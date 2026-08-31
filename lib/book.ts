/**
 * The account's book, from Postgres.
 *
 * One place the application asks for data. It reads through Supabase when a
 * project is configured, and falls back to the in-memory store when one is not
 * — which is what the tests run against, and what let every screen be built
 * before a database existed.
 *
 * The whole book is loaded in a single round trip and cached for the request.
 * A café has on the order of 150 recipes and 250 ingredients; fetching that
 * once is cheaper than the dozen round trips a lazier design would make, and
 * costing needs the whole graph anyway — a plate reaches three recipes deep,
 * so there is no useful smaller unit to fetch.
 */

import { cache } from 'react';

import type { Ingredient } from '@/core/ingredient';
import { type Pantry, type Recipe, pantryOf } from '@/core/recipe';

import type { CostingModel } from './costing';
import type { Flag } from './flags';
import type { DishMeta } from './data';
import { BLANK_ORG, type Member, type Org, type Plan, type RateChange, type RateSource } from './org';
import {
  type ComponentRow,
  type IngredientRow,
  type OrgRow,
  type RecipeRow,
  fromComponents,
  fromIngredient,
  fromOrg,
  fromRecipe,
  toIngredient,
  toMeta,
  toOrg,
  toRecipe,
} from './rows';
import * as memory from './store';
import { supabaseConfigured } from './supabase/env';
import { supabaseServer } from './supabase/server';

/**
 * A write that failed, in words.
 *
 * Every Supabase call returns `{ error }` and none of these used to look at
 * it. An import of 74 recipes hit a type mismatch on the very first row,
 * reported "74 dishes created", and wrote nothing — which is worse than
 * failing, because the operator has no reason to look.
 */
export class WriteFailed extends Error {
  readonly detail: string;
  constructor(what: string, detail: string) {
    super(`Costbook could not save ${what}. ${detail}`);
    this.name = 'WriteFailed';
    this.detail = detail;
  }
}

/** Throw on a failed write rather than carrying on as though it worked. */
function check(what: string, result: { error: { message: string } | null }): void {
  if (result.error !== null) throw new WriteFailed(what, result.error.message);
}

export interface Book {
  readonly orgId: string | null;
  readonly org: Org;
  readonly recipes: readonly Recipe[];
  readonly ingredients: readonly Ingredient[];
  readonly meta: Readonly<Record<string, DishMeta>>;
  readonly members: readonly Member[];
  readonly plan: Plan;
  readonly history: Readonly<Record<string, readonly RateChange[]>>;
  /** What the kitchen has said about a dish (A40). Newest first. */
  readonly flags: readonly Flag[];
}

/** What a signed-out visitor sees: nothing, and no pretence of anything. */
const EMPTY: Book = {
  orgId: null,
  org: BLANK_ORG,
  recipes: [],
  ingredients: [],
  meta: {},
  members: [],
  plan: 'free',
  history: {},
  flags: [],
};

function fromMemory(): Book {
  return {
    orgId: 'memory',
    org: memory.org(),
    recipes: [...memory.allRecipes()],
    ingredients: [...memory.allIngredients()],
    meta: { ...memory.allMeta() },
    members: [...memory.members()],
    plan: memory.plan(),
    history: {},
    flags: [],
  };
}

/**
 * Load everything, once per request.
 *
 * `cache` is React's per-request memo: six server components on one page ask
 * for the book and one query answers them all. It does not survive the
 * request, so an edit is never served from a stale copy.
 */
export const book = cache(async (): Promise<Book> => {
  if (!supabaseConfigured()) return fromMemory();

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user === null) return EMPTY;

  const { data: orgs } = await supabase.from('organizations').select('*').limit(1);
  const orgRow = (orgs as OrgRow[] | null)?.[0];
  if (orgRow === undefined) return EMPTY;

  // RLS scopes every one of these to the caller's org, so none of them carries
  // a where-clause of its own. The policy is the filter.
  const [recipesRes, componentsRes, ingredientsRes, membersRes, subRes, historyRes, flagsRes] =
    await Promise.all([
      supabase.from('recipes').select('*'),
      supabase.from('recipe_components').select('*'),
      supabase.from('ingredients').select('*'),
      supabase.from('memberships').select('role, user_id, display_name'),
      supabase.from('subscriptions').select('plan').limit(1),
      supabase
        .from('ingredient_rate_history')
        .select('ingredient_id, price_from, price_to, changed_at, source')
        .order('changed_at', { ascending: false }),
      supabase.from('flags').select('*').order('sent_at', { ascending: false }),
    ]);

  const recipeRows = (recipesRes.data ?? []) as RecipeRow[];
  const componentRows = (componentsRes.data ?? []) as ComponentRow[];
  const ingredientRows = (ingredientsRes.data ?? []) as IngredientRow[];

  const byRecipe = new Map<string, ComponentRow[]>();
  for (const c of componentRows) {
    const list = byRecipe.get(c.recipe_id);
    if (list === undefined) byRecipe.set(c.recipe_id, [c]);
    else list.push(c);
  }

  const meta: Record<string, DishMeta> = {};
  for (const r of recipeRows) meta[r.id] = toMeta(r);

  const history: Record<string, RateChange[]> = {};
  for (const h of (historyRes.data ?? []) as {
    ingredient_id: string; price_from: number | string | null; price_to: number | string;
    changed_at: string; source: string | null;
  }[]) {
    const list = history[h.ingredient_id] ?? (history[h.ingredient_id] = []);
    list.push({
      from: h.price_from === null ? null : Number(h.price_from),
      to: Number(h.price_to),
      on: h.changed_at.slice(0, 10),
      source: (h.source ?? 'manual') as RateSource,
    });
  }

  const rows = membersRes.data as
    { role: 'owner' | 'manager'; user_id: string; display_name: string | null }[] | null;

  const dishName = new Map(recipeRows.map((r) => [r.id, r.name]));

  return {
    orgId: orgRow.id,
    org: toOrg(orgRow),
    recipes: recipeRows.map((r) => toRecipe(r, byRecipe.get(r.id) ?? [])),
    ingredients: ingredientRows.map(toIngredient),
    meta,
    members: (rows ?? []).map((m) => ({
      // The email lives in auth.users, which RLS does not expose to a client.
      // A member the caller cannot name is shown by role until the invitation
      // record supplies one, rather than by a fabricated address.
      /*
       * A40 needs a person, not a role. Emails live in auth.users and RLS does
       * not expose them, so the name is carried on the membership — given at
       * signup or by whoever sent the invitation. Falling back to the role is
       * honest about not knowing rather than inventing one.
       */
      name:
        m.display_name ??
        (m.user_id === auth.user?.id ? 'You' : m.role === 'owner' ? 'Owner' : 'Manager'),
      email: m.user_id === auth.user?.id ? (auth.user?.email ?? '') : '',
      role: m.role,
      lastIn: null,
      accepted: true,
    })),
    plan: ((subRes.data as { plan: Plan }[] | null)?.[0]?.plan ?? 'free') as Plan,
    history,
    flags: ((flagsRes.data ?? []) as FlagRow[]).map((f) => ({
      id: f.id,
      recipeId: f.recipe_id,
      dish: dishName.get(f.recipe_id) ?? 'A dish',
      from: f.sent_by_name,
      note: f.note,
      cost: f.cost === null ? null : Number(f.cost),
      price: f.price === null ? null : Number(f.price),
      foodCost: f.food_cost === null ? null : Number(f.food_cost),
      target: f.target === null ? null : Number(f.target),
      sentAt: f.sent_at,
      openedAt: f.opened_at,
      seenAt: f.seen_at,
    })),
  };
});

interface FlagRow {
  id: string; recipe_id: string; sent_by_name: string; note: string | null;
  cost: string | number | null; price: string | number | null;
  food_cost: string | number | null; target: string | number | null;
  sent_at: string; opened_at: string | null; seen_at: string | null;
}

/* ── reads the screens use ────────────────────────────────────────────────── */

export async function pantry(): Promise<Pantry> {
  const b = await book();
  return pantryOf(b.recipes, b.ingredients);
}

export async function orgModel(): Promise<CostingModel> {
  const { org } = await book();
  return {
    wastagePercent: org.wastagePercent,
    packagingPerPortion: org.packagingPerPortion,
    foodCostTarget: org.foodCostTarget,
    rounding: org.rounding,
  };
}

export async function currencyIsSettable(): Promise<boolean> {
  const b = await book();
  return b.recipes.length === 0;
}

/* ── writes ───────────────────────────────────────────────────────────────── */

export async function saveOrg(patch: Partial<Org>): Promise<void> {
  if (!supabaseConfigured()) {
    memory.setOrg(patch);
    return;
  }
  const b = await book();
  if (b.orgId === null) return;
  const supabase = await supabaseServer();
  check('your settings', await supabase.from('organizations').update(fromOrg(patch)).eq('id', b.orgId));
}

export async function saveIngredient(
  ingredient: Ingredient,
  source: RateSource = 'manual',
): Promise<void> {
  if (!supabaseConfigured()) {
    memory.putIngredient(ingredient, source);
    return;
  }
  const b = await book();
  if (b.orgId === null) return;
  const supabase = await supabaseServer();

  // Read the rate as it stands before overwriting it, so the record has both
  // sides. The trigger that used to do this could not know the source.
  const before = b.ingredients.find((i) => i.id === ingredient.id)?.purchasePrice ?? null;

  check(
    ingredient.name,
    await supabase.from('ingredients').upsert(fromIngredient(ingredient, b.orgId), { onConflict: 'id' }),
  );

  await recordRate(supabase, ingredient, before, source);
}

/**
 * Write one history record, if there is one to write.
 *
 * A change is always recorded. A confirmation is recorded even though nothing
 * moved, because "days since anyone confirmed it" is a different figure from
 * "days since it last changed" — and a chef who checks a price and finds it
 * unchanged has done the work.
 *
 * Anything else — a save that touched a yield or a supplier and left the rate
 * alone — writes nothing. History that fills up with non-events answers no
 * question.
 */
async function recordRate(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  ingredient: Ingredient,
  before: number | null,
  source: RateSource,
): Promise<void> {
  const now = ingredient.purchasePrice;
  if (now === null) return;

  const moved = before !== now;
  if (!moved && source !== 'confirmed') return;

  check(
    `the rate history for ${ingredient.name}`,
    await supabase.from('ingredient_rate_history').insert({
      ingredient_id: ingredient.id,
      purchase_qty: ingredient.purchaseQty,
      price_from: moved ? before : now,
      price_to: now,
      source,
    }),
  );
}

/**
 * Write a recipe and its lines.
 *
 * The components are replaced wholesale rather than diffed. A line has no
 * identity the operator would recognise — they reorder, retype and delete
 * them freely — so matching them up would be inventing a history nobody kept.
 */
export async function saveRecipe(recipe: Recipe, meta: DishMeta | undefined): Promise<void> {
  if (!supabaseConfigured()) {
    memory.putRecipe(recipe);
    if (meta !== undefined) memory.putMeta(recipe.id, meta);
    return;
  }
  const b = await book();
  if (b.orgId === null) return;
  const supabase = await supabaseServer();

  check(recipe.name, await supabase.from('recipes').upsert(fromRecipe(recipe, meta, b.orgId), { onConflict: 'id' }));
  check(recipe.name, await supabase.from('recipe_components').delete().eq('recipe_id', recipe.id));

  const lines = fromComponents(recipe);
  if (lines.length > 0) {
    check(`the lines of ${recipe.name}`, await supabase.from('recipe_components').insert(lines));
  }
}

/** Everything an import produces, in as few round trips as it can be done. */
export async function saveBook(input: {
  readonly ingredients: readonly Ingredient[];
  readonly recipes: readonly Recipe[];
  readonly meta: Readonly<Record<string, DishMeta>>;
}): Promise<void> {
  if (!supabaseConfigured()) {
    for (const i of input.ingredients) memory.putIngredient(i);
    for (const r of input.recipes) {
      memory.putRecipe(r);
      const m = input.meta[r.id];
      if (m !== undefined) memory.putMeta(r.id, m);
    }
    return;
  }

  const b = await book();
  if (b.orgId === null) return;
  const supabase = await supabaseServer();
  const orgId = b.orgId;

  if (input.ingredients.length > 0) {
    // Rates as they stand, before the import overwrites them.
    const was = new Map(b.ingredients.map((i) => [i.id, i.purchasePrice]));

    check(
      'your ingredients',
      await supabase
        .from('ingredients')
        .upsert(input.ingredients.map((i) => fromIngredient(i, orgId)), { onConflict: 'id' }),
    );

    /*
     * Recorded as an import, not as manual. A price list that moves 238 rates
     * is one event; logging it as 238 manual edits makes every ingredient in
     * the book look like it was checked by hand this morning, which is exactly
     * the signal the kitchen screen ranks on.
     */
    const moves = input.ingredients
      .filter((i) => i.purchasePrice !== null && (was.get(i.id) ?? null) !== i.purchasePrice)
      .map((i) => ({
        ingredient_id: i.id,
        purchase_qty: i.purchaseQty,
        price_from: was.get(i.id) ?? null,
        price_to: i.purchasePrice,
        source: 'import' as const,
      }));

    for (let i = 0; i < moves.length; i += 500) {
      check('the rate history', await supabase.from('ingredient_rate_history').insert(moves.slice(i, i + 500)));
    }
  }

  if (input.recipes.length > 0) {
    check(
      'your dishes',
      await supabase
        .from('recipes')
        .upsert(input.recipes.map((r) => fromRecipe(r, input.meta[r.id], orgId)), { onConflict: 'id' }),
    );

    const ids = input.recipes.map((r) => r.id);
    check('the old lines', await supabase.from('recipe_components').delete().in('recipe_id', ids));

    const lines = input.recipes.flatMap(fromComponents);
    // Chunked: a large sheet produces thousands of lines, and one statement
    // carrying all of them is a request nobody's proxy is expecting.
    for (let i = 0; i < lines.length; i += 500) {
      check('your recipe lines', await supabase.from('recipe_components').insert(lines.slice(i, i + 500)));
    }
  }
}

export async function clearBook(): Promise<void> {
  if (!supabaseConfigured()) {
    memory.clearBook();
    return;
  }
  const b = await book();
  if (b.orgId === null) return;
  const supabase = await supabaseServer();
  await supabase.from('recipes').delete().eq('org_id', b.orgId);
  await supabase.from('ingredients').delete().eq('org_id', b.orgId);
}

/**
 * How many of the operator's recipes reach an ingredient, directly or through
 * a sub-recipe. The question an owner asks before changing a rate: what else
 * does this move?
 */
export async function recipesUsing(ingredientId: string): Promise<readonly Recipe[]> {
  const b = await book();
  const byId = new Map(b.recipes.map((r) => [r.id, r]));

  const reaches = (recipe: Recipe, seen = new Set<string>()): boolean => {
    if (seen.has(recipe.id)) return false;
    seen.add(recipe.id);
    return recipe.components.some((c) => {
      if (c.kind === 'ingredient') return c.ingredientId === ingredientId;
      if (c.kind === 'recipe') {
        const child = byId.get(c.childId);
        return child !== undefined && reaches(child, seen);
      }
      return false;
    });
  };

  return b.recipes.filter((r) => reaches(r));
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  return (await book()).recipes.find((r) => r.id === id);
}

export async function getMeta(id: string): Promise<DishMeta | undefined> {
  return (await book()).meta[id];
}

/**
 * Patch a dish's meta.
 *
 * A merge rather than a replace, because the callers send what changed — a
 * price, an archived flag — and not the whole record. Reads the current row
 * first so a patch never blanks a field it did not mention.
 */
export async function saveMeta(id: string, patch: Partial<DishMeta>): Promise<void> {
  if (!supabaseConfigured()) {
    memory.putMeta(id, patch);
    return;
  }
  const b = await book();
  if (b.orgId === null) return;

  const current = b.meta[id];
  const next: DishMeta = {
    category: patch.category ?? current?.category ?? 'Mains',
    station: patch.station ?? current?.station ?? null,
    portionSize: patch.portionSize ?? current?.portionSize ?? null,
    sellingPrice: patch.sellingPrice !== undefined ? patch.sellingPrice : (current?.sellingPrice ?? null),
    deliveryPrice: patch.deliveryPrice !== undefined ? patch.deliveryPrice : (current?.deliveryPrice ?? null),
    note: patch.note ?? current?.note ?? '',
    onMenu: patch.onMenu ?? current?.onMenu ?? false,
    archived: patch.archived ?? current?.archived ?? false,
  };

  const supabase = await supabaseServer();
  await supabase
    .from('recipes')
    .update({
      category: next.category,
      station: next.station,
      portion_size: next.portionSize,
      selling_price: next.sellingPrice,
      delivery_price: next.deliveryPrice,
      notes: next.note,
      on_menu: next.onMenu,
      archived: next.archived,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

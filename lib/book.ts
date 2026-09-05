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

import { FREE_SUBSCRIPTION, type Subscription, type Term, endOf, termOf, tierOf } from "./plan";
import { cache } from "react";

import { currency } from "@/core/currency";
import type { Ingredient } from "@/core/ingredient";
import { type Pantry, type Recipe, pantryOf } from "@/core/recipe";

import type { CostingModel } from "./costing";
import type { Flag } from "./flags";
import { type DishMeta, NO_DISH_PRICING } from "./data";
import {
  BLANK_ORG,
  type Member,
  type Org,
  type Plan,
  type RateChange,
  type RateSource,
  type Role,
  roleOf,
} from "./org";
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
  pricingColumns,
} from "./rows";
import * as memory from "./store";
import { supabaseConfigured } from "./supabase/env";
import { supabaseServer } from "./supabase/server";


/**
 * A read the application cannot do without.
 *
 * Most reads degrade to an empty list, which is right for a book with nothing
 * in it yet. The plan is not one of those: an empty answer there means "free",
 * which silently takes away what somebody paid for.
 */
export class ReadFailed extends Error {
  constructor(what: string, why: string) {
    super(`Costbook could not read ${what}. ${why}`);
    this.name = "ReadFailed";
  }
}

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
    this.name = "WriteFailed";
    this.detail = detail;
  }
}

/** Throw on a failed write rather than carrying on as though it worked. */
function check(
  what: string,
  result: { error: { message: string } | null },
): void {
  if (result.error !== null) throw new WriteFailed(what, result.error.message);
}

export interface Book {
  readonly orgId: string | null;
  /**
   * Who is asking, and what they may do.
   *
   * The book used to answer "who is on this account" and never "which of them
   * is you", so everything downstream that needed a role had to guess. The one
   * guess in the codebase was `members[0]`, which is whichever row Postgres
   * returned first — the owner, as often as not, when a manager signed in.
   *
   * `role` is null for a signed-out visitor, which is not the same as a
   * manager: null may do nothing at all.
   */
  readonly userId: string | null;
  readonly role: Role | null;
  readonly org: Org;
  readonly recipes: readonly Recipe[];
  readonly ingredients: readonly Ingredient[];
  readonly meta: Readonly<Record<string, DishMeta>>;
  readonly members: readonly Member[];
  /** The tier in force now, derived from `subscription` (lib/plan.ts). */
  readonly plan: Plan;
  /** The subscriptions row as it stands: term, dates, what the provider called it. */
  readonly subscription: Subscription;
  readonly history: Readonly<Record<string, readonly RateChange[]>>;
  /** What the kitchen has said about a dish (A40). Newest first. */
  readonly flags: readonly Flag[];
  /** How many of each dish sold, by month: recipe id → period → sold. */
  readonly sales: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

interface SubscriptionRow {
  readonly plan: Plan;
  readonly status?: string | null;
  readonly term?: string | null;
  readonly started_at?: string | null;
  readonly current_period_end?: string | null;
  readonly provider_reference?: string | null;
}

/** What a signed-out visitor sees: nothing, and no pretence of anything. */
const EMPTY: Book = {
  orgId: null,
  userId: null,
  role: null,
  org: BLANK_ORG,
  recipes: [],
  ingredients: [],
  meta: {},
  members: [],
  plan: "free",
  subscription: FREE_SUBSCRIPTION,
  history: {},
  flags: [],
  sales: {},
};

function fromMemory(): Book {
  return {
    orgId: "memory",
    // The in-memory book has one operator and they own it. Development runs
    // as the owner because the alternative — a manager who cannot reach
    // Settings — would hide half the application behind a session that does
    // not exist yet.
    userId: "memory",
    role: "owner",
    org: memory.org(),
    recipes: [...memory.allRecipes()],
    ingredients: [...memory.allIngredients()],
    meta: { ...memory.allMeta() },
    members: [...memory.members()],
    plan: tierOf(memory.subscription()),
    subscription: memory.subscription(),
    // Read from the store rather than left empty: drift, the to-do list and
    // the month's sales were all blank without a database, so every screen
    // that depends on them was unreviewable in development.
    history: memory.allRateHistory(),
    flags: [],
    sales: memory.allSales(),
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

  const { data: orgs } = await supabase
    .from("organizations")
    .select("*")
    .limit(1);
  const orgRow = (orgs as OrgRow[] | null)?.[0];
  if (orgRow === undefined) return EMPTY;

  // RLS scopes every one of these to the caller's org, so none of them carries
  // a where-clause of its own. The policy is the filter.
  const [
    recipesRes,
    componentsRes,
    ingredientsRes,
    membersRes,
    invitesRes,
    subRes,
    historyRes,
    flagsRes,
    salesRes,
  ] = await Promise.all([
    supabase.from("recipes").select("*"),
    supabase.from("recipe_components").select("*"),
    supabase.from("ingredients").select("*"),
    supabase.from("memberships").select("role, user_id, display_name"),
    /*
     * Everyone asked and not yet arrived.
     *
     * Settings shows them beside the people on the book, which is the only
     * way an owner can tell an invitation was recorded at all. Expired ones
     * are left out rather than shown lapsed: A32 gives the lapse message to
     * the person following the link, not to the person who sent it.
     */
    supabase
      .from("invitations")
      .select("id, email, role, expires_at")
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
    supabase.from("subscriptions").select("plan, status, term, started_at, current_period_end, provider_reference").limit(1),
    /*
     * The last year, not all of it.
     *
     * Every screen that reads history asks about the last month or the last
     * few changes; this loaded every row ever written, on every page, for
     * every visitor. A kitchen importing a price list monthly writes
     * thousands a year, and the free tier only ever shows three of them.
     */
    supabase
      .from("ingredient_rate_history")
      .select("ingredient_id, purchase_qty, price_from, price_to, changed_at, source")
      .gte("changed_at", new Date(Date.now() - 366 * 86_400_000).toISOString())
      .order("changed_at", { ascending: false }),
    supabase.from("flags").select("*").order("sent_at", { ascending: false }),
    supabase.from("dish_sales").select("recipe_id, period, sold"),
  ]);

  /*
   * A read that failed is not an empty book.
   *
   * Every one of these fell through `?? []` on any error, so a renamed column
   * or a missing migration showed a kitchen with no recipes in it and said
   * nothing at all — the same shape as the bug that made a paid account read
   * as free. The tables are named so the sentence points at the cause.
   */
  for (const [what, res] of [
    ["your dishes", recipesRes],
    ["your recipe lines", componentsRes],
    ["your ingredients", ingredientsRes],
    ["who is on this book", membersRes],
    ["your invitations", invitesRes],
    ["your rate history", historyRes],
    ["what the kitchen sent you", flagsRes],
    ["your sales", salesRes],
  ] as const) {
    if (res.error !== null) throw new ReadFailed(what, res.error.message);
  }

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
    ingredient_id: string;
    price_from: number | string | null;
    price_to: number | string;
    purchase_qty: number | string;
    changed_at: string;
    source: string | null;
  }[]) {
    const list = history[h.ingredient_id] ?? (history[h.ingredient_id] = []);
    list.push({
      from: h.price_from === null ? null : Number(h.price_from),
      to: Number(h.price_to),
      qty: Number(h.purchase_qty),
      on: h.changed_at.slice(0, 10),
      source: (h.source ?? "manual") as RateSource,
    });
  }

  const rows = membersRes.data as
    | {
        role: "owner" | "manager";
        user_id: string;
        display_name: string | null;
      }[]
    | null;

  const sales: Record<string, Record<string, number>> = {};
  for (const row of (salesRes.data ?? []) as { recipe_id: string; period: string; sold: number }[]) {
    const byPeriod = sales[row.recipe_id] ?? (sales[row.recipe_id] = {});
    byPeriod[row.period] = row.sold;
  }

  const dishName = new Map(recipeRows.map((r) => [r.id, r.name]));

  /*
   * A read that fails is not "free".
   *
   * This select asks for the columns migration 18 adds. On a project without
   * it the whole query is refused, and the refusal used to fall through the
   * `?? []` below into a free plan — silently, for a paid account, taking the
   * cap and the import with it. The narrow select is what every project has
   * carried since the first migration, so a plan stays a plan; anything else
   * wrong here is thrown, because a bill nobody can read is not a detail.
   */
  let subRows = subRes.data as SubscriptionRow[] | null;
  if (subRes.error !== null) {
    if (subRes.error.code === "42703" || subRes.error.code === "PGRST204") {
      console.warn(
        "subscriptions is missing the term columns; apply migration 18. " +
          "Reading the plan without them for now.",
      );
      const narrow = await supabase.from("subscriptions").select("plan, status, current_period_end").limit(1);
      if (narrow.error !== null) throw new ReadFailed("your plan", narrow.error.message);
      subRows = narrow.data as SubscriptionRow[] | null;
    } else {
      throw new ReadFailed("your plan", subRes.error.message);
    }
  }

  const subRow = subRows?.[0];
  const subscription: Subscription = subRow === undefined ? FREE_SUBSCRIPTION : {
    plan: subRow.plan,
    status: subRow.status ?? "active",
    term: termOf(subRow.term)?.id ?? null,
    startedAt: subRow.started_at ?? null,
    periodEnd: subRow.current_period_end ?? null,
    reference: subRow.provider_reference ?? null,
  };

  return {
    orgId: orgRow.id,
    userId: auth.user.id,
    /*
     * The caller's own row, found by id rather than by position.
     *
     * `memberships` is returned in no particular order and pending invitations
     * are appended to the same list, so "the first one" was never a person in
     * particular. Absent means a session whose membership has been removed
     * mid-visit: null, which may do nothing, rather than a default that lets
     * them keep working.
     */
    role: roleOf(rows ?? [], auth.user.id),
    org: toOrg(orgRow),
    recipes: recipeRows.map((r) => toRecipe(r, byRecipe.get(r.id) ?? [])),
    ingredients: ingredientRows.map(toIngredient),
    meta,
    members: (rows ?? [])
      .map((m) => ({
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
          (m.user_id === auth.user?.id
            ? "You"
            : m.role === "owner"
              ? "Owner"
              : "Manager"),
        email: m.user_id === auth.user?.id ? (auth.user?.email ?? "") : "",
        id: m.user_id,
        role: m.role,
        lastIn: null,
        accepted: true,
      }))
      .concat(
        (
          (invitesRes.data ?? []) as {
            id: string;
            email: string;
            role: "owner" | "manager";
          }[]
        ).map((i) => ({
          // The invitation is the only record that knows the address, which is
          // why a pending row can show one and an accepted row cannot.
          name: i.email,
          email: i.email,
          id: i.id,
          role: i.role,
          lastIn: null,
          accepted: false,
        })),
      ),
    plan: tierOf(subscription),
    subscription,
    history,
    sales,
    flags: ((flagsRes.data ?? []) as FlagRow[]).map((f) => ({
      id: f.id,
      recipeId: f.recipe_id,
      dish: dishName.get(f.recipe_id) ?? "A dish",
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
  id: string;
  recipe_id: string;
  sent_by_name: string;
  note: string | null;
  cost: string | number | null;
  price: string | number | null;
  food_cost: string | number | null;
  target: string | number | null;
  sent_at: string;
  opened_at: string | null;
  seen_at: string | null;
}

/* ── reads the screens use ────────────────────────────────────────────────── */

export async function pantry(): Promise<Pantry> {
  const b = await book();
  return pantryOf(b.recipes, b.ingredients);
}

export async function orgModel(): Promise<CostingModel> {
  const { org } = await book();
  return {
    // So a price is rounded in the money it will be printed in.
    decimals: currency(org.currency).decimals,
    wastagePercent: org.wastagePercent,
    packagingPerPortion: org.packagingPerPortion,
    foodCostTarget: org.foodCostTarget,
    rounding: org.rounding,
    method: org.pricingMethod,
    moneyPerPlate: org.moneyPerPlate,
    factor: org.factor,
    accompanimentsPerPortion: org.accompanimentsPerPortion,
    labourRatePerHour: org.labourRatePerHour,
    overheadPerPortion: org.overheadPerPortion,
    pricesIncludeCharges: org.pricesIncludeCharges,
    charges: org.charges,
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
  // Loud, not silent. A write that quietly does nothing is worse than one that
  // fails: nothing prompts the operator to look.
  if (b.orgId === null)
    throw new WriteFailed("anything", "No account is signed in.");
  const supabase = await supabaseServer();
  check(
    "your settings",
    await supabase
      .from("organizations")
      .update(fromOrg(patch))
      .eq("id", b.orgId),
  );
}

export async function saveIngredient(
  ingredient: Ingredient,
  source: RateSource = "manual",
): Promise<void> {
  if (!supabaseConfigured()) {
    memory.putIngredient(ingredient, source);
    return;
  }
  const b = await book();
  // Loud, not silent. A write that quietly does nothing is worse than one that
  // fails: nothing prompts the operator to look.
  if (b.orgId === null)
    throw new WriteFailed("anything", "No account is signed in.");
  const supabase = await supabaseServer();

  // Read the rate as it stands before overwriting it, so the record has both
  // sides. The trigger that used to do this could not know the source.
  const before =
    b.ingredients.find((i) => i.id === ingredient.id)?.purchasePrice ?? null;

  check(
    ingredient.name,
    await supabase
      .from("ingredients")
      .upsert(fromIngredient(ingredient, b.orgId), { onConflict: "id" }),
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
  if (!moved && source !== "confirmed") return;

  check(
    `the rate history for ${ingredient.name}`,
    await supabase.from("ingredient_rate_history").insert({
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
export async function saveRecipe(
  recipe: Recipe,
  meta: DishMeta | undefined,
): Promise<void> {
  if (!supabaseConfigured()) {
    memory.putRecipe(recipe);
    if (meta !== undefined) memory.putMeta(recipe.id, meta);
    return;
  }
  const b = await book();
  // Loud, not silent. A write that quietly does nothing is worse than one that
  // fails: nothing prompts the operator to look.
  if (b.orgId === null)
    throw new WriteFailed("anything", "No account is signed in.");
  const supabase = await supabaseServer();

  await writeRecipes(supabase, [fromRecipe(recipe, meta, b.orgId)], fromComponents(recipe), meta !== undefined, recipe.name);
}

/**
 * The recipe rows and their lines, as one transaction.
 *
 * `save_recipes` (migration 19) upserts the rows, replaces the lines, and
 * either all of it lands or none of it does. Until the function exists on a
 * project the old three statements run instead — loudly noted, because a
 * save that can leave a dish with no lines is the thing the function ends.
 */
async function writeRecipes(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  rows: readonly Record<string, unknown>[],
  lines: readonly Record<string, unknown>[],
  withMeta: boolean,
  what: string,
): Promise<void> {
  const res = await supabase.rpc("save_recipes", { p_recipes: rows, p_lines: lines, p_with_meta: withMeta });
  if (res.error === null) return;
  if (res.error.code !== "PGRST202") {
    check(what, res);
    return;
  }
  console.warn("save_recipes is not on this project yet; apply migration 19. Saving in three statements instead.");
  check(what, await supabase.from("recipes").upsert([...rows], { onConflict: "id" }));
  const ids = rows.map((r) => r.id as string);
  check(what, await supabase.from("recipe_components").delete().in("recipe_id", ids));
  for (let i = 0; i < lines.length; i += 500) {
    check(`the lines of ${what}`, await supabase.from("recipe_components").insert(lines.slice(i, i + 500)));
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
  // Loud, not silent. A write that quietly does nothing is worse than one that
  // fails: nothing prompts the operator to look.
  if (b.orgId === null)
    throw new WriteFailed("anything", "No account is signed in.");
  const supabase = await supabaseServer();
  const orgId = b.orgId;

  if (input.ingredients.length > 0) {
    // Rates as they stand, before the import overwrites them.
    const was = new Map(b.ingredients.map((i) => [i.id, i.purchasePrice]));

    check(
      "your ingredients",
      await supabase.from("ingredients").upsert(
        input.ingredients.map((i) => fromIngredient(i, orgId)),
        { onConflict: "id" },
      ),
    );

    /*
     * Recorded as an import, not as manual. A price list that moves 238 rates
     * is one event; logging it as 238 manual edits makes every ingredient in
     * the book look like it was checked by hand this morning, which is exactly
     * the signal the kitchen screen ranks on.
     */
    const moves = input.ingredients
      .filter(
        (i) =>
          i.purchasePrice !== null &&
          (was.get(i.id) ?? null) !== i.purchasePrice,
      )
      .map((i) => ({
        ingredient_id: i.id,
        purchase_qty: i.purchaseQty,
        price_from: was.get(i.id) ?? null,
        price_to: i.purchasePrice,
        source: "import" as const,
      }));

    for (let i = 0; i < moves.length; i += 500) {
      check(
        "the rate history",
        await supabase
          .from("ingredient_rate_history")
          .insert(moves.slice(i, i + 500)),
      );
    }
  }

  if (input.recipes.length > 0) {
    /*
     * All or none carry meta, never some of each: a bulk upsert sends one
     * column list for every row, and a payload whose objects have different
     * keys is refused outright.
     */
    const withMeta = input.recipes.every((r) => input.meta[r.id] !== undefined);
    await writeRecipes(
      supabase,
      input.recipes.map((r) => fromRecipe(r, withMeta ? input.meta[r.id] : undefined, orgId)),
      input.recipes.flatMap(fromComponents),
      withMeta,
      "your dishes",
    );
  }
}

export async function clearBook(): Promise<void> {
  if (!supabaseConfigured()) {
    memory.clearBook();
    return;
  }
  const b = await book();
  // Loud, not silent. A write that quietly does nothing is worse than one that
  // fails: nothing prompts the operator to look.
  if (b.orgId === null)
    throw new WriteFailed("anything", "No account is signed in.");
  const supabase = await supabaseServer();
  check("your dishes", await supabase.from("recipes").delete().eq("org_id", b.orgId));
  check("your ingredients", await supabase.from("ingredients").delete().eq("org_id", b.orgId));
}

/**
 * How many of the operator's recipes reach an ingredient, directly or through
 * a sub-recipe. The question an owner asks before changing a rate: what else
 * does this move?
 */
export async function recipesUsing(
  ingredientId: string,
): Promise<readonly Recipe[]> {
  const b = await book();
  const byId = new Map(b.recipes.map((r) => [r.id, r]));

  const reaches = (recipe: Recipe, seen = new Set<string>()): boolean => {
    if (seen.has(recipe.id)) return false;
    seen.add(recipe.id);
    return recipe.components.some((c) => {
      if (c.kind === "ingredient") return c.ingredientId === ingredientId;
      if (c.kind === "recipe") {
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
export async function saveMeta(
  id: string,
  patch: Partial<DishMeta>,
): Promise<void> {
  if (!supabaseConfigured()) {
    memory.putMeta(id, patch);
    return;
  }
  const b = await book();
  // Loud, not silent. A write that quietly does nothing is worse than one that
  // fails: nothing prompts the operator to look.
  if (b.orgId === null)
    throw new WriteFailed("anything", "No account is signed in.");

  const current = b.meta[id];
  const next: DishMeta = {
    category: patch.category ?? current?.category ?? "Mains",
    station: patch.station ?? current?.station ?? null,
    portionSize: patch.portionSize ?? current?.portionSize ?? null,
    sellingPrice:
      patch.sellingPrice !== undefined
        ? patch.sellingPrice
        : (current?.sellingPrice ?? null),
    deliveryPrice:
      patch.deliveryPrice !== undefined
        ? patch.deliveryPrice
        : (current?.deliveryPrice ?? null),
    note: patch.note ?? current?.note ?? "",
    onMenu: patch.onMenu ?? current?.onMenu ?? false,
    archived: patch.archived ?? current?.archived ?? false,
    // Written as typed, never renumbered. Undefined in a patch means "leave
    // it"; null means the operator cleared it.
    method: patch.method !== undefined ? patch.method : (current?.method ?? null),
    // Merged field by field: a sheet that sets labour minutes must not wipe
    // a target set last week. Null inside a patch clears one figure.
    pricing:
      patch.pricing !== undefined
        ? { ...NO_DISH_PRICING, ...(current?.pricing ?? {}), ...patch.pricing }
        : (current?.pricing ?? NO_DISH_PRICING),
    pricedAt: patch.pricedAt !== undefined ? patch.pricedAt : (current?.pricedAt ?? null),
    keptAtPricing: patch.keptAtPricing !== undefined ? patch.keptAtPricing : (current?.keptAtPricing ?? null),
  };

  const supabase = await supabaseServer();
  check(
    "this dish",
    await supabase
    .from("recipes")
    .update({
      category: next.category,
      station: next.station,
      portion_size: next.portionSize,
      selling_price: next.sellingPrice,
      delivery_price: next.deliveryPrice,
      notes: next.note,
      method: next.method,
      ...pricingColumns(next.pricing),
      priced_at: next.pricedAt,
      kept_at_pricing: next.keptAtPricing,
      on_menu: next.onMenu,
      archived: next.archived,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id),
  );
}

/*
 * `inviteToOrg`, `removeFromOrg` and `setOrgRole` used to sit here.
 *
 * Costbook is one person per account for now, so nothing calls them. The whole
 * flow they served was unreachable at its far end anyway: /join never read the
 * token in its link and rendered the lapsed state every time, and no mail went
 * out to carry a link in the first place.
 *
 * The database keeps everything they wrote to — the `invitations` table, the
 * `member_role` enum, the owner-gated policies and the signup trigger that
 * redeems an invitation by address. So a second person on the book is a screen
 * and these three functions again, not a migration. PRD 6 and FLOWS 9 both
 * describe the flow; it is deferred, not cancelled.
 */

/**
 * Move the account between plans.
 *
 * This wrote to the in-memory store and nowhere else, so with a project wired
 * up the `subscriptions` row never moved: an operator upgraded, the screen
 * agreed, and the next server restart put them back on free. A plan that
 * forgets itself is worse than one that cannot be changed — nothing prompts
 * anybody to look, and the tier caps quietly come back.
 *
 * It still takes no money. Razorpay is TRD build step 25 and there is no
 * payment path yet; what this does is record a decision durably, so that when
 * there is one it has somewhere to write.
 */
export async function savePlan(next: Plan): Promise<void> {
  if (!supabaseConfigured()) {
    memory.setPlan(next);
    return;
  }
  const b = await book();
  // Loud, not silent. A write that quietly does nothing is worse than one that
  // fails: nothing prompts the operator to look.
  if (b.orgId === null) throw new WriteFailed("anything", "No account is signed in.");
  const supabase = await supabaseServer();
  check(
    "your plan",
    await supabase.from("subscriptions").update({ plan: next }).eq("org_id", b.orgId),
  );
}

/** An order opened at the provider, as the server recorded it. */
export interface RecordedOrder {
  readonly term: Term;
  readonly amount: number;
}

/**
 * Record what an order was for, before the browser is sent to pay it.
 *
 * The provider signs the order and the payment, not the amount or the term,
 * so this row is the only place that knows what was actually asked for.
 */
export async function recordOrder(input: {
  readonly id: string;
  readonly term: Term;
  readonly amount: number;
  readonly currency: string;
}): Promise<void> {
  if (!supabaseConfigured()) return;
  const b = await book();
  if (b.orgId === null) throw new WriteFailed("an order", "No account is signed in.");
  const supabase = await supabaseServer();
  check(
    "your order",
    await supabase.from("payment_orders").insert({
      id: input.id,
      org_id: b.orgId,
      term: input.term,
      amount: input.amount,
      currency: input.currency,
      status: "open",
    }),
  );
}

/**
 * Claim an open order for a payment, once.
 *
 * One conditional update: open becomes paid, and only from open. A second
 * confirmation of the same payment matches no row and gets null, which is how
 * a replayed callback is refused rather than stacking another stretch. Row
 * security does the rest — an order belonging to another book matches nothing
 * either. Returns what the order was for, so the caller never has to trust
 * the term it was handed.
 */
export async function claimOrder(orderId: string, paymentId: string): Promise<RecordedOrder | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await supabaseServer();
  const res = await supabase
    .from("payment_orders")
    .update({ status: "paid", payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "open")
    .select("term, amount");
  // A duplicate payment_id trips the unique index rather than returning rows:
  // the same refusal, said by the database.
  if (res.error !== null) return null;
  const row = (res.data as { term: string; amount: number }[] | null)?.[0];
  const term = termOf(row?.term);
  if (row === undefined || term === undefined) return null;
  return { term: term.id, amount: row.amount };
}

/**
 * Switch a paid stretch on.
 *
 * Called only after the payment has been verified (app/plans/actions.ts), or
 * by the sandbox, which records itself as such. A stretch bought while one is
 * running starts when that one ends, so nothing already paid for is lost.
 */
export async function activateSubscription(term: Term, reference: string, now: Date = new Date()): Promise<void> {
  const t = termOf(term);
  if (t === undefined) throw new Error("That is not a term Costbook sells.");
  if (!supabaseConfigured()) {
    // The same row the database would hold, so the plans screen shows real
    // dates in development rather than a plan with no end.
    const from = tierOf(memory.subscription(), now) === "paid" && memory.subscription().periodEnd !== null
      ? new Date(memory.subscription().periodEnd ?? now)
      : now;
    memory.setSubscription({
      plan: "paid",
      status: "active",
      term: t.id,
      startedAt: from.toISOString(),
      periodEnd: endOf(from, t.months).toISOString(),
      reference,
    });
    return;
  }
  const b = await book();
  if (b.orgId === null) throw new WriteFailed("anything", "No account is signed in.");
  const running = b.plan === "paid" && b.subscription.periodEnd !== null ? new Date(b.subscription.periodEnd) : null;
  const from = running !== null && running > now ? running : now;
  const supabase = await supabaseServer();
  check(
    "your plan",
    await supabase
      .from("subscriptions")
      .update({
        plan: "paid",
        status: "active",
        term: t.id,
        started_at: from.toISOString(),
        current_period_end: endOf(from, t.months).toISOString(),
        provider_reference: reference,
      })
      .eq("org_id", b.orgId),
  );
}

/**
 * A month's sales for a set of dishes. One row per dish and month, replaced
 * when the same month is pasted again — a till export is re-run, not
 * appended to.
 */
export async function saveSales(
  period: string,
  rows: readonly { readonly recipeId: string; readonly sold: number }[],
): Promise<void> {
  if (!supabaseConfigured()) {
    memory.putSales(period, rows);
    return;
  }
  const b = await book();
  if (b.orgId === null) throw new WriteFailed("sales", "No account is signed in.");
  const supabase = await supabaseServer();
  const { error } = await supabase.from("dish_sales").upsert(
    rows.map((r) => ({ org_id: b.orgId, recipe_id: r.recipeId, period, sold: r.sold })),
    { onConflict: "recipe_id,period" },
  );
  if (error) throw new WriteFailed("sales", error.message);
}

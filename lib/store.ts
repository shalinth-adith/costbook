/**
 * Where edits live until there is a database.
 *
 * A module-level store on the server, seeded from the fixtures. It is real
 * persistence in the sense that matters for the screens — save a dish and the
 * dashboard shows it, at its true rank, on the next request — and it is lost
 * when the server restarts. Supabase replaces this at build step 12, and the
 * shape is deliberately what a route handler will hand over then: plain lists
 * in, a Pantry out (TRD 2).
 *
 * Nothing here computes a cost. It stores what the operator entered and hands
 * it to `core/` to be costed, every time, from current data.
 */

import { isKnownCurrency } from '@/core/currency';
import type { Ingredient } from '@/core/ingredient';
import { type Pantry, type Recipe, pantryOf } from '@/core/recipe';

import type { CostingModel } from './costing';
import type { DishMeta } from './data';
import { BLANK_ORG, type Member, type Org, type Plan, type RateChange, type RateSource } from './org';

interface State {
  recipes: Recipe[];
  ingredients: Ingredient[];
  meta: Record<string, DishMeta>;
  /**
   * Every answer the operator gave about their place, in one object. Holding
   * it whole rather than as loose fields is what lets the wizard and Settings
   * write the same thing — they are one form rendered twice, not two forms.
   */
  org: Org;
  /** Two roles only, per A27. A kitchen does not need a permissions matrix. */
  members: Member[];
  plan: Plan;
  /**
   * Every rate an ingredient has carried, newest first (TRD 5, A28).
   *
   * Kept because "the price has always been that" is a thing suppliers say,
   * and without this the operator has only their memory to answer it with.
   * Append-only: a rate that was true on a date stays true for that date.
   */
  rateHistory: Record<string, RateChange[]>;
}

/**
 * Held on `globalThis` so the dev server's module reloading does not quietly
 * discard someone's work between requests.
 */
/*
 * Versioned deliberately. `Symbol.for` is a process-wide registry, so a dev
 * server that is already running holds state in whatever shape it was seeded
 * with — and `??=` finds that key present and adopts it. Changing the shape of
 * State without changing this key hands old data to new code, which fails at
 * the first field that did not exist yet. Bump it whenever State changes.
 */
const KEY = Symbol.for('costbook.store.v4');

interface Holder {
  [KEY]?: State;
}

function state(): State {
  const holder = globalThis as unknown as Holder;
  /*
   * An account starts empty. Every figure in Costbook is one the operator gave
   * us, and that has to be true of the first screen too — a menu nobody entered
   * is exactly the plausible wrong data the product exists to avoid, and a
   * demo café sitting in a live account is worse than no data at all.
   *
   * The fixture book in `data.ts` is test material. It is imported by tests
   * and by nothing that runs.
   */
  holder[KEY] ??= {
    recipes: [],
    ingredients: [],
    meta: {},
    org: { ...BLANK_ORG },
    members: [],
    plan: 'free',
    rateHistory: {},
  };
  return holder[KEY];
}

export function pantry(): Pantry {
  const s = state();
  return pantryOf(s.recipes, s.ingredients);
}

export function allRecipes(): readonly Recipe[] {
  return state().recipes;
}

export function allIngredients(): readonly Ingredient[] {
  return state().ingredients;
}

export function allMeta(): Readonly<Record<string, DishMeta>> {
  return state().meta;
}

export function getRecipe(id: string): Recipe | undefined {
  return state().recipes.find((r) => r.id === id);
}

export function getMeta(id: string): DishMeta | undefined {
  return state().meta[id];
}

/** Replace a recipe wholesale. The client sends what it has; this is the write. */
export function putRecipe(recipe: Recipe): void {
  const s = state();
  const at = s.recipes.findIndex((r) => r.id === recipe.id);
  if (at === -1) s.recipes.push(recipe);
  else s.recipes[at] = recipe;
}

export function putMeta(id: string, patch: Partial<DishMeta>): void {
  const s = state();
  const current = s.meta[id];

  // A brand new dish has no entry to patch, so this seeds one rather than
  // silently dropping the write.
  s.meta[id] = current === undefined
    ? {
        category: patch.category ?? 'Mains',
        station: patch.station ?? null,
        portionSize: patch.portionSize ?? null,
        sellingPrice: patch.sellingPrice ?? null,
        note: patch.note ?? '',
        onMenu: patch.onMenu ?? false,
        ...patch,
      }
    : { ...current, ...patch };
}

/**
 * Give an ingredient a rate.
 *
 * One ingredient, referenced by every line that uses it, so this is the whole
 * of the write — nothing downstream is stored, and every dish recosts from it
 * on the next read (FLOWS 6).
 */
export function putIngredient(ingredient: Ingredient, source: RateSource = 'manual'): void {
  const s = state();
  const at = s.ingredients.findIndex((i) => i.id === ingredient.id);

  /*
   * Record before the write, while the old rate is still readable.
   *
   * A confirmation is recorded even though nothing moved. "Days since anyone
   * confirmed it" is not the same figure as "days since it last changed", and
   * a chef who checks the onion price and finds it unchanged has done the work
   * — dropping that record means the screen asks them again tomorrow.
   */
  const before = at === -1 ? undefined : s.ingredients[at];
  if (before !== undefined && ingredient.purchasePrice !== null) {
    const moved = before.purchasePrice !== ingredient.purchasePrice;
    if (moved || source === 'confirmed') {
      const log = s.rateHistory[ingredient.id] ?? [];
      log.unshift({
        from: moved ? before.purchasePrice : ingredient.purchasePrice,
        to: ingredient.purchasePrice,
        on: ingredient.pricedAt ?? new Date().toISOString().slice(0, 10),
        source,
      });
      s.rateHistory[ingredient.id] = log;
    }
  }
  if (at === -1) s.ingredients.push(ingredient);
  else s.ingredients[at] = ingredient;
}

/** How many recipes reach an ingredient, directly or through a sub-recipe. */
export function recipesUsing(ingredientId: string): readonly Recipe[] {
  const s = state();
  const byId = new Map(s.recipes.map((r) => [r.id, r]));

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

  return s.recipes.filter((r) => reaches(r));
}

/** Undo support: the sheet sends back what it had, and this puts it back. */
export function restore(recipe: Recipe, dishMeta: DishMeta | undefined): void {
  putRecipe(recipe);
  if (dishMeta !== undefined) state().meta[recipe.id] = dishMeta;
}

export function currencyCode(): string {
  return state().org.currency;
}

/** Everything the operator answered. Read whole; written by patch. */
export function org(): Org {
  return state().org;
}

/**
 * The costing model as it stands.
 *
 * Every screen that costs anything reads this rather than `DEFAULT_MODEL`, so
 * a target changed in Settings reaches the dashboard, the library and the cost
 * sheet without any of them being told about it.
 */
export function orgModel(): CostingModel {
  const o = state().org;
  return {
    wastagePercent: o.wastagePercent,
    packagingPerPortion: o.packagingPerPortion,
    foodCostTarget: o.foodCostTarget,
    rounding: o.rounding,
  };
}

/**
 * Write part of the org.
 *
 * Currency is refused here and goes through `setCurrency`, which is the only
 * field with a precondition: it cannot move once a rate has been typed in it.
 */
export function setOrg(patch: Partial<Omit<Org, 'currency'>>): void {
  const s = state();
  s.org = { ...s.org, ...patch };
}

/** Kept for the callers that only ever wrote these two. */
export function setOrgModel(patch: {
  wastagePercent?: number;
  packagingPerPortion?: number;
}): void {
  setOrg(patch);
}

/**
 * Whether the currency can still be chosen.
 *
 * Once a dish exists, every rate on it was typed in the currency in force at
 * the time. Changing the label afterwards would not change those figures, so
 * the account would be holding one currency's rates under another's symbol —
 * which is a worse number than any it was meant to fix.
 *
 * Moving an account between currencies for real means converting every rate
 * at a figure the operator supplies, and that is a separate feature.
 */
export function currencyIsSettable(): boolean {
  return state().recipes.length === 0;
}

/**
 * Set the currency the account prices in.
 *
 * Only before there is anything priced. Nothing is converted, because nothing
 * has been entered yet — which is exactly why this is the moment to ask.
 */
export function setCurrency(code: string): void {
  if (!isKnownCurrency(code)) return;
  if (!currencyIsSettable()) return;
  const s = state();
  s.org = { ...s.org, currency: code.toUpperCase() };
}

/** Empty the account, so setup can be walked through again. */
export function clearBook(): void {
  const s = state();
  s.recipes = [];
  s.ingredients = [];
  s.meta = {};
}


/** Who is on the book. Owner and manager; nothing else exists. */
export function members(): readonly Member[] {
  return state().members;
}

export function inviteMember(name: string, email: string, role: Member['role']): void {
  const s = state();
  if (s.members.some((m) => m.email.toLowerCase() === email.toLowerCase())) return;
  s.members.push({ name, email, role, lastIn: null, accepted: false });
}

export function removeMember(email: string): void {
  const s = state();
  // The owner cannot be removed: an account with nobody who can pay for it or
  // change its costing is an account nobody can fix.
  s.members = s.members.filter((m) => m.email !== email || m.role === 'owner');
}

export function setMemberRole(email: string, role: Member['role']): void {
  const s = state();
  const at = s.members.findIndex((m) => m.email === email);
  const found = s.members[at];
  if (found === undefined) return;
  s.members[at] = { ...found, role };
}

export function plan(): Plan {
  return state().plan;
}

export function setPlan(next: Plan): void {
  state().plan = next;
}


/**
 * What this ingredient has cost, newest first.
 *
 * The free tier keeps the last three changes; the paid tier keeps every one.
 * Nothing is deleted at the limit — it is simply not shown, which is the rule
 * for every free-tier cap in the product.
 */
export function rateHistory(id: string, limit?: number): readonly RateChange[] {
  const log = state().rateHistory[id] ?? [];
  return limit === undefined ? log : log.slice(0, limit);
}


/**
 * Put a book in the store. Tests only.
 *
 * Exported so the tests that exercise writes have something to write against.
 * Nothing in `app/` calls this, and nothing should: a running account is
 * whatever its operator entered, starting from nothing.
 */
export function seedForTests(seed: {
  recipes: readonly Recipe[];
  ingredients: readonly Ingredient[];
  meta: Readonly<Record<string, DishMeta>>;
  org?: Partial<Org>;
}): void {
  const s = state();
  s.recipes = [...seed.recipes];
  s.ingredients = [...seed.ingredients];
  s.meta = { ...seed.meta };
  s.org = { ...BLANK_ORG, setupDone: true, ...seed.org };
  s.rateHistory = {};
}

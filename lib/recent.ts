/**
 * What moved, and what it moved.
 *
 * The dashboard's job, per FLOWS 1, is the owner's loop: "open the dashboard,
 * see which dishes drifted, change a rate or a price, close. Five minutes."
 * The word that got lost in the build is *drifted*. What the screen showed was
 * a ranking of every dish by food cost — the same ranking this week as last
 * week unless something moved, and silent about what moved.
 *
 * It could not have shown otherwise: `dashboard()` is handed
 * `{ ids, pantry, meta, model }` and no history at all, so the screen whose job
 * is noticing change was never given the change. The rate history has been
 * loaded on every request the whole time.
 *
 * The trick here is that a rate change is reversible. Every `RateChange`
 * carries the price it moved *from*, so the ingredient list as it stood at the
 * start of the window can be rebuilt exactly, and `impactOf` — which until now
 * has only ever previewed a change nobody had made yet — can be asked about
 * one that already happened.
 */

import type { Ingredient } from "@/core/ingredient";
import type { Recipe } from "@/core/recipe";

import type { CostingModel } from "./costing";
import type { DishMeta } from "./data";
import { type Impact, type Movement, impactOf } from "./impact";
import type { RateChange, RateSource } from "./org";

/** One ingredient's net move across the window, however many steps it took. */
export interface RateMove {
  readonly ingredientId: string;
  readonly name: string;
  /**
   * The price at the start of the window. Null when the ingredient took its
   * first rate inside it — which is a new ingredient, not a price rise, and
   * the screen says so rather than printing a rise from nothing.
   */
  readonly from: number | null;
  readonly to: number;
  /** The pack size those prices were for. A rate is meaningless without it. */
  readonly qty: number;
  /** The most recent change in the window. */
  readonly on: string;
  readonly source: RateSource;
  /** Net percentage move, or null when there was nothing to move from. */
  readonly percent: number | null;
}

/** One mover, with the dishes it actually moved. */
export interface Attributed {
  readonly move: RateMove;
  readonly dishesMoved: number;
  /** Dishes this rate alone pushed across the target line. */
  readonly crossed: readonly Movement[];
}

export interface Recent {
  /** The first day inside the window, inclusive. */
  readonly since: string;
  readonly days: number;
  /**
   * Ingredients whose rate genuinely moved — one price to a different price.
   * Biggest proportional move first.
   */
  readonly moves: readonly RateMove[];
  /**
   * Ingredients that took their first rate in the window.
   *
   * Kept apart from `moves`, and out of the impact entirely, because a rate
   * arriving is not a price rise. Rolling a first rate back leaves the
   * ingredient with no rate at all, which makes every dish above it
   * uncostable — so `impactOf` would report each of those dishes as having
   * risen from nothing, and the screen would say a menu got more expensive
   * when what actually happened is that it became costable.
   *
   * On a freshly imported book this is every rate in the account, which is
   * exactly the case that would otherwise print a wrong and alarming figure.
   */
  readonly arrivals: readonly RateMove[];
  /** The whole window's effect, computed in one pass. */
  readonly impact: Impact;
  /**
   * The few movers worth naming, each with what it moved.
   *
   * Capped, because an import can carry hundreds of rates and a list of
   * hundreds is not a five-minute screen. The total above is exact; this is
   * the part a person reads.
   */
  readonly leaders: readonly Attributed[];
  /** True when nothing at all moved — a good week, not an empty state. */
  readonly quiet: boolean;
}

export interface RecentInput {
  readonly recipes: readonly Recipe[];
  readonly ingredients: readonly Ingredient[];
  readonly meta: Readonly<Record<string, DishMeta>>;
  readonly model: CostingModel;
  readonly history: Readonly<Record<string, readonly RateChange[]>>;
  /** ISO date, `YYYY-MM-DD`. Passed in so this stays pure and testable. */
  readonly today: string;
  readonly days: number;
}

/** How many movers get named before the list stops being a five-minute read. */
const LEADERS = 4;

/** The first day inside a window of `days` ending today, inclusive. */
export function since(today: string, days: number): string {
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - (days - 1));
  return t.toISOString().slice(0, 10);
}

/**
 * Every ingredient whose rate moved in the window, as a single net move.
 *
 * Three changes to one ingredient inside the window is one thing that happened
 * to that ingredient, not three — the owner wants to know where ghee stands
 * now against where it stood a month ago, not to read its diary. So the `from`
 * is the oldest change's `from` and the `to` is the newest change's `to`.
 *
 * ISO dates compare correctly as strings, which is why the history is stored
 * as `YYYY-MM-DD` and why this does no date arithmetic.
 */
export function movesSince(
  history: Readonly<Record<string, readonly RateChange[]>>,
  ingredients: readonly Ingredient[],
  from: string,
): readonly RateMove[] {
  const named = new Map(ingredients.map((i) => [i.id, i.name]));
  const out: RateMove[] = [];

  for (const [id, changes] of Object.entries(history)) {
    const inWindow = changes.filter((c) => c.on >= from);
    if (inWindow.length === 0) continue;

    // The book hands these back newest first. Sorting rather than trusting it
    // means this function is correct on any ordering, including a test's.
    const ordered = [...inWindow].sort((a, b) => a.on.localeCompare(b.on));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (first === undefined || last === undefined) continue;

    // An ingredient deleted since the change is a change to nothing anybody
    // can act on. Left out rather than named as an id.
    const name = named.get(id);
    if (name === undefined) continue;

    out.push({
      ingredientId: id,
      name,
      from: first.from,
      to: last.to,
      qty: last.qty,
      on: last.on,
      source: last.source,
      percent:
        first.from === null || first.from === 0
          ? null
          : ((last.to - first.from) / first.from) * 100,
    });
  }

  // Biggest proportional move first. A first rate has no percentage and sorts
  // last: it is news, but it is not a rise.
  return out.sort(
    (a, b) =>
      Math.abs(b.percent ?? -1) - Math.abs(a.percent ?? -1) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * The ingredient list as it stood before these moves.
 *
 * Both the price and the pack size go back, because a supplier who changes the
 * price often changes the pack — which is why `RateChange` carries `qty` at
 * all. Rolling back the price alone would compare this month's price against
 * last month's per-unit rate and report a move nobody made.
 */
export function rollBack(
  ingredients: readonly Ingredient[],
  moves: readonly RateMove[],
): readonly Ingredient[] {
  const by = new Map(moves.map((m) => [m.ingredientId, m]));
  return ingredients.map((i) => {
    const move = by.get(i.id);
    if (move === undefined) return i;
    return {
      ...i,
      purchasePrice: move.from,
      // A pack size of zero is not a state the engine accepts, so a move that
      // somehow carries one keeps the current pack rather than poisoning the
      // whole costing with a division by nothing.
      purchaseQty: move.qty > 0 ? move.qty : i.purchaseQty,
    };
  });
}

export function recent(input: RecentInput): Recent {
  const from = since(input.today, input.days);
  const all = movesSince(input.history, input.ingredients, from);

  // A rate that arrived is not a rate that moved. See `arrivals` above for
  // why mixing the two makes the impact figure actively wrong.
  const moves = all.filter((m) => m.from !== null);
  const arrivals = all.filter((m) => m.from === null);

  const before = rollBack(input.ingredients, moves);

  /*
   * One pass for the totals, however many rates moved.
   *
   * Attribution needs a pass per ingredient, so an import carrying 238 rates
   * would be 238 full recostings of the whole book. The totals are computed
   * once from the rolled-back list, and only the few movers actually named
   * below pay for a pass of their own.
   */
  const impact = impactOf({
    recipes: input.recipes,
    ingredients: before,
    nextIngredients: input.ingredients,
    meta: input.meta,
    model: input.model,
  });

  const leaders: Attributed[] = moves.slice(0, LEADERS).map((move) => {
    // This one rate rolled back, everything else where it stands — so the
    // dishes named under it are the ones this rate moved, not the ones that
    // moved for any reason this month.
    const alone = rollBack(input.ingredients, [move]);
    const own = impactOf({
      recipes: input.recipes,
      ingredients: alone,
      nextIngredients: input.ingredients,
      meta: input.meta,
      model: input.model,
      ingredientId: move.ingredientId,
    });
    return { move, dishesMoved: own.moved.length, crossed: own.crossing };
  });

  return {
    since: from,
    days: input.days,
    moves,
    arrivals,
    impact,
    leaders,
    // Quiet only when neither happened. An import that filled an empty book is
    // not a quiet month, it is just not a month of price rises.
    quiet: moves.length === 0 && arrivals.length === 0,
  };
}

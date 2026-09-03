/**
 * The shape of a menu — what this kitchen actually cooks.
 *
 * Every other screen answers a question about a dish, a rate or a change. This
 * one answers a question about the place: how big the book is, what it is
 * mostly made of, and which of the four setup answers are in force. It is the
 * page behind the wordmark, which used to lead to the dashboard — the same
 * destination as the Dashboard nav item beside it, so the mark was a second
 * button for a place the user could already reach.
 *
 * Pure, like everything in this folder that decides something. It reads rows
 * that have already been costed and counts them; nothing here computes money.
 */

import type { LibraryRow } from "./library";
import { type Org, taxLabel } from "./org";
import { PRESETS, type PresetName, describeRule } from "@/core/rounding";
import { currency } from "@/core/currency";

/**
 * One line of the menu's shape.
 *
 * `costed` is the count that can state a real cost rather than a floor — a
 * section where those two numbers are far apart is a section with rates
 * missing, which is a more useful thing to know than the total on its own.
 */
export interface Section {
  readonly name: string;
  readonly dishes: number;
  readonly costed: number;
  readonly onMenu: number;
  /** Share of the live dish count, 0–100. Rounded for display only. */
  readonly share: number;
}

export interface Place {
  readonly name: string;
  /** Biggest section first — the shape of the menu is its ordering. */
  readonly sections: readonly Section[];
  readonly dishes: number;
  readonly batches: number;
  readonly ingredients: number;
  /** Dishes that can state a cost rather than a floor. */
  readonly costed: number;
  /** Dishes carrying a price. */
  readonly onMenu: number;
  /**
   * Batches more than one recipe leans on, most-used first.
   *
   * The kitchen's own building blocks, and the thing a menu shape misses if it
   * only counts plated dishes: a café with one masala that reaches eleven
   * dishes is a different operation from one with eleven unrelated dishes.
   */
  readonly shared: readonly {
    readonly name: string;
    readonly usedIn: number;
  }[];
}

export interface PlaceInput {
  readonly org: Org;
  readonly rows: readonly LibraryRow[];
  readonly ingredientCount: number;
}

/** How many shared batches are worth naming before the list stops teaching. */
const SHARED_SHOWN = 6;

export function placeOf(input: PlaceInput): Place {
  // Archived rows are still in the book and are not part of its shape. A
  // section that reads "9 dishes" and lists six is worse than either number.
  const live = input.rows.filter((r) => !r.archived);
  const dishes = live.filter((r) => r.kind === "dish");
  const batches = live.filter((r) => r.kind === "batch");

  const byCategory = new Map<string, LibraryRow[]>();
  for (const row of dishes) {
    const list = byCategory.get(row.category);
    if (list === undefined) byCategory.set(row.category, [row]);
    else list.push(row);
  }

  const sections: Section[] = [...byCategory.entries()]
    .map(([name, rows]) => ({
      name,
      dishes: rows.length,
      costed: rows.filter((r) => r.complete).length,
      onMenu: rows.filter((r) => r.sellingPrice !== null).length,
      share: dishes.length === 0 ? 0 : (rows.length / dishes.length) * 100,
    }))
    // Biggest first, and alphabetical within a tie so the order is stable
    // between requests rather than following whatever Map iteration gave us.
    .sort((a, b) => b.dishes - a.dishes || a.name.localeCompare(b.name));

  const shared = batches
    .filter((b) => b.usedIn > 1)
    .sort((a, b) => b.usedIn - a.usedIn || a.name.localeCompare(b.name))
    .slice(0, SHARED_SHOWN)
    .map((b) => ({ name: b.name, usedIn: b.usedIn }));

  return {
    name: input.org.name,
    sections,
    dishes: dishes.length,
    batches: batches.length,
    ingredients: input.ingredientCount,
    costed: dishes.filter((r) => r.complete).length,
    onMenu: dishes.filter((r) => r.sellingPrice !== null).length,
    shared,
  };
}

/**
 * The four setup answers, written as sentences.
 *
 * Settings shows these as fields to change. Here they are read back as
 * statements, because the question this page answers is "how does this kitchen
 * cost" and a form does not answer it — a row of inputs is a thing to edit,
 * not a thing to understand.
 *
 * Nothing is invented. An unanswered tax treatment says it is unanswered;
 * `taxLabel` already refuses to guess, and this keeps that.
 */
export interface Stance {
  readonly label: string;
  readonly said: string;
}

export function stanceOf(org: Org): readonly Stance[] {
  const cur = currency(org.currency);
  const rule = PRESETS[org.rounding as PresetName];

  return [
    {
      label: "Prices in",
      said: `${cur.name} — ${cur.symbol}, set once and never converted.`,
    },
    { label: "Supplier tax", said: taxLabel(org.taxTreatment) },
    {
      label: "Aiming at",
      said: `${String(org.foodCostTarget)}% food cost, which is what every suggested price is worked back from.`,
    },
    {
      label: "Prices land on",
      said:
        rule === undefined
          ? "No rounding rule set."
          : `Costbook will ${describeRule(rule)}.`,
    },
  ];
}

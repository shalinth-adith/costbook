import { beforeEach, describe, expect, it } from "vitest";

import type { Ingredient } from "@/core/ingredient";

import {
  allIngredients,
  allRateHistory,
  clearBook,
  finishImport,
  lastImport,
  putIngredient,
  startImport,
  undoImport,
} from "./store";

/**
 * Putting an import back.
 *
 * FLOWS 3.3 gives a repeat import seven days rather than a confirm step,
 * "because the user is committing a change to a menu that was already
 * working". These assert the contract the Postgres function in migration 24
 * implements against a live project: the rates go back, the arrivals stay, and
 * an import cannot be put back twice.
 */
const pack = (id: string, price: number | null, qty = 1000): Ingredient =>
  ({
    id,
    name: id,
    family: "mass",
    purchaseQty: qty,
    purchasePrice: price,
    purchaseUnit: "kg",
    yieldPercent: 100,
    yieldIsAssumed: false,
  }) as Ingredient;

/** An import that moves two rates, the way saveBook writes one. */
function anImport(after: readonly Ingredient[]): string {
  const id = startImport("prices.xlsx", { rate: { header: "Rate", at: 4 } });
  const history = allRateHistory();
  for (const next of after) {
    const was = allIngredients().find((i) => i.id === next.id);
    putIngredient(next, "import");
    // The store records the move; stamping it is what `saveBook` does with the
    // import's id, and what makes the whole price list one event.
    const log = history[next.id];
    const top = log?.[0];
    if (top !== undefined && was !== undefined) {
      (log as unknown as { importId?: string }[])[0] = { ...top, importId: id };
    }
  }
  finishImport(id, { ratesUpdated: after.length });
  return id;
}

describe("undoing an import", () => {
  beforeEach(() => {
    clearBook();
  });

  it("puts every rate it moved back, and says how many", () => {
    putIngredient(pack("rice", 40));
    putIngredient(pack("ghee", 300));

    const id = anImport([pack("rice", 55), pack("ghee", 410)]);
    expect(allIngredients().find((i) => i.id === "rice")?.purchasePrice).toBe(
      55,
    );

    const out = undoImport(id);
    expect(out).toEqual({ ok: true, restored: 2 });
    expect(allIngredients().find((i) => i.id === "rice")?.purchasePrice).toBe(
      40,
    );
    expect(allIngredients().find((i) => i.id === "ghee")?.purchasePrice).toBe(
      300,
    );
  });

  it("puts the pack back with the price", () => {
    // A supplier moving a 1 kg bag to a 5 kg sack moves both. Restoring the
    // price alone would price five kilos at the cost of one.
    putIngredient(pack("rice", 40, 1000));
    const id = anImport([pack("rice", 180, 5000)]);

    undoImport(id);
    const back = allIngredients().find((i) => i.id === "rice");
    expect(back?.purchasePrice).toBe(40);
    expect(back?.purchaseQty).toBe(1000);
  });

  it("leaves a rate the import did not touch alone", () => {
    putIngredient(pack("rice", 40));
    putIngredient(pack("salt", 9));

    const id = anImport([pack("rice", 55)]);
    undoImport(id);

    expect(allIngredients().find((i) => i.id === "salt")?.purchasePrice).toBe(
      9,
    );
  });

  it("removes the history it wrote, so the month stops counting it", () => {
    putIngredient(pack("rice", 40));
    const id = anImport([pack("rice", 55)]);

    undoImport(id);
    const left = allRateHistory().rice ?? [];
    expect(left.some((c) => c.importId === id)).toBe(false);
  });

  it("refuses a second time rather than putting back what is already back", () => {
    putIngredient(pack("rice", 40));
    const id = anImport([pack("rice", 55)]);

    expect(undoImport(id).ok).toBe(true);
    const again = undoImport(id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.message).toContain("already");
  });

  it("refuses an import that is not on this book", () => {
    const out = undoImport("import-nothing");
    expect(out.ok).toBe(false);
  });
});

describe("the last import", () => {
  beforeEach(() => {
    clearBook();
  });

  it("is nothing at all for an account that has never imported", () => {
    expect(lastImport()).toBeNull();
  });

  it("carries the map forward, so next month's sheet arrives mapped", () => {
    putIngredient(pack("rice", 40));
    anImport([pack("rice", 55)]);

    const last = lastImport();
    expect(last?.mapping.rate).toEqual({ header: "Rate", at: 4 });
    expect(last?.undoable).toBe(true);
    expect(last?.ratesMoved).toBe(1);
  });

  it("stops offering the undo once it has been used", () => {
    putIngredient(pack("rice", 40));
    const id = anImport([pack("rice", 55)]);
    undoImport(id);

    expect(lastImport()?.undoable).toBe(false);
    expect(lastImport()?.status).toBe("undone");
  });
});

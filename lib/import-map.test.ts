import { describe, expect, it } from "vitest";

import {
  applyRemembered,
  headersUnchanged,
  rememberMap,
  sameHeader,
} from "./import-map";

/**
 * A remembered map is only worth having if it is right. A wrong one is worse
 * than none: it skips the step the operator would have used to catch it, so
 * every case where the sheet changed shape is tested here rather than trusted.
 */
const header = ["Dish", "Ingredient", "Qty", "Unit", "Rate", "Total"];

describe("comparing headers", () => {
  it("ignores case and spacing, which a re-saved sheet changes on its own", () => {
    expect(sameHeader("Qty ", "qty")).toBe(true);
    expect(sameHeader("Rate  per  kg", "rate per kg")).toBe(true);
    expect(sameHeader("Rate:", "Rate")).toBe(true);
  });

  it("does not treat one header as another that merely starts the same", () => {
    // The whole point of exact matching: a fuzzy hit here would map rates to
    // a column of rates-per-kilo and present it as remembered.
    expect(sameHeader("Rate", "Rate/kg")).toBe(false);
    expect(sameHeader("Qty", "Qty (batch)")).toBe(false);
  });
});

describe("remembering a map", () => {
  it("keeps the header text beside the column it sat in", () => {
    const out = rememberMap({ name: 1, qty: 2, rate: 4 }, header);
    expect(out.name).toEqual({ header: "Ingredient", at: 1 });
    expect(out.rate).toEqual({ header: "Rate", at: 4 });
  });

  it("drops a field pointing past the end of the header row", () => {
    // A mapping can outlive the sheet it was made against; remembering an
    // index with no column behind it restores a field to nothing.
    const out = rememberMap({ name: 1, rate: 99 }, header);
    expect(out.rate).toBeUndefined();
    expect(out.name).toBeDefined();
  });

  it("drops a field pointing at a blank header", () => {
    const out = rememberMap({ name: 0, rate: 1 }, ["Dish", "   "]);
    expect(out.rate).toBeUndefined();
  });
});

describe("laying a remembered map over a new sheet", () => {
  const remembered = rememberMap(
    { recipe: 0, name: 1, qty: 2, rate: 4 },
    header,
  );

  it("restores every field when the sheet is the same one", () => {
    const out = applyRemembered(remembered, header, {});
    expect(out.mapping).toEqual({ recipe: 0, name: 1, qty: 2, rate: 4 });
    expect(out.changed).toHaveLength(0);
    expect(out.restored).toHaveLength(4);
  });

  it("follows a column that moved, rather than reading the wrong one", () => {
    // The failure that makes storing indices wrong: a column inserted at the
    // front shifts every one after it.
    const moved = ["Code", ...header];
    const out = applyRemembered(remembered, moved, {});
    expect(out.mapping).toEqual({ recipe: 1, name: 2, qty: 3, rate: 5 });
    expect(out.changed).toHaveLength(0);
  });

  it("asks again only about the column that went missing", () => {
    const without = header.filter((h) => h !== "Rate");
    const out = applyRemembered(remembered, without, {});
    expect(out.changed).toEqual(["rate"]);
    expect(out.mapping.rate).toBeUndefined();
    expect(out.mapping.name).toBe(1);
  });

  it("lets detection fill a column the account has never mapped", () => {
    const grown = [...header, "Yield %"];
    const out = applyRemembered(remembered, grown, { yield: 6 });
    expect(out.mapping.yield).toBe(6);
    expect(out.mapping.rate).toBe(4);
  });

  it("does not let detection overwrite what the operator corrected", () => {
    // Memory wins: the remembered map is one a person fixed by hand, and
    // detection is the guess they were fixing.
    const out = applyRemembered(remembered, header, { rate: 5 });
    expect(out.mapping.rate).toBe(4);
  });

  it("never maps two fields onto one column", () => {
    // A detected field landing on a column memory already claimed is dropped,
    // not doubled up: the parser acts on one of them and which is unknowable.
    const out = applyRemembered(remembered, header, { total: 4 });
    expect(out.mapping.total).toBeUndefined();
    expect(out.mapping.rate).toBe(4);
  });

  it("picks the nearer of two columns sharing a header", () => {
    // A batch Qty and a plate Qty. Either is a defensible guess; the one
    // picked last time is the only one better than a coin toss.
    const twice = ["Dish", "Ingredient", "Qty", "Unit", "Qty", "Rate"];
    const before = rememberMap({ qty: 4, rate: 5 }, twice);
    const out = applyRemembered(before, twice, {});
    expect(out.mapping.qty).toBe(4);
  });
});

describe("whether the map step can be skipped", () => {
  const remembered = rememberMap(
    { recipe: 0, name: 1, qty: 2, rate: 4 },
    header,
  );

  it("is skippable when every remembered column is present", () => {
    expect(headersUnchanged(remembered, header)).toBe(true);
    expect(headersUnchanged(remembered, ["Code", ...header])).toBe(true);
  });

  it("is not skippable when one is missing, whichever one it is", () => {
    expect(
      headersUnchanged(
        remembered,
        header.filter((h) => h !== "Rate"),
      ),
    ).toBe(false);
  });

  it("is not skippable for an account that has never imported", () => {
    expect(headersUnchanged({}, header)).toBe(false);
  });
});

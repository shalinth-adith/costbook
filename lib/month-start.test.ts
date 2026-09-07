import { describe, expect, it } from "vitest";

import { monthStart } from "./engineering";

/**
 * One shape for a month. `dish_sales.period` is a date; a bare YYYY-MM cannot
 * be cast to one, and choosing any month but the default failed at the write
 * because the picker sent that shape. Everything now goes through here.
 */
describe("a month, as the database keys it", () => {
  it("turns YYYY-MM into the first of that month", () => {
    expect(monthStart("2026-08")).toBe("2026-08-01");
  });
  it("leaves a first-of-month date as it is, and folds any other day to the first", () => {
    expect(monthStart("2026-08-01")).toBe("2026-08-01");
    expect(monthStart("2026-08-19")).toBe("2026-08-01");
  });
  it("refuses anything that is not a month", () => {
    expect(monthStart("August 2026")).toBeNull();
    expect(monthStart("2026-13")).toBeNull();
    expect(monthStart("")).toBeNull();
  });
});

/**
 * A dish's name, without the sheet's own index in front of it.
 *
 * The risk here is entirely on the other side: a rule loose enough to strip a
 * number that is part of the dish. "Chicken 65" and "Gravy 2" are names, and a
 * dish silently renamed is the kind of wrong that gets printed on a prep card
 * and taped to a wall before anybody notices.
 */

import { describe, expect, it } from "vitest";

import { tidyDishName } from "./parse";

describe("the sheet index comes off", () => {
  it("removes a two-part index", () => {
    expect(tidyDishName("1.1 Dosa Batter")).toBe("Dosa Batter");
    expect(tidyDishName("9.4 Paniyar Chutney")).toBe("Paniyar Chutney");
  });

  it("removes a three-part index", () => {
    expect(tidyDishName("2.10.3 Rava Pongal")).toBe("Rava Pongal");
  });

  it("removes an index that ends in a dot or a bracket", () => {
    expect(tidyDishName("1.2. Idly Batter")).toBe("Idly Batter");
    expect(tidyDishName("1.2) Idly Batter")).toBe("Idly Batter");
  });

  it("copes with the extra spacing a spreadsheet leaves behind", () => {
    expect(tidyDishName("  5.3   Peanut Chutney ")).toBe("Peanut Chutney");
  });

  it("keeps a name that carries brackets of its own", () => {
    expect(tidyDishName("8.2 Sweet Pongal (Sakkar Pongal)")).toBe(
      "Sweet Pongal (Sakkar Pongal)",
    );
  });
});

describe("a number that is part of the dish stays", () => {
  it("keeps a trailing number", () => {
    // The one that would hurt most. "Chicken 65" is the dish.
    expect(tidyDishName("Chicken 65")).toBe("Chicken 65");
    expect(tidyDishName("Thooku Chatti Parotta - Gravy 2")).toBe(
      "Thooku Chatti Parotta - Gravy 2",
    );
  });

  it("keeps a single leading number, which is not an index", () => {
    // One group is not a sheet index — it is far more likely to be the dish.
    // Two groups is the pattern a workbook actually numbers blocks with.
    expect(tidyDishName("65 Chicken")).toBe("65 Chicken");
    expect(tidyDishName("7 Spice Mix")).toBe("7 Spice Mix");
  });

  it("keeps a number in the middle", () => {
    expect(tidyDishName("Gravy 1 for Parotta")).toBe("Gravy 1 for Parotta");
  });

  it("keeps a decimal that is a quantity", () => {
    // No trailing space after the digits, so nothing is stripped.
    expect(tidyDishName("1.5kg Cake")).toBe("1.5kg Cake");
  });
});

describe("names that are only an index", () => {
  it("keeps the index rather than returning nothing", () => {
    // A row called "1.1" and nothing else is a row whose name we do not know.
    // An empty name is worse than a useless one: it prints as a blank line on
    // every screen and the operator cannot even search for it.
    expect(tidyDishName("1.1")).toBe("1.1");
    expect(tidyDishName("1.1 ")).toBe("1.1");
  });

  it("leaves an already-clean name exactly as it is", () => {
    for (const name of ["Koottu", "Filter Coffee", "NUTS COOKIES", "Dough"]) {
      expect(tidyDishName(name), name).toBe(name);
    }
  });

  it("trims, because a sheet cell almost always has room around it", () => {
    expect(tidyDishName("  Koottu  ")).toBe("Koottu");
  });
});

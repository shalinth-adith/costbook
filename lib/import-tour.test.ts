import { describe, expect, it } from "vitest";

import {
  IMPORT_TOUR,
  importNextLabel,
  shouldImportTour,
} from "./import-tour";

/**
 * The import tour. What is worth proving is that it never forces an upload,
 * that it answers the four questions somebody has about their own file, and
 * that it stops appearing once they have imported.
 */
describe("it never forces anybody", () => {
  it("says Next on every step but the last", () => {
    for (const s of IMPORT_TOUR.slice(0, -1))
      expect(importNextLabel(s.id)).toBe("Next");
  });

  it("ends by handing the screen back", () => {
    expect(importNextLabel("undo")).toBe("Bring in my sheet");
  });
});

describe("the four questions", () => {
  it("promises the file is not altered", () => {
    expect(IMPORT_TOUR[0]?.p).toMatch(/never altered/);
  });

  it("says nothing is written before it is shown", () => {
    expect(IMPORT_TOUR[2]?.p).toMatch(/before anything is written/i);
  });

  it("names the seven days, because that is the promise that removes the fear", () => {
    expect(IMPORT_TOUR[3]?.p).toMatch(/seven days/);
  });

  it("never says shelf", () => {
    const all = IMPORT_TOUR.map((s) => `${s.h} ${s.p}`).join(" ");
    expect(all).not.toMatch(/shelf/i);
  });
});

describe("when it runs", () => {
  it("runs for an account that has never imported", () => {
    expect(
      shouldImportTour({ hasImported: false, forced: false, skipped: false }),
    ).toBe(true);
  });

  it("stops once a sheet has been brought in", () => {
    expect(
      shouldImportTour({ hasImported: true, forced: false, skipped: false }),
    ).toBe(false);
  });

  it("respects a skip", () => {
    expect(
      shouldImportTour({ hasImported: false, forced: false, skipped: true }),
    ).toBe(false);
  });

  it("runs when asked for by name", () => {
    expect(
      shouldImportTour({ hasImported: true, forced: true, skipped: true }),
    ).toBe(true);
  });
});

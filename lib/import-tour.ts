/**
 * The import, shown before a file is dropped.
 *
 * Bringing in a sheet is the one screen in Costbook where the operator risks
 * something they own. A recipe typed wrong is a recipe; a workbook read wrong
 * is every rate in the kitchen, and the fear is not irrational — it is why
 * people keep costing by hand. So this tour is not a feature tour. Each step
 * answers one of the four questions somebody actually has with their own
 * price list in front of them: what will you take, what will you ask me,
 * what lands, and what happens if it is wrong.
 *
 * Same rules as the first-dish tour (lib/tour.ts): Next always moves on,
 * nothing is forced, and the last button hands the screen back. Nobody is
 * made to upload anything to read it.
 */

export type ImportStepId = "file" | "read" | "land" | "undo";

export interface ImportStep {
  readonly id: ImportStepId;
  readonly h: string;
  readonly p: string;
}

export const IMPORT_TOUR: readonly ImportStep[] = [
  {
    id: "file",
    h: "Your own sheet, as it is",
    p: "Excel or CSV, the file you already keep. Merged cells, blank rows, three sheets in one workbook, prices with the currency typed in — it is read as it stands. Your file is opened, never altered, and never sent anywhere but here.",
  },
  {
    id: "read",
    h: "One question, not twenty",
    p: "Costbook reads one of your own rows back to you as a sentence. If that sentence is right, the rest of the sheet is right too — it was all read the same way. A column it cannot place is kept under your own heading rather than dropped.",
  },
  {
    id: "land",
    h: "Nothing lands until you say so",
    p: "Before anything is written you see what would arrive: how many ingredients are new, how many already exist, and every rate that would change. That is the moment to stop, and stopping costs nothing.",
  },
  {
    id: "undo",
    h: "And it can be put back",
    p: "For seven days the whole import can be undone in one press, rates included. Nothing you already costed is lost by trying this.",
  },
];

/** What the button says. The last one hands the screen back. */
export function importNextLabel(id: ImportStepId): string {
  return id === "undo" ? "Bring in my sheet" : "Next";
}

/**
 * Whether the tour runs on its own.
 *
 * On the first visit to Import, before the account has ever imported
 * anything. After that it is there by name — "Show me how this works" — and
 * a skip is remembered per browser so it never nags.
 */
export function shouldImportTour(input: {
  readonly hasImported: boolean;
  readonly forced: boolean;
  readonly skipped: boolean;
}): boolean {
  if (input.forced) return true;
  if (input.skipped) return false;
  return !input.hasImported;
}

/** Where a skip is remembered. Per browser, and only a convenience. */
export const IMPORT_TOUR_SKIPPED_KEY = "costbook:import-tour-skipped";

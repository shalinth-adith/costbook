/**
 * The first dish, taught by entering it.
 *
 * Not a tour of the screen. The usual version — a row of "Next → Next → Got
 * it" bubbles over an empty form — is the most-skipped pattern in software:
 * people click through to reach what they came for and remember nothing,
 * because they were reading about a field they were not yet using.
 *
 * So each step points at one real field and waits until that field has been
 * answered. When the last step is done the owner has a real dish in front of
 * them, entered by their own hand, and every figure on it is theirs.
 *
 * THE WORDS ARE SPENT UNEVENLY, ON PURPOSE. "Dish name" needs one line.
 * Portions needs the most care, because every cost per plate is divided by it
 * and a pot that serves forty typed as one makes every plate look forty times
 * dearer. Pack price is the other trap — the dashboard has already caught a
 * rate twenty-seven times every other ingredient's — and it is taught where it
 * bites, at the step that shows what has no price yet.
 */

export type TourStepId =
  "name" | "portions" | "section" | "paste" | "check" | "create";

export interface TourStep {
  readonly id: TourStepId;
  /** Which of the screen's four numbered cards this sits in. */
  readonly card: 1 | 2 | 3 | 4;
  readonly h: string;
  readonly p: string;
}

export const TOUR: readonly TourStep[] = [
  {
    id: "name",
    card: 1,
    h: "What guests call it",
    p: "The name on your menu. It prints at the top of the prep card, so use the one your kitchen says out loud.",
  },
  {
    id: "portions",
    card: 1,
    h: "Plates from one pot",
    p: "The one people get wrong. If one pot of biryani serves 40 plates, type 40 — not 1. Every cost per plate is divided by this number.",
  },
  {
    id: "section",
    card: 1,
    h: "Where it sits",
    p: "Your menu's own sections. It only groups the list; it changes no figure.",
  },
  {
    id: "paste",
    card: 2,
    h: "Paste what goes in",
    p: "Copy the lines the way you already write them — a note, a message, an old sheet. One ingredient a line: the amount, the unit and the name. Costbook reads them as you type.",
  },
  {
    id: "check",
    card: 3,
    h: "Check what it read",
    // Replaced at runtime by `checkWords` — this is the fallback.
    p: "Each line shows the amount, the unit and the name Costbook read, and where it came from.",
  },
  {
    id: "create",
    card: 4,
    h: "Create it",
    p: "That is everything. Press create and you land on its cost sheet — give it a selling price there, and Costbook tells you what each plate keeps.",
  },
];

/** What the screen knows, as far as the tour needs to. */
export interface TourState {
  readonly name: string;
  readonly portions: number;
  /** Lines Costbook has read out of the paste. */
  readonly counted: number;
  /** Lines naming an ingredient with no price yet. */
  readonly unpriced: number;
}

/**
 * Why this step cannot move on yet, or null if it can.
 *
 * A sentence rather than a disabled button. A greyed-out Next says nothing;
 * this says what is missing and how little is needed to supply it.
 */
export function tourRefusal(id: TourStepId, s: TourState): string | null {
  switch (id) {
    case "name":
      return s.name.trim() === "" ? "Type the dish's name first." : null;
    case "portions":
      return Number.isFinite(s.portions) && s.portions >= 1
        ? null
        : "Enter how many plates one batch makes.";
    case "paste":
      return s.counted === 0
        ? "Paste or type at least one line — “200 g onion” is enough."
        : null;
    default:
      return null;
  }
}

/**
 * The words for Check, chosen by what is actually on the screen.
 *
 * Pack price is taught here and only here, because this is the first moment
 * an ingredient with no price is in front of the owner. Taught up front it is
 * a rule about a field they have not met; taught now it is about the line
 * they are looking at.
 */
export function checkWords(s: TourState): string {
  if (s.unpriced === 0) {
    return "Every line is clear. The tag on each one says where it came from — something on your shelf, or a batch you already make.";
  }
  const which =
    s.unpriced === 1 ? "One line has" : `${String(s.unpriced)} lines have`;
  return `${which} no price yet, and that is fine — it is added later. When you price it, give the pack you buy and what the pack costs: a 5 kg bag at 200. Costbook works out the rate. Typing a rate where it asks for a pack is how one ingredient ends up costing twenty-seven times the rest.`;
}

/**
 * What the Next button says.
 *
 * On portions it names the figure being accepted. The field arrives holding a
 * default, and a default waved through is exactly the mistake that step
 * exists to stop — so the button makes the owner read the number back before
 * it lets them past, without refusing a default that happens to be right.
 */
export function nextLabel(id: TourStepId, s: TourState): string {
  if (id === "portions") {
    return `Yes, ${String(s.portions)} ${s.portions === 1 ? "plate" : "plates"}`;
  }
  if (id === "create") return "Got it";
  return "Next";
}

/**
 * Whether the tour runs.
 *
 * On an empty book, once — the book's own state is the memory, so it works
 * on every device and can never drift out of sync with a flag somewhere. The
 * moment there is a dish, it stops. `?tour=1` runs it regardless, which is
 * both the way back in for somebody who skipped it and how it is recorded.
 * A skip is remembered per browser, so skipping does not nag on every visit.
 */
export function shouldTour(input: {
  readonly recipeCount: number;
  readonly forced: boolean;
  readonly skipped: boolean;
}): boolean {
  if (input.forced) return true;
  if (input.skipped) return false;
  return input.recipeCount === 0;
}

/** Where a skip is remembered. Per browser, and only a convenience. */
export const TOUR_SKIPPED_KEY = "costbook:first-dish-tour-skipped";

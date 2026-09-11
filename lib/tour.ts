/**
 * The first dish, shown before it is entered.
 *
 * Six steps, each lighting one real field on the screen and saying what it is
 * for. Next always moves on: the tour shows where everything is, and filling
 * it in is the owner's, at their own pace — the last button is "Start
 * typing", which ends the tour and puts the cursor at the top.
 *
 * An earlier version waited for each field to be answered before it would
 * move on. The owner's call was that a tour must not force anybody — show,
 * then let them do it — and that is the rule now.
 *
 * THE WORDS ARE SPENT UNEVENLY, ON PURPOSE. "Dish name" needs one line.
 * Portions needs the most care, because every cost per plate is divided by it
 * and a pot that serves forty typed as one makes every plate look forty times
 * dearer. Pack price is taught where it bites, at the step that shows which
 * lines have no price yet.
 *
 * NO "SHELF". The owner reads the product as having an ingredients list,
 * and so does every other screen; "on your shelf" was a word from inside the
 * code that leaked onto this one.
 */

export type TourStepId =
  | "name"
  | "portions"
  | "section"
  | "paste"
  | "check"
  | "create";

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
    p: "Each line shows the amount, the unit and the name Costbook read, and whether it is already in your ingredients.",
  },
  {
    id: "create",
    card: 4,
    h: "Create it",
    p: "When the fields are filled in, this creates the dish and takes you to its cost sheet — give it a selling price there and Costbook tells you what each plate keeps.",
  },
];

/** What Check needs to know about the paste. */
export interface CheckState {
  /** Lines Costbook has read out of the paste. */
  readonly counted: number;
  /** Lines naming an ingredient with no price yet. */
  readonly unpriced: number;
}

/**
 * The words for Check, chosen by what is actually on the screen.
 *
 * With nothing pasted — the usual case in a click-through tour — it explains
 * the three tags the lines will carry. With lines that have no price, it
 * teaches pack price and points at the button that fixes it.
 */
export function checkWords(s: CheckState): string {
  if (s.counted === 0) {
    return "Every line you paste appears here with a tag: in your ingredients (already priced, so it is costed), your batch (a recipe you make), or new — not in your ingredients yet, with an Add its price button that saves it to the list with its pack and price.";
  }
  if (s.unpriced === 0) {
    return "Every line is matched. The tag on each says where it comes from — already in your ingredients, or a batch you make.";
  }
  const which = s.unpriced === 1 ? "One line has" : `${String(s.unpriced)} lines have`;
  return `${which} no price yet. On a new one, press Add its price: give the pack you buy and what the pack costs — a 5 kg bag at 200 — and it is saved to your ingredients list. Typing a rate where it asks for a pack is how one ingredient ends up costing twenty-seven times the rest.`;
}

/** What the button says. The last one hands the screen back. */
export function nextLabel(id: TourStepId): string {
  return id === "create" ? "Start typing" : "Next";
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

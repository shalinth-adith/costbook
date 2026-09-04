/**
 * A line of a recipe, written the way a person writes one.
 *
 * `parse.ts` reads spreadsheets: columns, in a known order, one value a cell.
 * This reads a notebook. "100 g onion", "Onion 100g", "2 kg rice", "Ghee –
 * 50 g", "1/2 kg sugar" — the same line, six ways, because the person typing
 * it is a chef and not a data-entry clerk.
 *
 * The reason it exists at all is the thing every costing product loses users
 * to: manual entry. Operators report ten hours a week on it and quit before
 * the payoff arrives. The fastest entry any of them offer is a box you paste
 * a recipe into, and a box you paste a recipe into needs something to read it.
 *
 * Deliberately not clever. It finds a number, a unit next to that number, and
 * calls everything else the name. Where it cannot tell, it says so and hands
 * the line back for a person to settle rather than guessing — a wrong quantity
 * is a wrong cost, and a wrong cost is a wrong price on a menu.
 */

import { isKnownUnit, normaliseUnit } from "./units";

export interface LooseLine {
  /** What was typed, kept whole so the screen can show it back. */
  readonly raw: string;
  readonly name: string;
  /** Null when no quantity could be found. The line still comes through. */
  readonly qty: number | null;
  /** Normalised where recognised — `gms` becomes `g`. Null when absent. */
  readonly unit: string | null;
  /**
   * Why this line needs a person.
   *
   * `null` means it read cleanly. Anything else is shown against the line
   * rather than resolved by guessing.
   */
  readonly needs: "quantity" | "unit" | "name" | null;
  /**
   * A rate written on the line, the way a kitchen's own sheet carries one
   * beside every ingredient: "260 g Onion @ 5.08/kg". Per `rateUnit`, which
   * is the unit after the slash, or the line's own unit when none is given.
   * Null when the line carries none, in which case the shelf's rate applies.
   */
  readonly rate: number | null;
  readonly rateUnit: string | null;
  /** "50 ml Ghee per plate": this line goes on every item, not into the batch. */
  readonly perPlate: boolean;
}

/** `1/2`, `3/4`, and the fraction characters a phone keyboard produces. */
const VULGAR: Readonly<Record<string, number>> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
};

/**
 * A number, however it was written.
 *
 * Handles `1/2`, `1 1/2`, `1.5`, `1,5` and the vulgar fractions. Returns null
 * rather than NaN, because NaN propagates into a cost and prints as a figure.
 */
export function looseNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;

  const vulgar = VULGAR[t];
  if (vulgar !== undefined) return vulgar;

  // "1 1/2" — a whole followed by a fraction.
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (mixed !== null) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den === 0) return null;
    return whole + num / den;
  }

  // "1/2"
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac !== null) {
    const den = Number(frac[2]);
    if (den === 0) return null;
    return Number(frac[1]) / den;
  }

  // "1½"
  const withVulgar = /^(\d+)\s*([¼½¾⅓⅔⅛])$/.exec(t);
  if (withVulgar !== null) {
    const part = VULGAR[withVulgar[2] ?? ""];
    if (part !== undefined) return Number(withVulgar[1]) + part;
  }

  // A comma decimal is a decimal in most of the world. A comma between two
  // groups of three is a thousands separator; that is what the length check
  // below is doing rather than a locale setting nobody has been asked for.
  const normalised = /^\d+,\d{3}(,\d{3})*$/.test(t)
    ? t.replace(/,/g, "")
    : t.replace(",", ".");
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/** Anything that is punctuation between a quantity and a name. */
const SEPARATOR = /^[\s\-–—:,•*]+|[\s\-–—:,•*]+$/g;

/**
 * Read one written line.
 *
 * The order it tries things in is the whole of it:
 *
 *   1. A quantity and unit at the start — "100 g onion". The commonest.
 *   2. A quantity and unit at the end — "onion 100 g". The next commonest,
 *      and what anyone converting a column layout by hand writes.
 *   3. A bare quantity at either end — "2 onions", "onions 2".
 *
 * A unit is only taken as a unit when it sits against the number. "Oil" in
 * "1 tin oil" is not a unit even though "tin" might be, because taking it
 * would leave the line named "oil" and quantified in tins of nothing.
 */
export function parseLooseLine(raw: string): LooseLine {
  let line = raw.trim();
  if (line === "") {
    return { raw, name: "", qty: null, unit: null, needs: "name", rate: null, rateUnit: null, perPlate: false };
  }

  const clean = (s: string): string => s.replace(SEPARATOR, "").trim();

  /*
   * The sheet's own column order first: "Onion, 0.26, kg, 5.08" or the same
   * with tabs, which is what a row copied out of a costing sheet looks like.
   * Name, quantity, unit, and the rate per that unit. Three fields with a
   * number in the second is the shape; anything else reads as a sentence.
   */
  const cols = line.split(/\t|\s*,\s*/).map((c) => c.trim());
  if (cols.length >= 3 && cols[0] !== "" && looseNumber(cols[1] ?? "") !== null && /^[A-Za-z]+$/.test(cols[2] ?? "")) {
    const qty = looseNumber(cols[1] ?? "");
    const word = cols[2] ?? "";
    // "portion", "tin", "serving": a word Costbook cannot weigh. With a rate
    // beside it the line is a cost with a label — 13 portions at 0.5 is 6.50
    // — and needs nothing more; without one it needs a unit, as before.
    const unit = isKnownUnit(word) ? normaliseUnit(word) : null;
    const rate = cols.length >= 4 ? looseNumber(cols[3] ?? "") : null;
    const name = clean(cols[0] ?? "");
    return {
      raw, name, qty, unit,
      needs: unit === null && rate === null ? "unit" : null,
      rate,
      rateUnit: rate === null ? null : (unit ?? word.toLowerCase()),
      perPlate: false,
    };
  }

  // "… per plate" / "… each": on every item, not in the batch.
  let perPlate = false;
  const plate = /\s*\b(?:per\s+(?:plate|item|portion|serving|piece|head)|each|a\s+plate)\s*$/i.exec(line);
  if (plate !== null) {
    perPlate = true;
    line = line.slice(0, plate.index).trim();
  }

  // "… @ 5.08/kg", "… at 5.08 per kg", "… = 5.08 a kg": a rate for this line.
  let rate: number | null = null;
  let rateUnit: string | null = null;
  const at = /(?:@|\bat\b|=)?\s*([\d.,]+)\s*(?:\/|\bper\b|\ban?\b)\s*([A-Za-z]+)\s*$/i.exec(line);
  if (at !== null) {
    const r = looseNumber(at[1] ?? "");
    const u = at[2] ?? "";
    // The rate's unit may be one Costbook weighs ("kg") or the sheet's own
    // word ("portion"); either way the figure on the line is the rate.
    if (r !== null && u !== "") {
      rate = r;
      rateUnit = isKnownUnit(u) ? normaliseUnit(u) : u.toLowerCase();
      line = clean(line.slice(0, at.index));
    }
  }

  const read = (l: LooseLine): LooseLine => ({
    ...l,
    rate,
    // "13 portion Poriya (side) @ 0.5" — a cost with a label, not a measurement.
    // With a rate on it the line needs nothing more from a person.
    needs: l.needs === "unit" && rate !== null ? null : l.needs,
    rateUnit: rate === null ? null : (rateUnit ?? l.unit),
    perPlate,
  });

  // 1 — leading quantity, optional unit stuck to it or spaced from it.
  const lead =
    /^([\d.,/¼½¾⅓⅔⅛]+(?:\s+\d+\s*\/\s*\d+)?)\s*([A-Za-z]+)?\s*(.*)$/.exec(line);
  if (lead !== null) {
    const qty = looseNumber(lead[1] ?? "");
    const maybeUnit = lead[2] ?? "";
    const rest = lead[3] ?? "";
    if (qty !== null) {
      const unit =
        maybeUnit !== "" && isKnownUnit(maybeUnit)
          ? normaliseUnit(maybeUnit)
          : null;
      // A word that is not a unit belongs to the name: "2 large onions".
      const name = clean(
        unit === null && maybeUnit !== "" ? `${maybeUnit} ${rest}` : rest,
      );
      if (name !== "") {
        return read({ raw, name, qty, unit, needs: unit === null ? "unit" : null, rate: null, rateUnit: null, perPlate: false });
      }
      // "500 g" and nothing else — a quantity with nothing to weigh.
      return read({ raw, name: "", qty, unit, needs: "name", rate: null, rateUnit: null, perPlate: false });
    }
  }

  // 2 — trailing quantity and unit: "Onion 100 g", "Onion - 100g".
  const tail = /^(.*?)[\s\-–—:,]*([\d.,/¼½¾⅓⅔⅛]+)\s*([A-Za-z]+)?\s*$/.exec(
    line,
  );
  if (tail !== null) {
    const qty = looseNumber(tail[2] ?? "");
    const maybeUnit = tail[3] ?? "";
    const name = clean(tail[1] ?? "");
    const unit =
      maybeUnit !== "" && isKnownUnit(maybeUnit)
        ? normaliseUnit(maybeUnit)
        : null;
    /*
     * A trailing number is only a quantity when a unit follows it.
     *
     * "Onion 100" could be a hundred grams or a hundred onions, and "Chicken
     * 65" is neither — it is the dish. Nothing in the string tells them apart,
     * so taking the number would be inventing a figure, which is the one thing
     * this codebase refuses to do. The line falls through to needing a
     * quantity, and the chef types one. A keystroke is cheaper than a menu
     * priced off a number nobody entered.
     */
    if (qty !== null && name !== "" && unit !== null) {
      return read({ raw, name, qty, unit, needs: null, rate: null, rateUnit: null, perPlate: false });
    }
  }

  // 3 — no number anywhere. A named line waiting for a quantity, which is a
  // perfectly ordinary thing to paste: a chef lists what goes in before how
  // much of it.
  return read({ raw, name: clean(line), qty: null, unit: null, needs: "quantity", rate: null, rateUnit: null, perPlate: false });
}

/**
 * Read a pasted block.
 *
 * Blank lines are separators, not entries. A line ending in a colon is a
 * heading — "For the tempering:" — and headings are dropped rather than turned
 * into an ingredient nobody can cost.
 */
export function parseLooseBlock(text: string): readonly LooseLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .filter((l) => !/:$/.test(l))
    .map(parseLooseLine);
}

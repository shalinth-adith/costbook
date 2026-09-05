/**
 * The prep card's content, taken from the dish rather than invented.
 *
 * The card printed a fixed five-step podi-idly method, a fixed "9 min", and a
 * fixed "Milk · Sesame" on every dish in the book — so Palkova cake carried
 * Podi Idly's method and an allergen line nobody had entered. A card taped to
 * a kitchen wall is read and acted on; a fabricated allergen on it is the
 * worst thing this product could print.
 *
 * The rule is the one the rest of Costbook already keeps: show what the
 * operator gave us, show nothing where they gave us nothing.
 */

export interface MethodLine {
  /** Exactly what the operator wrote, their own numbering included. */
  readonly text: string;
  /** "Step 2: Palkova Cream Preparation" — a group, not an instruction. */
  readonly heading: boolean;
}

/**
 * A method written in one cell, read back as the lines the operator wrote.
 *
 * Deliberately not renumbered. The reference workbook's Palkova cake is five
 * named groups of numbered sub-steps — "Step 1: Cake Preparation", then 1..7,
 * then "Step 2: …". Flattening that into one 1..30 list would renumber every
 * instruction away from the sheet the kitchen already knows, and print the
 * group headings as though they were steps. So the card supplies no numbers
 * and the text arrives as written.
 */
export function methodLines(method: string | null | undefined): readonly MethodLine[] {
  if (method === null || method === undefined) return [];
  return method
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((text) => ({ text, heading: isHeading(text) }));
}

/** A group title rather than an instruction. */
function isHeading(line: string): boolean {
  if (/^step\s+\d/i.test(line)) return true;
  // "Topping:" — a short label ending in a colon, not a sentence containing one.
  return line.endsWith(':') && line.length <= 48 && !/[.!?]/.test(line);
}

/**
 * Allergens, only where someone stated them.
 *
 * Never derived from ingredient names: "Milk" in a name is a guess, and a
 * guess printed under CONTAINS is worse than an empty line, because a kitchen
 * cannot tell the two apart.
 */
export function allergensFrom(custom: Readonly<Record<string, string>> | undefined): readonly string[] {
  if (custom === undefined) return [];
  for (const [heading, value] of Object.entries(custom)) {
    const key = heading.toLowerCase().replace(/[^a-z]/g, '');
    if (key === 'allergens' || key === 'contains' || key === 'allergen') {
      return value
        .split(/[,;·|]/)
        .map((a) => a.trim())
        .filter((a) => a !== '');
    }
  }
  return [];
}

/**
 * The keys Costbook writes when somebody types these on the dish itself.
 *
 * The same shelf an imported sheet's columns land on, read by the three
 * functions here — so a column called "Allergens" from a workbook and a line
 * typed into the dish sheet are the same fact, and neither overwrites the
 * other by accident.
 */
export const PREP_KEYS = {
  contains: 'Contains',
  prepTime: 'Prep time',
  doNot: 'Do not',
} as const;

/** What must not happen to this dish. Printed under the method, in its own box. */
export function doNotFrom(custom: Readonly<Record<string, string>> | undefined): string | null {
  if (custom === undefined) return null;
  for (const [heading, value] of Object.entries(custom)) {
    const key = heading.toLowerCase().replace(/[^a-z]/g, '');
    if (key === 'donot' || key === 'never' || key === 'donotdo') {
      const said = value.trim();
      if (said !== '') return said;
    }
  }
  return null;
}

/** Prep time, only where the sheet carried a column for it. */
export function prepTimeFrom(custom: Readonly<Record<string, string>> | undefined): string | null {
  if (custom === undefined) return null;
  for (const [heading, value] of Object.entries(custom)) {
    const key = heading.toLowerCase().replace(/[^a-z]/g, '');
    if (key === 'preptime' || key === 'time' || key === 'cooktime' || key === 'preparationtime') {
      const said = value.trim();
      if (said !== '') return said;
    }
  }
  return null;
}

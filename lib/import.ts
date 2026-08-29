/**
 * Turning a spreadsheet into a costed menu.
 *
 * The wedge. Nobody retypes a menu, so the first thing Costbook has to do is
 * read the file the operator already keeps (PRD 3). `core/parse.ts` does the
 * reading; this decides what the rows mean and what committing them would do.
 *
 * Nothing is written until the last step, and the summary shown before that
 * step is the same object that performs it — so what the operator agreed to is
 * exactly what happens.
 */

import type { Ingredient } from '@/core/ingredient';
import { ingredientFromPack } from '@/core/ingredient';
import type { ParseResult, ParsedBlock, ParsedLine } from '@/core/parse';
import type { Recipe, RecipeComponent } from '@/core/recipe';
import { flatComponent, ingredientComponent } from '@/core/recipe';
import { type UnitFamily, unitFamily } from '@/core/units';

export interface PlannedIngredient {
  readonly ingredient: Ingredient;
  /** True when an ingredient of this name is already on file. */
  readonly existing: boolean;
  /** The rate as it stands now, when there is one to compare against. */
  readonly wasRate: number | null;
}

export interface PlannedRecipe {
  readonly recipe: Recipe;
  readonly category: string;
  /** Lines the sheet carried that could not be turned into components. */
  readonly skipped: number;
}

export interface ImportPlan {
  readonly ingredients: readonly PlannedIngredient[];
  readonly recipes: readonly PlannedRecipe[];
  /** What arrives, for the summary shown before committing. */
  readonly summary: {
    readonly ingredientsNew: number;
    readonly ratesUpdated: number;
    readonly dishes: number;
    readonly rowsSkipped: number;
  };
}

export type WarningTone = 'review' | 'flag' | 'block';

export interface WarningGroup {
  readonly code: string;
  readonly title: string;
  readonly body: string;
  readonly items: readonly string[];
  readonly tone: WarningTone;
}

function familyOf(unit: string | null): UnitFamily {
  return unit === null ? 'mass' : (unitFamily(unit) ?? 'mass');
}

/** A readable id from a name, so a second import of the same sheet matches. */
function idFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * What committing this file would do.
 *
 * An ingredient is created at a pack of one unit priced at the sheet's rate,
 * because that is the only thing the sheet actually says. Where the sheet has
 * a spend and a quantity instead, the rate is derived from them - which is how
 * the information arrives in most real files (TRD 6.6).
 */
export function planImport(
  parsed: ParseResult,
  existing: readonly Ingredient[],
  today: string,
): ImportPlan {
  const byName = new Map(existing.map((i) => [i.name.toLowerCase(), i]));
  const planned = new Map<string, PlannedIngredient>();
  const recipes: PlannedRecipe[] = [];
  let skippedTotal = 0;

  for (const block of parsed.blocks) {
    const components: RecipeComponent[] = [];
    let skipped = 0;

    for (const line of block.lines) {
      // A word that is not a unit is a cost with a label, not a measurement.
      if (line.kind === 'flat') {
        const amount = line.total ?? line.rate ?? 0;
        components.push(flatComponent(line.name, amount));
        continue;
      }

      if (line.qty === null || line.unit === null) {
        skipped += 1;
        continue;
      }

      const key = line.name.toLowerCase();
      const already = planned.get(key);
      const onFile = byName.get(key);

      const rate = rateOf(line);
      const ingredient =
        already?.ingredient ??
        makeIngredient(line, onFile, rate, today);

      if (already === undefined) {
        planned.set(key, {
          ingredient,
          existing: onFile !== undefined,
          wasRate: onFile?.purchasePrice ?? null,
        });
      }

      try {
        components.push(ingredientComponent(ingredient, line.qty, line.unit));
      } catch {
        // A line Costbook cannot measure is skipped rather than guessed at.
        skipped += 1;
      }
    }

    if (components.length === 0) {
      skippedTotal += skipped;
      continue;
    }

    recipes.push({
      recipe: {
        id: idFor(block.name === '' ? `sheet-${block.row}` : block.name),
        name: block.name === '' ? 'Untitled from your sheet' : block.name,
        family: 'count',
        // Output and portions are the operator's to state, never inferred from
        // the inputs - the reference workbook infers them and gets it wrong
        // three ways (TRD 6.3). One portion until they say otherwise.
        outputQty: 1,
        outputUnit: 'pc',
        portions: 1,
        components,
      },
      category: 'From your sheet',
      skipped,
    });
    skippedTotal += skipped;
  }

  const list = [...planned.values()];

  return {
    ingredients: list,
    recipes,
    summary: {
      ingredientsNew: list.filter((p) => !p.existing).length,
      ratesUpdated: list.filter((p) => p.existing).length,
      dishes: recipes.length,
      rowsSkipped: skippedTotal,
    },
  };
}

/** The rate a line carries, whichever way the sheet stated it (TRD 6.6). */
function rateOf(line: ParsedLine): number | null {
  if (line.rate !== null) return line.rate;
  if (line.total !== null && line.qty !== null && line.qty > 0) return line.total / line.qty;
  return null;
}

function makeIngredient(
  line: ParsedLine,
  onFile: Ingredient | undefined,
  rate: number | null,
  today: string,
): Ingredient {
  const unit = line.unit ?? 'g';

  // A pack of one unit at the sheet's rate is the only thing the sheet says.
  const made = ingredientFromPack({
    id: onFile?.id ?? idFor(line.name),
    name: line.name,
    family: familyOf(line.unit),
    packQty: 1,
    packUnit: unit,
    packPrice: rate,
  });

  // Never invent a rate. A row without one arrives unpriced and the dishes
  // using it report a floor until somebody enters it (TRD 7).
  return rate === null ? made : { ...made, pricedAt: today };
}

/**
 * The warnings, grouped by kind and sorted by consequence rather than by row.
 *
 * Most are informational and can be left. Only the one that genuinely stops a
 * dish being costed gets a solid dark mark - a warning list is the first thing
 * a new owner sees, and it is mostly their own housekeeping (A7, FLOWS 3).
 */
export function groupWarnings(parsed: ParseResult): readonly WarningGroup[] {
  const by = new Map<string, string[]>();
  for (const w of parsed.warnings) {
    const list = by.get(w.code) ?? [];
    list.push(w.subject);
    by.set(w.code, list);
  }

  const groups: WarningGroup[] = [];
  const add = (code: string, title: (n: number) => string, body: string, tone: WarningTone) => {
    const items = by.get(code);
    if (items === undefined || items.length === 0) return;
    groups.push({
      code,
      title: title(items.length),
      body,
      items: [...new Set(items)].slice(0, 8),
      tone,
    });
  };

  add(
    'possible_sub_recipe',
    (n) => `${n} ${n === 1 ? 'line looks' : 'lines look'} like a recipe you already have`,
    'Your sheet has been standing in for these with a hand-guessed rate. Link one and Costbook carries its real cost and yield across instead — which is the thing a spreadsheet cannot do.',
    'flag',
  );
  add(
    'no_rate',
    (n) => `${n} ${n === 1 ? 'ingredient has' : 'ingredients have'} no rate`,
    'They come in unpriced. Every dish using one shows its cost as a floor rather than a cost until you give it a rate — nothing is guessed.',
    'review',
  );
  add(
    'magnitude_suspect',
    (n) => `${n} ${n === 1 ? 'quantity does' : 'quantities do'} not suit the unit beside it`,
    'The figure has been kept exactly as written. Spreadsheets often label a column in grams and hold kilograms, and correcting that silently would be worse than pointing at it.',
    'flag',
  );
  add(
    'unrecognised_unit',
    (n) => `${n} ${n === 1 ? 'line uses a word' : 'lines use words'} Costbook does not measure in`,
    'Lot, as required, pinch, packet. They arrive as a cost with a label rather than a quantity — they add to the batch and stay out of every yield.',
    'review',
  );
  add(
    'inconsistent_total',
    (n) => `${n} ${n === 1 ? 'row disagrees' : 'rows disagree'} with its own arithmetic`,
    'The rate and the total do not multiply out. Both figures are kept for you to choose between.',
    'flag',
  );
  add(
    'no_quantity',
    (n) => `${n} ${n === 1 ? 'row has' : 'rows have'} no quantity`,
    'They cannot be costed as a measured line yet, so they are left out rather than brought in as something they are not.',
    'review',
  );
  add(
    'unmapped_columns',
    () => 'Some columns were not recognised',
    'Nothing is discarded. They stay in your file exactly as they are, and Costbook simply does not read them.',
    'review',
  );

  // Sorted by consequence: what blocks, then what needs a look, then the rest.
  const rank: Record<WarningTone, number> = { block: 0, flag: 1, review: 2 };
  return [...groups].sort((a, b) => rank[a.tone] - rank[b.tone]);
}

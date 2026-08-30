/**
 * How that figure is made (A28, and TRD build step 21).
 *
 * Every figure on the cost sheet traces to a step here. The point is not to
 * show working for its own sake — it is that a costing figure nobody can check
 * is a figure nobody trusts, and an owner who cannot follow the arithmetic will
 * go back to the spreadsheet they could follow.
 *
 * Each step names where its figure came from: this recipe, an ingredient, a
 * sub-recipe, or the organisation's settings. The last of those is what carries
 * a DEFAULT chip, because it is the only kind the operator did not enter.
 */

import type { RecipeCost } from '@/core/recipe';

import type { CostBuildUp, CostingModel } from './costing';

export type StepSource = 'recipe' | 'ingredient' | 'sub-recipe' | 'organisation';

export interface InspectorStep {
  readonly n: number;
  readonly label: string;
  /** Where the figure comes from, in the operator's words. */
  readonly from: string;
  readonly source: StepSource;
  /** Null when the step contributes nothing of its own to display. */
  readonly amount: number | null;
  /** The figure after this step. Null when the chain has no per-portion side. */
  readonly running: number | null;
  /** True for a figure Costbook supplied rather than one that was entered. */
  readonly isDefault: boolean;
  /** Sub-recipes unfolded here rather than opened elsewhere. */
  readonly children?: readonly {
    readonly name: string;
    readonly note: string;
    readonly amount: number;
  }[];
}

export function inspect(
  cost: RecipeCost,
  build: CostBuildUp,
  model: CostingModel,
  suggested: number | null,
): readonly InspectorStep[] {
  const steps: InspectorStep[] = [];

  const lineCount = cost.lines.length;
  const nested = cost.lines.filter((l) => l.refId !== null && l.kind === 'recipe');
  const flatLines = build.linesTotal - nested.reduce((n, l) => n + (l.cost ?? 0), 0);

  steps.push({
    n: 1,
    label: `${lineCount} component ${lineCount === 1 ? 'line' : 'lines'}, each at its own rate`,
    from: 'from this recipe · quantities as written, gross of yield',
    source: 'recipe',
    amount: flatLines,
    running: flatLines,
    isDefault: false,
  });

  // Yield is already inside step 1's figure. Saying so is the point: an owner
  // who cannot see where the peel went assumes it was forgotten.
  const yielded = cost.lines.filter((l) => l.yieldPercent !== null && l.yieldPercent < 100);
  if (yielded.length > 0) {
    steps.push({
      n: steps.length + 1,
      label: 'Yield applied line by line',
      from: `from each ingredient · ${yielded
        .slice(0, 3)
        .map((l) => `${l.name} at ${l.yieldPercent}%`)
        .join(', ')}${yielded.length > 3 ? `, and ${yielded.length - 3} more` : ''} — already inside the figure above`,
      source: 'ingredient',
      amount: null,
      running: flatLines,
      isDefault: false,
    });
  }

  if (nested.length > 0) {
    const nestedTotal = nested.reduce((n, l) => n + (l.cost ?? 0), 0);
    steps.push({
      n: steps.length + 1,
      label: `${nested.length} sub-${nested.length === 1 ? 'recipe' : 'recipes'}, at ${nested.length === 1 ? 'its' : 'their'} own batch cost`,
      from: 'unfolded here rather than opened elsewhere',
      source: 'sub-recipe',
      amount: nestedTotal,
      running: build.linesTotal,
      isDefault: false,
      children: nested.map((l) => ({
        name: l.name,
        note: l.note ?? '',
        amount: l.cost ?? 0,
      })),
    });
  }

  if (build.portions !== null && build.ingredientsPerPortion !== null) {
    steps.push({
      n: steps.length + 1,
      label: `Divided by ${build.portions} ${build.portions === 1 ? 'portion' : 'portions'}`,
      from: 'from this dish · what the batch is written to serve',
      source: 'recipe',
      amount: null,
      running: build.ingredientsPerPortion,
      isDefault: false,
    });
  }

  if (build.wastage !== null) {
    steps.push({
      n: steps.length + 1,
      label: `Wastage at ${model.wastagePercent.toFixed(1)}%`,
      from: 'from the organisation · spillage, trim, the pan that got away',
      source: 'organisation',
      amount: build.wastage.amount,
      running: null,
      isDefault: build.wastage.isDefault,
    });
  }

  if (build.packaging !== null) {
    steps.push({
      n: steps.length + 1,
      label: 'Packaging',
      from: 'from the organisation · the counter service allowance',
      source: 'organisation',
      amount: build.packaging.amount,
      running: build.total,
      isDefault: build.packaging.isDefault,
    });
  }

  if (suggested !== null && build.total !== null) {
    const raw = build.total / (model.foodCostTarget / 100);
    steps.push({
      n: steps.length + 1,
      label: `Plate cost ÷ ${model.foodCostTarget.toFixed(1)}% target, then rounded`,
      from: `from the organisation · ${build.total.toFixed(2)} ÷ ${(model.foodCostTarget / 100).toFixed(2)} = ${raw.toFixed(2)}`,
      source: 'organisation',
      amount: null,
      running: suggested,
      isDefault: true,
    });
  }

  return steps;
}

/** Plain text, for the Copy button. A figure you can paste is a figure you can check. */
export function asText(steps: readonly InspectorStep[], title: string): string {
  const rows = steps.map((s) => {
    const amt = s.amount === null ? '' : s.amount.toFixed(2);
    const run = s.running === null ? '' : s.running.toFixed(2);
    const kids = (s.children ?? []).map((c) => `      ${c.name} — ${c.note} — ${c.amount.toFixed(2)}`);
    return [`${s.n}. ${s.label}${amt === '' ? '' : `  ${amt}`}${run === '' ? '' : `  → ${run}`}`,
      `      ${s.from}`, ...kids].join('\n');
  });
  return [`How ${title} is costed`, '', ...rows].join('\n');
}

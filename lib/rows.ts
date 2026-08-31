/**
 * Database rows into the shapes `core/` costs, and back.
 *
 * The only place in the application that knows what a Postgres row looks like.
 * `core/` never sees one — it takes plain objects and returns plain objects,
 * which is the boundary that let the whole engine be written and verified
 * before a database existed (TRD 2).
 *
 * Every quantity crosses this line in BASE units, in both directions. The
 * column is `numeric` and the domain is a number; nothing is converted here,
 * because a conversion in a mapping layer is a conversion nobody can find.
 */

import type { Ingredient } from '@/core/ingredient';
import type { LineEntry, Recipe, RecipeComponent } from '@/core/recipe';
import type { UnitFamily } from '@/core/units';

import type { DishMeta } from './data';
import type { Charge } from '@/core/charges';
import type { Org, TaxTreatment } from './org';
import type { PresetName } from '@/core/rounding';

/* ── ingredients ──────────────────────────────────────────────────────────── */

export interface IngredientRow {
  id: string;
  name: string;
  family: string;
  purchase_qty: number | string;
  purchase_price: number | string | null;
  purchase_unit: string;
  yield_percent: number | string;
  yield_is_assumed: boolean;
  supplier: string | null;
  priced_at: string | null;
  locked_by: string | null;
}

/** `numeric` arrives as a string from PostgREST when it will not fit a float. */
const num = (v: number | string | null | undefined): number =>
  v === null || v === undefined ? 0 : typeof v === 'number' ? v : Number(v);

const nullableNum = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : Number(v);

export function toIngredient(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    name: row.name,
    family: row.family as UnitFamily,
    purchaseQty: num(row.purchase_qty),
    // Null stays null. It means no rate on file, and zero means free.
    purchasePrice: nullableNum(row.purchase_price),
    purchaseUnit: row.purchase_unit,
    yieldPercent: num(row.yield_percent),
    yieldIsAssumed: row.yield_is_assumed,
    ...(row.supplier === null ? {} : { supplier: row.supplier }),
    ...(row.priced_at === null ? {} : { pricedAt: row.priced_at }),
    ...(row.locked_by === null ? {} : { lockedBy: row.locked_by }),
  };
}

export function fromIngredient(i: Ingredient, orgId: string): Record<string, unknown> {
  return {
    id: i.id,
    org_id: orgId,
    name: i.name,
    family: i.family,
    purchase_qty: i.purchaseQty,
    purchase_price: i.purchasePrice,
    purchase_unit: i.purchaseUnit,
    yield_percent: i.yieldPercent,
    yield_is_assumed: i.yieldIsAssumed,
    supplier: i.supplier ?? null,
    priced_at: i.pricedAt ?? null,
    locked_by: i.lockedBy ?? null,
  };
}

/* ── recipes and their components ─────────────────────────────────────────── */

export interface ComponentRow {
  id?: string;
  recipe_id: string;
  position: number;
  kind: 'ingredient' | 'recipe' | 'flat';
  scope: 'batch' | 'portion';
  ingredient_id: string | null;
  child_recipe_id: string | null;
  label: string | null;
  qty: number | string | null;
  unit: string | null;
  note: string | null;
  rate_override: number | string | null;
  line_total: number | string | null;
}

export interface RecipeRow {
  id: string;
  name: string;
  category: string | null;
  station: string | null;
  family: string;
  output_qty: number | string;
  output_unit: string;
  portions: number | string | null;
  portion_size: string | null;
  selling_price: number | string | null;
  delivery_price: number | string | null;
  on_menu: boolean;
  archived: boolean;
  notes: string | null;
  method: string | null;
  updated_at: string | null;
  custom: unknown;
}

/**
 * How a line was entered (TRD 6.6).
 *
 * Both columns null means the line takes the ingredient's own rate — which is
 * the ordinary case, and the reason changing one rate moves every dish.
 */
function toEntry(row: ComponentRow): LineEntry {
  const rate = nullableNum(row.rate_override);
  if (rate !== null) return { mode: 'rate', ratePerBaseUnit: rate };
  const total = nullableNum(row.line_total);
  if (total !== null) return { mode: 'spend', total };
  return { mode: 'ingredient_rate' };
}

function toComponent(row: ComponentRow): RecipeComponent | null {
  const scope = row.scope;

  if (row.kind === 'flat') {
    if (row.label === null) return null;
    return { kind: 'flat', scope, label: row.label, amount: num(row.line_total) };
  }

  const qty = nullableNum(row.qty);
  if (qty === null || row.unit === null) return null;

  const shared = { scope, qty, unit: row.unit, entry: toEntry(row) } as const;

  if (row.kind === 'ingredient') {
    if (row.ingredient_id === null) return null;
    return {
      kind: 'ingredient',
      ingredientId: row.ingredient_id,
      ...shared,
      ...(row.note === null ? {} : { note: row.note }),
    };
  }

  if (row.child_recipe_id === null) return null;
  return {
    kind: 'recipe',
    childId: row.child_recipe_id,
    ...shared,
    ...(row.note === null ? {} : { note: row.note }),
  };
}

export function toRecipe(row: RecipeRow, components: readonly ComponentRow[]): Recipe {
  return {
    id: row.id,
    name: row.name,
    family: row.family as UnitFamily,
    outputQty: num(row.output_qty),
    outputUnit: row.output_unit,
    portions: nullableNum(row.portions),
    components: [...components]
      .sort((a, b) => a.position - b.position)
      .map(toComponent)
      .filter((c): c is RecipeComponent => c !== null),
  };
}

export function toMeta(row: RecipeRow): DishMeta {
  return {
    category: row.category ?? 'Mains',
    station: row.station,
    portionSize: row.portion_size,
    sellingPrice: nullableNum(row.selling_price),
    deliveryPrice: nullableNum(row.delivery_price),
    note: row.notes ?? '',
    method: row.method ?? null,
    onMenu: row.on_menu,
    archived: row.archived,
    custom:
      row.custom !== null && typeof row.custom === 'object'
        ? (row.custom as Record<string, string>)
        : {},
    ...(row.updated_at === null ? {} : { updatedAt: row.updated_at }),
  };
}

export function fromRecipe(r: Recipe, meta: DishMeta | undefined, orgId: string): Record<string, unknown> {
  return {
    id: r.id,
    org_id: orgId,
    name: r.name,
    family: r.family,
    output_qty: r.outputQty,
    output_unit: r.outputUnit,
    portions: r.portions,
    category: meta?.category ?? null,
    station: meta?.station ?? null,
    portion_size: meta?.portionSize ?? null,
    selling_price: meta?.sellingPrice ?? null,
    delivery_price: meta?.deliveryPrice ?? null,
    on_menu: meta?.onMenu ?? false,
    archived: meta?.archived ?? false,
    notes: meta?.note ?? null,
    method: meta?.method ?? null,
    custom: meta?.custom ?? {},
    // A sub-recipe is one that plates into nothing of its own.
    is_sub_recipe: r.portions === null,
    updated_at: new Date().toISOString(),
  };
}

export function fromComponents(r: Recipe): Record<string, unknown>[] {
  return r.components.map((c, position) => {
    const base = {
      recipe_id: r.id,
      position,
      kind: c.kind,
      scope: c.scope,
      ingredient_id: null as string | null,
      child_recipe_id: null as string | null,
      label: null as string | null,
      qty: null as number | null,
      unit: null as string | null,
      note: null as string | null,
      rate_override: null as number | null,
      line_total: null as number | null,
    };

    if (c.kind === 'flat') return { ...base, label: c.label, line_total: c.amount };

    const entry =
      c.entry.mode === 'rate'
        ? { rate_override: c.entry.ratePerBaseUnit }
        : c.entry.mode === 'spend'
          ? { line_total: c.entry.total }
          : {};

    return {
      ...base,
      qty: c.qty,
      unit: c.unit,
      note: c.kind === 'ingredient' ? (c.note ?? null) : null,
      ...(c.kind === 'ingredient' ? { ingredient_id: c.ingredientId } : { child_recipe_id: c.childId }),
      ...entry,
    };
  });
}

/* ── the organisation ─────────────────────────────────────────────────────── */

export interface OrgRow {
  id: string;
  name: string;
  currency_code: string;
  food_cost_target: number | string;
  tax_treatment: string | null;
  charges: unknown;
  rounding: string;
  wastage_percent: number | string;
  packaging_per_portion: number | string;
  stale_after_days: number;
  default_mass_unit: string;
  default_volume_unit: string;
  setup_done: boolean;
}

export function toOrg(row: OrgRow): Org {
  return {
    name: row.name,
    currency: row.currency_code,
    taxTreatment: (row.tax_treatment as TaxTreatment | null) ?? null,
    charges: Array.isArray(row.charges) ? (row.charges as Charge[]) : [],
    foodCostTarget: num(row.food_cost_target),
    rounding: row.rounding as PresetName,
    wastagePercent: num(row.wastage_percent),
    packagingPerPortion: num(row.packaging_per_portion),
    staleAfterDays: row.stale_after_days,
    defaultMassUnit: row.default_mass_unit as 'g' | 'kg',
    defaultVolumeUnit: row.default_volume_unit as 'ml' | 'l',
    setupDone: row.setup_done,
  };
}

export function fromOrg(patch: Partial<Org>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out['name'] = patch.name;
  if (patch.currency !== undefined) out['currency_code'] = patch.currency;
  if (patch.taxTreatment !== undefined) out['tax_treatment'] = patch.taxTreatment;
  if (patch.charges !== undefined) out['charges'] = patch.charges;
  if (patch.foodCostTarget !== undefined) out['food_cost_target'] = patch.foodCostTarget;
  if (patch.rounding !== undefined) out['rounding'] = patch.rounding;
  if (patch.wastagePercent !== undefined) out['wastage_percent'] = patch.wastagePercent;
  if (patch.packagingPerPortion !== undefined) out['packaging_per_portion'] = patch.packagingPerPortion;
  if (patch.staleAfterDays !== undefined) out['stale_after_days'] = patch.staleAfterDays;
  if (patch.defaultMassUnit !== undefined) out['default_mass_unit'] = patch.defaultMassUnit;
  if (patch.defaultVolumeUnit !== undefined) out['default_volume_unit'] = patch.defaultVolumeUnit;
  if (patch.setupDone !== undefined) out['setup_done'] = patch.setupDone;
  return out;
}

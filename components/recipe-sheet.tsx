'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import type { Ingredient } from '@/core/ingredient';
import { type Recipe, flatComponent, recipeCost } from '@/core/recipe';

import {
  type Ack,
  removeFromMenu,
  saveAndPrice,
  saveChanges,
  saveDeliveryPrice,
  saveDraft,
  setIngredientRate,
} from '@/app/recipes/[id]/actions';
import { ingredientComponent } from '@/core/recipe';
import { ingredientFromPack } from '@/core/ingredient';
import { addIngredient } from '@/app/ingredients/actions';
import { suggestPrice } from '@/lib/costing';

import { ComponentCards } from './component-cards';
import { PrepCard } from './prep-card';
import { Toast, type ToastState } from './toast';
import { ChannelSection } from './channel-section';
import { ChargesSheet } from './sheets/charges-sheet';
import { DishSheet } from './sheets/dish-sheet';
import { PasteSheet, type PastedRow } from './sheets/paste-sheet';
import { RateSheet } from './sheets/rate-sheet';
import { RoundingSheet } from './sheets/rounding-sheet';
import { AddSheet } from './sheets/add-sheet';
import { ComponentTable, type LineHandlers } from './component-table';
import { ComponentPicker, type PickerChoice } from './component-picker';
import { CostRail } from './cost-rail';
import { StatusChip } from './status-chip';
import { type CostingModel, DEFAULT_MODEL, buildUp, foodCostPercent } from '@/lib/costing';
import type { Charge } from '@/core/charges';
import { compareChannels } from '@/lib/channels';
import type { PresetName } from '@/core/rounding';
import { unitFamily } from '@/core/units';
import { addComponent, pantryWith, removeLine, setQty, toggleScope } from '@/lib/edit';
import type { DishMeta } from '@/lib/data';
import { ORG } from '@/lib/data';
import { ROUNDING_LABEL } from '@/lib/costing';
import { money, percent } from '@/lib/format';

import { useMoney } from './currency-provider';

type Layout = 'table' | 'cards';

/**
 * The cost sheet, editing.
 *
 * The engine runs here in the browser, which is a deliberate exception to the
 * rule that costing happens on the server. It is the same trade the TRD makes
 * for the cycle check: the server figure is the guarantee, and this one is the
 * user experience. Round-tripping a keystroke to recost a dish would make
 * editing feel broken, and `core/` is pure, so running it twice costs nothing
 * but agreement. The saved figure is still the server's.
 */
export function RecipeSheet({
  initialRecipe,
  otherRecipes,
  shelf,
  dish,
  usageCounts,
  orgModel,
  orgCharges,
}: {
  initialRecipe: Recipe;
  otherRecipes: readonly Recipe[];
  shelf: readonly Ingredient[];
  dish: DishMeta;
  usageCounts: Readonly<Record<string, number>>;
  /** Wastage and packaging as the account has them, packaging being money. */
  orgModel: CostingModel;
  /** The account's charge stack, so the delivery comparison is theirs. */
  orgCharges: readonly Charge[];
}) {
  const [recipe, setRecipe] = useState<Recipe>(initialRecipe);
  const [layout, setLayout] = useState<Layout>('table');
  const [expanded, setExpanded] = useState(-1);
  const [rounding, setRounding] = useState<PresetName>(DEFAULT_MODEL.rounding);
  const [dirty, setDirty] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  /** Which secondary surface is up. Only ever one at a time. */
  const [sheet, setSheet] = useState<
    'dish' | 'paste' | 'add' | 'charges' | 'rounding' | null
  >(null);
  /** The line whose rate is being answered, if any. */
  const [rateFor, setRateFor] = useState<string | null>(null);
  const [view, setView] = useState<'costing' | 'prep'>('costing');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);

  /** The dish's own fields, editable here rather than only in the database. */
  const [fields, setFields] = useState({
    name: initialRecipe.name,
    category: dish.category,
    station: dish.station,
  });

  /** Wastage and packaging, once the operator has set them for this dish. */
  const [charges, setCharges] = useState<
    { wastagePercent: number; packagingPerPortion: number } | null
  >(null);

  /** What to put back if the toast's Undo is pressed. */
  const [undoTo, setUndoTo] = useState<Recipe | null>(null);

  const pantry = useMemo(
    () => pantryWith(recipe, otherRecipes, shelf),
    [otherRecipes, recipe, shelf],
  );

  const model = useMemo(
    () => ({
      ...DEFAULT_MODEL,
      ...orgModel,
      foodCostTarget: ORG.foodCostTarget,
      rounding,
      ...(charges ?? {}),
    }),
    [rounding, charges, orgModel],
  );

  const cost = useMemo(() => recipeCost(recipe, pantry), [recipe, pantry]);
  const build = useMemo(() => buildUp(cost, model), [cost, model]);
  const fc =
    build.complete && build.total !== null
      ? foodCostPercent(build.total, dish.sellingPrice)
      : null;

  const edit = useCallback((next: Recipe) => {
    setRecipe((current) => { setUndoTo(current); return next; });
    setDirty(true);
  }, []);

  /** Every write goes through here, so the toast always says what the server did. */
  const commit = useCallback(async (run: () => Promise<Ack>) => {
    setSaving(true);
    try {
      const ack = await run();
      setToast(ack);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, []);

  const usedInCount = useCallback(
    (name: string) => usageCounts[name] ?? 1,
    [usageCounts],
  );

  const handlers: LineHandlers = {
    expanded,
    portions: recipe.portions,
    usedInCount,
    onExpand: (i) => setExpanded((current) => (current === i ? -1 : i)),
    onQty: (i, value) => edit(setQty(recipe, i, value)),
    onScope: (i) => edit(toggleScope(recipe, i)),
    onRemove: (i) => {
      const gone = cost.lines[i]?.name ?? 'That line';
      setExpanded(-1);
      edit(removeLine(recipe, i));
      setToast({ message: `${gone} removed`, undoable: true });
    },
    onSetRate: (i) => {
      const line = cost.lines[i];
      if (line?.refId != null) setRateFor(line.refId);
    },
  };

  /**
   * Adding a component can close a loop — B already contains A. The engine
   * refuses it, and the refusal is shown in the operator's language with the
   * path drawn, never as an error code (FLOWS 5.2).
   */
  const onPick = (choice: PickerChoice) => {
    const result = addComponent(recipe, otherRecipes, shelf, choice);
    if (!result.ok) {
      setBlocked(result.message);
      return;
    }
    setBlocked(null);
    edit(result.recipe);
  };

  const dishFields = { category: fields.category, station: fields.station };
  const named: Recipe = { ...recipe, name: fields.name };

  const suggestion =
    build.complete && build.total !== null ? suggestPrice(build.total, model) : null;

  /*
   * The delivery comparison (A26). Computed here beside the plate cost because
   * it only means anything next to it — a commission is a number until you see
   * what it does to this dish.
   */
  const channels = useMemo(
    () => compareChannels({
      charges: orgCharges,
      plateCost: build.complete && build.total !== null ? build.total : 0,
      packaging: model.packagingPerPortion,
      target: model.foodCostTarget,
      dineInPrice: dish.sellingPrice,
      deliveryPrice: dish.deliveryPrice ?? null,
      rounding,
    }),
    [orgCharges, build, model, dish.sellingPrice, dish.deliveryPrice, rounding],
  );

  /** Paste rows: parsed by the importer's own code, then appended as real lines. */
  const addPasted = (rows: readonly PastedRow[]) => {
    let next = recipe;
    let unpriced = 0;

    for (const row of rows) {
      const ingredient =
        row.match ??
        ingredientFromPack({
          name: row.name,
          family: familyOf(row.unit),
          packQty: 1,
          packUnit: row.unit === '' ? 'g' : row.unit,
          packPrice: row.rate,
        });
      if (ingredient.purchasePrice === null) unpriced += 1;

      try {
        next = {
          ...next,
          components: [
            ...next.components,
            ingredientComponent(ingredient, row.qty, row.unit === '' ? ingredient.purchaseUnit : row.unit),
          ],
        };
      } catch {
        // A row Costbook cannot measure is left out rather than guessed at.
      }
    }

    edit(next);
    setSheet(null);
    setToast({
      message:
        `${rows.length} lines added.` +
        (unpriced > 0 ? ` ${unpriced} has no rate, so the total is a floor.` : ''),
      undoable: true,
    });
  };

  const addCharge = () => {
    edit({
      ...recipe,
      components: [...recipe.components, flatComponent('Processing charge', 0)],
    });
  };

  const m = useMoney();
  const saved = build.complete && dish.onMenu && !dirty;

  const rateIngredient =
    rateFor === null ? null : (shelf.find((i) => i.id === rateFor) ?? null);

  if (view === 'prep') {
    return (
      <PrepCard
        name={fields.name}
        dish={{ ...dish, category: fields.category, station: fields.station }}
        portions={recipe.portions}
        lines={cost.lines}
        steps={PREP_STEPS}
        prepTime="9 min"
        contains={['Milk', 'Sesame']}
        doNot="Podi the idlys before they are ordered — they go soft. Send within 60 seconds of the tawa."
        onBack={() => setView('costing')}
      />
    );
  }

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/recipes">Recipes</Link>
            <Chevron />
            <span>{fields.category}</span>
            <Chevron />
            <span aria-current="page">{fields.name}</span>
          </nav>

          <div className="page-title-row">
            <h1 className="page-title">{fields.name}</h1>
            {dirty ? (
              <span className="chip chip-incomplete">UNSAVED CHANGES</span>
            ) : dish.onMenu ? (
              <span className="chip chip-status chip-on">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M2.4 6.2 4.8 8.6 9.6 3.6" />
                </svg>
                SAVED
              </span>
            ) : (
              <span className="chip chip-incomplete">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                  strokeWidth="1.5" aria-hidden="true">
                  <rect x="1.4" y="1.4" width="9.2" height="9.2" strokeDasharray="2.4 1.8" />
                </svg>
                DRAFT
              </span>
            )}
          </div>

          {/* One line, not a card. Everything about the dish that is not a
              component line, said once. */}
          <p className="page-sub">
            {fields.category} · batch of{' '}
            <span className="figure ink">{recipe.portions ?? '—'}</span> plates
            {fields.station === null || fields.station === '' ? '' : ` · ${fields.station}`}
            {dish.portionSize === null ? '' : ` · ${dish.portionSize}`} ·{' '}
            <span className="figure ink">{cost.lines.length}</span> component lines
          </p>
        </div>

        <div className="page-actions">
          <button type="button" className="btn" onClick={() => setSheet('dish')}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M4 16h3.2l8.4-8.4a1.7 1.7 0 0 0 0-2.4l-.8-.8a1.7 1.7 0 0 0-2.4 0L4 12.8Z" />
            </svg>
            Edit dish
          </button>
          <div className="segmented" role="group" aria-label="View">
            <span className="segmented-item is-active">Costing</span>
            <button type="button" className="segmented-item" onClick={() => setView('prep')}>
              Prep card
            </button>
          </div>
        </div>
      </div>

      <div className="costing">
        <div className="costing-main">
          {blocked !== null ? (
            <section className="card blocked" role="alert">
              <span className="chip chip-over">
                <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M6 1 11.2 10.6H0.8Z" fill="currentColor" />
                </svg>
                BLOCKED
              </span>
              <p className="blocked-copy">{blocked}</p>
              <button type="button" className="btn" onClick={() => setBlocked(null)}>
                Choose something else
              </button>
            </section>
          ) : null}

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">
                Components <span className="figure card-count">{cost.lines.length}</span>
              </h2>
              <div className="card-head-actions">
                <span className="layout-label">Layout</span>
                <div className="segmented segmented-xs" role="group" aria-label="Component layout">
                  <button
                    type="button"
                    className={`segmented-item${layout === 'table' ? ' is-active' : ''}`}
                    aria-pressed={layout === 'table'}
                    onClick={() => setLayout('table')}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M1 2h10M1 6h10M1 10h10" /></svg>
                    Table
                  </button>
                  <button
                    type="button"
                    className={`segmented-item${layout === 'cards' ? ' is-active' : ''}`}
                    aria-pressed={layout === 'cards'}
                    onClick={() => setLayout('cards')}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="1" y="1.4" width="10" height="3.6" /><rect x="1" y="7" width="10" height="3.6" /></svg>
                    Cards
                  </button>
                </div>
                <button type="button" className="btn btn-xs" onClick={() => setSheet('paste')}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><rect x="6.4" y="3" width="7.2" height="3.2" rx="1" /><path d="M13.6 4.6h2.2v12.4H4.2V4.6h2.2" /></svg>
                  Paste rows
                </button>
                <button type="button" className="btn btn-xs" onClick={() => setSheet('add')}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 2v8M2 6h8" /></svg>
                  Add line
                </button>
              </div>
            </div>

            {cost.lines.length === 0 ? (
              <div className="empty">
                <p className="empty-title">Nothing on the plate yet</p>
                <p className="empty-copy">
                  Start with the largest thing on it. If you already have it as a recipe — a parotta,
                  a kuruma, a batch of idlies — search for it and Costbook will carry its own cost and
                  yield across.
                </p>
              </div>
            ) : layout === 'table' ? (
              <ComponentTable lines={cost.lines} handlers={handlers} />
            ) : (
              <ComponentCards lines={cost.lines} handlers={handlers} />
            )}

            <div className="running-total">
              <span className="running-said">
                {build.complete ? (
                  'Every line carries a rate, so the total below is a cost rather than a floor.'
                ) : (
                  <span className="running-warn">
                    {cost.kind === 'floor' ? cost.unpriced.length : 0} line
                    {cost.kind === 'floor' && cost.unpriced.length === 1 ? ' has' : 's have'} no
                    rate, so the batch total is a floor rather than a cost.
                  </span>
                )}
              </span>
              <span className="batch-total">
                <span className="label">{build.complete ? 'Batch total' : 'Batch floor'}</span>
                <span className="figure batch-total-value">
                  {m.symbol} {m.money(build.linesTotal)}
                </span>
              </span>
            </div>
          </section>

        </div>

        <CostRail
          cost={cost}
          build={build}
          model={model}
          sellingPrice={dish.sellingPrice}
          note={dish.note}
          onRounding={setRounding}
          onOpenCharges={() => setSheet('charges')}
          onOpenRounding={() => setSheet('rounding')}
          onUsePrice={() => {
            if (suggestion === null) return;
            void commit(() => saveAndPrice(named, dishFields, suggestion.rounded));
          }}
          actions={
            <div className="rail-actions rail-actions-row">
              <button
                type="button"
                className="btn"
                onClick={() => { setView('prep'); setTimeout(() => window.print(), 60); }}
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M6.2 7V4.4h7.6V7M5 7h10v9.2H5Z" />
                </svg>
                Print prep card
              </button>

              {dish.onMenu ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!dirty || saving}
                    title={dirty ? undefined : 'Nothing has changed since this was last saved.'}
                    onClick={() => void commit(() => saveChanges(named, dishFields))}
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    className="link link-sm"
                    disabled={saving}
                    onClick={() => void commit(() => removeFromMenu(recipe.id))}
                  >
                    Remove from menu
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={saving}
                    onClick={() => void commit(() => saveDraft(named, dishFields))}
                  >
                    Save as draft
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving || suggestion === null}
                    onClick={() => {
                      if (suggestion === null) return;
                      void commit(() => saveAndPrice(named, dishFields, suggestion.rounded));
                    }}
                  >
                    {saving ? 'Saving…' : 'Save and cost it'}
                  </button>
                </>
              )}
            </div>
          }
          onKeepPrice={() =>
            setToast({
              message: `Price left at ${m.withSymbol(dish.sellingPrice)}. Nothing changed.`,
              undoable: false,
            })
          }
          busy={saving}
          isDefault={charges === null}
        />

      <ChannelSection
        comparison={channels}
        target={model.foodCostTarget}
        onAddChannel={() => { window.location.href = '/settings'; }}
        onUseSuggested={(price) => {
          void commit(() => saveDeliveryPrice(recipe.id, price));
        }}
      />
      </div>

      <DishSheet
        open={sheet === 'dish'}
        onClose={() => setSheet(null)}
        name={fields.name}
        category={fields.category}
        station={fields.station}
        portions={recipe.portions}
        linesTotal={build.linesTotal}
        onName={(v) => { setFields((f) => ({ ...f, name: v })); setDirty(true); }}
        onCategory={(v) => { setFields((f) => ({ ...f, category: v })); setDirty(true); }}
        onStation={(v) => { setFields((f) => ({ ...f, station: v })); setDirty(true); }}
        onPortions={(v) => edit({ ...recipe, portions: v })}
      />

      <PasteSheet
        open={sheet === 'paste'}
        onClose={() => setSheet(null)}
        shelf={shelf}
        onAdd={addPasted}
      />

      <AddSheet
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        shelf={shelf}
        recipes={otherRecipes}
        pantry={pantry}
        excludeRecipeId={recipe.id}
        usedInCount={usedInCount}
        onPick={onPick}
        creating={saving}
        onCreateIngredient={(input) => {
          void commit(async () => {
            const ack = await addIngredient(input);
            if (ack.id !== null) {
              // Straight onto the line that was being written, which is the
              // whole point of not redirecting to the ingredients screen.
              const made = ingredientFromPack({
                name: input.name,
                family: familyOf(input.packUnit),
                packQty: input.packQty,
                packUnit: input.packUnit,
                packPrice: input.packPrice,
              });
              edit({
                ...recipe,
                components: [
                  ...recipe.components,
                  ingredientComponent({ ...made, id: ack.id }, 1, input.packUnit),
                ],
              });
            }
            setSheet(null);
            return { message: ack.message, undoable: ack.undoable };
          });
        }}
      />

      <ChargesSheet
        open={sheet === 'charges'}
        onClose={() => setSheet(null)}
        wastagePercent={model.wastagePercent}
        packaging={model.packagingPerPortion}
        isDefault={charges === null}
        ingredientsPerPortion={build.ingredientsPerPortion ?? 0}
        onWastage={(v) => setCharges({ wastagePercent: v, packagingPerPortion: model.packagingPerPortion })}
        onPackaging={(v) => setCharges({ wastagePercent: model.wastagePercent, packagingPerPortion: v })}
        onReset={() => { setCharges(null); setToast({ message: 'Back to the figures every dish starts from.', undoable: false }); }}
        onApply={() => {
          setSheet(null);
          setToast({
            message: 'Wastage and packaging updated — every figure above recalculated',
            undoable: false,
          });
        }}
      />

      <RoundingSheet
        open={sheet === 'rounding'}
        onClose={() => setSheet(null)}
        exact={suggestion?.exact ?? 0}
        current={rounding}
        onPick={(rule) => {
          setRounding(rule);
          setSheet(null);
          setToast({ message: `Rounding rule is now “${ROUNDING_LABEL[rule]}”.`, undoable: false });
        }}
      />

      <RateSheet
        ingredient={rateIngredient}
        usedIn={rateIngredient === null ? 1 : usedInCount(rateIngredient.name)}
        onClose={() => setRateFor(null)}
        onSet={(packPrice) => {
          const id = rateFor;
          setRateFor(null);
          if (id !== null) void commit(() => setIngredientRate(id, packPrice, recipe.id));
        }}
      />

      <Toast
        toast={toast}
        onUndo={() => {
          if (undoTo !== null) { setRecipe(undoTo); setDirty(true); }
          setToast(null);
        }}
        onDismiss={() => setToast(null)}
      />
    </>
  );
}

/**
 * The method, until a dish carries its own. The prep card is the chef's half
 * of the product and the reason the data stays current (FLOWS 7), so it shows
 * something real rather than an empty section.
 */
const PREP_STEPS: readonly string[] = [
  'Steam the idlies and let them stand two minutes before they are handled.',
  'Heat ghee on the tawa until it just moves, not until it colours.',
  'Toss the idlies until every face has taken colour. Do not crowd the tawa.',
  'Podi at the pass, not before — podi sitting on a hot idly goes soft.',
  'Chutney cup on the side. Send within 60 seconds of the tawa.',
];

/** Which family a pasted unit belongs to, so a new ingredient is measurable. */
function familyOf(unit: string): 'mass' | 'volume' | 'count' {
  const family = unitFamily(unit);
  return family ?? 'mass';
}

function Chevron() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="m4.4 2.6 3 3.4-3 3.4" />
    </svg>
  );
}

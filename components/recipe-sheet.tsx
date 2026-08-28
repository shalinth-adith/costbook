'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import type { Ingredient } from '@/core/ingredient';
import { type Recipe, flatComponent, recipeCost } from '@/core/recipe';

import { ComponentCards } from './component-cards';
import { ComponentTable, type LineHandlers } from './component-table';
import { ComponentPicker, type PickerChoice } from './component-picker';
import { CostRail } from './cost-rail';
import { StatusChip } from './status-chip';
import {
  DEFAULT_MODEL,
  type RoundingRule,
  buildUp,
  foodCostPercent,
} from '@/lib/costing';
import { addComponent, bookWith, removeLine, setQty, toggleScope } from '@/lib/edit';
import type { DishMeta } from '@/lib/data';
import { ORG } from '@/lib/data';
import { money, percent } from '@/lib/format';

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
}: {
  initialRecipe: Recipe;
  otherRecipes: readonly Recipe[];
  shelf: readonly Ingredient[];
  dish: DishMeta;
  usageCounts: Readonly<Record<string, number>>;
}) {
  const [recipe, setRecipe] = useState<Recipe>(initialRecipe);
  const [layout, setLayout] = useState<Layout>('table');
  const [expanded, setExpanded] = useState(-1);
  const [rounding, setRounding] = useState<RoundingRule>(DEFAULT_MODEL.rounding);
  const [dirty, setDirty] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const book = useMemo(() => bookWith(recipe, otherRecipes), [otherRecipes, recipe]);

  const model = useMemo(
    () => ({ ...DEFAULT_MODEL, foodCostTarget: ORG.foodCostTarget, rounding }),
    [rounding],
  );

  const cost = useMemo(() => recipeCost(recipe, book), [recipe, book]);
  const build = useMemo(() => buildUp(cost, model), [cost, model]);
  const fc =
    build.complete && build.total !== null
      ? foodCostPercent(build.total, dish.sellingPrice)
      : null;

  const edit = useCallback((next: Recipe) => {
    setRecipe(next);
    setDirty(true);
  }, []);

  const usedInCount = useCallback(
    (name: string) => usageCounts[name] ?? 1,
    [usageCounts],
  );

  const handlers: LineHandlers = {
    expanded,
    usedInCount,
    onExpand: (i) => setExpanded((current) => (current === i ? -1 : i)),
    onQty: (i, value) => edit(setQty(recipe, i, value)),
    onScope: (i) => edit(toggleScope(recipe, i)),
    onRemove: (i) => {
      setExpanded(-1);
      edit(removeLine(recipe, i));
    },
  };

  /**
   * Adding a component can close a loop — B already contains A. The engine
   * refuses it, and the refusal is shown in the operator's language with the
   * path drawn, never as an error code (FLOWS 5.2).
   */
  const onPick = (choice: PickerChoice) => {
    const result = addComponent(recipe, otherRecipes, choice);
    if (!result.ok) {
      setBlocked(result.message);
      return;
    }
    setBlocked(null);
    edit(result.recipe);
  };

  const addCharge = () => {
    edit({
      ...recipe,
      components: [...recipe.components, flatComponent('Processing charge', 0)],
    });
  };

  const saved = build.complete && dish.onMenu && !dirty;

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/recipes">Recipes</Link>
            <Chevron />
            <span>{dish.category}</span>
            <Chevron />
            <span aria-current="page">{recipe.name}</span>
          </nav>

          <div className="page-title-row">
            <h1 className="page-title">{recipe.name}</h1>
            {!build.complete ? (
              <StatusChip status="incomplete" label="SAVED · INCOMPLETE" />
            ) : dirty ? (
              <span className="chip chip-incomplete">UNSAVED CHANGES</span>
            ) : saved ? (
              <span className="chip chip-status chip-on">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M2.4 6.2 4.8 8.6 9.6 3.6" />
                </svg>
                SAVED · ON THE MENU
              </span>
            ) : (
              <span className="chip chip-incomplete">SAVED · NOT ON THE MENU</span>
            )}
          </div>
        </div>

        <div className="page-actions">
          <div className="segmented">
            <span className="segmented-item is-active">Costing</span>
            <button type="button" className="segmented-item">Prep card</button>
          </div>
          <button type="button" className="btn">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6.2 7V4.4h7.6V7M5 7h10v9.2H5Z" />
            </svg>
            Print prep card
          </button>
          <button type="button" className="btn btn-primary" disabled={!dirty} onClick={() => setDirty(false)}>
            {dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      <div className="sheet">
        <div className="sheet-main">
          <section className="card dish-summary">
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <rect x="3.2" y="3.2" width="13.6" height="13.6" rx="1.5" />
              <path d="M7 7.6h6M7 10.8h6M7 14h3.4" />
            </svg>
            <div className="dish-summary-text">
              <span className="dish-summary-title">
                {recipe.name}
                <span className="dish-summary-meta">
                  {' · '}{dish.category}
                  {recipe.portions !== null ? ` · ${recipe.portions} plates` : ''}
                  {dish.station !== null ? ` · ${dish.station}` : ''}
                  {dish.portionSize !== null ? ` · ${dish.portionSize}` : ''}
                </span>
              </span>
              <span className="dish-summary-sub">
                {dish.sellingPrice === null ? (
                  'No menu price set'
                ) : (
                  <>
                    Menu price <span className="figure">{ORG.currencySymbol} {money(dish.sellingPrice)}</span>
                    {fc !== null ? <> · food cost <span className="figure">{percent(fc)}</span></> : null}
                  </>
                )}
              </span>
            </div>
            <button type="button" className="btn">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M13.4 3.8 16.2 6.6 7.4 15.4H4.6v-2.8Z" />
              </svg>
              Edit dish
            </button>
          </section>

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
                <div className="segmented segmented-sm" role="group" aria-label="Component layout">
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
                <button type="button" className="btn" onClick={addCharge}>
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M6 2v8M2 6h8" /></svg>
                  Add a charge
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
              <ComponentTable lines={cost.lines} components={recipe.components} handlers={handlers} />
            ) : (
              <ComponentCards lines={cost.lines} components={recipe.components} handlers={handlers} />
            )}

            <div className="add-component">
              <ComponentPicker
                shelf={shelf}
                recipes={otherRecipes}
                book={book}
                excludeRecipeId={recipe.id}
                usedInCount={usedInCount}
                onPick={onPick}
              />
            </div>

            <div className="running-total">
              <span>
                Running total{' '}
                <span className="figure strong">
                  {ORG.currencySymbol} {money(build.ingredientsPerPortion)}
                </span>{' '}
                per plate before wastage and packaging
                {!build.complete ? (
                  <span className="running-warn"> — one line has no rate, so this is a floor and not a cost.</span>
                ) : null}
              </span>
              <span className="figure running-work">
                {money(build.linesTotal)} ÷ {recipe.portions ?? '—'} = {money(build.ingredientsPerPortion)}
              </span>
            </div>
          </section>

          <div className="sheet-footer">
            <button type="button" className="link">
              {dish.onMenu ? 'Remove this dish from the menu' : 'Discard this dish'}
            </button>
          </div>
        </div>

        <CostRail
          cost={cost}
          build={build}
          model={model}
          sellingPrice={dish.sellingPrice}
          note={dish.note}
          onRounding={setRounding}
        />
      </div>
    </>
  );
}

function Chevron() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="m4.4 2.6 3 3.4-3 3.4" />
    </svg>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { recipeCost } from '@/core/recipe';

import { AppShell } from '@/components/app-shell';
import { ComponentTable } from '@/components/component-table';
import { CostRail } from '@/components/cost-rail';
import { StatusChip } from '@/components/status-chip';
import { DEFAULT_MODEL, buildUp, foodCostPercent } from '@/lib/costing';
import { ORG, book, meta } from '@/lib/data';
import { money, percent } from '@/lib/format';

/**
 * The cost sheet. Creating a dish and editing one are the same screen in two
 * states — same controls in the same slots, only size, weight and fill differ
 * between them (FLOWS 5.1). The alternative is an owner creating a dish on one
 * layout and meeting a different one next week with no explanation.
 */
export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const recipe = book.get(id);
  const dish = meta[id];
  if (recipe === undefined || dish === undefined) notFound();

  const cost = recipeCost(recipe, book);
  const build = buildUp(cost, { ...DEFAULT_MODEL, foodCostTarget: ORG.foodCostTarget });
  const fc = build.complete ? foodCostPercent(build.total, dish.sellingPrice) : null;

  const saved = build.complete && dish.onMenu;

  return (
    <AppShell current="Recipes">
      <div className="page-head">
        <div className="page-title-block">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/recipes">Recipes</Link>
            <Chevron />
            <Link href="/recipes">{dish.category}</Link>
            <Chevron />
            <span aria-current="page">{recipe.name}</span>
          </nav>

          <div className="page-title-row">
            <h1 className="page-title">{recipe.name}</h1>
            {saved ? (
              <span className="chip chip-status chip-on">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M2.4 6.2 4.8 8.6 9.6 3.6" />
                </svg>
                SAVED · ON THE MENU
              </span>
            ) : (
              <StatusChip status="incomplete" label="SAVED · INCOMPLETE" />
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
          <button type="button" className="btn btn-primary">Save changes</button>
        </div>
      </div>

      <div className="sheet">
        <div className="sheet-main">
          {/* Collapsed to one line the moment its required fields are filled,
              which returns about a third of the column to the work in hand. */}
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

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">
                Components <span className="figure card-count">{cost.lines.length}</span>
              </h2>
              <div className="card-head-actions">
                <div className="segmented segmented-sm">
                  <span className="segmented-item is-active">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M1 2h10M1 6h10M1 10h10" /></svg>
                    Table
                  </span>
                  <button type="button" className="segmented-item">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="1" y="1.4" width="10" height="3.6" /><rect x="1" y="7" width="10" height="3.6" /></svg>
                    Cards
                  </button>
                </div>
                <button type="button" className="btn">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><rect x="6.4" y="3" width="7.2" height="3.2" rx="1" /><path d="M13.6 4.6h2.2v12.4H4.2V4.6h2.2" /></svg>
                  Paste rows
                </button>
                <button type="button" className="btn">
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M6 2v8M2 6h8" /></svg>
                  Add line
                </button>
              </div>
            </div>

            <ComponentTable lines={cost.lines} />

            <div className="add-component">
              <label className="label" htmlFor="add-component">Add a component</label>
              <div className="search-field">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <circle cx="9" cy="9" r="5.4" />
                  <path d="m13.2 13.2 3.2 3.2" />
                </svg>
                <input id="add-component" placeholder="Search ingredients and your own recipes" />
              </div>
            </div>

            <div className="running-total">
              <span>
                Running total{' '}
                <span className="figure strong">
                  {ORG.currencySymbol} {money(build.ingredientsPerPortion)}
                </span>{' '}
                per plate before wastage and packaging
              </span>
              <span className="figure running-work">
                {money(build.linesTotal)} ÷ {recipe.portions ?? '—'} = {money(build.ingredientsPerPortion)}
              </span>
            </div>
          </section>

          <div className="sheet-footer">
            <button type="button" className="link">
              {saved ? 'Remove this dish from the menu' : 'Discard this dish'}
            </button>
          </div>
        </div>

        <CostRail
          cost={cost}
          build={build}
          model={{ ...DEFAULT_MODEL, foodCostTarget: ORG.foodCostTarget }}
          sellingPrice={dish.sellingPrice}
          note={dish.note}
        />
      </div>
    </AppShell>
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

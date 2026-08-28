import type { RecipeCost } from '@/core/recipe';

import {
  type CostBuildUp,
  type CostingModel,
  foodCostPercent,
  statusFor,
  suggestPrice,
} from '@/lib/costing';
import { ORG } from '@/lib/data';
import { money, percent, points } from '@/lib/format';

import { DefaultChip, StatusChip } from './status-chip';

/**
 * The right rail: what a portion costs, how that figure was reached, and what
 * to charge for it.
 *
 * Two rules govern it. Every figure the operator did not enter is labelled
 * where it appears, with a way to change it. And an incomplete dish is offered
 * no price at all — a suggestion built on a floor is a suggestion to lose
 * money, so the card says why instead.
 */
export function CostRail({
  cost,
  build,
  model,
  sellingPrice,
  note,
}: {
  cost: RecipeCost;
  build: CostBuildUp;
  model: CostingModel;
  sellingPrice: number | null;
  note: string;
}) {
  const fc = build.complete ? foodCostPercent(build.total, sellingPrice) : null;
  const status = statusFor(fc, model.foodCostTarget);
  const suggestion = build.complete ? suggestPrice(build.total, model) : null;
  const missing = cost.kind === 'floor' ? cost.unpriced : [];

  return (
    <aside className="rail">
      <section className="card">
        <div className="rail-head">
          <div className="label">{build.complete ? 'Cost per portion' : 'Floor per portion'}</div>
          <div className="rail-figure">
            <span className="figure rail-currency">{ORG.currencySymbol}</span>
            <span className="figure rail-amount">{money(build.total)}</span>
          </div>

          <div className="rail-status">
            <StatusChip status={status} />
            {fc === null ? (
              <span className="rail-status-note">
                {build.complete
                  ? 'No menu price set yet, so there is no food cost to report.'
                  : 'A rate is missing, so this figure can only go up.'}
              </span>
            ) : (
              <span className="rail-status-note">
                food cost <span className="figure strong">{percent(fc)}</span>,{' '}
                {points(fc - model.foodCostTarget)} pts against {percent(model.foodCostTarget, 1)}
              </span>
            )}
          </div>
        </div>

        {/* How that figure is made. Every step names its source, and anything
            Costbook supplied carries a chip and a way to change it. */}
        <div className="buildup">
          <Row op="" label="Lines entered" value={money(build.linesTotal)} />
          <Row op="÷" label="Portions per batch" value={build.portions === null ? '—' : String(build.portions)} />
          <Row op="=" label="Ingredient cost per portion" value={money(build.ingredientsPerPortion)} rule strong />
          <Row op="+" label={build.wastage.label} value={money(build.wastage.amount)} defaulted />
          <Row op="+" label={build.packaging.label} value={money(build.packaging.amount)} defaulted />
          <Row
            op="="
            label={build.complete ? 'Total cost per portion' : 'Floor, total per portion'}
            value={money(build.total)}
            total
          />
        </div>
      </section>

      {suggestion === null ? (
        <section className="card card-inert">
          <div className="label">Suggested price</div>
          <div className="rail-figure muted">
            <span className="figure rail-currency">{ORG.currencySymbol}</span>
            <span className="figure rail-amount-sm">—</span>
          </div>
          <p className="rail-copy">
            {missing.length === 1 && missing[0] !== undefined
              ? `${missing[0].name} has no rate${missing[0].via.length > 0 ? `, inside ${missing[0].via.join(' → ')}` : ''}. It counts as zero until you give it one, which is why no price is offered yet.`
              : 'A rate is missing, so no price is offered yet.'}
          </p>
          <button type="button" className="btn btn-primary" disabled>
            Use as the price
          </button>
        </section>
      ) : (
        <section className="card">
          <div className="label">Suggested price at {percent(model.foodCostTarget, 1)}</div>

          <div className="price-work">
            <div className="figure price-formula">
              {money(build.total)} ÷ {percent(model.foodCostTarget, 1)} = {money(suggestion.exact)}
            </div>
            <p className="price-rule">
              Your rounding rule is <strong>{suggestion.ruleLabel}</strong>.{' '}
              <button type="button" className="link">Change it here</button> — you do not have to
              leave the dish.
            </p>

            <div className="price-options">
              <div className="price-option is-chosen">
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M2.4 6.2 4.8 8.6 9.6 3.6" />
                </svg>
                <span className="figure price-value">
                  {ORG.currencySymbol} {money(suggestion.rounded)}
                </span>
                <span className="price-fc">
                  food cost <span className="figure strong">{percent(suggestion.roundedFoodCost)}</span>
                </span>
              </div>

              <button type="button" className="price-option">
                <span className="price-radio" />
                <span className="figure price-value muted">
                  {ORG.currencySymbol} {money(suggestion.alternative)}
                </span>
                <span className="price-fc">
                  food cost <span className="figure strong">{percent(suggestion.alternativeFoodCost)}</span>
                </span>
              </button>
            </div>
          </div>

          <button type="button" className="btn btn-primary">
            Use {ORG.currencySymbol} {money(suggestion.rounded)} as the price
          </button>
        </section>
      )}

      <section className="card card-note">
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="6" cy="6" r="4.6" />
          <path d="M6 3.4V6l1.8 1.2" />
        </svg>
        <span>{note}</span>
      </section>
    </aside>
  );
}

function Row({
  op,
  label,
  value,
  defaulted = false,
  rule = false,
  strong = false,
  total = false,
}: {
  op: string;
  label: string;
  value: string;
  defaulted?: boolean;
  rule?: boolean;
  strong?: boolean;
  total?: boolean;
}) {
  return (
    <div className={`buildup-row${rule ? ' has-rule' : ''}${total ? ' is-total' : ''}`}>
      <span className="figure buildup-op">{op}</span>
      <span className="buildup-label">
        {label}
        {defaulted ? (
          <>
            <DefaultChip />
            <button type="button" className="link link-sm">change</button>
          </>
        ) : null}
      </span>
      <span className={`figure buildup-value${strong || total ? ' strong' : ''}`}>{value}</span>
    </div>
  );
}

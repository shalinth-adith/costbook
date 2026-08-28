'use client';

import type { RecipeCost } from '@/core/recipe';
import type { PresetName } from '@/core/rounding';

import {
  ROUNDING_CHOICES,
  ROUNDING_LABEL,
  
  type CostBuildUp,
  type CostingModel,
  foodCostPercent,
  statusFor,
  suggestPrice,
} from '@/lib/costing';
import { ORG } from '@/lib/data';
import { money, outputText, percent, points } from '@/lib/format';
import { toBase } from '@/core/units';

/** Rates invert against quantities: 0.128 per gram is 128.07 per kg. */
const ratePerOutputUnit = (perBase: number, unit: string): number => toBase(perBase, unit);

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
  onRounding,
  onOpenCharges,
  onOpenRounding,
  onUsePrice,
  onKeepPrice,
  busy,
}: {
  cost: RecipeCost;
  build: CostBuildUp;
  model: CostingModel;
  sellingPrice: number | null;
  note: string;
  onRounding: (rule: PresetName) => void;
  /** Opens the wastage and packaging sheet, where the defaults become yours. */
  onOpenCharges: () => void;
  /** Opens the rounding sheet, which shows what each rule would charge. */
  onOpenRounding: () => void;
  onUsePrice: () => void;
  /** Leaves the menu price where it is, and says so. */
  onKeepPrice: () => void;
  busy: boolean;
}) {
  // A dish with no portions has no cost per portion, so the rail leads with
  // what a batch costs instead. Nothing is invented to fill the slot.
  const plated = build.total !== null;
  const fc = build.complete && plated ? foodCostPercent(build.total, sellingPrice) : null;
  const status = statusFor(fc, model.foodCostTarget);
  const suggestion = build.complete && build.total !== null ? suggestPrice(build.total, model) : null;
  const missing = cost.kind === 'floor' ? cost.unpriced : [];

  const headline = plated ? build.total : build.linesTotal;
  const headlineLabel = !plated
    ? 'Cost per batch'
    : build.complete
      ? 'Cost per portion'
      : 'Floor per portion';

  return (
    <aside className="rail">
      <section className="card">
        <div className="rail-head">
          <div className="label">{headlineLabel}</div>
          <div className="rail-figure">
            <span className="figure rail-currency">{ORG.currencySymbol}</span>
            <span className="figure rail-amount">{money(headline)}</span>
          </div>

          <div className="rail-status">
            {/* A dish that is complete but not plated is not incomplete. Only
                a missing rate earns that word; the rest is explained in
                sentences rather than stamped with a status. */}
            {!build.complete ? (
              <StatusChip status="incomplete" />
            ) : fc !== null ? (
              <StatusChip status={status} />
            ) : null}
            {fc === null ? (
              <span className="rail-status-note">
                {!build.complete
                  ? 'A rate is missing, so this figure can only go up.'
                  : !plated
                    ? 'Made by the batch and never plated on its own, so there is no cost per portion to report.'
                    : 'No menu price set yet, so there is no food cost to report.'}
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
          {plated && build.wastage !== null && build.packaging !== null ? (
            <>
              <Row op="÷" label="Portions per batch" value={String(build.portions)} />
              <Row op="=" label="Ingredient cost per portion" value={money(build.ingredientsPerPortion)} rule strong />
              <Row op="+" label={build.wastage.label} value={money(build.wastage.amount)} defaulted onChange={onOpenCharges} />
              <Row op="+" label={build.packaging.label} value={money(build.packaging.amount)} defaulted onChange={onOpenCharges} />
              <Row
                op="="
                label={build.complete ? 'Total cost per portion' : 'Floor, total per portion'}
                value={money(build.total)}
                total
              />
            </>
          ) : (
            <>
              <Row op="÷" label={`Yields ${outputText(cost.outputQty, cost.outputUnit)}`} value="" />
              <Row
                op="="
                label={`Cost per ${cost.outputUnit}`}
                value={money(ratePerOutputUnit(build.perBaseUnit, cost.outputUnit))}
                total
              />
            </>
          )}
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
            {!build.complete ? (
              missing.length === 1 && missing[0] !== undefined ? (
                `${missing[0].name} has no rate${missing[0].via.length > 0 ? `, inside ${missing[0].via.join(' → ')}` : ''}. It counts as zero until you give it one, which is why no price is offered yet.`
              ) : (
                'A rate is missing, so no price is offered yet.'
              )
            ) : (
              'A price applies to a portion, and this is made by the batch rather than plated. It carries its cost into the dishes that use it.'
            )}
          </p>
          {missing.length > 0 ? (
            <p className="rail-copy">
              Give it one and this price becomes trustworthy. Until then{' '}
              <span className="figure strong">
                {ORG.currencySymbol} {money(build.total ?? build.linesTotal)}
              </span>{' '}
              is the least this dish can cost.
            </p>
          ) : null}
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
            <div className="price-rule">
              <label htmlFor="rounding-rule">
                Your rounding rule is{' '}
              </label>
              <button type="button" className="rule-button" onClick={onOpenRounding}>
                {ROUNDING_LABEL[model.rounding]}
              </button>
              <span> — changed here, because nothing that affects a dish's cost should
              require leaving that dish.</span>
            </div>

            <div className="price-options">
              <div className="price-option is-chosen" aria-current="true">
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

              <button
                type="button"
                className="price-option"
                onClick={() => onRounding(model.rounding === 'charm_99' ? 'up_to_5' : 'charm_99')}
              >
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

          <div className="price-actions">
            <button type="button" className="btn btn-primary" onClick={onUsePrice} disabled={busy}>
              {busy ? 'Saving…' : `Use ${ORG.currencySymbol} ${money(suggestion.rounded)}`}
            </button>
            {sellingPrice === null ? null : (
              <button type="button" className="btn" onClick={onKeepPrice} disabled={busy}>
                Keep {ORG.currencySymbol} {money(sellingPrice)}
              </button>
            )}
          </div>
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
  onChange,
}: {
  op: string;
  label: string;
  value: string;
  defaulted?: boolean;
  rule?: boolean;
  strong?: boolean;
  total?: boolean;
  onChange?: () => void;
}) {
  return (
    <div className={`buildup-row${rule ? ' has-rule' : ''}${total ? ' is-total' : ''}`}>
      <span className="figure buildup-op">{op}</span>
      <span className="buildup-label">
        {label}
        {defaulted ? (
          <>
            <DefaultChip />
            <button type="button" className="link link-sm" onClick={onChange}>change</button>
          </>
        ) : null}
      </span>
      <span className={`figure buildup-value${strong || total ? ' strong' : ''}`}>{value}</span>
    </div>
  );
}

'use client';

import Link from 'next/link';

import type { RecipeCost } from '@/core/recipe';
import type { PresetName } from '@/core/rounding';

import {
  ROUNDING_CHOICES,
  ROUNDING_LABEL,
  
  type CostBuildUp,
  type CostingModel,
  foodCostPercent,
  statusFor,
} from '@/lib/costing';
import { perHundred } from '@/lib/plain';
import {
  suggestPrice,
} from '@/lib/costing';
import { ORG } from '@/lib/data';
import { outputText, percent, points } from '@/lib/format';

import { useMoney } from './currency-provider';
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
  onOpenTarget,
  onOpenInspector,
  onUsePrice,
  onKeepPrice,
  busy,
  isDefault,
  actions,
  below,
  since = null,
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
  /** Change what this dish aims for, without leaving it. */
  onOpenTarget: () => void;
  /** The full arithmetic, step by step (A28). */
  onOpenInspector: () => void;
  onUsePrice: () => void;
  /** Leaves the menu price where it is, and says so. */
  onKeepPrice: () => void;
  busy: boolean;
  /** Whether wastage and packaging are still the figures nobody entered. */
  isDefault: boolean;
  /** Print, save and remove sit under the price, where the decision is made. */
  actions: React.ReactNode;
  /** The delivery-channel card. It lives inside the rail so the sticky rail
      can never ride over it — which it did, heading showing through. */
  below?: React.ReactNode;
  /** When the price was set, what it kept then, and which rates moved since. */
  since?: { readonly on: string; readonly kept: number | null; readonly moves: readonly { name: string; percent: number }[] } | null;
}) {
  // A dish with no portions has no cost per portion, so the rail leads with
  // what a batch costs instead. Nothing is invented to fill the slot.
  const plated = build.total !== null;
  const fc = build.complete && plated ? foodCostPercent(build.total, sellingPrice, model) : null;
  const status = statusFor(fc, model.foodCostTarget);
  const suggestion = build.complete && build.total !== null ? suggestPrice(build.total, model) : null;
  const missing = cost.kind === 'floor' ? cost.unpriced : [];
  const m = useMoney();

  const headline = plated ? build.total : build.linesTotal;
  const headlineLabel = !plated
    ? 'Cost per batch'
    : build.complete
      ? 'Cost per portion'
      : 'Floor per portion';

  const whole = (n: number): string =>
    m.position === 'prefix' ? `${m.symbol} ${String(n)}` : `${String(n)} ${m.symbol}`;
  const spend = perHundred(fc);
  const want = perHundred(model.foodCostTarget) ?? 0;

  return (
    <aside className="rail">
      <section className="card">
        <div className="rail-head">
          {/* Two labels, side by side. The cost and what it means as a share
              of the price are one thought, so they sit on one line. */}
          <div className="rail-heads">
            <span className="label">{headlineLabel}</span>
            <span className="label">Food cost</span>
          </div>

          <div className="rail-figures">
            <div className="rail-figure">
              <span className="figure rail-currency">{m.symbol}</span>
              <span className="figure rail-amount">{m.money(headline)}</span>
            </div>
            {fc === null ? (
              <span className="chip chip-incomplete">—</span>
            ) : (
              <StatusChip status={status} label={percent(fc)} />
            )}
          </div>

          {spend !== null && (
            <p className="rail-plain">
              {/* Said as what you keep, and as a gap, because "over" was read
                  as "we are making a loss". It is not a loss; it is less than
                  planned, and the sentence has to say which. */}
              {sellingPrice !== null && build.complete && build.total !== null && build.total > sellingPrice ? (
                <>
                  <b className="ink-over">This plate loses money.</b> It costs{' '}
                  {m.withSymbol(build.total)} to make and sells for {m.withSymbol(sellingPrice)} — you
                  lose <b>{m.withSymbol(build.total - sellingPrice)}</b> on every one.
                </>
              ) : (
                <>
                  You keep <b>{whole(100 - spend)}</b> of every {whole(100)} this sells for. You
                  wanted to keep <b>{whole(100 - want)}</b>
                  {100 - spend < 100 - want - 2 ? (
                    <> — that is <b className="ink-over">{whole(spend - want)} less</b> than you planned.</>
                  ) : 100 - spend > 100 - want + 2 ? (
                    <> — that is <b className="ink-on">{whole(want - spend)} more</b> than you planned.</>
                  ) : (
                    <> — <b className="ink-on">about what you planned</b>.</>
                  )}
                </>
              )}
            </p>
          )}

          {fc === null ? (
            <p className="rail-status-note">
              {!build.complete
                ? 'A rate is missing, so this figure can only go up.'
                : !plated
                  ? 'Made by the batch and never plated on its own, so there is no cost per portion to report.'
                  : 'No menu price set yet, so there is no food cost to report.'}
            </p>
          ) : null}
        </div>

        <div className="buildup">
          <div className="buildup-head">
            <span className="label buildup-title">How that figure is made</span>
            {/* Seven steps, from batch total to suggested price (A28). */}
            <button type="button" className="link link-sm" onClick={onOpenInspector}>
              Every step
            </button>
          </div>

          {plated && build.wastage !== null && build.packaging !== null ? (
            <>
              <Row op="" label="Batch ingredient cost" value={m.money(build.linesTotal)} />
              <Row op="÷" label="Portions per batch" value={String(build.portions)} />
              <Row op="=" label="Ingredient cost per portion" value={m.money(build.ingredientsPerPortion)} rule strong />
              {build.wastage.amount > 0 ? (
                <Row op="+" label={`Wastage, ${percent(model.wastagePercent, 1)}`} value={m.money(build.wastage.amount)} />
              ) : null}
              {build.packaging.amount > 0 ? (
                <Row op="+" label="Packaging, flat per portion" value={m.money(build.packaging.amount)} />
              ) : null}
              {build.accompaniments !== null ? (
                <Row op="+" label="On every plate: sides, bread, condiments" value={m.money(build.accompaniments.amount)} />
              ) : null}
              {build.labour !== null ? (
                <Row op="+" label={build.labour.label} value={m.money(build.labour.amount)} />
              ) : null}
              {build.overhead !== null ? (
                <Row op="+" label="Rent, gas and power" value={m.money(build.overhead.amount)} />
              ) : null}
              <Row op="=" label="Total cost per portion" value={m.money(build.total)} total />
            </>
          ) : (
            <>
              <Row op="" label="Batch ingredient cost" value={m.money(build.linesTotal)} />
              <Row op="÷" label={`Yields ${outputText(cost.outputQty, cost.outputUnit)}`} value="" />
              <Row
                op="="
                label={`Cost per ${cost.outputUnit}`}
                value={m.money(ratePerOutputUnit(build.perBaseUnit, cost.outputUnit))}
                total
              />
            </>
          )}

          {/* One chip and one button, rather than a change link on each row.
              Wastage and packaging are set together or not at all. */}
          {plated ? (
            <div className="buildup-defaults">
              <div className="buildup-defaults-head">
                <span className={`chip chip-default figure${isDefault ? '' : ' is-yours'}`}>
                  {isDefault ? 'FROM SETTINGS' : 'THIS DISH'}
                </span>
              </div>
              <p className="buildup-note">
                {model.wastagePercent > 0 || model.packagingPerPortion > 0 ? (
                  <>
                    <span className="figure">{model.wastagePercent}%</span> wastage and{' '}
                    <span className="figure">{m.withSymbol(model.packagingPerPortion)}</span> packaging, per portion.
                  </>
                ) : (
                  <>No wastage or packaging counted: the plate cost is the ingredients alone.</>
                )}
                {isDefault ? (
                  <> Set once in <Link href="/settings" className="link-inline">Settings</Link>.</>
                ) : (
                  <> Set for this dish only.</>
                )}
              </p>
              <button type="button" className="btn wide" onClick={onOpenCharges}>
                Change for this dish
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {suggestion === null ? (
        <section className="card card-inert">
          <div className="label">Suggested price</div>
          <div className="rail-figure muted">
            <span className="figure rail-currency">{m.symbol}</span>
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
                {m.symbol} {m.money(build.total ?? build.linesTotal)}
              </span>{' '}
              is the least this dish can cost.
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" disabled>
            Use as the price
          </button>
        </section>
      ) : (
        <section className="card price-card">
          <div className="label">What to charge</div>

          {/*
            * One figure, one sentence, three facts, two short verbs. It used
            * to say the exact price twice, the target twice and a percentage
            * the owner never asked for, and the button label wrapped.
            */}
          <div className="price-one">
            <span className="price-one-figure figure">{m.withSymbol(suggestion.rounded)}</span>
            <span className="price-one-said">
              Costs <b>{m.withSymbol(build.total)}</b> to make.{' '}
              {model.method === 'money_per_plate' ? (
                <>You want every plate to leave <b>{m.withSymbol(model.moneyPerPlate)}</b> after its cost.</>
              ) : model.method === 'times_cost' ? (
                <>You price at <b>{String(model.factor)} times</b> the cost.</>
              ) : (
                <>
                  You want to keep <b>{whole(100 - want)}</b> of every {whole(100)}{' '}
                  <button type="button" className="label-edit" onClick={onOpenTarget}>change</button>.
                </>
              )}
              {model.pricesIncludeCharges && model.charges.length > 0 ? (
                <> The price includes what the bill adds on top.</>
              ) : null}
            </span>
          </div>

          <dl className="price-facts">
            <div className="price-fact">
              <dt>Exact</dt>
              <dd>
                <span className="figure">{m.withSymbol(suggestion.exact)}</span>
                <span className="price-fact-how"> — cost {suggestion.methodLabel}</span>
              </dd>
            </div>
            <div className="price-fact">
              <dt>Rounded</dt>
              <dd>
                {suggestion.ruleLabel} —{' '}
                <Link href="/settings" className="link-inline">a setting for every dish</Link>
              </dd>
            </div>
            {since !== null && sellingPrice !== null && spend !== null ? (
              <div className="price-fact">
                <dt>Since</dt>
                <dd>
                  Priced {sinceDate(since.on)}
                  {since.kept !== null ? <>, keeping <b className="figure">{whole(since.kept)}</b></> : null}.
                  {since.kept !== null && Math.abs(since.kept - (100 - spend)) >= 1 ? (
                    <> Today <b className={100 - spend < since.kept ? 'ink-over' : 'ink-on'}>{whole(100 - spend)}</b>.</>
                  ) : null}
                  {since.moves.length > 0 ? (
                    <span className="price-fact-how">
                      {' '}Since then: {since.moves.slice(0, 3).map((mv) => `${mv.name} ${mv.percent > 0 ? '+' : ''}${Math.round(mv.percent)}%`).join(', ')}.
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {sellingPrice !== null && spend !== null ? (
              <div className="price-fact">
                <dt>Today</dt>
                <dd>
                  <b className="figure">{m.withSymbol(sellingPrice)}</b>, keeping{' '}
                  <b className={100 - spend < 100 - want - 2 ? 'ink-over' : 'ink-on'}>{whole(100 - spend)}</b>
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="price-actions">
            <button type="button" className="btn btn-primary" onClick={onUsePrice} disabled={busy}>
              {busy ? 'Saving…' : `Charge ${m.withSymbol(suggestion.rounded)}`}
            </button>
            {sellingPrice === null ? null : (
              <button type="button" className="btn" onClick={onKeepPrice} disabled={busy}>
                Keep {m.withSymbol(sellingPrice)}
              </button>
            )}
          </div>
        </section>
      )}

      {below}

      {/* Fixed to the viewport, full width, under both columns. It used to
          sit at the bottom of this sticky rail and land on top of whatever
          followed — the delivery-channel card, for weeks. A fixed bar cannot
          overlap flow content; the grid reserves its height instead. */}
      <div className="sheet-footer">
        <div className="sheet-footer-inner">{actions}</div>
      </div>
    </aside>
  );
}

/** "1 Jun" for a stored `YYYY-MM-DD`. */
function sinceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
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

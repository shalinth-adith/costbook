'use client';

import type { ChannelComparison } from '@/lib/channels';

import { useMoney } from './currency-provider';

/**
 * Channels — a section under the suggested price, not a screen (A26).
 *
 * The answer sits above the arithmetic. Two percentages and the gap between
 * them come first; the columns that prove it sit underneath, so someone who
 * reads only the first line has the whole finding.
 */
export function ChannelSection({
  comparison,
  target,
  onAddChannel,
  onUseSuggested,
}: {
  comparison: ChannelComparison;
  target: number;
  onAddChannel: () => void;
  onUseSuggested: (price: number) => void;
}) {
  const m = useMoney();
  const { dineIn, delivery } = comparison;

  if (dineIn === null) return null;

  const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);

  return (
    <section className="chan" aria-labelledby="chan-h">
      <h2 className="chan-h" id="chan-h">What you keep, channel by channel</h2>
      <p className="chan-lede">
        The menu price is not what reaches you. Charges the guest pays pass straight through; a
        platform&rsquo;s commission comes out of your side. Every food cost below is measured
        against what you actually keep, not against the price on the menu.
        <span className="chan-target figure">target {target.toFixed(1)}%</span>
      </p>

      {delivery === null ? (
        <div className="chan-empty">
          <p><b>Counter only — no delivery channel set up.</b></p>
          <p>
            Add one and we&rsquo;ll show what a platform&rsquo;s commission does to this dish before
            you list it.
          </p>
          <button type="button" className="btn" onClick={onAddChannel}>Add a delivery channel</button>
        </div>
      ) : (
        <>
          {/* The finding, before any arithmetic. */}
          <div className="chan-finding" data-breaks={comparison.breaksOnDelivery}>
            {comparison.breaksOnDelivery ? (
              <>
                <h3>This dish stops working on delivery.</h3>
                <p>
                  Same price on both, but what the platform and the gateway take comes out of your
                  side, so you keep <b className="figure">{m.withSymbol(delivery.keeps)}</b> instead
                  of <b className="figure">{m.withSymbol(dineIn.keeps)}</b> — and the packaging is
                  yours too. Every delivery order of this dish leaves you{' '}
                  <b className="figure">{m.withSymbol(comparison.marginGap ?? 0)}</b> worse off than
                  the same dish at the counter.
                </p>
              </>
            ) : delivery.overTarget ? (
              <>
                {/* Over on both. Delivery is not the problem here and saying so
                    would send the operator to fix the wrong thing. */}
                <h3>This dish is over target at the counter too.</h3>
                <p>
                  Delivery makes it worse — what the platform and the gateway take comes out of your
                  side, so you keep <b className="figure">{m.withSymbol(delivery.keeps)}</b> of a{' '}
                  <b className="figure">{m.withSymbol(delivery.price)}</b> order. But the dish is
                  already above {target.toFixed(1)}% at the counter, so a channel price alone
                  won&rsquo;t fix it.
                </p>
              </>
            ) : (
              <>
                <h3>The target survives on delivery.</h3>
                <p>
                  After commission and the gateway you keep{' '}
                  <b className="figure">{m.withSymbol(delivery.keeps)}</b> — which is the point of a
                  channel price rather than a discount.
                </p>
              </>
            )}

            <div className="chan-pair">
              <div>
                <span>At the counter</span>
                <b className="figure">{pct(dineIn.foodCostPercent)}</b>
              </div>
              <div>
                <span>On delivery</span>
                <b className="figure" data-over={delivery.overTarget}>{pct(delivery.foodCostPercent)}</b>
              </div>
              <div>
                <span>Difference</span>
                <b className="figure">
                  {comparison.gapPoints === null ? '—' : `${comparison.gapPoints.toFixed(1)}`}
                </b>
                <em>points of food cost</em>
              </div>
            </div>
          </div>

          {comparison.suggestedDeliveryPrice !== null && delivery.overTarget && (
            <div className="chan-solve">
              <h3>Charge more on the platform than at the counter.</h3>
              <p>
                <b className="figure">{m.withSymbol(comparison.suggestedDeliveryPrice)}</b> is your{' '}
                {target.toFixed(1)}% target solved backwards through what comes off: you keep{' '}
                <b className="figure">{m.withSymbol(comparison.suggestedKeeps ?? 0)}</b>, which puts
                this dish at <b className="figure">{pct(comparison.suggestedFoodCost)}</b> on
                delivery. Your dine-in price does not move.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onUseSuggested(comparison.suggestedDeliveryPrice ?? 0)}
              >
                Set the delivery price to {m.withSymbol(comparison.suggestedDeliveryPrice)}
              </button>
            </div>
          )}

          <div className="chan-cols">
            {comparison.columns.map((c) => (
              <div className="chan-col" key={c.channel} data-over={c.overTarget}>
                <h4>{c.name}<em>{c.note}</em></h4>
                <div className="chan-row"><span>Menu price</span><span className="figure">{m.money(c.price)}</span></div>

                {c.guestCharges.map((g) => (
                  <div className="chan-row is-guest" key={g.name}>
                    <span>{g.name} <em>the guest pays</em></span>
                    <span className="figure">{m.money(g.amount)}</span>
                  </div>
                ))}
                {c.guestCharges.length > 0 && (
                  <div className="chan-row is-sub"><span>The guest pays</span><span className="figure">{m.money(c.guestTotal)}</span></div>
                )}

                {/* Who bears it is a visible property. That distinction is the
                    entire misunderstanding this section exists to correct. */}
                {c.deductions.map((d) => (
                  <div className="chan-row is-borne" key={d.name}>
                    <span>{d.name} <em>you bear this, not the guest</em></span>
                    <span className="figure">−{m.money(d.amount)}</span>
                  </div>
                ))}

                <div className="chan-row is-keeps"><span>You keep</span><span className="figure">{m.money(c.keeps)}</span></div>
                <div className="chan-row">
                  <span>Plate cost, this channel</span>
                  <span className="figure">{m.money(c.cost)}</span>
                </div>
                <div className="chan-row is-fc">
                  <span>Food cost <em>against what you keep</em></span>
                  <span className="figure" data-over={c.overTarget}>{pct(c.foodCostPercent)}</span>
                </div>
                <div className="chan-row"><span>Left after ingredients</span><span className="figure">{m.money(c.marginPerPlate)}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

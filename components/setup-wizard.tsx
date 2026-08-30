'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { type Charge, applyCharges } from '@/core/charges';
import { CURRENCIES, currency, formatMoney } from '@/core/currency';

import { finishSetup } from '@/app/setup/actions';
import { SETUP_STEPS, TARGET_MAX, TARGET_MIN, type TaxTreatment, targetExample } from '@/lib/org';

import { Wordmark } from './wordmark';

/**
 * The setup wizard (A22 at 1440, A23 at 768).
 *
 * Four questions, asked once, because they are the four that cannot be guessed.
 * Everything else in the product starts from a labelled default and is changed
 * where it acts — asking about wastage or rounding here would cost more in
 * abandonment than it returns in accuracy, since someone who has not yet seen a
 * costed dish has no basis for answering.
 *
 * Answers are held here and written once at the end. Backing up and changing an
 * answer costs nothing, which is what makes "nothing here is a commitment"
 * true rather than merely reassuring.
 */

/** The example bill in step 3, and the one in Settings. One dish, one price. */
const EXAMPLE_PRICE = 100;

function nextCharge(count: number): Charge {
  return {
    name: '',
    mode: 'percent',
    value: 5,
    base: 'running_total',
    order: count + 1,
    compounds: true,
    borneBy: 'guest',
    channels: ['dine_in', 'takeaway', 'delivery'],
  };
}

export function SetupWizard({ initialCurrency }: { initialCurrency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCurrency);
  const [tax, setTax] = useState<TaxTreatment | null>(null);
  const [explainer, setExplainer] = useState(false);
  const [charges, setCharges] = useState<readonly Charge[]>([]);
  const [target, setTarget] = useState(30);

  const cur = currency(code);
  const money = (n: number) => formatMoney(n, code);

  const answered =
    step === 1 ? name.trim() !== ''
    : step === 2 ? tax !== null
    : step === 3 ? true
    : true;

  // The guest's side of a 100 dish, recomputed as charges are typed. Named
  // charges only: a row still being filled in has nothing to show yet.
  const bill = useMemo(() => {
    const ready = charges.filter((c) => c.name.trim() !== '');
    try {
      return applyCharges(EXAMPLE_PRICE, ready, 'dine_in');
    } catch {
      return null;
    }
  }, [charges]);

  const ex = targetExample(target, 12);

  const patchCharge = (i: number, patch: Partial<Charge>) => {
    setCharges((cs) => cs.map((c, n) => (n === i ? { ...c, ...patch } : c)));
  };

  const commit = () => {
    if (tax === null) return;
    start(async () => {
      await finishSetup({
        name,
        currency: code,
        taxTreatment: tax,
        charges: charges.filter((c) => c.name.trim() !== ''),
        foodCostTarget: target,
      });
      setStep(5);
    });
  };

  return (
    <div className="wiz">
      <header className="wiz-top">
        {/* Inert: this flow holds four unsaved answers and the mark must not
            quietly discard them (A34). */}
        <Wordmark mode="inert" />
        <span className="wiz-kicker">SETUP</span>
        <span className="wiz-count figure">
          {step > 4 ? 'All four answered' : `Step ${step} of 4`}
        </span>
      </header>

      {/* Four named ticks, not a bar. Names rather than numbers, so someone who
          leaves and returns knows what is left rather than how much. */}
      <ol className="wiz-ticks" aria-label="Setup progress">
        {SETUP_STEPS.map((t) => (
          <li
            key={t.no}
            className="wiz-tick"
            data-state={step > t.no ? 'done' : step === t.no ? 'current' : 'ahead'}
            aria-current={step === t.no ? 'step' : undefined}
          >
            <span className="wiz-tick-rule" />
            <span className="wiz-tick-label">{t.label}</span>
          </li>
        ))}
      </ol>

      <main className="wiz-body">
        {step === 1 && (
          <section className="wiz-step">
            <p className="wiz-eyebrow">Step 1 of 4 · your place</p>
            <h1 className="wiz-h">Let&rsquo;s start with the two things we can&rsquo;t guess.</h1>
            <p className="wiz-lede">
              Four questions in all, and then you&rsquo;re in. Nothing here is a commitment — every
              number can be changed later, and none of it touches your spreadsheet.
            </p>

            <label className="wiz-field">
              <span className="wiz-label">What&rsquo;s your place called?</span>
              <input
                className="wiz-input"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="Anandha Bhavan Café"
              />
              <span className="wiz-help">
                It goes on printed prep cards and anything you export for your accountant.
              </span>
            </label>

            <div className="wiz-field">
              <span className="wiz-label">What money do you deal in?</span>
              <div className="wiz-currencies" role="radiogroup" aria-label="Currency">
                {CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    role="radio"
                    aria-checked={c.code === code}
                    className="wiz-cur"
                    data-on={c.code === code}
                    onClick={() => setCode(c.code)}
                  >
                    <span className="figure">{c.symbol}</span> {c.code}
                  </button>
                ))}
              </div>
              <p className="wiz-note">
                <strong>Every figure you see will be in {cur.symbol} {cur.name}</strong>
                <br />
                Rates, dish costs, prices, printed cards, exports. This one is set once and stays:
                Costbook never converts between currencies, so if you buy in one and sell in
                another, choose the one you sell in.
              </p>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="wiz-step">
            <p className="wiz-eyebrow">Step 2 of 4 · tax on what you buy</p>
            <h1 className="wiz-h">
              When your supplier bills you tax, do you get that money back?
            </h1>
            <p className="wiz-lede">
              We ask because it decides whether the tax on a sack of rice counts as part of what
              your dish costs. It&rsquo;s the only question here that changes every number in the
              product, so it&rsquo;s worth a moment.
            </p>

            <div className="wiz-choices" role="radiogroup" aria-label="Supplier tax">
              <button
                type="button"
                role="radio"
                aria-checked={tax === 'recoverable'}
                className="wiz-choice"
                data-on={tax === 'recoverable'}
                onClick={() => { setTax('recoverable'); setExplainer(false); }}
              >
                <span className="wiz-choice-h">Yes, I claim it back</span>
                <span className="wiz-choice-p">
                  Then we enter your ingredient rates without tax, because the tax is not really
                  your cost.
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={tax === 'absorbed'}
                className="wiz-choice"
                data-on={tax === 'absorbed'}
                onClick={() => { setTax('absorbed'); setExplainer(false); }}
              >
                <span className="wiz-choice-h">No, I absorb it</span>
                <span className="wiz-choice-p">
                  Then we enter your rates with tax included, because every rupee of it is part of
                  your dish cost.
                </span>
              </button>
              {/* Never a silent default: the third path is a worked example, not
                  a guess made on their behalf. */}
              <button
                type="button"
                className="wiz-choice is-quiet"
                aria-expanded={explainer}
                onClick={() => setExplainer((v) => !v)}
              >
                <span className="wiz-choice-h">I&rsquo;m not sure which one I am</span>
                <span className="wiz-choice-p">Here it is with real numbers.</span>
              </button>
            </div>

            {explainer && (
              <div className="wiz-explain">
                <p>
                  You buy a 25 kg sack of rice. The bill says <b className="figure">{money(1000)}</b>{' '}
                  for the rice and <b className="figure">{money(50)}</b> tax. You pay{' '}
                  <b className="figure">{money(1050)}</b>.
                </p>
                <div className="wiz-explain-pair">
                  <div>
                    <h3>If you claim the tax back</h3>
                    <p>The {money(50)} comes back to you, so the sack really cost {money(1000)}.</p>
                    <p className="wiz-explain-fig">
                      Rice goes in at <b className="figure">{money(40)}</b> a kilo
                    </p>
                  </div>
                  <div>
                    <h3>If you don&rsquo;t</h3>
                    <p>Nobody returns the {money(50)}. The sack cost you {money(1050)}.</p>
                    <p className="wiz-explain-fig">
                      Rice goes in at <b className="figure">{money(42)}</b> a kilo
                    </p>
                  </div>
                </div>
                <p className="wiz-explain-punch">
                  Same sack, same day — and a 5% difference in every dish that uses rice.
                  That&rsquo;s why we ask rather than assume.
                </p>
                <h3>How to tell which one you are</h3>
                <p>
                  If you file a return where the tax you paid your suppliers is set against the tax
                  you collected from customers, you claim it back. If you pay a flat percentage of
                  your turnover instead, or you don&rsquo;t file at all, you absorb it. Whoever does
                  your returns will answer this in one line.
                </p>
                <p className="wiz-explain-punch">
                  Still not sure? Choose &ldquo;No, I absorb it.&rdquo; Your dish costs come out a
                  little high rather than a little low, which is the safer way to be wrong. When you
                  find out, change it in Settings — we recost the whole menu ourselves and you
                  retype nothing.
                </p>
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="wiz-step">
            <p className="wiz-eyebrow">Step 3 of 4 · the customer&rsquo;s bill</p>
            <h1 className="wiz-h">
              What appears on your customer&rsquo;s bill on top of the menu price?
            </h1>
            <p className="wiz-lede">
              Only things the guest pays on top — service charge, a municipality fee, VAT, GST,
              whatever yours are called. If it&rsquo;s already inside the price printed on your
              menu, leave it out.
            </p>

            {charges.length === 0 ? (
              <p className="wiz-note">
                <strong>Nothing on top, and that&rsquo;s the common answer.</strong>
                <br />
                Most single outlets add nothing at all: the price on the menu is the price on the
                bill. If that&rsquo;s you, this step is already answered — carry on and we&rsquo;ll
                never ask again.
              </p>
            ) : (
              <div className="wiz-charges">
                <div className="wiz-charge-head">
                  <span>What it&rsquo;s called on the bill</span>
                  <span>How much</span>
                  <span>Stacking</span>
                  <span />
                </div>
                {charges.map((c, i) => (
                  <div className="wiz-charge" key={i}>
                    <input
                      className="wiz-input"
                      value={c.name}
                      placeholder="Service charge"
                      onChange={(e) => patchCharge(i, { name: e.target.value })}
                    />
                    <span className="wiz-amt">
                      <input
                        className="wiz-input figure"
                        inputMode="decimal"
                        value={c.value}
                        onChange={(e) => patchCharge(i, { value: Number(e.target.value) || 0 })}
                      />
                      <span>%</span>
                    </span>
                    <button
                      type="button"
                      className="wiz-stack"
                      onClick={() => patchCharge(i, {
                        compounds: !c.compounds,
                        base: c.compounds ? 'net_subtotal' : 'running_total',
                      })}
                    >
                      {c.compounds ? 'on everything above' : 'on the menu price'}
                    </button>
                    <button
                      type="button"
                      className="wiz-remove"
                      aria-label={`Remove ${c.name || 'this charge'}`}
                      onClick={() => setCharges((cs) => cs.filter((_, n) => n !== i))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="wiz-add"
              onClick={() => setCharges((cs) => [...cs, nextCharge(cs.length)])}
            >
              Add a charge
            </button>

            {bill !== null && bill.lines.length > 0 && (
              <div className="wiz-bill">
                <h3>A {money(EXAMPLE_PRICE)} dish, as the guest sees it</h3>
                <div className="wiz-bill-row">
                  <span>Menu price</span>
                  <span className="figure">{money(EXAMPLE_PRICE)}</span>
                </div>
                {bill.lines.map((l, i) => (
                  <div className="wiz-bill-row" key={i}>
                    <span>{l.name}</span>
                    <span className="figure">{money(l.amount)}</span>
                  </div>
                ))}
                <div className="wiz-bill-row is-total">
                  <span>The guest pays</span>
                  <span className="figure">{money(bill.guestTotal)}</span>
                </div>
              </div>
            )}
          </section>
        )}

        {step === 4 && (
          <section className="wiz-step">
            <p className="wiz-eyebrow">Step 4 of 4 · what you&rsquo;re aiming for</p>
            <h1 className="wiz-h">What food cost are you aiming for?</h1>
            <p className="wiz-lede">
              This is the share of a dish&rsquo;s price you&rsquo;re willing to spend on its
              ingredients. We use it to suggest a price for every dish, and to tell you when one has
              drifted.
            </p>

            <div className="wiz-target">
              <output className="wiz-target-fig figure">{target}<span>%</span></output>
              <input
                type="range"
                className="wiz-slider"
                min={TARGET_MIN}
                max={TARGET_MAX}
                step={1}
                value={target}
                aria-label="Target food cost percentage"
                onChange={(e) => setTarget(Number(e.target.value))}
              />
              <div className="wiz-slider-ends figure">
                <span>{TARGET_MIN}%</span>
                <span>{TARGET_MAX}%</span>
              </div>
            </div>

            {/* The sentence is the control: a target is a percentage until it
                is a price. Figures cut to their new values; nothing counts up. */}
            <p className="wiz-sentence">
              {target}% means a dish costing <b className="figure">{money(ex.cost)}</b> sells at{' '}
              <b className="figure">{money(ex.price)}</b>.
              <br />
              <span className="wiz-sentence-sub">
                That&rsquo;s {ex.multiple.toFixed(1)} times what it costs you to make.
              </span>
            </p>

            <p className="wiz-note">
              <strong>30% is the usual place to start</strong>
              <br />
              Cafés and quick service often run nearer 20%, where the ticket is small and the volume
              is high. A full-service kitchen with waiters and a longer menu tends to sit above 30%.
              Pick something close and adjust once you see your own dishes — and any single dish can
              carry its own target later.
            </p>
          </section>
        )}

        {step === 5 && (
          <section className="wiz-step">
            <p className="wiz-eyebrow">Setup · done</p>
            <h1 className="wiz-h">That&rsquo;s everything we couldn&rsquo;t guess.</h1>
            <p className="wiz-lede">
              Four answers, and every figure in Costbook now comes out in your terms. Everything
              else already has a sensible default — wastage, rounding, how long before a rate counts
              as stale. They&rsquo;re all in Settings if you ever want them.
            </p>

            <dl className="wiz-summary">
              {[
                { label: 'Your place', value: name },
                { label: 'Currency', value: `${cur.symbol} ${cur.name}` },
                {
                  label: 'Supplier tax',
                  value: tax === 'recoverable' ? 'Claimed back' : 'Absorbed',
                },
                {
                  label: 'On the bill',
                  value: charges.length === 0 ? 'Nothing on top' : `${charges.length} charge${charges.length > 1 ? 's' : ''}`,
                },
                { label: 'Food cost target', value: `${target}%` },
              ].map((s) => (
                <div className="wiz-summary-row" key={s.label}>
                  <dt>{s.label}</dt>
                  <dd className="figure">{s.value}</dd>
                </div>
              ))}
            </dl>

            <h2 className="wiz-h2">Now bring your menu in.</h2>
            <div className="wiz-doors">
              {/* Deliberately unequal: import is the faster path to a costed
                  menu, and the reassurance is attached because "will it change
                  my file" is the fear that stops the click. */}
              <button
                type="button"
                className="wiz-door is-primary"
                onClick={() => router.push('/import')}
              >
                <span className="wiz-door-h">Import your spreadsheet</span>
                <span className="wiz-door-p">
                  The fast way. Most sheets map in about a minute and you come out the other side
                  with a costed menu. Keep your file — Costbook only reads it.
                </span>
              </button>
              <button
                type="button"
                className="wiz-door"
                onClick={() => router.push('/recipes')}
              >
                <span className="wiz-door-h">Start with one dish</span>
                <span className="wiz-door-p">
                  Cost a single dish by hand first, if you&rsquo;d rather see how it works before
                  bringing everything in. You can import whenever you like.
                </span>
              </button>
            </div>
          </section>
        )}
      </main>

      {step <= 4 && (
        <footer className="wiz-foot">
          <button
            type="button"
            className="wiz-back"
            disabled={step === 1}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </button>
          <span className="wiz-foot-note">
            {step === 4 ? 'Nothing is locked. Settings has all four.' : 'Takes about two minutes.'}
          </span>
          <button
            type="button"
            className="wiz-next"
            disabled={!answered || pending}
            onClick={() => (step === 4 ? commit() : setStep((s) => s + 1))}
          >
            {/* An answer, not a skip. A link labelled Skip implies the step was
                meant for you and you are ducking it. */}
            {step === 3 && charges.length === 0
              ? 'Nothing extra on my bills'
              : step === 4
                ? (pending ? 'Setting up…' : 'That’s the four')
                : 'Next'}
          </button>
        </footer>
      )}
    </div>
  );
}

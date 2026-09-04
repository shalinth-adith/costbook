'use client';

import { useMemo, useState, useTransition } from 'react';

import { CURRENCIES, currency, formatMoney } from '@/core/currency';
import { PRESETS, applyRounding, describeRule, type PresetName } from '@/core/rounding';
import { COUNTRIES, TEAM_SIZES, type TeamSize, countryOf, searchCountries } from '@/lib/countries';
import { TARGET_MAX, TARGET_MIN } from '@/lib/org';

import { finishSetup } from '@/app/setup/actions';

import { Wordmark } from './wordmark';

/** Where the three rules start from. Starting points, not decisions: the owner makes those. */
export interface SetupDefaults {
  readonly foodCostTarget: number;
  readonly rounding: PresetName;
  readonly staleAfterDays: number;
}

const SCREENS = [
  { no: 1, label: 'Your restaurant' },
  { no: 2, label: 'Your rules' },
  { no: 3, label: 'Review' },
] as const;

/** The keep shares offered as chips; anything between the bounds can be typed. */
const KEEP_CHIPS = [60, 65, 70, 75, 80] as const;
const STALE_CHIPS = [30, 60, 90, 180] as const;
const PRESET_NAMES = Object.keys(PRESETS) as readonly PresetName[];
/** A plate cost to show the rules working on. Marked as an example wherever it appears. */
const EXAMPLE_COST = 12;

const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * The restaurant's portfolio and its rules, asked once after sign-up.
 *
 * Three screens, one layout. The first asks who the restaurant is: name,
 * country, money, how many hands. The second asks the three rules the book
 * runs on — what is kept of every hundred, how a price rounds, when a rate
 * is old — because those are the owner's to decide, not a default's; each
 * choice shows what it does beside it, on real figures. The third lists
 * every answer with a way back to it, then saves all of it at once. The
 * right half is the consequence of the field beside it throughout, which
 * is how Settings works too. Nothing is written until the last button.
 */
export function SetupWizard({ initialCurrency, defaults, preview = false }: {
  initialCurrency: string;
  defaults: SetupDefaults;
  /**
   * Show the screens without saving them. The real wizard is behind an
   * account once it is answered, so this is how it is looked at afterwards:
   * the last button starts over instead of writing anything.
   */
  preview?: boolean;
}) {
  const [pending, start] = useTransition();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Screen 1.
  const [name, setName] = useState('');
  const [country, setCountry] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [code, setCode] = useState(initialCurrency);
  const [codeChosen, setCodeChosen] = useState(false);
  const [teamSize, setTeamSize] = useState<TeamSize | null>(null);

  // Screen 2. Held as "keep of every hundred", which is how the owner thinks
  // of it; the org stores the other side, the supplier share.
  const [keep, setKeep] = useState(100 - defaults.foodCostTarget);
  const [rounding, setRounding] = useState<PresetName>(defaults.rounding);
  const [stale, setStale] = useState(defaults.staleAfterDays);

  const picked = countryOf(country);
  const cur = currency(code);
  const shown = useMemo(() => searchCountries(search), [search]);
  const size = TEAM_SIZES.find((t) => t.id === teamSize);
  const rule = PRESETS[rounding];
  const said = (v: number) => formatMoney(v, code);

  const keepOk = Number.isFinite(keep) && keep >= 100 - TARGET_MAX && keep <= 100 - TARGET_MIN;
  const staleOk = Number.isInteger(stale) && stale >= 1 && stale <= 365;
  // The example plate, priced by the rules as they stand.
  const examplePrice = keepOk ? applyRounding(EXAMPLE_COST / ((100 - keep) / 100), rule) : null;

  const pickCountry = (c: string) => {
    setCountry(c);
    // The country proposes the money once; a hand-picked currency is kept.
    const proposed = countryOf(c)?.currency;
    if (!codeChosen && proposed !== undefined) setCode(proposed);
  };

  const missing1 = [
    name.trim() === '' ? 'the name' : null,
    country === null ? 'the country' : null,
    teamSize === null ? 'the kitchen' : null,
  ].filter((m): m is string => m !== null);
  const missing2 = [
    keepOk ? null : `a keep between ${100 - TARGET_MAX} and ${100 - TARGET_MIN}`,
    staleOk ? null : 'a number of days up to 365',
  ].filter((m): m is string => m !== null);
  const ready = step === 1 ? missing1.length === 0 : step === 2 ? missing2.length === 0 : true;
  const missing = step === 1 ? missing1 : missing2;

  const reset = () => {
    setStep(1);
    setName(''); setCountry(null); setSearch(''); setCode(initialCurrency);
    setCodeChosen(false); setTeamSize(null);
    setKeep(100 - defaults.foodCostTarget); setRounding(defaults.rounding); setStale(defaults.staleAfterDays);
  };

  const save = () => {
    if (preview) { reset(); return; }
    start(async () => {
      // Saving is leaving: the action sends the account to its landing page.
      await finishSetup({
        name, country, currency: code, teamSize,
        foodCostTarget: 100 - keep, rounding, staleAfterDays: stale,
      });
    });
  };

  const next = () => {
    if (!ready) return;
    if (step === 3) save();
    else setStep(step === 1 ? 2 : 3);
  };

  return (
    <div className="wiz">
      <header className="wiz-top">
        <Wordmark />
        <span className="wiz-kicker">YOUR RESTAURANT</span>
        {preview && <span className="wiz-preview">Preview · nothing here is saved</span>}
        <ol className="wiz-ticks" aria-label="Setup progress">
          {SCREENS.map((s) => (
            <li key={s.no} className="wiz-tick" data-state={s.no < step ? 'done' : s.no === step ? 'now' : 'todo'}>
              <span className="wiz-tick-no figure">{s.no}</span>
              {s.label}
            </li>
          ))}
        </ol>
      </header>

      <div className="wiz-body">
        <main className="wiz-form">
          {step === 1 && (
            <>
              <p className="wiz-eyebrow">1 of 3 · your restaurant</p>
              <h1 className="wiz-h display">Set up your book.</h1>
              <p className="wiz-lede">
                Who the restaurant is, then the three rules the book runs on, then a review.
                Nothing is written until the last screen, and everything can be changed later
                in Settings, where each change shows what it reprices before it commits.
              </p>

              <section className="wiz-sec">
                <div className="wiz-sec-head">
                  <span className="wiz-sec-no figure">01</span>
                  <h2 className="wiz-sec-h">The name</h2>
                  <p className="wiz-sec-p">As it is on the board outside. It heads every prep card and every export.</p>
                </div>
                <div className="wiz-sec-body">
                  <input
                    className="wiz-input"
                    value={name}
                    autoFocus
                    placeholder="Your restaurant"
                    aria-label="Restaurant name"
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </section>

              <section className="wiz-sec">
                <div className="wiz-sec-head">
                  <span className="wiz-sec-no figure">02</span>
                  <h2 className="wiz-sec-h">Where it is</h2>
                  <p className="wiz-sec-p">
                    Only the money comes from this. Not on the list yet? Pick the nearest and choose
                    the money by hand below.
                  </p>
                </div>
                <div className="wiz-sec-body">
                  <input
                    className="wiz-input"
                    value={search}
                    placeholder="Type to find the country"
                    aria-label="Find a country"
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      const first = shown[0];
                      if (e.key === 'Enter' && first !== undefined) { pickCountry(first.code); setSearch(''); }
                    }}
                  />
                  <div className="wiz-countries" role="radiogroup" aria-label="Country">
                    {shown.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        className={`wiz-chip${country === c.code ? ' is-on' : ''}`}
                        aria-pressed={country === c.code}
                        onClick={() => pickCountry(c.code)}
                      >
                        {c.name}
                        <span className="wiz-chip-sub figure">{c.currency}</span>
                      </button>
                    ))}
                    {shown.length === 0 && (
                      <p className="wiz-note">
                        Nothing by that name in the {COUNTRIES.length} on the list. Pick the nearest
                        for now; the money is chosen separately.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="wiz-sec">
                <div className="wiz-sec-head">
                  <span className="wiz-sec-no figure">03</span>
                  <h2 className="wiz-sec-h">The money</h2>
                  <p className="wiz-sec-p">
                    {picked !== undefined && !codeChosen
                      ? <>In {picked.name} that is usually {picked.currency}. Change it if you deal in something else.</>
                      : <>Every rate you type and every price you set is in it. Costbook never converts.</>}
                  </p>
                </div>
                <div className="wiz-sec-body">
                  <div className="wiz-currencies" role="radiogroup" aria-label="Currency">
                    {CURRENCIES.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        className={`wiz-cur${code === c.code ? ' is-on' : ''}`}
                        aria-pressed={code === c.code}
                        title={c.name}
                        onClick={() => { setCode(c.code); setCodeChosen(true); }}
                      >
                        <span className="figure">{c.code}</span>
                        <span className="wiz-cur-name">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="wiz-sec">
                <div className="wiz-sec-head">
                  <span className="wiz-sec-no figure">04</span>
                  <h2 className="wiz-sec-h">The kitchen</h2>
                  <p className="wiz-sec-p">How many people work in it. About is fine; nothing is priced by it.</p>
                </div>
                <div className="wiz-sec-body">
                  <div className="wiz-sizes" role="radiogroup" aria-label="Kitchen size">
                    {TEAM_SIZES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`wiz-size${teamSize === t.id ? ' is-on' : ''}`}
                        aria-pressed={teamSize === t.id}
                        onClick={() => setTeamSize(t.id)}
                      >
                        <span className="wiz-size-label">{t.label}</span>
                        <span className="wiz-size-said">{t.said}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {step === 2 && (
            <>
              <p className="wiz-eyebrow">2 of 3 · your rules</p>
              <h1 className="wiz-h display">Three rules the book runs on.</h1>
              <p className="wiz-lede">
                Yours to set, not Costbook's. Each one is shown working on the right as you change
                it, and each one is in Settings afterwards.
              </p>

              <section className="wiz-sec">
                <div className="wiz-sec-head">
                  <span className="wiz-sec-no figure">05</span>
                  <h2 className="wiz-sec-h">What you keep</h2>
                  <p className="wiz-sec-p">
                    Of every {said(100)} a guest pays, how much stays with you after the
                    ingredients. The rest is what you are willing to spend on suppliers.
                  </p>
                </div>
                <div className="wiz-sec-body">
                  <div className="wiz-sizes" role="radiogroup" aria-label="Keep of every hundred">
                    {KEEP_CHIPS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={`wiz-size${keep === k ? ' is-on' : ''}`}
                        aria-pressed={keep === k}
                        onClick={() => setKeep(k)}
                      >
                        <span className="wiz-size-label figure">{said(k)}</span>
                        <span className="wiz-size-said">{said(100 - k)} to suppliers</span>
                      </button>
                    ))}
                  </div>
                  <label className="wiz-typed">
                    <span>Or type another, between {100 - TARGET_MAX} and {100 - TARGET_MIN}</span>
                    <input
                      className="wiz-input wiz-input-sm figure"
                      inputMode="decimal"
                      value={Number.isFinite(keep) ? String(keep) : ''}
                      onChange={(e) => setKeep(e.target.value === '' ? Number.NaN : Number(e.target.value))}
                      aria-invalid={!keepOk}
                    />
                  </label>
                </div>
              </section>

              <section className="wiz-sec">
                <div className="wiz-sec-head">
                  <span className="wiz-sec-no figure">06</span>
                  <h2 className="wiz-sec-h">How a price rounds</h2>
                  <p className="wiz-sec-p">
                    The sheet works out an exact figure and this rule turns it into the price on
                    the menu. Each option shows what it makes of {said(46.3)}.
                  </p>
                </div>
                <div className="wiz-sec-body">
                  <div className="wiz-rules" role="radiogroup" aria-label="Rounding rule">
                    {PRESET_NAMES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`wiz-rule${rounding === p ? ' is-on' : ''}`}
                        aria-pressed={rounding === p}
                        onClick={() => setRounding(p)}
                      >
                        <span className="wiz-rule-said">{sentence(describeRule(PRESETS[p]))}</span>
                        <span className="wiz-rule-fig figure">{said(46.3)} → {said(applyRounding(46.3, PRESETS[p]))}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="wiz-sec">
                <div className="wiz-sec-head">
                  <span className="wiz-sec-no figure">07</span>
                  <h2 className="wiz-sec-h">When a rate is old</h2>
                  <p className="wiz-sec-p">
                    A supplier price nobody has checked for this long is flagged on the ingredient
                    and on every dish it is in, so a stale figure is never mistaken for a current one.
                  </p>
                </div>
                <div className="wiz-sec-body">
                  <div className="wiz-sizes" role="radiogroup" aria-label="Days before a rate is stale">
                    {STALE_CHIPS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`wiz-size${stale === d ? ' is-on' : ''}`}
                        aria-pressed={stale === d}
                        onClick={() => setStale(d)}
                      >
                        <span className="wiz-size-label figure">{d} days</span>
                        <span className="wiz-size-said">
                          {d <= 30 ? 'a month' : d <= 60 ? 'two months' : d <= 90 ? 'a quarter' : 'half a year'}
                        </span>
                      </button>
                    ))}
                  </div>
                  <label className="wiz-typed">
                    <span>Or type a number of days, up to 365</span>
                    <input
                      className="wiz-input wiz-input-sm figure"
                      inputMode="numeric"
                      value={Number.isFinite(stale) ? String(stale) : ''}
                      onChange={(e) => setStale(e.target.value === '' ? Number.NaN : Number(e.target.value))}
                      aria-invalid={!staleOk}
                    />
                  </label>
                </div>
              </section>
            </>
          )}

          {step === 3 && (
            <>
              <p className="wiz-eyebrow">3 of 3 · review</p>
              <h1 className="wiz-h display">Review, then save.</h1>
              <p className="wiz-lede">
                Everything below saves together and opens your book. If something is wrong, Edit
                takes you back to it. Later, every one of these is in Settings, changed one at a
                time, and each change shows what it reprices before it commits.
              </p>

              <section className="wiz-review">
                <div className="wiz-review-head">
                  <h2 className="wiz-sec-h">Your restaurant</h2>
                  <button type="button" className="wiz-edit" onClick={() => setStep(1)}>Edit</button>
                </div>
                <dl className="wiz-rows">
                  <div className="wiz-row"><dt>Name</dt><dd>{name.trim()}</dd></div>
                  <div className="wiz-row"><dt>Country</dt><dd>{picked?.name ?? '—'}</dd></div>
                  <div className="wiz-row"><dt>Money</dt><dd>{cur.name} · a hundred is <b className="figure">{said(100)}</b></dd></div>
                  <div className="wiz-row"><dt>Kitchen</dt><dd>{size !== undefined ? <>{size.label}, {size.said}</> : '—'}</dd></div>
                </dl>
              </section>

              <section className="wiz-review">
                <div className="wiz-review-head">
                  <h2 className="wiz-sec-h">Your rules</h2>
                  <button type="button" className="wiz-edit" onClick={() => setStep(2)}>Edit</button>
                </div>
                <dl className="wiz-rows">
                  <div className="wiz-row">
                    <dt>Of every {said(100)} a guest pays</dt>
                    <dd><b className="figure">{said(keep)}</b> stays with you, <b className="figure">{said(100 - keep)}</b> goes to suppliers</dd>
                  </div>
                  <div className="wiz-row">
                    <dt>A suggested price</dt>
                    <dd>{sentence(describeRule(rule))}. <b className="figure">{said(46.3)}</b> becomes <b className="figure">{said(applyRounding(46.3, rule))}</b>.</dd>
                  </div>
                  <div className="wiz-row">
                    <dt>A rate nobody has checked</dt>
                    <dd>Flagged after <b className="figure">{stale}</b> days</dd>
                  </div>
                </dl>
              </section>

              <p className="wiz-save-note">
                {preview
                  ? 'In the preview, saving starts over. Nothing is written.'
                  : 'Saving opens your book. Any edit after this is made in Settings.'}
              </p>
            </>
          )}

          <footer className="wiz-foot">
            {step > 1 ? (
              <button type="button" className="btn wiz-back" onClick={() => setStep(step === 3 ? 2 : 1)}>
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary btn-lg wiz-next"
              disabled={!ready || pending}
              onClick={next}
            >
              {pending ? 'Saving…'
                : step === 3 ? (preview ? 'Start over' : 'Save and open Costbook')
                : step === 2 ? 'Review'
                : 'Next: your rules'}
            </button>
            <span className="wiz-foot-note">
              {ready
                ? (step === 3 ? 'One save, then the book.' : 'Nothing is written until the last screen.')
                : `Still needed: ${missing.join(', ')}.`}
            </span>
          </footer>
        </main>

        <aside className="wiz-live" aria-live="polite">
          <p className="wiz-live-label">{step === 2 ? 'Your rules, working' : 'What this sets up'}</p>

          {step !== 2 && (
            <div className="wiz-card">
              <div className="wiz-card-head">
                <span className={`wiz-card-name display${name.trim() === '' ? ' is-empty' : ''}`}>
                  {name.trim() === '' ? 'Your restaurant' : name.trim()}
                </span>
                <span className="wiz-card-sub">
                  {picked?.name ?? 'Country not chosen yet'} · {cur.name}
                </span>
              </div>
              <div className="wiz-card-money">
                <span className="wiz-card-money-label">A hundred, written your way</span>
                <span className="wiz-card-money-fig display">{said(100)}</span>
                <span className="wiz-card-money-more">
                  A half is {said(0.5)}, a quarter {said(0.25)}. Every sheet, every export, every price.
                </span>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wiz-card">
              <div className="wiz-card-money">
                <span className="wiz-card-money-label">A plate whose ingredients cost {said(EXAMPLE_COST)}, for example</span>
                <span className="wiz-card-money-fig display">{examplePrice === null ? '—' : said(examplePrice)}</span>
                <span className="wiz-card-money-more">
                  {examplePrice === null
                    ? 'Choose a keep between the bounds to see the price.'
                    : <>Sells at that, so <b className="figure">{said(examplePrice - EXAMPLE_COST)}</b> of it stays with you. Exact figure {said(EXAMPLE_COST / ((100 - keep) / 100))}, then {describeRule(rule)}.</>}
                </span>
              </div>
            </div>
          )}

          {step === 1 && (
            <>
              <p className="wiz-live-label">The kitchen</p>
              <dl className="wiz-rows">
                <div className="wiz-row">
                  <dt>How many hands</dt>
                  <dd>{size !== undefined ? <>{size.label}, {size.said}</> : 'Not chosen yet'}</dd>
                </div>
              </dl>
              <p className="wiz-live-label">Next</p>
              <ol className="wiz-then">
                <li><b>Your rules.</b> What you keep of every {said(100)}, how a price rounds, when a rate is old. You set them; nothing is decided for you.</li>
                <li><b>Review.</b> Every answer in one place, then one save.</li>
              </ol>
            </>
          )}

          {step === 2 && (
            <dl className="wiz-rows">
              <div className="wiz-row">
                <dt>Of every {said(100)} a guest pays</dt>
                <dd>
                  {keepOk
                    ? <><b className="figure">{said(keep)}</b> stays with you, <b className="figure">{said(100 - keep)}</b> goes to suppliers</>
                    : <>Choose a keep between {100 - TARGET_MAX} and {100 - TARGET_MIN}</>}
                </dd>
              </div>
              <div className="wiz-row">
                <dt>A suggested price</dt>
                <dd>{sentence(describeRule(rule))}. <b className="figure">{said(46.3)}</b> becomes <b className="figure">{said(applyRounding(46.3, rule))}</b>.</dd>
              </div>
              <div className="wiz-row">
                <dt>A rate nobody has checked</dt>
                <dd>{staleOk ? <>Flagged after <b className="figure">{stale}</b> days, on the ingredient and every dish it is in</> : 'Choose a number of days up to 365'}</dd>
              </div>
            </dl>
          )}

          {step === 3 && (
            <>
              <p className="wiz-live-label">Then</p>
              <ol className="wiz-then">
                <li><b>Add a dish.</b> Type its lines with their rates, the way they are on your sheet.</li>
                <li><b>Read the plate.</b> What it costs, what it should sell for, what you keep.</li>
                <li><b>Change one rate.</b> Every dish that uses it moves, and the ones that slip are named.</li>
              </ol>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

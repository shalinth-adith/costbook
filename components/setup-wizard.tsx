'use client';

import { useMemo, useState, useTransition } from 'react';

import { CURRENCIES, currency, formatMoney } from '@/core/currency';
import { PRESETS, applyRounding, describeRule, type PresetName } from '@/core/rounding';
import { COUNTRIES, TEAM_SIZES, type TeamSize, countryOf, searchCountries } from '@/lib/countries';

import { finishSetup } from '@/app/setup/actions';

import { Wordmark } from './wordmark';

/** The defaults the book opens with, shown beside the answers so nothing is a surprise. */
export interface SetupDefaults {
  readonly foodCostTarget: number;
  readonly rounding: PresetName;
  readonly staleAfterDays: number;
}

/**
 * The restaurant's portfolio, asked once after sign-up.
 *
 * One screen, two halves. The left asks four things — the name, the country,
 * the money, how many hands are in the kitchen — at the size the rest of the
 * app is written in. The right shows what those answers set up, from the
 * real values: the name as it will head a prep card, a hundred and a half
 * written in the chosen money, the defaults the book opens with and the
 * rule each one follows. Nothing on the right is invented; the panel is
 * the consequence of the field beside it, which is how Settings works too.
 * Answers are held here and written once, so changing one costs nothing.
 */
export function SetupWizard({ initialCurrency, defaults, preview = false }: {
  initialCurrency: string;
  defaults: SetupDefaults;
  /**
   * Show the screen without saving it. The real wizard is behind an account
   * once it is answered, so this is how it is looked at afterwards: the
   * button starts over instead of writing anything.
   */
  preview?: boolean;
}) {
  const [pending, start] = useTransition();

  const [name, setName] = useState('');
  const [country, setCountry] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [code, setCode] = useState(initialCurrency);
  const [codeChosen, setCodeChosen] = useState(false);
  const [teamSize, setTeamSize] = useState<TeamSize | null>(null);

  const picked = countryOf(country);
  const cur = currency(code);
  const shown = useMemo(() => searchCountries(search), [search]);
  const size = TEAM_SIZES.find((t) => t.id === teamSize);
  const rule = PRESETS[defaults.rounding];

  const pickCountry = (c: string) => {
    setCountry(c);
    // The country proposes the money once; a hand-picked currency is kept.
    const proposed = countryOf(c)?.currency;
    if (!codeChosen && proposed !== undefined) setCode(proposed);
  };

  const missing = [
    name.trim() === '' ? 'the name' : null,
    country === null ? 'the country' : null,
    teamSize === null ? 'the kitchen' : null,
  ].filter((m): m is string => m !== null);
  const ready = missing.length === 0;

  const reset = () => {
    setName(''); setCountry(null); setSearch(''); setCode(initialCurrency);
    setCodeChosen(false); setTeamSize(null);
  };

  const commit = () => {
    if (preview) { reset(); return; }
    start(async () => {
      // Saving is leaving: the action sends the account to its landing page.
      await finishSetup({ name, country, currency: code, teamSize });
    });
  };

  const said = (v: number) => formatMoney(v, code);
  // The rule is written to sit mid-sentence; here it opens one.
  const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  return (
    <div className="wiz">
      <header className="wiz-top">
        <Wordmark />
        <span className="wiz-kicker">YOUR RESTAURANT</span>
        {preview && <span className="wiz-preview">Preview · nothing here is saved</span>}
        <span className="wiz-count">Four answers · under a minute</span>
      </header>

      <div className="wiz-body">
        <main className="wiz-form">
          <p className="wiz-eyebrow">Before the first dish</p>
          <h1 className="wiz-h display">Set up your book.</h1>
          <p className="wiz-lede">
            Four answers, and the book opens. How you price, how prices round, what goes on the
            bill — all of that starts from a default you can see on the right, and each one is
            changed in Settings, where it shows what it reprices before it commits.
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

          <footer className="wiz-foot">
            <button
              type="button"
              className="btn btn-primary btn-lg wiz-next"
              disabled={!ready || pending}
              onClick={commit}
            >
              {pending ? 'Opening…' : preview ? 'Start over' : 'Open Costbook'}
            </button>
            <span className="wiz-foot-note">
              {ready
                ? 'Nothing is locked. All four are in Settings.'
                : `Still needed: ${missing.join(', ')}.`}
            </span>
          </footer>
        </main>

        <aside className="wiz-live" aria-live="polite">
          <p className="wiz-live-label">What this sets up</p>

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

          <p className="wiz-live-label">Already decided, all of it in Settings</p>
          <dl className="wiz-rows">
            <div className="wiz-row">
              <dt>Of every {said(100)} a guest pays</dt>
              <dd>
                <b className="figure">{said(100 - defaults.foodCostTarget)}</b> planned to keep,{' '}
                <b className="figure">{said(defaults.foodCostTarget)}</b> to suppliers
              </dd>
            </div>
            <div className="wiz-row">
              <dt>A suggested price</dt>
              <dd>
                {sentence(describeRule(rule))}. <b className="figure">{said(46.3)}</b> becomes{' '}
                <b className="figure">{said(applyRounding(46.3, rule))}</b>.
              </dd>
            </div>
            <div className="wiz-row">
              <dt>A rate nobody has checked</dt>
              <dd>Flagged after <b className="figure">{defaults.staleAfterDays}</b> days, on the ingredient and every dish it is in</dd>
            </div>
            <div className="wiz-row">
              <dt>The kitchen</dt>
              <dd>{size !== undefined ? <>{size.label}, {size.said}</> : 'Not chosen yet'}</dd>
            </div>
          </dl>

          <p className="wiz-live-label">Then</p>
          <ol className="wiz-then">
            <li><b>Add a dish.</b> Type its lines with their rates, the way they are on your sheet.</li>
            <li><b>Read the plate.</b> What it costs, what it should sell for, what you keep.</li>
            <li><b>Change one rate.</b> Every dish that uses it moves, and the ones that slip are named.</li>
          </ol>
        </aside>
      </div>
    </div>
  );
}

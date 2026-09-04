'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { CURRENCIES, currency, formatMoney } from '@/core/currency';
import { COUNTRIES, TEAM_SIZES, type TeamSize, countryOf, searchCountries } from '@/lib/countries';
import { SETUP_STEPS } from '@/lib/org';

import { finishSetup } from '@/app/setup/actions';

import { Wordmark } from './wordmark';

/**
 * The restaurant's portfolio, asked once after sign-up.
 *
 * Four answers, one a screen, each large enough to be the whole screen: the
 * name, the country, the money, and how many hands are in the kitchen. Then
 * the book. Tax, the bill and the target all start from labelled defaults
 * and are changed where they act; asking them here would cost more in
 * abandonment than it returns, since a kitchen that has not yet costed a
 * dish has no basis for answering. Answers are held here and written once
 * at the end, so backing up costs nothing.
 */
export function SetupWizard({ initialCurrency }: { initialCurrency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [country, setCountry] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [code, setCode] = useState(initialCurrency);
  const [codeChosen, setCodeChosen] = useState(false);
  const [teamSize, setTeamSize] = useState<TeamSize | null>(null);

  const cur = currency(code);
  const picked = countryOf(country);
  const shown = useMemo(() => searchCountries(search), [search]);

  const pickCountry = (c: string) => {
    setCountry(c);
    // The country proposes the money once; a hand-picked currency is kept.
    const proposed = countryOf(c)?.currency;
    if (!codeChosen && proposed !== undefined) setCode(proposed);
  };

  const answered =
    step === 1 ? name.trim() !== ''
    : step === 2 ? country !== null
    : step === 3 ? true
    : teamSize !== null;

  const commit = () => {
    start(async () => {
      await finishSetup({ name, country, currency: code, teamSize });
      setStep(5);
    });
  };

  return (
    <div className="wiz">
      <header className="wiz-top">
        <Wordmark />
        <span className="wiz-kicker">YOUR RESTAURANT</span>
        <span className="wiz-count figure">{Math.min(step, 4)} / 4</span>
      </header>

      <ol className="wiz-ticks" aria-label="Setup progress">
        {SETUP_STEPS.map((t) => (
          <li key={t.no} className="wiz-tick" data-state={t.no < step ? 'done' : t.no === step ? 'now' : 'todo'}>
            <span className="wiz-tick-rule" />
            <span className="wiz-tick-label">{t.label}</span>
          </li>
        ))}
      </ol>

      <main className="wiz-body">
        {step === 1 && (
          <section className="wiz-step">
            <p className="wiz-eyebrow">1 of 4 · the name</p>
            <h1 className="wiz-h">What is your restaurant called?</h1>
            <label className="wiz-field">
              <span className="wiz-label">The name on the board outside</span>
              <input
                className="wiz-input wiz-input-lg"
                value={name}
                autoFocus
                placeholder="Kumbakonam Cafe"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() !== '') setStep(2); }}
              />
              <span className="wiz-help">It goes on every prep card and every export.</span>
            </label>
          </section>
        )}

        {step === 2 && (
          <section className="wiz-step">
            <p className="wiz-eyebrow">2 of 4 · the country</p>
            <h1 className="wiz-h">Where is {name.trim() === '' ? 'it' : name.trim()}?</h1>
            <label className="wiz-field">
              <span className="wiz-label">Country</span>
              <input
                className="wiz-input"
                value={search}
                autoFocus
                placeholder="Type to find it"
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  const first = shown[0];
                  if (e.key === 'Enter' && first !== undefined) { pickCountry(first.code); setStep(3); }
                }}
              />
            </label>
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
                  Not on the list yet. Pick the nearest for now — only the currency comes from it,
                  and you choose that on the next screen.
                </p>
              )}
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="wiz-step">
            <p className="wiz-eyebrow">3 of 4 · the money</p>
            <h1 className="wiz-h">
              {picked !== undefined && !codeChosen
                ? <>In {picked.name} that is usually <span className="figure">{picked.currency}</span>.</>
                : <>What money do you deal in?</>}
            </h1>
            <div className="wiz-big display" aria-live="polite">{formatMoney(100, code)}</div>
            <p className="wiz-lede">
              That is how a hundred will be written on every sheet. Every rate you type and every
              price you set is in it, and it is the one thing Costbook never converts.
            </p>
            <div className="wiz-currencies" role="radiogroup" aria-label="Currency">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`wiz-cur${code === c.code ? ' is-on' : ''}`}
                  aria-pressed={code === c.code}
                  onClick={() => { setCode(c.code); setCodeChosen(true); }}
                >
                  <span className="figure">{c.symbol === c.code ? c.code : `${c.symbol} ${c.code}`}</span>
                  <span className="wiz-cur-name">{c.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="wiz-step">
            <p className="wiz-eyebrow">4 of 4 · the strength</p>
            <h1 className="wiz-h">How many people work in the kitchen?</h1>
            <p className="wiz-lede">About is fine. Nothing is priced by it.</p>
            <div className="wiz-sizes" role="radiogroup" aria-label="Kitchen size">
              {TEAM_SIZES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`wiz-size${teamSize === t.id ? ' is-on' : ''}`}
                  aria-pressed={teamSize === t.id}
                  onClick={() => setTeamSize(t.id)}
                >
                  <span className="wiz-size-label display">{t.label}</span>
                  <span className="wiz-size-said">{t.said}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 5 && (
          <section className="wiz-step">
            <p className="wiz-eyebrow">Done</p>
            <h1 className="wiz-h">{name.trim()} is set up.</h1>
            <dl className="wiz-summary">
              {[
                { label: 'Restaurant', value: name.trim() },
                { label: 'Country', value: picked?.name ?? '—' },
                { label: 'Currency', value: `${cur.symbol} · ${cur.name}` },
                { label: 'Kitchen', value: TEAM_SIZES.find((t) => t.id === teamSize)?.label ?? '—' },
              ].map((row) => (
                <div key={row.label} className="wiz-summary-row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="wiz-lede">
              Everything else already has a sensible default — how you price, rounding, what goes on
              the bill. They are all in Settings, and each one shows what it changes before it does.
            </p>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => router.push('/dashboard')}>
              Open your book
            </button>
          </section>
        )}
      </main>

      {step <= 4 && (
        <footer className="wiz-foot">
          {step > 1 ? (
            <button type="button" className="btn wiz-back" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          ) : <span />}
          <span className="wiz-foot-note">
            {step === 4 ? 'Nothing is locked. All four are in Settings.' : 'Under a minute.'}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-lg wiz-next"
            disabled={!answered || pending}
            onClick={() => (step === 4 ? commit() : setStep((s) => s + 1))}
          >
            {pending ? 'Saving…' : step === 4 ? 'Open Costbook' : 'Next'}
          </button>
        </footer>
      )}
    </div>
  );
}

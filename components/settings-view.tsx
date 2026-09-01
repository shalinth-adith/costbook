'use client';

import { useMemo, useState, useTransition } from 'react';

import { type Charge, applyCharges } from '@/core/charges';
import { currency, formatMoney } from '@/core/currency';
import { PRESETS, type PresetName, applyRounding, describeRule } from '@/core/rounding';

import { changeRole, choosePlan, drop, invite, previewCosting, saveCharges, saveCosting, saveOrganisation }
  from '@/app/settings/actions';
import { ROUNDING_CHOICES, type CostingModel, dishModel, suggestPrice } from '@/lib/costing';
import { FREE_LIMITS, type Member, type Org, type Plan, type Role, taxLabel } from '@/lib/org';
import type { Impact } from '@/lib/impact';

import { ImpactTable } from './impact-table';

const TABS = ['Organisation', 'Costing', 'Charges', 'Team', 'Billing'] as const;
type Tab = (typeof TABS)[number];

const EXAMPLE_PRICE = 100;

/**
 * Three prices to show a rounding rule on.
 *
 * Chosen to land in different places on every lattice: one just under a whole
 * number, one just over, one mid-range. A rule shown on a single price looks
 * like it does nothing.
 */
const ROUNDING_SHOWN: readonly number[] = [46.3, 118.7, 232.4];

/** One line of the worked example. The figure column stays a figure. */
function WorkedRow({ said, figure, strong }: { said: string; figure: string; strong?: boolean }) {
  return (
    <div className={`set-worked-row${strong === true ? ' is-strong' : ''}`}>
      <dt>{said}</dt>
      <dd className="figure">{figure}</dd>
    </div>
  );
}

export interface SettingsData {
  readonly org: Org;
  readonly model: CostingModel;
  readonly members: readonly Member[];
  readonly plan: Plan;
  readonly recipeCount: number;
  readonly ingredientCount: number;
  readonly staleCount: number;
  /** One real dish, costed, so the worked example is theirs and not made up. */
  readonly sample: {
    readonly name: string;
    /** Ingredient cost for one portion, before wastage and packaging. */
    readonly ingredientCost: number;
  } | null;
}

/**
 * Settings — an index, not a path (A27).
 *
 * Every value here is also editable where it acts, on the dish, beside the
 * figure it produces. This screen is for reviewing it all at once, or setting
 * up before there is any data. Nothing is reachable only from here.
 */
export function SettingsView({
  data,
  currencyCode,
}: {
  data: SettingsData;
  currencyCode: string;
}) {
  const [tab, setTab] = useState<Tab>('Organisation');
  const [pending, start] = useTransition();

  const cur = currency(currencyCode);
  const money = (n: number) => formatMoney(n, currencyCode);

  // The Costing tab is a sentence with fields in it. These are the draft
  // values; nothing is applied until the blast radius has been accepted.
  const [target, setTarget] = useState(data.model.foodCostTarget);
  const [wastage, setWastage] = useState(data.model.wastagePercent);
  const [packaging, setPackaging] = useState(data.model.packagingPerPortion);
  const [rounding, setRounding] = useState<PresetName>(data.model.rounding);
  /**
   * The worked example, computed the way the sentence above reads it — in that
   * order, so a reader can follow the arithmetic line by line rather than
   * being handed a total.
   */
  const sampleIngredients = data.sample?.ingredientCost ?? 0;
  const sampleWaste = sampleIngredients * (wastage / 100);
  const samplePlate = sampleIngredients + sampleWaste + packaging;
  // Through the same function the cost sheet uses, so the example on this
  // screen and the price on the dish can never disagree about the arithmetic.
  const sampleSuggestion = suggestPrice(
    samplePlate,
    dishModel(data.model, { foodCostTarget: target, rounding }),
  );

  const [showRadius, setShowRadius] = useState(false);
  /** Null until "show me what moves" is pressed; the server does the costing. */
  const [blastRadius, setBlastRadius] = useState<Impact | null>(null);

  const [charges, setCharges] = useState<readonly Charge[]>(data.org.charges);
  const [name, setName] = useState(data.org.name);
  const [stale, setStale] = useState(data.org.staleAfterDays);

  const dirty =
    target !== data.model.foodCostTarget ||
    wastage !== data.model.wastagePercent ||
    packaging !== data.model.packagingPerPortion ||
    rounding !== data.model.rounding;

  const bill = useMemo(() => {
    try {
      return applyCharges(EXAMPLE_PRICE, charges.filter((c) => c.name.trim() !== ''), 'dine_in');
    } catch {
      return null;
    }
  }, [charges]);

  const applyCosting = () => {
    start(async () => {
      await saveCosting({ foodCostTarget: target, wastagePercent: wastage, packagingPerPortion: packaging, rounding });
      setShowRadius(false);
      setBlastRadius(null);
    });
  };

  return (
    <div className="set">
      <div className="set-head">
        <div>
          <h1 className="set-h">Settings</h1>
          <p className="set-lede">
            Everything here is also editable where it acts — on the dish, in the cost breakdown,
            beside the figure it produces. This screen is for reviewing it all at once, or setting
            up before you have any data.
          </p>
        </div>
        <span className="set-who">{data.org.name} · owner</span>
      </div>

      {/* Tabs at 1440; the same list stacks at 768. */}
      <div className="set-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={t === tab}
            className="set-tab"
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="set-body" role="tabpanel">
        {tab === 'Organisation' && (
          <>
            <SettingRow
              label="Business name"
              help="On printed prep cards and exports."
              scope="APPLIES EVERYWHERE"
            >
              <input
                className="set-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => start(async () => { await saveOrganisation({ name }); })}
              />
            </SettingRow>

            <SettingRow
              label="Currency"
              help="Set once. Costbook does not convert — changing it would leave every rate on file meaning something else."
              scope="NO OVERRIDES, EVER"
            >
              <p className="set-fixed figure">{cur.code} · {cur.name} · {cur.symbol}</p>
              <p className="set-note">
                To move currency you start a new organisation and import into it. Write to us and
                we&rsquo;ll do the move with you.
              </p>
            </SettingRow>

            <SettingRow
              label="How supplier tax reaches you"
              help="Whether tax your supplier bills comes back to you. It decides which figure you type as a rate."
              scope="NO OVERRIDES, EVER"
            >
              <p className="set-fixed">{taxLabel(data.org.taxTreatment)}</p>
              <div className="set-seg">
                {(['recoverable', 'absorbed'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="set-seg-item"
                    data-on={data.org.taxTreatment === t}
                    onClick={() => start(async () => { await saveOrganisation({ taxTreatment: t }); })}
                  >
                    {t === 'recoverable' ? 'I claim it back' : 'I absorb it'}
                  </button>
                ))}
              </div>
              <p className="set-note">
                Changing this recosts every dish — we do it ourselves and you retype nothing.
              </p>
            </SettingRow>

            {/* A29's currency is set once; this is the opposite kind of setting
                and says so. It decides what a line *starts* in, and every line
                can be changed as it is typed. */}
            <SettingRow
              label="Default units"
              help="What a new component line starts in. Any line can be changed as you type it."
              scope="EVERY LINE CAN OVERRIDE"
            >
              <div className="set-units">
                <div className="set-unit-group">
                  <span className="set-unit-family">Mass</span>
                  <div className="set-seg">
                    {([['g', 'g — grams'], ['kg', 'kg — kilos']] as const).map(([u, said]) => (
                      <button
                        key={u}
                        type="button"
                        className="set-seg-item"
                        data-on={data.org.defaultMassUnit === u}
                        onClick={() => start(async () => { await saveOrganisation({ defaultMassUnit: u }); })}
                      >
                        {said}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="set-unit-group">
                  <span className="set-unit-family">Volume</span>
                  <div className="set-seg">
                    {([['ml', 'ml — millilitres'], ['l', 'L — litres']] as const).map(([u, said]) => (
                      <button
                        key={u}
                        type="button"
                        className="set-seg-item"
                        data-on={data.org.defaultVolumeUnit === u}
                        onClick={() => start(async () => { await saveOrganisation({ defaultVolumeUnit: u }); })}
                      >
                        {said}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </SettingRow>

            <SettingRow
              label="When a rate counts as stale"
              help="After this long we mark the rate on the ingredient, and any dish that leans on it."
              scope="APPLIES EVERYWHERE"
            >
              <span className="set-inline">
                <input
                  className="set-input figure is-narrow"
                  inputMode="numeric"
                  value={stale}
                  onChange={(e) => setStale(Number(e.target.value) || 0)}
                  onBlur={() => start(async () => { await saveOrganisation({ staleAfterDays: stale }); })}
                />
                <span>days · <b className="figure">{data.staleCount}</b> ingredients are past it today</span>
              </span>
            </SettingRow>
          </>
        )}

        {tab === 'Costing' && (
          <>
            <h2 className="set-h2">
              How Costbook works out a price
              <span className="set-h2-note">every figure below is a field</span>
            </h2>

            {/* The formula is the control. Nobody can predict what a rounding
                rule does to their menu from its name, so it is shown rather
                than described. */}
            <p className="set-formula">
              Ingredients, plus{' '}
              <input className="set-inline-field figure" inputMode="decimal" value={wastage}
                aria-label="Wastage percent"
                onChange={(e) => setWastage(Number(e.target.value) || 0)} />% wastage, plus{' '}
              {cur.symbol}
              <input className="set-inline-field figure" inputMode="decimal" value={packaging}
                aria-label="Packaging per portion"
                onChange={(e) => setPackaging(Number(e.target.value) || 0)} /> packaging — that is
              your plate cost. Divide by your target of{' '}
              <input className="set-inline-field figure" inputMode="decimal" value={target}
                aria-label="Food cost target"
                onChange={(e) => setTarget(Number(e.target.value) || 0)} />% to get the price. Then{' '}
              <select className="set-inline-select" value={rounding} aria-label="Rounding rule"
                onChange={(e) => setRounding(e.target.value as PresetName)}>
                {ROUNDING_CHOICES.map((r) => (
                  <option key={r} value={r}>{describeRule(PRESETS[r])}</option>
                ))}
              </select>.
            </p>

            {/*
              The formula is a description of how their place works. This is
              the same arithmetic on one of their own dishes, following on the
              keystroke — which is what makes the figures above feel theirs
              rather than like a form they are filling in.
            */}
            {data.sample === null ? null : (
              <section className="set-worked">
                <h3 className="set-h3">
                  On one of your dishes, right now
                  <span className="set-worked-dish">{data.sample.name}</span>
                </h3>
                <dl className="set-worked-rows">
                  <WorkedRow said="Ingredients, as costed today" figure={money(sampleIngredients)} />
                  <WorkedRow said={`Wastage at ${wastage}%`} figure={`+ ${money(sampleWaste)}`} />
                  <WorkedRow said="Packaging" figure={`+ ${money(packaging)}`} />
                  <WorkedRow said="Plate cost" figure={money(samplePlate)} strong />
                  <WorkedRow said={`Divided by ${target}%`} figure={money(sampleSuggestion.exact)} />
                  <WorkedRow said="Suggested price" figure={money(sampleSuggestion.rounded)} strong />
                </dl>
                <p className="set-note">
                  This is your dish and your rates, not an illustration. Change a figure in the
                  sentence above and this follows on the same keystroke.
                </p>
              </section>
            )}

            {/* Nobody can predict what a rounding rule does to their menu from
                its name, so it is shown on three prices rather than described. */}
            <section className="set-rounding-eg">
              <h3 className="set-h3">What that rounding does to real prices</h3>
              <div className="set-rounding-rows">
                {ROUNDING_SHOWN.map((raw) => (
                  <div className="set-rounding-row" key={raw}>
                    <span className="figure set-rounding-from">{money(raw)}</span>
                    <span className="figure set-rounding-arrow" aria-hidden="true">&rarr;</span>
                    <span className="figure set-rounding-to">
                      {money(applyRounding(raw, PRESETS[rounding]))}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <div className="set-overrides">
              <div>
                <span className="set-scope">A DISH CAN OVERRIDE</span>
                <p>target · rounding · packaging</p>
              </div>
              <div>
                <span className="set-scope">NO OVERRIDES, EVER</span>
                <p>currency · how supplier tax is treated</p>
              </div>
            </div>
            <p className="set-note">
              Wastage is per dish on the cost sheet too — a biryani wastes differently from a
              filter coffee.
            </p>

            <div className="set-apply">
              {!dirty ? (
                <p className="set-note">Nothing here has been changed, so nothing has been repriced.</p>
              ) : !showRadius ? (
                <>
                  <p className="set-note">
                    <b>Not saved yet.</b> Changing these reprices dishes — see what moves first.
                  </p>
                  <button type="button" className="btn btn-primary" disabled={pending} onClick={() => {
                    start(async () => {
                      const out = await previewCosting({
                        foodCostTarget: target, wastagePercent: wastage,
                        packagingPerPortion: packaging, rounding,
                      });
                      setBlastRadius(out);
                      setShowRadius(true);
                    });
                  }}>
                    {pending ? 'Costing the menu…' : 'Show me what moves'}
                  </button>
                </>
              ) : (
                <div className="set-radius">
                  <h3>Not saved yet</h3>
                  <p>
                    Changing your target from{' '}
                    <b className="figure">{data.model.foodCostTarget}%</b> to{' '}
                    <b className="figure">{target}%</b> reprices{' '}
                    <b className="figure">{blastRadius?.moved.length ?? 0}</b> dishes.{' '}
                    <b className="figure">{blastRadius?.crossCount ?? 0}</b> would cross target.
                  </p>
                  <p className="set-note">
                    The same panel you get when an ingredient&rsquo;s rate moves, because this is
                    the same event seen from the other end. Nothing is applied until you say so.
                  </p>
                  {blastRadius !== null && (
                    <ImpactTable impact={blastRadius} currencyCode={currencyCode} limit={5} />
                  )}
                  <div className="set-radius-foot">
                    <button type="button" className="btn" onClick={() => {
                      setTarget(data.model.foodCostTarget);
                      setWastage(data.model.wastagePercent);
                      setPackaging(data.model.packagingPerPortion);
                      setRounding(data.model.rounding);
                      setShowRadius(false);
                    }}>
                      Leave it at {data.model.foodCostTarget}%
                    </button>
                    <button type="button" className="btn btn-primary" disabled={pending} onClick={applyCosting}>
                      {pending ? 'Repricing…' : `Reprice ${blastRadius?.moved.length ?? 0} dishes`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'Charges' && (
          <>
            <h2 className="set-h2">The stack, in the order it is applied</h2>
            <p className="set-lede">
              Order matters: a charge that compounds takes its percentage off everything above it.
              Move a row and the example beside this updates.
            </p>

            <div className="set-charges">
              {charges.length === 0 && (
                <p className="set-note">
                  Nothing on the bill on top of your menu price. That is the common answer for a
                  single outlet, and it is a complete one.
                </p>
              )}
              {charges.map((c, i) => (
                <div className="set-charge" key={i}>
                  <span className="set-charge-n figure">{i + 1}</span>
                  <input className="set-input" value={c.name} placeholder="Service charge"
                    onChange={(e) => setCharges((cs) => cs.map((x, n) => n === i ? { ...x, name: e.target.value } : x))} />
                  <span className="set-inline">
                    <input className="set-input figure is-narrow" inputMode="decimal" value={c.value}
                      onChange={(e) => setCharges((cs) => cs.map((x, n) => n === i ? { ...x, value: Number(e.target.value) || 0 } : x))} />
                    <span>{c.mode === 'percent' ? '%' : cur.symbol}</span>
                  </span>
                  <button type="button" className="set-pill" onClick={() =>
                    setCharges((cs) => cs.map((x, n) => n === i ? { ...x, borneBy: x.borneBy === 'guest' ? 'operator' : 'guest' } : x))}>
                    {c.borneBy === 'guest' ? 'the guest pays' : 'you bear this'}
                  </button>
                  <button type="button" className="set-pill" onClick={() =>
                    setCharges((cs) => cs.map((x, n) => n === i ? { ...x, compounds: !x.compounds, base: x.compounds ? 'net_subtotal' : 'running_total' } : x))}>
                    {c.compounds ? 'compounds' : 'on the price'}
                  </button>
                  <button type="button" className="set-pill" aria-label={`Remove ${c.name || 'charge'}`}
                    onClick={() => setCharges((cs) => cs.filter((_, n) => n !== i))}>Remove</button>
                </div>
              ))}
              <button type="button" className="wiz-add" onClick={() => setCharges((cs) => [...cs, {
                name: '', mode: 'percent', value: 5, base: 'running_total',
                order: cs.length + 1, compounds: true, borneBy: 'guest',
                channels: ['dine_in', 'takeaway', 'delivery'],
              }])}>Add a charge</button>
            </div>

            {bill !== null && (
              <div className="wiz-bill">
                <h3>A {money(EXAMPLE_PRICE)} dish, itemised</h3>
                <div className="wiz-bill-row"><span>Menu price</span><span className="figure">{money(EXAMPLE_PRICE)}</span></div>
                {bill.lines.map((l, i) => (
                  <div className="wiz-bill-row" key={i} data-borne={l.borneBy}>
                    <span>{l.name} <em>{l.borneBy === 'guest' ? 'the guest pays' : 'you bear this'}</em></span>
                    <span className="figure">{l.borneBy === 'operator' ? '−' : ''}{money(l.amount)}</span>
                  </div>
                ))}
                <div className="wiz-bill-row is-total"><span>The guest pays</span><span className="figure">{money(bill.guestTotal)}</span></div>
                <div className="wiz-bill-row is-total"><span>You keep</span><span className="figure">{money(bill.operatorKeeps)}</span></div>
              </div>
            )}
            <p className="set-note">
              Charges the guest pays are added; charges you bear are taken off what reaches you.
            </p>
            <button type="button" className="btn btn-primary" disabled={pending}
              onClick={() => start(async () => { await saveCharges(charges); })}>
              {pending ? 'Saving…' : 'Save the stack'}
            </button>
          </>
        )}

        {tab === 'Team' && (
          <TeamTab members={data.members} pending={pending} start={start} />
        )}

        {tab === 'Billing' && (
          <BillingTab
            plan={data.plan}
            recipeCount={data.recipeCount}
            ingredientCount={data.ingredientCount}
            pending={pending}
            start={start}
          />
        )}
      </div>
    </div>
  );
}

function SettingRow({
  label, help, scope, children,
}: {
  label: string; help: string; scope: string; children: React.ReactNode;
}) {
  return (
    <div className="set-row">
      <div className="set-row-head">
        <span className="set-row-label">{label}</span>
        <span className="set-scope">{scope}</span>
      </div>
      <p className="set-row-help">{help}</p>
      {children}
    </div>
  );
}

function TeamTab({
  members, pending, start,
}: {
  members: readonly Member[];
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
}) {
  const [email, setEmail] = useState('');
  const [who, setWho] = useState('');
  const [role, setRole] = useState<Role>('manager');

  return (
    <>
      <table className="set-table">
        <thead><tr><th>Who</th><th>Role</th><th>Last in</th><th /></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>
                <b>{m.name}</b>
                <span className="set-email">{m.accepted ? m.email : `${m.email} · invited, not signed in yet`}</span>
              </td>
              <td>
                {m.role === 'owner' ? (
                  <span className="set-pill is-static">Owner</span>
                ) : (
                  <button type="button" className="set-pill"
                    onClick={() => start(async () => { await changeRole(m.id, m.role === 'manager' ? 'owner' : 'manager', !m.accepted); })}>
                    Manager
                  </button>
                )}
              </td>
              <td className="figure">{m.lastIn ?? '—'}</td>
              <td>
                {m.role === 'owner' ? (
                  <span className="set-note">that&rsquo;s you</span>
                ) : (
                  <button type="button" className="set-pill"
                    onClick={() => start(async () => { await drop(m.id, !m.accepted); })}>
                    {m.accepted ? 'Remove' : 'Resend'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="set-h3">Invite someone</h3>
      <div className="set-invite">
        <input className="set-input" placeholder="Their name" value={who} onChange={(e) => setWho(e.target.value)} />
        <input className="set-input" placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="button" className="set-pill" onClick={() => setRole(role === 'manager' ? 'owner' : 'manager')}>
          {role === 'manager' ? 'Manager' : 'Owner'}
        </button>
        <button type="button" className="btn btn-primary" disabled={pending || email.trim() === ''}
          onClick={() => start(async () => { await invite(who, email, role); setEmail(''); setWho(''); })}>
          Create the invitation
        </button>
      </div>

      {/*
        Temporary, and honest while it lasts. A27 says "Send the invitation",
        which is right once mail delivers and a lie until then. The row is
        real: the signup trigger joins whoever creates an account at this
        address, so the invitation works — it just has to be passed on by hand.
      */}
      <p className="set-note">
        Costbook does not send email yet, so tell them yourself. Anyone who signs up with{' '}
        <b>exactly this address</b> joins your café; a different one starts an empty account of
        their own, so it is worth checking the spelling with them first.
      </p>

      <p className="set-note">
        <b>Two roles, on purpose.</b> Owner can change costing, charges, billing and people.
        Manager can cost dishes, edit rates and print cards, but cannot reprice the menu or see the
        bill. A kitchen does not need a permissions matrix.
      </p>
    </>
  );
}

function BillingTab({
  plan, recipeCount, ingredientCount, pending, start,
}: {
  plan: Plan;
  recipeCount: number;
  ingredientCount: number;
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
}) {
  const atLimit = plan === 'free' && recipeCount >= FREE_LIMITS.recipes;

  return (
    <>
      {atLimit && (
        <div className="set-limit">
          <h3>You are at the free limit — {FREE_LIMITS.recipes} recipes.</h3>
          <p>
            Everything you have stays costed, printable and exportable. What stops is adding the
            forty-first recipe, repeat imports, and rate history beyond the last change. Nothing is
            deleted and nothing is locked away.
          </p>
          <button type="button" className="btn btn-primary" disabled={pending}
            onClick={() => start(async () => { await choosePlan('paid'); })}>
            See what keeping it current costs
          </button>
        </div>
      )}

      <SettingRow label="Your plan" help={plan === 'free'
        ? 'Cost your menu, keep it, print it. No card on file.'
        : 'Repeat imports, full rate history, a second person on the book.'}
        scope={plan === 'free' ? 'FREE' : 'PAID'}>
        <button type="button" className="set-pill" disabled={pending}
          onClick={() => start(async () => { await choosePlan(plan === 'free' ? 'paid' : 'free'); })}>
          {plan === 'free' ? 'Compare with paid' : 'Back to free'}
        </button>
      </SettingRow>

      <table className="set-table">
        <tbody>
          <tr>
            <td>Recipes</td>
            <td className="figure">{recipeCount} of {plan === 'free' ? FREE_LIMITS.recipes : '∞'}</td>
            <td className="set-note">{atLimit ? 'full — the next one needs the paid tier' : ''}</td>
          </tr>
          <tr>
            <td>Ingredients</td>
            <td className="figure">{ingredientCount} of {plan === 'free' ? FREE_LIMITS.ingredients : '∞'}</td>
            <td />
          </tr>
          <tr>
            <td>Imports this month</td>
            <td className="figure">1 of {plan === 'free' ? FREE_LIMITS.importsPerMonth : '∞'}</td>
            <td className="set-note">repeat imports are what the paid tier is for</td>
          </tr>
        </tbody>
      </table>

      <SettingRow label="Invoices" scope="" help="">
        <p className="set-note">
          Nothing yet — the free tier does not bill. Once you subscribe, every invoice lands here as
          a PDF with your business name on it.
        </p>
      </SettingRow>

      <SettingRow label="Payment method" scope="" help="">
        <p className="set-fixed">No card on file</p>
        <p className="set-note">
          You&rsquo;ll be asked for one only when you choose the paid tier. Costbook never charges a
          card you added to try something.
        </p>
      </SettingRow>
    </>
  );
}

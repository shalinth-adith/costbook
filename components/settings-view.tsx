"use client";

import Link from "next/link";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { type Charge, applyCharges, effectiveRate } from "@/core/charges";
import { currency, formatMoney } from "@/core/currency";
import {
  PRESETS,
  type PresetName,
  applyRounding,
  describeRule,
} from "@/core/rounding";

import {
  previewCosting,
  saveCharges,
  saveCosting,
  saveOrganisation,
} from "@/app/settings/actions";
import {
  ROUNDING_CHOICES,
  suggestPrice,
  factorOfShare,
  shareOfFactor,
  type CostingModel,
  type PricingMethod,
} from "@/lib/costing";
import {
  FREE_LIMITS,
  PAID_MONTHLY,
  type Member,
  type Org,
  type Plan,
  type Role,
  taxLabel,
} from "@/lib/org";
import { type Subscription, termOf } from "@/lib/plan";
import type { Impact } from "@/lib/impact";
import { hintFor, suggestedPlatforms } from "@/lib/world";

import { ImpactTable } from "./impact-table";

const TABS = ["Organisation", "Costing", "Charges", "Team", "Billing"] as const;
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

/**
 * A figure that ticks when it changes. The live panel follows every keystroke,
 * and a value that moves without a trace is one the eye misses; a short
 * settle says "this one moved".
 */
function LiveFigure({ children }: { children: string }) {
  const [tick, setTick] = useState(false);
  const prev = useRef(children);
  useEffect(() => {
    if (prev.current === children) return undefined;
    prev.current = children;
    setTick(true);
    const t = setTimeout(() => setTick(false), 480);
    return () => clearTimeout(t);
  }, [children]);
  return <span className={`live-fig${tick ? " is-tick" : ""}`}>{children}</span>;
}

/** One line of the worked example. The figure column stays a figure. */
function WorkedRow({
  said,
  figure,
  strong,
}: {
  said: string;
  figure: string;
  strong?: boolean;
}) {
  return (
    <div className={`set-worked-row${strong === true ? " is-strong" : ""}`}>
      <dt>{said}</dt>
      <dd className="figure"><LiveFigure>{figure}</LiveFigure></dd>
    </div>
  );
}

export interface SettingsData {
  readonly org: Org;
  readonly model: CostingModel;
  readonly members: readonly Member[];
  readonly plan: Plan;
  readonly subscription: Subscription;
  /** The caller's own role, from `book()`. The header used to print "owner". */
  readonly role: Role | null;
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
  const [tab, setTab] = useState<Tab>("Organisation");
  const [pending, start] = useTransition();

  const cur = currency(currencyCode);
  const money = (n: number) => formatMoney(n, currencyCode);

  // The Costing tab is a sentence with fields in it. These are the draft
  // values; nothing is applied until the blast radius has been accepted.
  const [target, setTarget] = useState(data.model.foodCostTarget);
  const [wastage, setWastage] = useState(data.model.wastagePercent);
  const [packaging, setPackaging] = useState(data.model.packagingPerPortion);
  const [rounding, setRounding] = useState<PresetName>(data.model.rounding);
  // The last step of the ladder and the lines a small kitchen leaves out.
  const [method, setMethod] = useState<PricingMethod>(data.model.method);
  const [moneyPerPlate, setMoneyPerPlate] = useState(data.model.moneyPerPlate);
  const [factor, setFactor] = useState(data.model.factor);
  const [accompaniments, setAccompaniments] = useState(data.model.accompanimentsPerPortion);
  const [labourRate, setLabourRate] = useState(data.model.labourRatePerHour);
  const [overhead, setOverhead] = useState(data.model.overheadPerPortion);
  const [includeCharges, setIncludeCharges] = useState(data.model.pricesIncludeCharges);
  const [alertMove, setAlertMove] = useState(data.org.alertMovePercent);
  const draft: CostingModel = {
    ...data.model,
    foodCostTarget: target,
    wastagePercent: wastage,
    packagingPerPortion: packaging,
    rounding,
    method,
    moneyPerPlate,
    factor,
    accompanimentsPerPortion: accompaniments,
    labourRatePerHour: labourRate,
    overheadPerPortion: overhead,
    pricesIncludeCharges: includeCharges,
  };
  const guestAddsPercent = data.org.charges.length > 0 ? effectiveRate(data.org.charges, "dine_in") : 0;
  const worldHint = hintFor(currencyCode);
  /**
   * The worked example, computed the way the sentence above reads it — in that
   * order, so a reader can follow the arithmetic line by line rather than
   * being handed a total.
   */
  const sampleIngredients = data.sample?.ingredientCost ?? 0;
  const sampleWaste = sampleIngredients * (wastage / 100);
  const samplePlate = sampleIngredients + sampleWaste + packaging + accompaniments + overhead;
  // Through the same function the cost sheet uses, so the example on this
  // screen and the price on the dish can never disagree about the arithmetic.
  const sampleSuggestion = suggestPrice(samplePlate, draft);

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
    rounding !== data.model.rounding ||
    method !== data.model.method ||
    moneyPerPlate !== data.model.moneyPerPlate ||
    factor !== data.model.factor ||
    accompaniments !== data.model.accompanimentsPerPortion ||
    labourRate !== data.model.labourRatePerHour ||
    overhead !== data.model.overheadPerPortion ||
    includeCharges !== data.model.pricesIncludeCharges ||
    alertMove !== data.org.alertMovePercent;
  const costingPatch = {
    alertMovePercent: alertMove,
    foodCostTarget: target,
    wastagePercent: wastage,
    packagingPerPortion: packaging,
    rounding,
    method,
    moneyPerPlate,
    factor,
    accompanimentsPerPortion: accompaniments,
    labourRatePerHour: labourRate,
    overheadPerPortion: overhead,
    pricesIncludeCharges: includeCharges,
  };
  const resetCosting = () => {
    setTarget(data.model.foodCostTarget);
    setWastage(data.model.wastagePercent);
    setPackaging(data.model.packagingPerPortion);
    setRounding(data.model.rounding);
    setMethod(data.model.method);
    setMoneyPerPlate(data.model.moneyPerPlate);
    setFactor(data.model.factor);
    setAccompaniments(data.model.accompanimentsPerPortion);
    setLabourRate(data.model.labourRatePerHour);
    setOverhead(data.model.overheadPerPortion);
    setIncludeCharges(data.model.pricesIncludeCharges);
    setAlertMove(data.org.alertMovePercent);
  };

  const bill = useMemo(() => {
    try {
      return applyCharges(
        EXAMPLE_PRICE,
        charges.filter((c) => c.name.trim() !== ""),
        "dine_in",
      );
    } catch {
      return null;
    }
  }, [charges]);

  const applyCosting = () => {
    start(async () => {
      await saveCosting(costingPatch);
      setShowRadius(false);
      setBlastRadius(null);
    });
  };

  const liveCosting = (
    <>
            {data.sample === null ? null : (
              <section className="set-worked">
                <h3 className="set-h3">
                  On one of your dishes, right now
                  <span className="set-worked-dish">{data.sample.name}</span>
                </h3>
                <dl className="set-worked-rows">
                  <WorkedRow
                    said="Ingredients, as costed today"
                    figure={money(sampleIngredients)}
                  />
                  {wastage > 0 ? (
                    <WorkedRow said={`Wastage at ${wastage}%`} figure={`+ ${money(sampleWaste)}`} />
                  ) : null}
                  {packaging > 0 ? (
                    <WorkedRow said="Packaging" figure={`+ ${money(packaging)}`} />
                  ) : null}
                  {accompaniments > 0 ? (
                    <WorkedRow said="On every plate" figure={`+ ${money(accompaniments)}`} />
                  ) : null}
                  {overhead > 0 ? (
                    <WorkedRow said="Rent, gas and power" figure={`+ ${money(overhead)}`} />
                  ) : null}
                  <WorkedRow
                    said="Plate cost"
                    figure={money(samplePlate)}
                    strong
                  />
                  <WorkedRow
                    said={`Cost ${sampleSuggestion.methodLabel}`}
                    figure={money(sampleSuggestion.net)}
                  />
                  {includeCharges && data.org.charges.length > 0 ? (
                    <WorkedRow said="Plus what the bill adds" figure={money(sampleSuggestion.exact)} />
                  ) : null}
                  <WorkedRow
                    said="Suggested price"
                    figure={money(sampleSuggestion.rounded)}
                    strong
                  />
                </dl>
                <p className="set-note">
                  This is your dish and your rates, not an illustration. Change
                  a figure above and this follows on the same keystroke.
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
                    <span className="figure set-rounding-from">
                      {money(raw)}
                    </span>
                    <span
                      className="figure set-rounding-arrow"
                      aria-hidden="true"
                    >
                      &rarr;
                    </span>
                    <span className="figure set-rounding-to">
                      <LiveFigure>{money(applyRounding(raw, PRESETS[rounding]))}</LiveFigure>
                    </span>
                  </div>
                ))}
              </div>
            </section>

    </>
  );
  const liveCharges = (
    <>
            {bill !== null && (
              <div className="wiz-bill">
                <h3>One {money(EXAMPLE_PRICE)} dish, itemised</h3>
                <div className="wiz-bill-row">
                  <span>Menu price</span>
                  <span className="figure">{money(EXAMPLE_PRICE)}</span>
                </div>
                {bill.lines.map((l, i) => (
                  <div className="wiz-bill-row" key={i} data-borne={l.borneBy}>
                    <span>
                      {l.name}{" "}
                      <em>
                        {l.borneBy === "guest"
                          ? "the guest pays"
                          : "you bear this"}
                      </em>
                    </span>
                    <span className="figure">
                      {l.borneBy === "operator" ? "−" : ""}
                      {money(l.amount)}
                    </span>
                  </div>
                ))}
                <div className="wiz-bill-row is-total">
                  <span>The guest pays</span>
                  <span className="figure"><LiveFigure>{money(bill.guestTotal)}</LiveFigure></span>
                </div>
                <div className="wiz-bill-row is-total">
                  <span>You keep</span>
                  <span className="figure"><LiveFigure>{money(bill.operatorKeeps)}</LiveFigure></span>
                </div>
              </div>
            )}
    </>
  );

  const guestCharges = charges.filter((c) => c.name.trim() !== "" && c.borneBy === "guest").length;
  const operatorCharges = charges.filter((c) => c.name.trim() !== "" && c.borneBy === "operator").length;
  const summaryOf: Readonly<Record<Tab, string>> = {
    Organisation: `${name.trim() === "" ? data.org.name : name} · ${cur.symbol} · ${taxLabel(data.org.taxTreatment).toLowerCase()}`,
    Costing: `${
      method === "money_per_plate"
        ? `${cur.symbol} ${moneyPerPlate} left a plate`
        : `Ingredients ${target}% of the price · × ${factor}`
    } · ${describeRule(PRESETS[rounding])}`,
    Charges:
      guestCharges + operatorCharges === 0
        ? "Nothing on the bill"
        : `${guestCharges} on the bill · ${operatorCharges} you bear`,
    Team: data.members.length === 1 ? "One person, the owner" : `${data.members.length} people`,
    Billing: `${data.plan === "free" ? "Free" : "Paid"} · ${data.recipeCount} of ${data.plan === "free" ? FREE_LIMITS.recipes : "unlimited"} dishes`,
  };

  return (
    <div className="set">
      <div className="set-head">
        <div>
          <h1 className="set-h">Settings</h1>
          {dirty && <span className="set-pill-unsaved">Unsaved changes</span>}
          <p className="set-lede">
            Everything here is also editable where it acts — on the dish, in the
            cost breakdown, beside the figure it produces. This screen is for
            reviewing it all at once, or setting up before you have any data.
          </p>
        </div>
        <span className="set-who">
          {data.org.name} · {data.role ?? "not on this book"}
        </span>
      </div>

      {/* Tabs at 1440; the same list stacks at 768. */}
      <div className="set-cols">
      {/*
        The sections down the left, each with what it currently says — so the
        page reads as one account at a glance, not five tabs to open. The
        summaries follow the fields live: change the method and the word
        under "Costing" changes with it.
      */}
      <nav className="set-nav" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`set-nav-item${tab === t ? " is-on" : ""}`}
            onClick={() => setTab(t)}
          >
            <span className="set-nav-name">{t}</span>
            <span className="set-nav-sum">{summaryOf[t]}</span>
          </button>
        ))}
      </nav>

      <div className="set-body" role="tabpanel" key={tab}>
        {tab === "Organisation" && (
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
                onBlur={() =>
                  start(async () => {
                    await saveOrganisation({ name });
                  })
                }
              />
            </SettingRow>

            <SettingRow
              label="Currency"
              help="Set once. Costbook does not convert — changing it would leave every rate on file meaning something else."
              scope="NO OVERRIDES, EVER"
            >
              <p className="set-fixed figure">
                {cur.code} · {cur.name} · {cur.symbol}
              </p>
              <p className="set-note">
                To move currency you start a new organisation and import into
                it. Write to us and we&rsquo;ll do the move with you.
              </p>
            </SettingRow>

            <SettingRow
              label="How supplier tax reaches you"
              help="Whether tax your supplier bills comes back to you. It decides which figure you type as a rate."
              scope="NO OVERRIDES, EVER"
            >
              <p className="set-fixed">{taxLabel(data.org.taxTreatment)}</p>
              <div className="set-seg">
                {(["recoverable", "absorbed"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="set-seg-item"
                    data-on={data.org.taxTreatment === t}
                    onClick={() =>
                      start(async () => {
                        await saveOrganisation({ taxTreatment: t });
                      })
                    }
                  >
                    {t === "recoverable" ? "I claim it back" : "I absorb it"}
                  </button>
                ))}
              </div>
              <p className="set-note">
                Changing this recosts every dish — we do it ourselves and you
                retype nothing.
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
                    {(
                      [
                        ["g", "g — grams"],
                        ["kg", "kg — kilos"],
                      ] as const
                    ).map(([u, said]) => (
                      <button
                        key={u}
                        type="button"
                        className="set-seg-item"
                        data-on={data.org.defaultMassUnit === u}
                        onClick={() =>
                          start(async () => {
                            await saveOrganisation({ defaultMassUnit: u });
                          })
                        }
                      >
                        {said}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="set-unit-group">
                  <span className="set-unit-family">Volume</span>
                  <div className="set-seg">
                    {(
                      [
                        ["ml", "ml — millilitres"],
                        ["l", "L — litres"],
                      ] as const
                    ).map(([u, said]) => (
                      <button
                        key={u}
                        type="button"
                        className="set-seg-item"
                        data-on={data.org.defaultVolumeUnit === u}
                        onClick={() =>
                          start(async () => {
                            await saveOrganisation({ defaultVolumeUnit: u });
                          })
                        }
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
                  onBlur={() =>
                    start(async () => {
                      await saveOrganisation({ staleAfterDays: stale });
                    })
                  }
                />
                <span>
                  days · <b className="figure">{data.staleCount}</b> ingredients
                  are past it today
                </span>
              </span>
            </SettingRow>
          </>
        )}

        {tab === "Costing" && (
          <>
            <h2 className="set-h2">
              How you price
              <span className="set-h2-note">one rule, applied to every dish</span>
            </h2>

            {/*
              The rule is a sentence, as it is on a kitchen's own sheet:
              "Expected SP = cost / 0.2". Both ways of saying it are here and
              tied — five times the cost is ingredients at 20% of the price —
              and the third figure says what that leaves. Nothing else is
              needed to price a dish; everything else on this tab is optional
              and folded away.
            */}
            {method === "money_per_plate" ? (
              <p className="set-rule">
                Sell every dish at what it costs to make plus {cur.symbol}{" "}
                <input
                  className="set-inline-field figure"
                  inputMode="decimal"
                  value={moneyPerPlate}
                  aria-label="Money left per plate"
                  onChange={(e) => setMoneyPerPlate(Number(e.target.value) || 0)}
                />
                . Then{" "}
                <select
                  className="set-inline-select"
                  value={rounding}
                  aria-label="Rounding rule"
                  onChange={(e) => setRounding(e.target.value as PresetName)}
                >
                  {ROUNDING_CHOICES.map((r) => (
                    <option key={r} value={r}>
                      {describeRule(PRESETS[r])}
                    </option>
                  ))}
                </select>
                .
              </p>
            ) : (
              <p className="set-rule">
                Sell every dish at{" "}
                <input
                  className="set-inline-field figure"
                  inputMode="decimal"
                  value={factor}
                  aria-label="Times the cost"
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    setFactor(v);
                    setTarget(shareOfFactor(v));
                  }}
                />{" "}
                times what it costs to make — that is, ingredients are{" "}
                <input
                  className="set-inline-field figure"
                  inputMode="decimal"
                  value={target}
                  aria-label="Food cost target"
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    setTarget(v);
                    setFactor(factorOfShare(v));
                  }}
                />
                % of the price, and <b className="figure">{cur.symbol} {Math.round(100 - target)}</b> of every{" "}
                <span className="figure">{cur.symbol} 100</span> is left for everything else. Then{" "}
                <select
                  className="set-inline-select"
                  value={rounding}
                  aria-label="Rounding rule"
                  onChange={(e) => setRounding(e.target.value as PresetName)}
                >
                  {ROUNDING_CHOICES.map((r) => (
                    <option key={r} value={r}>
                      {describeRule(PRESETS[r])}
                    </option>
                  ))}
                </select>
                .
              </p>
            )}
            <p className="set-note set-typical">
              {worldHint.note} <b>Typical, not yours.</b>
            </p>

            <details className="set-more">
              <summary>
                <span className="set-more-texts">
                  <span className="set-more-h">More ways to count the cost of a plate</span>
                  <span className="set-more-sub">optional — most kitchens leave all of these off</span>
                </span>
              </summary>
              <p className="set-note">
                Each line is added to every plate once it has a figure. Zero means not counted.
                The price above needs none of them.
              </p>
              <div className="set-lines">
                <label className="set-line set-line-check">
                  <span className="set-line-name">A fixed amount instead</span>
                  <span className="set-line-field">
                    <input
                      type="checkbox"
                      checked={method === "money_per_plate"}
                      onChange={(e) => setMethod(e.target.checked ? "money_per_plate" : "food_share")}
                    />{" "}
                    Price every dish at its cost plus a set amount, rather than times its cost.
                    <span className="set-line-note"> For a menu where a coffee and a biryani should leave the same money.</span>
                  </span>
                </label>
                <label className="set-line">
                  <span className="set-line-name">Wastage</span>
                  <span className="set-line-field">
                    <input
                      className="set-inline-field figure"
                      inputMode="decimal"
                      value={wastage}
                      aria-label="Wastage percent"
                      onChange={(e) => setWastage(Number(e.target.value) || 0)}
                    />
                    % of the ingredient cost
                    <span className="set-line-note"> — for what gets trimmed, burnt or thrown away.</span>
                  </span>
                </label>
                <label className="set-line">
                  <span className="set-line-name">Packaging</span>
                  <span className="set-line-field">
                    {cur.symbol}{" "}
                    <input
                      className="set-inline-field figure"
                      inputMode="decimal"
                      value={packaging}
                      aria-label="Packaging per portion"
                      onChange={(e) => setPackaging(Number(e.target.value) || 0)}
                    />{" "}
                    a plate
                    <span className="set-line-note"> — the box, bag or cup a delivery order goes out in.</span>
                  </span>
                </label>
                <label className="set-line">
                  <span className="set-line-name">Sides on every plate</span>
                  <span className="set-line-field">
                    {cur.symbol}{" "}
                    <input
                      className="set-inline-field figure"
                      inputMode="decimal"
                      value={accompaniments}
                      aria-label="Accompaniments per plate"
                      onChange={(e) => setAccompaniments(Number(e.target.value) || 0)}
                    />{" "}
                    a plate
                    <span className="set-line-note"> — sambar, chutney, pickle, bread that go out with every dish but are not on its recipe.</span>
                  </span>
                </label>
                <label className="set-line">
                  <span className="set-line-name">The cook&rsquo;s time</span>
                  <span className="set-line-field">
                    {cur.symbol}{" "}
                    <input
                      className="set-inline-field figure"
                      inputMode="decimal"
                      value={labourRate}
                      aria-label="Kitchen rate per hour"
                      onChange={(e) => setLabourRate(Number(e.target.value) || 0)}
                    />{" "}
                    an hour
                    <span className="set-line-note"> — if you want the price to cover the time a batch takes. Minutes are set on each dish.</span>
                  </span>
                </label>
                <label className="set-line">
                  <span className="set-line-name">Rent and bills</span>
                  <span className="set-line-field">
                    {cur.symbol}{" "}
                    <input
                      className="set-inline-field figure"
                      inputMode="decimal"
                      value={overhead}
                      aria-label="Overhead per plate"
                      onChange={(e) => setOverhead(Number(e.target.value) || 0)}
                    />{" "}
                    a plate
                    <span className="set-line-note"> — last month&rsquo;s rent, gas and power divided by the plates you served, if you want the price to cover them.</span>
                  </span>
                </label>
                <label className="set-line set-line-check">
                  <span className="set-line-name">The menu price</span>
                  <span className="set-line-field">
                    <input
                      type="checkbox"
                      checked={includeCharges}
                      onChange={(e) => setIncludeCharges(e.target.checked)}
                      disabled={data.org.charges.length === 0}
                    />{" "}
                    already includes what the bill adds on top
                    {data.org.charges.length === 0 ? (
                      <span className="set-line-note"> — nothing is on the bill yet; see Charges</span>
                    ) : includeCharges ? (
                      <span className="set-line-note">
                        {" "}— the bill adds {guestAddsPercent.toFixed(1)}%, so a {target}% target is{" "}
                        {(target * (1 + guestAddsPercent / 100)).toFixed(1)}% of what you keep
                      </span>
                    ) : (
                      <span className="set-line-note"> — prices are quoted before the bill&rsquo;s charges</span>
                    )}
                  </span>
                </label>
                <label className="set-line">
                  <span className="set-line-name">Tell me</span>
                  <span className="set-line-field">
                    when a rate moves more than{" "}
                    <input
                      className="set-inline-field figure"
                      inputMode="decimal"
                      value={alertMove}
                      aria-label="Rate move alert percent"
                      onChange={(e) => setAlertMove(Number(e.target.value) || 0)}
                    />
                    % in a month
                    <span className="set-line-note"> — it goes on the dashboard&rsquo;s list for today.</span>
                  </span>
                </label>
              </div>
            </details>

            <div className="set-overrides">
              <div>
                <span className="set-scope">A DISH CAN OVERRIDE</span>
                <p>target · rounding · wastage · packaging · what goes on every plate · overhead · kitchen minutes</p>
              </div>
              <div>
                <span className="set-scope">NO OVERRIDES, EVER</span>
                <p>currency · how supplier tax is treated</p>
              </div>
            </div>
            <p className="set-note">
              Wastage is per dish on the cost sheet too — a biryani wastes
              differently from a filter coffee.
            </p>

            <div className="set-apply">
              {!dirty ? (
                <p className="set-note">
                  Nothing here has been changed, so nothing has been repriced.
                </p>
              ) : !showRadius ? (
                <>
                  <p className="set-note">
                    <b>Not saved yet.</b> Changing these reprices dishes — see
                    what moves first.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={() => {
                      start(async () => {
                        const out = await previewCosting(costingPatch);
                        setBlastRadius(out);
                        setShowRadius(true);
                      });
                    }}
                  >
                    {pending ? "Costing the menu…" : "Show me what moves"}
                  </button>
                </>
              ) : (
                <div className="set-radius">
                  <h3>Not saved yet</h3>
                  <p>
                    Changing how you price reprices{" "}
                    <b className="figure">{blastRadius?.moved.length ?? 0}</b>{" "}
                    dishes.{" "}
                    <b className="figure">{blastRadius?.crossCount ?? 0}</b>{" "}
                    would cross your target.
                  </p>
                  <p className="set-note">
                    The same panel you get when an ingredient&rsquo;s rate
                    moves, because this is the same event seen from the other
                    end. Nothing is applied until you say so.
                  </p>
                  {blastRadius !== null && (
                    <ImpactTable
                      impact={blastRadius}
                      currencyCode={currencyCode}
                      limit={5}
                    />
                  )}
                  <div className="set-radius-foot">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        resetCosting();
                        setShowRadius(false);
                      }}
                    >
                      Leave it as it was
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={pending}
                      onClick={applyCosting}
                    >
                      {pending
                        ? "Repricing…"
                        : `Reprice ${blastRadius?.moved.length ?? 0} dishes`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "Charges" && (
          <>
            <h2 className="set-h2">The stack, in the order it is applied</h2>
            <p className="set-lede">
              Order matters: a charge that compounds takes its percentage off
              everything above it. Move a row and the example beside this
              updates.
            </p>

            <div className="set-charges">
              {charges.length === 0 && (
                <p className="set-note">
                  Nothing on the bill on top of your menu price. That is the
                  common answer for a single outlet, and it is a complete one.
                </p>
              )}
              {!charges.some((c) => c.borneBy === "operator") && (
                <div className="set-platforms">
                  <span className="label">Selling on a delivery app?</span>
                  <p className="set-note">
                    Apps usually take {worldHint.appCommission[0]} to {worldHint.appCommission[1]}% of the
                    order. Add yours as a row, name it, and put its own figure on it.{" "}
                    <b>Typical, not yours.</b>
                  </p>
                  <div className="set-platform-btns">
                    {suggestedPlatforms(worldHint, charges.length + 1).map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        className="btn"
                        onClick={() => setCharges((cs) => [...cs, { ...c, order: cs.length + 1 }])}
                      >
                        Add a delivery app
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {charges.map((c, i) => (
                <div className="set-charge" key={i}>
                  <span className="set-charge-n figure">{i + 1}</span>
                  <input
                    className="set-input"
                    value={c.name}
                    placeholder="Service charge"
                    onChange={(e) =>
                      setCharges((cs) =>
                        cs.map((x, n) =>
                          n === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <span className="set-inline">
                    <input
                      className="set-input figure is-narrow"
                      inputMode="decimal"
                      value={c.value}
                      onChange={(e) =>
                        setCharges((cs) =>
                          cs.map((x, n) =>
                            n === i
                              ? { ...x, value: Number(e.target.value) || 0 }
                              : x,
                          ),
                        )
                      }
                    />
                    <span>{c.mode === "percent" ? "%" : cur.symbol}</span>
                  </span>
                  <button
                    type="button"
                    className="set-pill"
                    onClick={() =>
                      setCharges((cs) =>
                        cs.map((x, n) =>
                          n === i
                            ? {
                                ...x,
                                borneBy:
                                  x.borneBy === "guest" ? "operator" : "guest",
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    {c.borneBy === "guest" ? "the guest pays" : "you bear this"}
                  </button>
                  <button
                    type="button"
                    className="set-pill"
                    onClick={() =>
                      setCharges((cs) =>
                        cs.map((x, n) =>
                          n === i
                            ? {
                                ...x,
                                compounds: !x.compounds,
                                base: x.compounds
                                  ? "net_subtotal"
                                  : "running_total",
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    {c.compounds ? "compounds" : "on the price"}
                  </button>
                  <button
                    type="button"
                    className="set-pill"
                    aria-label={`Remove ${c.name || "charge"}`}
                    onClick={() =>
                      setCharges((cs) => cs.filter((_, n) => n !== i))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="wiz-add"
                onClick={() =>
                  setCharges((cs) => [
                    ...cs,
                    {
                      name: "",
                      mode: "percent",
                      value: 5,
                      base: "running_total",
                      order: cs.length + 1,
                      compounds: true,
                      borneBy: "guest",
                      channels: ["dine_in", "takeaway", "delivery"],
                    },
                  ])
                }
              >
                Add a charge
              </button>
            </div>

            <p className="set-note">
              Charges the guest pays are added; charges you bear are taken off
              what reaches you.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await saveCharges(charges);
                })
              }
            >
              {pending ? "Saving…" : "Save the stack"}
            </button>
          </>
        )}

        {tab === "Team" && (
          <TeamTab members={data.members} />
        )}

        {tab === "Billing" && (
          <BillingTab
            plan={data.plan}
            subscription={data.subscription}
            recipeCount={data.recipeCount}
            ingredientCount={data.ingredientCount}
            pending={pending}
            start={start}
          />
        )}
      </div>

      {/*
        What the section on the left does, live. A worked example on one of
        the owner's own dishes for costing; the itemised bill for charges; the
        account in one card for the rest. Sticky, so it stays beside the field
        being typed in.
      */}
      <aside className="set-live" key={`live-${tab}`}>
        {tab === "Costing" && liveCosting}
        {tab === "Charges" && (
          <>
            {liveCharges}
            <p className="set-live-sub">Follows the stack as you type it.</p>
            {bill === null || bill.lines.length === 0 ? (
              <p className="set-note">
                Nothing on the bill: a {money(EXAMPLE_PRICE)} dish is {money(EXAMPLE_PRICE)} to the
                guest and {money(EXAMPLE_PRICE)} to you.
              </p>
            ) : null}
          </>
        )}
        {tab === "Organisation" && (
          <div className="set-card">
            <span className="label">Your account, in one card</span>
            <dl className="set-card-rows">
              <div><dt>Name</dt><dd>{name.trim() === "" ? data.org.name : name}</dd></div>
              <div><dt>Currency</dt><dd className="figure">{cur.symbol} · {cur.name}</dd></div>
              <div><dt>Supplier tax</dt><dd>{taxLabel(data.org.taxTreatment)}</dd></div>
              <div><dt>Units</dt><dd className="figure">{data.org.defaultMassUnit} · {data.org.defaultVolumeUnit}</dd></div>
              <div><dt>A rate is stale after</dt><dd className="figure">{stale} days</dd></div>
              <div><dt>On the book</dt><dd className="figure">{data.recipeCount} dishes · {data.ingredientCount} ingredients</dd></div>
            </dl>
            <p className="set-note">
              Currency and the tax answer never change here: every rate on file was typed in them.
            </p>
          </div>
        )}
        {tab === "Team" && (
          <div className="set-card">
            <span className="label">Who is in</span>
            <p className="set-card-big">{data.members.length === 1 ? "One person" : `${data.members.length} people`}</p>
            <p className="set-note">
              Costbook is one owner per account for now, and the owner can do everything. A second
              person is a screen away, not a migration.
            </p>
          </div>
        )}
        {tab === "Billing" && (
          <div className="set-card">
            <span className="label">Your plan</span>
            <p className="set-card-big">{data.plan === "free" ? "Free" : "Paid"}</p>
            <dl className="set-card-rows">
              <div><dt>Dishes</dt><dd className="figure">{data.recipeCount} of {data.plan === "free" ? FREE_LIMITS.recipes : "unlimited"}</dd></div>
              <div><dt>Ingredients</dt><dd className="figure">{data.ingredientCount}</dd></div>
            </dl>
          </div>
        )}
      </aside>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  help,
  scope,
  children,
}: {
  label: string;
  help: string;
  scope: string;
  children: React.ReactNode;
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

function TeamTab({ members }: { members: readonly Member[] }) {
  /*
   * One person on the book, and no way to ask for another yet.
   *
   * This tab used to carry an invitation form, a role toggle and a Remove
   * button. None of the three could complete: /join never read the token in
   * its link and always rendered the lapsed state, so anybody invited followed
   * a link that told them their invitation had expired. Costbook also sends no
   * mail, so the "invitation" was a row and a sentence asking the owner to
   * pass the address on themselves.
   *
   * Rather than keep a form whose whole outcome was an unreachable screen, the
   * account is one person for now — the owner, who may do everything. PRD 6
   * lists manager logins as a v1 must-ship and FLOWS 9 describes the flow;
   * both are deferred, not cancelled. The `member_role` enum and the
   * owner-gated policies stay in Postgres, so a second person is a feature
   * later and not a migration.
   */
  return (
    <>
      <table className="set-table">
        <thead>
          <tr>
            <th>Who</th>
            <th>Role</th>
            <th>Last in</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>
                <b>{m.name}</b>
                <span className="set-email">{m.email}</span>
              </td>
              <td>
                <span className="set-pill is-static">
                  {m.role === "owner" ? "Owner" : "Manager"}
                </span>
              </td>
              <td className="figure">{m.lastIn ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="set-h3">Just you, for now</h3>
      <p className="set-note">
        Costbook is one person per account at the moment. What a second
        person waits on is email, not payment — an invitation is a link sent to
        an address, and Costbook cannot send one yet. Asking you for the
        address before then would only put a name in a table.
      </p>
      <p className="set-note">
        Nothing about your café is waiting on it. Everything on every other tab
        is yours to change, and the prep card prints for whoever is cooking
        without them needing an account at all.
      </p>
    </>
  );
}

function BillingTab({
  plan,
  subscription,
  recipeCount,
  ingredientCount,
  pending,
  start,
}: {
  plan: Plan;
  subscription: Subscription;
  recipeCount: number;
  ingredientCount: number;
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
}) {
  const atLimit = plan === "free" && recipeCount >= FREE_LIMITS.recipes;
  /** Whether the paid tier is being shown. Showing it changes no plan. */
  const [comparing, setComparing] = useState(false);

  return (
    <>
      {atLimit && (
        <div className="set-limit">
          <h3>Your {FREE_LIMITS.recipes} free dishes are costed.</h3>
          <p>
            {/*
             * "one more recipe" rather than an ordinal built from the
             * constant: FREE_LIMITS.recipes + 1 reads "11th" today and "21th"
             * the day somebody changes the number, and a sentence that breaks
             * when a config value moves is a sentence nobody will remember to
             * check.
             */}
            Everything you have stays costed, printable and exportable. What
            stops is adding one more recipe, repeat imports, and rate history
            beyond the last change. Nothing is deleted and nothing is locked
            away.
          </p>
          {/*
            * This button read "See what keeping it current costs" and called
            * choosePlan("paid") — it did not show a price, it changed the
            * plan. So did "Compare with paid" below. Both moved an account to
            * the paid tier, for nothing, on a press whose label promised only
            * to explain something.
            *
            * There is no payment path to send anybody down yet (Razorpay is
            * TRD build step 25), so what is offered is the price and a person
            * to arrange it with, which is true today.
            */}
          <Link href="/plans" className="btn btn-primary">See the plans</Link>
        </div>
      )}

      <SettingRow
        label="Your plan"
        help={
          plan === "free"
            ? "Cost your menu, keep it, print it. No card on file."
            : `${termOf(subscription.term)?.label ?? "Paid"}, until ${subscription.periodEnd === null ? "further notice" : new Date(subscription.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Nothing renews by itself.`
        }
        scope={plan === "free" ? "FREE" : "PAID"}
      >
        <button
          type="button"
          className="set-pill"
          onClick={() => setComparing((v) => !v)}
        >
          {comparing ? "Hide" : "Compare with paid"}
        </button>
      </SettingRow>

      {comparing && (
        <div className="set-limit">
          <h3>
            Paid is{" "}
            <span className="figure">
              {PAID_MONTHLY.symbol}
              {PAID_MONTHLY.amount}
            </span>{" "}
            a month.
          </h3>
          <p>
            It lifts the {FREE_LIMITS.recipes}-recipe cap and opens the
            import, so the sheet you already keep becomes a costed menu in a
            minute rather than an evening of typing — and so a new price list
            can be dropped in whenever one arrives. It also keeps every rate
            change rather than the last three.
          </p>
          <p className="set-note">
            Bought for a month, three, six or a year, once, up front; billed in
            rupees whatever your menu is priced in. <Link className="link" href="/plans">See the plans.</Link>
          </p>
        </div>
      )}

      <table className="set-table">
        <tbody>
          <tr>
            <td>Recipes</td>
            <td className="figure">
              {recipeCount} of {plan === "free" ? FREE_LIMITS.recipes : "∞"}
            </td>
            <td className="set-note">
              {atLimit ? "full — the next one needs the paid tier" : ""}
            </td>
          </tr>
          <tr>
            <td>Ingredients</td>
            <td className="figure">
              {ingredientCount} of{" "}
              {plan === "free" ? FREE_LIMITS.ingredients : "∞"}
            </td>
            <td />
          </tr>
          <tr>
            <td>Imports this month</td>
            {/*
              * The "1" here was typed, not counted — nothing in the product
              * records an import, so this row reported a figure nobody
              * measured, in a table whose other two rows are real. A dash is
              * what we know.
              */}
            <td className="figure">
              {plan === "free" ? "—" : "— of ∞"}
            </td>
            <td className="set-note">
              {/*
                * "repeat imports are what the paid tier is for" used to sit
                * here, which read as though the first one were free. It is
                * not: importing at all is the paid tier.
                */}
              {plan === "free"
                ? "importing a sheet is on the paid tier"
                : "not counted yet"}
            </td>
          </tr>
        </tbody>
      </table>

      <SettingRow label="Invoices" scope="" help="">
        {/* No invoice is generated anywhere in the product. Promising a PDF
            "with your business name on it" described a feature that does not
            exist, on the one screen where a person is deciding to pay. */}
        <p className="set-note">
          Not yet. A stretch is bought once and up front, and the payment
          provider emails its own receipt. Ask us and we will send an invoice
          in your business name.
        </p>
      </SettingRow>

      <SettingRow label="Payment method" scope="" help="">
        {/* No card is ever kept: a stretch is one payment, taken by the
            provider, and nothing renews. Saying "you'll be asked for one"
            described a subscription this product deliberately does not run. */}
        <p className="set-fixed">None kept</p>
        <p className="set-note">
          A plan is paid once, for the months you choose, at the provider&rsquo;s
          own form. Costbook keeps no card and nothing renews by itself.
        </p>
      </SettingRow>
    </>
  );
}

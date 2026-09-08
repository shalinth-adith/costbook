import Link from "next/link";

import { PublicBar } from "./public-bar";

/**
 * What Costbook is, at the width of the window.
 *
 * It was a 74ch column of prose centred on a 1440 screen, which is right for
 * a legal page and wrong for the one page a stranger reads before deciding
 * whether to sign up. Everything here is drawn from `PRD.md` — the problem,
 * who it is for, the non-goals — and nothing claims a date, a place or a
 * person, because those are the operator's to state and an invented founding
 * story would be the same quiet wrongness this product exists to remove from
 * a costing sheet.
 *
 * MOTION. Every section is fully visible at rest; the reveal is added only
 * where the browser supports a scroll timeline and the reader has not asked
 * for less motion. Nothing is parked at zero opacity waiting for a script —
 * a page whose content depends on JavaScript having run is a page that can
 * arrive blank.
 */
export function AboutView() {
  return (
    <div className="ab">
      <PublicBar />

      {/* ── the thesis, and the moment it is about ──────────────────── */}
      <section className="ab-hero">
        <div className="ab-hero-say">
          <p className="ab-eyebrow">Recipe costing for one kitchen</p>
          <h1 className="ab-h1">
            A small kitchen knows what it charges. It rarely knows what a dish
            costs.
          </h1>
          <p className="ab-lede">
            The information exists — rates, quantities, what is left of an onion
            after trimming. It lives in a spreadsheet one person maintains, and
            it goes stale within weeks, because supplier prices move constantly
            and re-costing a menu by hand means touching hundreds of rows.
          </p>
          <p className="ab-hero-cta">
            <Link className="ab-btn" href="/dashboard">
              Open your book
            </Link>
            <a className="ab-btn is-quiet" href="mailto:hello@costbook.in">
              Talk to us
            </a>
          </p>
        </div>

        {/*
         * The question a spreadsheet cannot answer, drawn as the thing it
         * happens in. Not decoration: this row is the product's whole case.
         */}
        <figure
          className="ab-demo"
          aria-label="A rate changing, and the dishes it reaches"
        >
          <figcaption className="ab-demo-cap">Onion, 30 → 60 a kilo</figcaption>
          <div className="ab-demo-rows">
            <div className="ab-demo-row is-rate">
              <span>Onion</span>
              <span className="ab-demo-was">30.00</span>
              <span className="ab-demo-now">60.00 / kg</span>
            </div>
            <div className="ab-demo-arrow" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="ab-demo-row">
              <span>Upma</span>
              <span className="ab-demo-was">1.00</span>
              <span className="ab-demo-now">1.68</span>
            </div>
            <div className="ab-demo-row">
              <span>Kichadi</span>
              <span className="ab-demo-was">1.21</span>
              <span className="ab-demo-now">1.94</span>
            </div>
            <div className="ab-demo-row is-over">
              <span>Puliyodharai</span>
              <span className="ab-demo-was">2.20</span>
              <span className="ab-demo-now">3.05</span>
            </div>
          </div>
          <p className="ab-demo-note">
            Three of eleven dishes moved, and one crossed its target. A sheet
            holds all of this and answers none of it.
          </p>
        </figure>
      </section>

      {/* ── the workbook this started from ──────────────────────────── */}
      <section className="ab-band rv">
        <p className="ab-band-lead">The workbook this started from</p>
        <dl className="ab-figs">
          <div className="ab-fig">
            <dt className="figure">81</dt>
            <dd>recipes, kept carefully</dd>
          </div>
          <div className="ab-fig">
            <dt className="figure">0</dt>
            <dd>links between them</dd>
          </div>
          <div className="ab-fig">
            <dt className="figure">3</dt>
            <dd>preparations in one parotta plate</dd>
          </div>
          <div className="ab-fig is-mark">
            <dt className="figure">2</dt>
            <dd>rates worked out by hand and typed in</dd>
          </div>
        </dl>
      </section>

      {/* ── where it started ────────────────────────────────────────── */}
      <section className="ab-two rv">
        <div className="ab-two-side">
          <h2 className="ab-h2">Where it started</h2>
        </div>
        <div className="ab-two-main">
          <p className="ab-p">
            With a real workbook, kept by somebody who knew their kitchen. It
            had no links between its recipes at all. A parotta plate is three
            separate preparations, each with its own yield, and costing it
            properly means costing all three first — so two of its lines carried
            a per-portion rate somebody had worked out by hand and typed in.
          </p>
          <p className="ab-p">
            Those two numbers were the whole problem in miniature. They were
            right on the day they were typed. Nothing about the sheet could tell
            anyone the day they stopped being right, and nothing about it would
            change them when the ghee moved.
          </p>
        </div>
      </section>

      {/* ── what we do ──────────────────────────────────────────────── */}
      <section className="ab-do rv">
        <p className="ab-pull">
          Keep your spreadsheet. We make it answer questions.
        </p>
        <ol className="ab-steps">
          <li className="ab-step">
            <span className="ab-step-n figure">01</span>
            <h3 className="ab-step-h">Upload the file you already keep</h3>
            <p className="ab-step-p">
              Merged cells, headers three rows down, grams next to kilos, blank
              rates. Nobody retypes a menu, so the way in is the sheet as it is.
            </p>
          </li>
          <li className="ab-step">
            <span className="ab-step-n figure">02</span>
            <h3 className="ab-step-h">The dishes come back costed</h3>
            <p className="ab-step-p">
              Through their own yields, following sub-recipes into their
              batches, with every figure you can open and read step by step.
            </p>
          </li>
          <li className="ab-step">
            <span className="ab-step-n figure">03</span>
            <h3 className="ab-step-h">One rate moves everything it reaches</h3>
            <p className="ab-step-p">
              One ingredient, entered once, priced once. Change what you pay for
              onions and every dish recosts — including the ones that reach them
              through a gravy made on Tuesday.
            </p>
          </li>
        </ol>
      </section>

      {/* ── why ─────────────────────────────────────────────────────── */}
      <section className="ab-two rv">
        <div className="ab-two-side">
          <h2 className="ab-h2">Why</h2>
          <p className="ab-side-note">
            None of it is a failure of care. It is arithmetic nobody has time to
            redo every week, on data that changes every week.
          </p>
        </div>
        <ul className="ab-costs">
          <li>
            <b>A dish quietly runs at a loss</b> after a supplier raises a
            price, and nobody notices for months.
          </li>
          <li>
            <b>A menu price gets set</b> by looking at what the shop next door
            charges.
          </li>
          <li>
            <b>Nobody can say what the food cost is</b> without losing a day to
            it.
          </li>
          <li>
            <b>Sub-recipes make it worse.</b> Cost the plate without costing the
            three things on it and the figure is fiction.
          </li>
        </ul>
      </section>

      {/* ── the non-goals, said as plainly as the goals ─────────────── */}
      <section className="ab-not rv">
        <h2 className="ab-h2">What this is not</h2>
        <div className="ab-not-grid">
          <p className="ab-p">
            It does not hold your stock, raise purchase orders, talk to your
            till, or do your accounts. Those are real jobs and other tools do
            them. Every one of them would add a step to the fifteen minutes
            between opening the app and seeing your own menu costed, and that
            fifteen minutes is the promise.
          </p>
          <p className="ab-p">
            It also never invents a figure. Where a rate is missing you see a
            floor and a plain sentence saying so, not a plausible number. A
            costing you cannot trust is worse than no costing, because you act
            on it.
          </p>
        </div>
        <ul className="ab-nots" aria-label="Not in Costbook">
          {[
            "Inventory",
            "Purchase orders",
            "POS integration",
            "Accounting",
            "Nutrition",
            "Multi-outlet",
          ].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>

      {/* ── talk to us ──────────────────────────────────────────────── */}
      <section className="ab-end rv">
        <div>
          <h2 className="ab-end-h">Costbook is built by a small team.</h2>
          <p className="ab-end-p">
            <a href="mailto:hello@costbook.in">hello@costbook.in</a> reaches us
            rather than a help desk, and we usually reply within a day. If your
            sheet will not import, send it — a file we cannot read is a bug on
            our side, not a mistake on yours.
          </p>
        </div>
        <p className="ab-end-links">
          <Link href="/contact">Contact</Link>
          <Link href="/plans">Plans</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </p>
      </section>
    </div>
  );
}

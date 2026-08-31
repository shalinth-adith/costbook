import type { Metadata } from 'next';
import Link from 'next/link';

import { Wordmark } from '@/components/wordmark';

import './landing.css';

import { FREE_LIMITS } from '@/lib/org';

export const metadata: Metadata = {
  title: 'Costbook — keep your spreadsheet, we make it answer questions',
  description:
    'Recipe costing for small restaurants. Costbook reads the file you already keep, costs every dish through its sub-recipes, and tells you which ones stopped making money.',
};

/**
 * The landing page (A29).
 *
 * For an owner who has never looked for this kind of software. One idea: keep
 * your spreadsheet, we make it answer questions. The product's own screens do
 * the arguing — no illustrations, no chefs, no tier table, no testimonials.
 */

const QUOTES = [
  { said: 'Onion was forty-two rupees last month.', then: "It's sixty now. Nothing on your menu knows that." },
  { said: 'The sheet says the dosa costs thirty-eight.', then: 'The sheet was right in March. It is a photograph, not a ledger.' },
  { said: "I'll update it on Sunday.", then: "And by Wednesday three rates have moved again. That's the whole problem." },
] as const;

const WORST = [
  { name: 'Mutton Kothu Parotta', fc: '44.0%', over: true },
  { name: 'Chicken 65', fc: '39.3%', over: true },
  { name: 'Parotta Kuruma Plate', fc: '38.9%', over: true },
  { name: 'Ghee Garlic Podi Thatte Idly', fc: '38.3%', over: true },
  { name: 'Kal Dosa & Kuruma (2 pc)', fc: '36.2%', over: true },
  { name: 'Ghee Roast Masala Dosa', fc: '31.9%', over: false },
] as const;

const MOVERS = [
  { name: 'Vada Curry (2 pc)', via: 'Chicken Kuruma', from: '31.2%', to: '33.6%' },
  { name: 'Ennai Kathirikai Kuzhambu', via: 'Onion Thakkali Gravy', from: '31.0%', to: '33.1%' },
  { name: 'Parotta Kuruma Plate', via: 'Chicken Kuruma', from: '38.9%', to: '41.9%' },
] as const;

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Wordmark mode="public" />
        <nav>
          <Link href="/sign-in" className="lp-link">Sign in</Link>
          <Link href="/import" className="btn btn-primary">Import your sheet</Link>
        </nav>
      </header>

      <section className="lp-hero">
        <div>
          <h1>Keep your spreadsheet.<br />We&rsquo;ll make it answer questions.</h1>
          <p className="lp-lede">
            You already know what your dishes cost — somewhere in a file that was right three weeks
            ago. Costbook reads that file, keeps every dish costed as rates move, and tells you
            which ones stopped making money.
          </p>
          <Link href="/import" className="btn btn-primary lp-btn-lg">
            Import your spreadsheet
          </Link>
          <p className="lp-fine">
            Free for your first {FREE_LIMITS.recipes} dishes, and no card. Your file comes back exactly as it went in —
            Costbook only reads it.
          </p>
        </div>

        {/* The product's own screen, not an illustration of one. */}
        <figure className="lp-shot">
          <figcaption>Example · the dashboard, worst food cost first</figcaption>
          <div className="lp-shot-head">
            <span>Worst food cost first</span>
            <span className="figure">21 dishes · target 32.0%</span>
          </div>
          {WORST.map((d) => (
            <div className="lp-shot-row" key={d.name}>
              <span>{d.name}</span>
              <span className="figure" data-over={d.over}>{d.fc}</span>
            </div>
          ))}
          <p className="lp-shot-foot">A worked example. We don&rsquo;t show anyone else&rsquo;s numbers, and we won&rsquo;t show yours.</p>
        </figure>
      </section>

      <section className="lp-quotes">
        <h2>You already say this out loud</h2>
        <div className="lp-quote-grid">
          {QUOTES.map((q) => (
            <blockquote key={q.said}>
              <p className="lp-said">&ldquo;{q.said}&rdquo;</p>
              <p className="lp-then">{q.then}</p>
            </blockquote>
          ))}
        </div>
        <p className="lp-punch">
          Nobody is going to retype a menu into new software, and nobody should have to. Costbook
          starts from the file you have.
        </p>
      </section>

      <section className="lp-steps">
        <h2>Three things happen. None of them involve typing your menu again.</h2>

        <article className="lp-step">
          <span className="lp-step-n figure">01</span>
          <div>
            <h3>Your file goes in as it is</h3>
            <p>
              Whatever shape it&rsquo;s in. We show you which column we think is which, with a line
              of your own data read back as a sentence, so a mistake is obvious before it becomes
              1,140 wrong numbers. Columns we can&rsquo;t place are kept, not dropped.
            </p>
          </div>
          <div className="lp-card">
            <span className="lp-card-h figure">Ingredient Master.xlsx · sheet RATE LIST · 1,140 rows</span>
            <div className="lp-map"><span>ITEM NAME</span><span>→</span><span>Ingredient name</span></div>
            <div className="lp-map"><span>RATE/UNIT</span><span>→</span><span>Rate per unit</span></div>
            <p className="lp-readback">
              <span>Row 4, read back to you</span>
              <b className="figure">Idly Rice — 8 kg at ₹ 3.16 per kg = ₹ 25.28</b>
              <em>If that sentence is wrong, the mapping is wrong.</em>
            </p>
          </div>
        </article>

        <article className="lp-step">
          <span className="lp-step-n figure">02</span>
          <div>
            <h3>Every dish comes out costed</h3>
            <p>
              Down to the gram, through your sub-recipes, with the peel and the trim taken off. Each
              figure can be opened and read step by step — where it came from, and which number is a
              default you can change.
            </p>
          </div>
          <div className="lp-card">
            <span className="lp-card-h">Example · a cost sheet</span>
            <div className="lp-line"><span>Veechu Parotta <em>SUB</em></span><span className="figure">8 pc</span><span className="figure">54.80</span></div>
            <div className="lp-line"><span>Chicken Kuruma <em>SUB</em></span><span className="figure">480 g</span><span className="figure">95.28</span></div>
            <div className="lp-line"><span>Onion, big <em>88% yield</em></span><span className="figure">200 g</span><span className="figure">13.64</span></div>
            <div className="lp-line is-quiet"><span>16 more lines</span><span /><span className="figure">114.08</span></div>
            <div className="lp-line is-total"><span>Cost a portion</span><span /><span className="figure">46.30</span></div>
            <div className="lp-line is-total"><span>Suggested price <em>at your 32% target</em></span><span /><span className="figure">149.00</span></div>
          </div>
        </article>

        <article className="lp-step">
          <span className="lp-step-n figure">03</span>
          <div>
            <h3>One rate changes and everything follows</h3>
            <p>
              Onion goes up. Before anything is saved, you see which dishes moved — including the
              ones that only touch onion through a gravy three recipes deep. That connection is the
              part no spreadsheet makes and nobody holds in their head.
            </p>
          </div>
          <div className="lp-card">
            <span className="lp-card-h figure">Example · onion 42.00 → 60.00 a kilo, not applied yet</span>
            <p className="lp-headline">11 dishes move. 3 cross your 32% target.</p>
            {MOVERS.map((d) => (
              <div className="lp-line" key={d.name}>
                <span>{d.name}<em>via {d.via}</em></span>
                <span className="figure lp-was">{d.from}</span>
                <span className="figure">{d.to}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="lp-delivery">
        <h2>And the one nobody sees: the dish that works at the counter and loses on the app.</h2>
        <p>
          A platform&rsquo;s commission comes off your price instead of being added to the
          guest&rsquo;s bill, so a dosa at 31.9% in the shop lands at 47.4% on delivery. Costbook
          works out what to charge on the platform so the target survives — and your counter price
          never moves.
        </p>
        <div className="lp-pair">
          <div><span>At the counter</span><b className="figure">31.9%</b></div>
          <div><span>On delivery</span><b className="figure" data-over="true">47.4%</b></div>
        </div>
        <p className="lp-fine">
          A dosa at ₹ 129.00 on both. The platform takes ₹ 30.96, the gateway ₹ 2.58,
          and the box is yours.
        </p>
      </section>

      <section className="lp-offer">
        <h2>Bring your spreadsheet in and see your worst dishes.</h2>
        <p>
          Upload the file in whatever state it&rsquo;s in. Costbook shows you which column it thinks
          is which, reads one of your own rows back as a sentence so a mistake is obvious before it
          becomes a thousand wrong numbers, and asks you to confirm before anything is saved.
          Nothing is committed until you say so.
        </p>
        <div className="lp-actions">
          <Link href="/import" className="btn btn-primary lp-btn-lg">Import your spreadsheet</Link>
          <Link href="/setup" className="btn lp-btn-lg">Or cost one dish yourself, free</Link>
        </div>
        <p className="lp-fine">
          Four steps, about a minute. Your file is only ever read — we never write to it, and you
          keep it.
        </p>
      </section>

      <section className="lp-price">
        <h2>Free to cost your menu. Paid to keep it current.</h2>
        <p>
          Cost up to forty recipes, print prep cards, export the arithmetic — free, for as long as
          you like. Nothing expires and nothing is held back to make you pay.
        </p>
        <p>
          Paying adds the part that costs us something every week: drop a new supplier list on and
          every dish recosts itself, with the whole history of every rate kept and a second person
          on the same book.
        </p>
        <p className="lp-figure">
          <b className="figure">₹ 750</b> <span>a month, one outlet</span>
        </p>
        <p className="lp-fine">
          Less than one mutton biryani a week. Cancel in the product, keep everything you costed,
          and it stays readable and exportable on the free tier afterwards.
        </p>
        <Link href="/setup" className="btn btn-primary lp-btn-lg">Start free — decide later</Link>
      </section>

      <footer className="lp-foot">
        <Wordmark mode="public" />
        <p>Made in Madurai for people who cook for a living.</p>
        <nav>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="mailto:hello@costbook.in">hello@costbook.in</a>
        </nav>
      </footer>
    </div>
  );
}

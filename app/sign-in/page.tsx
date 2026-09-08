import type { Metadata } from 'next';
import Link from 'next/link';

import { SignInForm } from '@/components/sign-in-form';
import { Wordmark } from '@/components/wordmark';

import './entry.css';

export const metadata: Metadata = {
  title: 'Sign in · Costbook',
  description: 'Know what every plate costs you, and what to charge for it.',
};

/**
 * A10 — the entry screen. The only screen in the product allowed to persuade
 * (PRD §8), so the left half argues and the right half does the work.
 *
 * The argument is the same one the entry page makes, with the same figures:
 * onion moved this morning, four dishes followed it, three crossed the line.
 * Same numbers on purpose — a visitor who has just come from the landing page
 * should not find a different story about the same plate one room in.
 */
const PROOF: readonly {
  name: string;
  via: string;
  was: string;
  now: string;
  mark: 'crosses' | 'under' | 'over';
}[] = [
  { name: 'Shakshuka', via: 'via Tomato Sofrito', was: '31.2', now: '33.6', mark: 'crosses' },
  { name: 'Beef Rendang', via: 'via Rendang Paste', was: '31.0', now: '33.1', mark: 'crosses' },
  { name: 'Chicken Katsu Curry', via: 'via Curry Base', was: '31.6', now: '32.4', mark: 'crosses' },
  { name: 'Vegetable Korma', via: 'via Curry Base', was: '24.1', now: '25.7', mark: 'under' },
];
const MARK_SAID = { crosses: 'Crosses', under: 'Under', over: 'Was over' } as const;

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Where the gate stopped them. Passed down rather than read with
  // useSearchParams, which would need a Suspense boundary around the form.
  const raw = (await searchParams)?.['next'];
  const next = typeof raw === 'string' ? raw : null;

  return (
    <main className="gate">
      <section className="entry-brand" aria-label="What Costbook does">
        <div className="entry-brand-mark">
          <Wordmark mode="public" size={20} />
        </div>

        <div className="entry-pitch">
          <p className="entry-eyebrow">Recipe costing · one kitchen</p>
          <h2 className="entry-headline">
            Know what every plate costs you, <span className="is-lit">and what to charge for it.</span>
          </h2>
          <p className="entry-copy">
            Upload the recipe sheet you already keep. Costbook costs every dish, follows your
            sub-recipes through their own yields, and reprices the whole menu the moment one rate
            moves.
          </p>

          <div className="proof" aria-label="One rate moved this morning, and the dishes it reached">
            <div className="proof-rate">
              <span className="proof-rate-name">Onion, large</span>
              <span className="figure proof-rate-was">42.00</span>
              <span className="figure proof-rate-arrow" aria-hidden="true">&rarr;</span>
              <span className="figure proof-rate-now">60.00</span>
              <span className="proof-rate-unit">a kilo</span>
              <span className="figure proof-rate-when">this morning</span>
            </div>
            {PROOF.map((dish) => (
              <div className={`proof-row is-${dish.mark}`} key={dish.name}>
                <span className="proof-name">
                  <span>{dish.name}</span>
                  <span className="proof-via">{dish.via}</span>
                </span>
                <span className="figure proof-move">
                  <span className="proof-was">{dish.was}%</span>
                  <span className="proof-now">{dish.now}%</span>
                </span>
                <span className="figure proof-mark">{MARK_SAID[dish.mark]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="entry-trust">
          <span>No card, ever, on the free tier</span>
          <span className="entry-trust-rule" aria-hidden="true" />
          <span>Your sheet is read, never altered</span>
        </div>
      </section>

      <section className="entry-side">
        <SignInForm next={next} />
        <nav className="entry-links" aria-label="Legal">
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact a human</Link>
        </nav>
      </section>
    </main>
  );
}

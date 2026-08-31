import type { Metadata } from 'next';
import Link from 'next/link';

import { Mark } from '@/components/mark';
import { SignInForm } from '@/components/sign-in-form';
import { StatusGlyph } from '@/components/status-chip';
import type { TargetStatus } from '@/lib/costing';

import './entry.css';

export const metadata: Metadata = {
  title: 'Sign in · Costbook',
  description: 'Know what every plate costs you, and what to charge for it.',
};

/**
 * A10 — the entry screen. The only screen in the product allowed to persuade
 * (PRD §8), so the left half argues and the right half does the work.
 *
 * The three dishes are the argument. Two of them are over target, because a
 * costing tool that shows only healthy numbers on its own front door is
 * selling something nobody needs.
 */
const PROOF: readonly { name: string; cost: string; foodCost: string; status: TargetStatus }[] = [
  { name: 'Filter Coffee', cost: '9.85', foodCost: '21.9', status: 'on' },
  { name: 'Parotta Kuruma Plate', cost: '46.30', foodCost: '38.9', status: 'over' },
  { name: 'Mutton Seeraga Samba Biryani', cost: '172.20', foodCost: '59.6', status: 'over' },
];

export default function SignInPage() {
  return (
    <main className="gate">
      <section className="entry-brand" aria-label="What Costbook does">
        <div className="entry-brand-mark">
          <Mark size={20} />
          <span>Costbook</span>
        </div>

        <div className="entry-pitch">
          <h2 className="entry-headline">
            Know what every plate costs you, and what to charge for it.
          </h2>
          <p className="entry-copy">
            Upload the recipe sheet you already keep. Costbook costs every dish, follows your
            sub-recipes through their own yields, and reprices the whole menu the moment one rate
            moves.
          </p>

          <div className="proof">
            <div className="proof-head">
              <span>Dish</span>
              <span className="end">Cost</span>
              <span className="end">Food %</span>
              <span />
            </div>
            {PROOF.map((dish) => (
              <div className="proof-row" key={dish.name}>
                <span className="proof-name">{dish.name}</span>
                <span className="figure figure-end">{dish.cost}</span>
                <span className={`figure figure-end proof-fc proof-fc-${dish.status}`}>
                  {dish.foodCost}
                </span>
                <span className={`proof-glyph proof-fc-${dish.status}`}>
                  <StatusGlyph status={dish.status} />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="entry-trust">
          <span>Rupees, dirhams, pounds, dollars</span>
          <span className="entry-trust-rule" aria-hidden="true" />
          <span>Your sheet is read, never altered</span>
        </div>
      </section>

      <section className="entry-side">
        <SignInForm />
        <nav className="entry-links" aria-label="Legal">
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact a human</Link>
        </nav>
      </section>
    </main>
  );
}

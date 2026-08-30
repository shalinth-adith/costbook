import Link from 'next/link';

import { Wordmark } from './wordmark';

/**
 * A legal page (A30).
 *
 * One measure, one type size, no decoration. A legal page that can be read is
 * worth more than one that looks impressive, so every section answers a
 * question someone would actually ask.
 */
export function LegalPage({
  title,
  changed,
  note,
  sections,
}: {
  title: string;
  changed: string;
  note?: string;
  sections: readonly { readonly h: string; readonly p: React.ReactNode }[];
}) {
  return (
    <div className="legal">
      <header className="legal-top">
        <Wordmark mode="public" />
      </header>
      <main>
        <h1>{title}</h1>
        <p className="legal-changed">
          Last changed {changed}.{note !== undefined && ` ${note}`}
        </p>
        {sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            <p>{s.p}</p>
          </section>
        ))}
      </main>
      <footer className="legal-foot">
        <Link href="/">Back to Costbook</Link>
        <a href="mailto:hello@costbook.in">hello@costbook.in</a>
      </footer>
    </div>
  );
}

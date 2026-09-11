import Link from "next/link";

import { PublicBar } from "./public-bar";
import { SUPPORT_EMAIL } from "@/lib/org";

/**
 * A legal page (A30).
 *
 * Every section still answers a question somebody would actually ask, in
 * plain words — that part was right. What was wrong was the shape: one
 * measure down the middle of the window with half the page empty either
 * side, and no way to see what the page covered without reading all of it.
 *
 * It now uses the width the way the rest of the product does. A soot header,
 * the facts that matter as figures, a standing list of contents in the left
 * margin, and the sections beside it. The contents is not decoration: on a
 * page nobody wants to read, being able to jump to the one paragraph you
 * came for is the whole courtesy.
 *
 * MOTION is entrance only, and every section is fully visible at rest — the
 * reveal is added where a scroll timeline exists and the reader has not asked
 * for less. A legal page that arrives blank because a script did not run is
 * worse than one nobody animated.
 */
export function LegalPage({
  title,
  changed,
  note,
  summary,
  facts,
  sections,
}: {
  title: string;
  changed: string;
  note?: string;
  /** What the whole page says, in one sentence, before any of it. */
  summary: string;
  /** The four things somebody actually wants to know, as figures. */
  facts: readonly { readonly n: string; readonly said: string }[];
  /**
   * A heading and a body. The body is anything React can render — usually a
   * sentence, sometimes a table.
   */
  sections: readonly { readonly h: string; readonly p: React.ReactNode }[];
}) {
  const slug = (h: string) =>
    h
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  return (
    <div className="lg">
      <PublicBar />

      <section className="lg-hero">
        <p className="lg-eyebrow">Last changed {changed}</p>
        <h1 className="lg-h1">{title}</h1>
        <p className="lg-summary">{summary}</p>
        {note !== undefined && <p className="lg-note">{note}</p>}
      </section>

      <section className="lg-facts rv">
        <dl>
          {facts.map((f) => (
            <div key={f.said} className="lg-fact">
              <dt className="figure">{f.n}</dt>
              <dd>{f.said}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="lg-body">
        {/* Standing beside the text, so the page can be used rather than read. */}
        <nav className="lg-toc" aria-label="On this page">
          <p className="lg-toc-h">On this page</p>
          <ol>
            {sections.map((s, i) => (
              <li key={s.h}>
                <a href={`#${slug(s.h)}`}>
                  <span className="figure">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.h}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="lg-sections">
          {sections.map((s, i) => (
            <section key={s.h} id={slug(s.h)} className="lg-section rv">
              <span className="figure lg-section-n">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="lg-h2">{s.h}</h2>
              {/*
                A div, not a paragraph, and the difference is not cosmetic. A
                section body is a React node, and the subprocessor list is a
                table — which inside a <p> is not nested at all: the parser
                closes the paragraph before it, hoists the table out, and
                leaves an empty <p> above a table with none of its styling.
                Nothing errors. `.lg-p` is a class selector, so the prose
                sections read exactly as they did.
              */}
              <div className="lg-p">{s.p}</div>
            </section>
          ))}
        </div>
      </div>

      <footer className="lg-foot">
        <div>
          <p className="lg-foot-mark">Costbook</p>
          <p className="lg-foot-said">
            Anything here that reads like it is hiding something, write and ask.
            We would rather rewrite a sentence than have you guess at it.
          </p>
        </div>
        <p className="lg-foot-links">
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          <Link href="/about">What this is</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/subprocessors">Who else touches it</Link>
          <Link href="/terms">Terms</Link>
        </p>
      </footer>
    </div>
  );
}

/**
 * The questions a restaurant owner actually asks before signing up.
 *
 * Native `<details>`, no script: the browser handles open, close, keyboard
 * and the accessibility tree, and the answers are in the page for a crawler
 * to read. Every answer is true of the product as built — nothing here
 * promises a feature that is not there, because a landing page that does is
 * a support thread waiting to happen.
 */

const QUESTIONS: readonly (readonly [string, string])[] = [
  [
    "Does it work with the sheet I already keep?",
    "Yes. Bring it in as it is — a spreadsheet or a CSV — and Costbook reads the columns, asks you once which is which, and remembers the answer for next month. On the free tier you enter ingredients by hand, which for six dishes takes an evening.",
  ],
  [
    "What happens after six dishes?",
    "Everything you have costed stays costed, readable and printable, for as long as you like. To add a seventh dish, or bring a sheet in, you buy the book for a stretch of months. There is no card kept on file.",
  ],
  [
    "Can my chef use it without me?",
    "The morning confirm is a one-minute job — three prices, checked against what the supplier actually charged — and it is what keeps the whole menu true. It works on a phone, and it needs no spreadsheet open. Today one account is one book.",
  ],
  [
    "How does it handle a gravy that goes into six dishes?",
    "As a recipe of its own, with its own yield. Cost the gravy once; every dish that uses it picks up its true per-portion cost, and when onion goes up the gravy reprices and so does everything that reaches it. This is the part a spreadsheet gets wrong.",
  ],
  [
    "Where is my data, and who can see it?",
    "In a database under your own account, readable by nobody else. Nobody at Costbook reads your recipes or your rates, and no advertising or analytics company is involved. The privacy page says exactly what is kept, and what is not.",
  ],
  [
    "What if a supplier’s price list is wrong?",
    "Undo it. A price list you brought in can be rolled back for seven days, and every rate it changed goes back to what it was — and so does every dish that moved because of it.",
  ],
];

export function LandingFaq() {
  return (
    <section className="lp-faq" aria-labelledby="lp-faq-h">
      <div className="lp-faq-head">
        <p className="lp-eyebrow">Before you start</p>
        <h2 className="lp-h2" id="lp-faq-h">
          The questions owners ask.
        </h2>
      </div>
      <div className="lp-faq-list">
        {QUESTIONS.map(([q, a]) => (
          <details className="lp-faq-item" key={q}>
            <summary className="lp-faq-q">
              <span>{q}</span>
              <span className="lp-faq-mark" aria-hidden="true" />
            </summary>
            <p className="lp-faq-a">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

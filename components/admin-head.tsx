/**
 * The head of every back-office screen.
 *
 * Five pages carried five slightly different headers. One component, so the
 * eyebrow, the title, the lede and the time it was read sit in the same
 * place on every screen — a console is read by the same person forty times a
 * day, and every difference between its pages is a thing they have to
 * re-find.
 *
 * "Read at" is the server's clock at render. Every page under /admin is
 * dynamic, so the figure is the moment the numbers were true — and a console
 * that does not say when it was read is one you cannot tell is stale.
 */
export function AdminHead({
  section,
  title,
  lede,
  aside,
}: {
  /** The rail item this belongs to, for the eyebrow. */
  section: string;
  title: string;
  lede?: string;
  /** Anything that belongs at the head's right edge — a count, an action. */
  aside?: React.ReactNode;
}) {
  const at = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <header className="ba-head">
      <div className="ba-head-say">
        <p className="ba-eyebrow">Back office · {section}</p>
        <h1 className="ba-h1">{title}</h1>
        {lede !== undefined && <p className="ba-lede">{lede}</p>}
      </div>
      <div className="ba-head-meta">
        {aside}
        <span className="figure ba-read" title="When these figures were read">
          <span className="ba-read-dot" aria-hidden="true" />
          Read at {at}
        </span>
      </div>
    </header>
  );
}

import Link from 'next/link';

/**
 * What a screen says when there is nothing on it yet.
 *
 * Not a shrug and not a drawing. An empty Costbook is the normal state of a
 * new account, and the screen's job at that moment is to say what would fill
 * it and offer the shortest way there — which is nearly always the import,
 * because nobody is going to retype a menu (PRD 3).
 *
 * Deliberately not seeded with a demo café. A menu nobody entered is exactly
 * the plausible wrong data this product exists to avoid, and figures an
 * operator cannot account for are worse than no figures at all.
 */
export function Empty({
  title,
  lede,
  primary,
  secondary,
  note,
}: {
  title: string;
  lede: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  note?: string;
}) {
  return (
    <div className="empty">
      <h2 className="empty-title">{title}</h2>
      <p className="empty-lede">{lede}</p>
      <div className="empty-actions">
        <Link href={primary.href} className="btn btn-primary">{primary.label}</Link>
        {secondary !== undefined && (
          <Link href={secondary.href} className="btn">{secondary.label}</Link>
        )}
      </div>
      {note !== undefined && <p className="empty-note">{note}</p>}
    </div>
  );
}

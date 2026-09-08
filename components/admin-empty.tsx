import { Mark } from "./mark";

/**
 * Nothing here — said properly.
 *
 * A console's empty screens are the ones its operator sees most, and a grey
 * sentence on white reads as a page that failed to load. This is a state
 * with a shape: the mark, what "nothing" means on this screen, and what
 * would make something appear — so the reader knows whether to be relieved
 * or to go and wire something up.
 */
export function AdminEmpty({
  title,
  said,
  would,
}: {
  title: string;
  said: string;
  /** What has to happen for a row to show up here. */
  would?: string;
}) {
  return (
    <div className="bo-empty-state">
      <span className="bo-empty-mark" aria-hidden="true">
        <Mark size={22} />
      </span>
      <p className="bo-empty-title">{title}</p>
      <p className="bo-empty-said">{said}</p>
      {would !== undefined && (
        <p className="bo-empty-would">
          <span className="figure">Appears when</span>
          {would}
        </p>
      )}
    </div>
  );
}

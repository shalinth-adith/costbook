'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A secondary surface, over the page rather than beside it.
 *
 * One component, two presentations, decided by width rather than by a prop:
 *
 *   tablet    rises from the bottom edge. A centred dialog puts its close
 *             target in the top corner, which is the furthest point from a
 *             thumb on a tablet held in two hands (A13).
 *   desktop   a centred dialog. It was a right-hand drawer taking a third of
 *             the window, which read as a second page arriving beside the
 *             first rather than a question asked about it — and a drawer that
 *             narrow forces every field into one column whatever it holds.
 *
 * Every surface that changes a figure carries that figure, so nothing needed
 * is behind the panel either way.
 *
 * Either way the whole 52px title row closes it, rather than a corner of it.
 */

/** How long the leaving animation runs. Matches `--dur-dismiss`. */
const EXIT_MS = 150;
export function Sheet({
  title,
  open,
  onClose,
  children,
  footer,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  /*
   * The latest `onClose`, held in a ref so it is not an effect dependency.
   *
   * It used to be one. Every caller passes an inline arrow, so every render
   * of the parent handed this component a new function, the effect re-ran,
   * and `panel.current?.focus()` pulled the cursor out of whatever field the
   * operator was in and onto the dialog itself. On the Add-line drawer that
   * meant adding a line — which re-renders the recipe — stole focus from the
   * search box the moment it had been returned there. Focus belongs to the
   * moment the sheet opens, and to nothing after.
   */
  const close = useRef(onClose);
  close.current = onClose;

  /*
   * Kept mounted for the length of the exit.
   *
   * `if (!open) return null` unmounted the dialog the instant it was
   * dismissed, so it could arrive with an animation and never leave with one
   * — it simply stopped existing, which reads as a glitch rather than as a
   * panel closing.
   */
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      return undefined;
    }
    if (!shown) return undefined;
    setLeaving(true);
    const t = setTimeout(() => {
      setShown(false);
      setLeaving(false);
    }, EXIT_MS);
    return () => { clearTimeout(t); };
  }, [open, shown]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    // Focus moves into the sheet so a keyboard is not left behind the scrim —
    // once, on opening.
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!shown) return null;

  return (
    <div
      className={`scrim${leaving ? ' is-leaving' : ''}`}
      onMouseDown={(e) => {
        if (leaving) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`sheet${leaving ? ' is-leaving' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
      >
        {/* The whole row is the close target, not a corner of it. */}
        <button type="button" className="sheet-head" onClick={onClose}>
          <span className="sheet-grip" aria-hidden="true" />
          <span className="sheet-title">{title}</span>
          <span className="sheet-close">Close</span>
        </button>

        <div className="sheet-body">{children}</div>
        {footer === undefined ? null : <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

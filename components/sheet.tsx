'use client';

import { useEffect, useRef } from 'react';

/**
 * A secondary surface, arriving from the edge nearest the eye.
 *
 * One component, two presentations, decided by width rather than by a prop:
 *
 *   tablet    rises from the bottom edge. A centred dialog puts its close
 *             target in the top corner, which is the furthest point from a
 *             thumb on a tablet held in two hands (A13).
 *   desktop   a right-hand drawer. At 1440 the eye is already at the rail
 *             where the cost sits, so a panel from the bottom would land
 *             700px below where someone is looking (A12).
 *
 * The drawer covers the rail, which is why every surface that changes a
 * figure carries that figure — nothing needed is behind the panel.
 *
 * Either way the whole 52px title row closes it, rather than a corner of it.
 */
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

  if (!open) return null;

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="sheet"
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

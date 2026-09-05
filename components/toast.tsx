'use client';

import { useEffect } from 'react';

/**
 * What just happened, said once.
 *
 * It fades in place rather than sliding — A15 is explicit that a toast does
 * not travel. It carries an Undo where the action can be taken back, and it
 * does not dismiss itself while an Undo is still on offer, because a message
 * that disappears before it is read has not been delivered.
 */
export interface ToastState {
  readonly message: string;
  readonly undoable: boolean;
  /**
   * Stays until it is dismissed.
   *
   * For the messages that report work *not* saved. Those read like every
   * other toast and are the opposite of a confirmation: a refusal that clears
   * itself after four seconds leaves somebody looking at a screen full of
   * edits with no idea they are still unsaved.
   */
  readonly sticky?: boolean;
}

export function Toast({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: ToastState | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (toast === null || toast.undoable || toast.sticky === true) return undefined;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (toast === null) return null;

  return (
    <div
      className={`toast${toast.sticky === true ? ' is-sticky' : ''}`}
      role={toast.sticky === true ? 'alert' : 'status'}
      aria-live={toast.sticky === true ? 'assertive' : 'polite'}
    >
      <span className="toast-text">{toast.message}</span>
      {toast.undoable ? (
        <button type="button" className="toast-undo" onClick={onUndo}>Undo</button>
      ) : null}
      <button type="button" className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

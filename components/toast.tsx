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
    if (toast === null || toast.undoable) return undefined;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (toast === null) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
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

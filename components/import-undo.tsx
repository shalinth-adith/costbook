"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { type ImportRecord, UNDO_DAYS } from "@/lib/import-map";

/**
 * The undo window, still open.
 *
 * FLOWS 3.3 gives a repeat import seven days to be reversed rather than a
 * confirm step to be clicked through, "because the user is committing a change
 * to a menu that was already working". A window that only exists on the screen
 * you saw once is not a window: the person who notices on Thursday that a
 * dozen dishes moved comes back to Import, because Import is where they moved
 * from.
 *
 * It says what it does and what it leaves alone before it is pressed. Somebody
 * about to reprice their entire menu backwards should not discover the scope
 * of that by doing it.
 */
export function ImportUndo({
  last,
  onUndo,
}: {
  last: ImportRecord;
  onUndo: (id: string) => Promise<{ message: string; undoable: boolean }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const left = daysLeft(last.at);

  if (said !== null) {
    return (
      <p className="iu-said" role="status">
        {said}
      </p>
    );
  }

  return (
    <section className="iu-undo">
      <div className="iu-undo-text">
        <p className="iu-undo-title">
          <b>{last.filename}</b> {whenSaid(last.at)}
          {last.ratesMoved > 0 ? (
            <>
              , moving <b className="figure">{last.ratesMoved}</b>{" "}
              {last.ratesMoved === 1 ? "rate" : "rates"}
            </>
          ) : null}
          .
        </p>
        <p className="iu-undo-copy">
          {asking ? (
            <>
              Every rate that sheet moved goes back to what it was. Dishes and
              ingredients it added stay where they are — this undoes the
              pricing, not the arrival.
            </>
          ) : (
            <>
              You can put it back for{" "}
              {left <= 1 ? "the rest of today" : `${String(left)} more days`}.
            </>
          )}
        </p>
      </div>

      {asking ? (
        <div className="iu-undo-act">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onUndo(last.id)
                .then((ack) => {
                  setSaid(ack.message);
                  router.refresh();
                })
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Putting them back…" : "Yes, put the rates back"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => setAsking(false)}
          >
            Leave them
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn iu-undo-act"
          onClick={() => setAsking(true)}
        >
          Undo that import
        </button>
      )}
    </section>
  );
}

/**
 * How much of the window is left, counted in whole days.
 *
 * Rounded up, so the last day reads as one day rather than nought. A window
 * that reports zero days remaining while it is still open is a window nobody
 * uses.
 */
function daysLeft(at: string): number {
  const gone = Date.now() - new Date(at).getTime();
  const left = UNDO_DAYS * 86_400_000 - gone;
  return Math.max(0, Math.ceil(left / 86_400_000));
}

/** "today", "yesterday", or the date — the way somebody would say it. */
function whenSaid(at: string): string {
  const then = new Date(at);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "was imported today";
  if (days === 1) return "was imported yesterday";
  return `was imported ${String(days)} days ago`;
}

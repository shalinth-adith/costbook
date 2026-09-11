"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";

import { closeAccount } from "@/app/settings/actions";

/**
 * Closing the account, on the screen rather than by letter.
 *
 * Three things this deliberately does not do.
 *
 * It does not hide behind a modal. A dialog that appears over the page is
 * something to dismiss; a section you have to scroll to, read, and type into
 * is something you decided.
 *
 * It does not promise an undo. There is none — no scheduler exists to finish
 * a seven-day deletion, and a grace period nothing is scheduled to honour is
 * a worse lie than no grace period. The sentence says now, because it is now.
 *
 * It does not soften the list. Somebody about to delete a year of costing
 * should read what a year of costing means before the button becomes real.
 */
export function CloseAccount({ orgName }: { orgName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [fault, setFault] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Case and spacing forgiven, matching the server. This is a check against
  // an accidental press, not a password.
  const ready = typed.trim().toLowerCase() === orgName.trim().toLowerCase();

  const close = () => {
    setFault(null);
    start(async () => {
      try {
        const refused = await closeAccount(typed);
        if (refused !== undefined) setFault(refused.message);
      } catch (e) {
        /*
         * Success leaves by throwing — `closeAccount` ends in `redirect`, and
         * the plans screen has already shown once today what catching that
         * looks like: the word NEXT_REDIRECT printed at a person, and the
         * navigation swallowed. Here it would be worse. The account really
         * would be gone, and the screen would say it had failed.
         */
        unstable_rethrow(e);
        setFault(
          e instanceof Error
            ? e.message
            : "That did not go through. Nothing has been deleted.",
        );
      }
    });
  };

  return (
    <section className="shut">
      <div className="shut-head">
        <h2 className="shut-h">Closing this account</h2>
        <p className="shut-p">
          Everything goes: every dish and what it costs, every rate and its
          history, the sales you have pasted in, and the sign-in that opens
          this book. It happens immediately and nothing is kept — there is no
          copy to restore and no seven-day window to change your mind in.
        </p>
      </div>

      {open ? (
        <div className="shut-body">
          <p className="shut-warn">
            Take what you want first. The menu and the whole book download as
            spreadsheets, and the prep cards print — once this is done there is
            nothing left to take.
          </p>
          <label className="shut-field">
            <span>
              Type <b>{orgName}</b> to confirm
            </span>
            <input
              className="set-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={orgName}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={typed !== "" && !ready}
            />
          </label>
          {fault !== null ? (
            <p className="shut-fault" role="alert">
              {fault}
            </p>
          ) : null}
          <div className="shut-act">
            <button
              type="button"
              className="btn shut-go"
              disabled={!ready || pending}
              onClick={close}
            >
              {pending ? "Closing…" : "Close this account for good"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setFault(null);
              }}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn shut-open"
          onClick={() => setOpen(true)}
        >
          Close this account
        </button>
      )}
    </section>
  );
}

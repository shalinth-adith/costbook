"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";

import { attemptSignIn, resendVerification } from "@/app/sign-in/actions";
import { confirmSignUp } from "@/app/sign-up/actions";
import { type FieldName, IDLE, type SignInState, emailFault } from "@/lib/auth";
import { FREE_LIMITS } from "@/lib/org";
import { LINK_FAILED } from "@/lib/recover";
import { CODE_LENGTH, codeFault, digitsOf } from "@/lib/verify";

import { StatusGlyph } from "./status-chip";

/**
 * A10 of the design canvas: sign in, and every way it goes wrong.
 *
 * The screen decides nothing. `lib/auth.ts` decides which state this is in and
 * the server action establishes the facts; everything here is rendering, plus
 * the two things only a browser knows — that the request never came back
 * (A10 · 07), and that it is still in flight (A10 · 08).
 */

/**
 * The action, wrapped so a dropped connection reads as one.
 *
 * A successful sign-in redirects, which resolves without a value while the
 * router is already navigating — hold the previous state rather than blanking
 * the form under someone's hands on the way out.
 */
async function run(
  previous: SignInState,
  form: FormData,
): Promise<SignInState> {
  try {
    const result = (await attemptSignIn(previous, form)) as
      SignInState | undefined;
    return result ?? previous;
  } catch (e) {
    /*
     * A successful sign-in redirects, and this path does not see that throw:
     * an action driven by `useActionState` has its redirect handled by the
     * form machinery, so it resolves without a value while the router is
     * already navigating — which is what `result ?? previous` above is for.
     *
     * The same action awaited plainly inside a transition DOES reject with
     * NEXT_REDIRECT, and on the plans screen that was caught and printed at a
     * person. Nothing in the signature says which of the two you are in. So
     * the framework's signals go back to the framework here as well, and what
     * reaches the sentence below is a request that really did not come back.
     */
    unstable_rethrow(e);
    return { kind: "unreachable" };
  }
}

/**
 * Clay for a refusal, ochre for a near miss. Both carry a shape as well as a
 * colour, and both sit against the field that caused them — never a banner.
 */
function Fault({
  tone,
  children,
}: {
  tone: "over" | "near";
  children: React.ReactNode;
}) {
  return (
    <span className={`field-fault field-fault-${tone}`}>
      <StatusGlyph status={tone} size={11} />
      <span>{children}</span>
    </span>
  );
}

function faultFor(state: SignInState, field: FieldName): string | null {
  if (state.kind !== "fields") return null;
  return state.faults.find((f) => f.field === field)?.message ?? null;
}

/** mm:ss, in the duplexed mono, so the seconds do not jog the line as they tick. */
function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function Countdown({ ms, onExpire }: { ms: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(ms);

  useEffect(() => {
    setRemaining(ms);
    const started = Date.now();
    const tick = setInterval(() => {
      const left = ms - (Date.now() - started);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(tick);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [ms, onExpire]);

  return (
    <span className="countdown figure" role="timer" aria-live="off">
      Try again in {clock(remaining)}
    </span>
  );
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function SignInForm({
  next,
  linkSpent = false,
}: {
  next: string | null;
  /**
   * They followed a link from their mail and it did not work.
   *
   * Said here rather than on a page of its own: the thing to do about an
   * expired link is sign in or ask for another, and both are on this screen.
   * A dead end that only explains itself is one more screen to leave.
   */
  linkSpent?: boolean;
}) {
  const [state, formAction, pending] = useActionState(run, IDLE);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  /*
   * `?dev-login=true` fills the standard test credentials, in development only.
   *
   * It fills the form rather than submitting it: the point is to skip the
   * typing, not to skip the screen. Anyone checking that sign-in works still
   * presses the button and still sees what it does.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!new URLSearchParams(window.location.search).has("dev-login")) return;
    setEmail("dev@costbook.test");
    setPassword("costbook-dev");
  }, []);
  const [shown, setShown] = useState(false);
  /**
   * Checked as they leave the field, not while they type. Correcting someone
   * mid-word is rude, so this is set on blur and cleared on the next keystroke.
   */
  const [blurFault, setBlurFault] = useState<string | null>(null);
  /**
   * Which answer has been read and put away — by typing over it, by "Change
   * email", or by a lock running out. Held as the state object itself rather
   * than a flag: every submission returns a fresh one, so the next answer is
   * never mistaken for the dismissed one.
   */
  const [dismissed, setDismissed] = useState<SignInState | null>(null);

  /*
   * The code step, for an account whose address is not yet proven.
   *
   * The password has been accepted by the time this renders, and a code is
   * already on its way (app/sign-in/actions.ts). What is left is the same
   * field the sign-up screen has — this used to be a card that said "we sent
   * a link", when nothing had been sent, and offered a button that then did
   * send a code, to a screen with nowhere to type it.
   */
  const router = useRouter();
  const [code, setCode] = useState("");
  const [codeWrong, setCodeWrong] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [cooldown, setCooldown] = useState(0);
  const [fresh, setFresh] = useState(false);

  const live: SignInState = state === dismissed ? IDLE : state;

  const emailMessage = blurFault ?? faultFor(live, "email");
  const passwordMessage = faultFor(live, "password");

  function onEmailChange(value: string) {
    setEmail(value);
    setBlurFault(null);
    setDismissed(state);
  }

  /* ── the cards that replace the form entirely ─────────────────────── */

  if (live.kind === "locked") {
    return (
      <div className="entry-card">
        <div className="notice notice-over">
          <span className="lock-badge" aria-hidden="true">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            >
              <rect x="2.6" y="5.2" width="6.8" height="5.2" />
              <path d="M4.2 5.2V3.6a1.8 1.8 0 0 1 3.6 0v1.6" />
            </svg>
          </span>
          <div className="notice-text">
            {/* Written for a five-strikes lock this product does not have.
                Supabase rate-limits the attempt instead, for the minute the
                timer below is actually counting — so the card said fifteen
                minutes while the clock beside it ran for one. */}
            <span className="notice-title">Too many tries just now</span>
            <span className="notice-copy">
              Wait for the timer and try again. Nobody has been signed out of
              the app, and your data is untouched.
            </span>
          </div>
        </div>
        {/*
          * A33 offers a reset link here and it is not offered yet, because
          * there is no mail provider to send one. What is offered instead is
          * the one door that is actually open — a person, at an address that
          * is read. Telling somebody locked out to wait fifteen minutes and
          * nothing else is how a bad morning becomes a refund request.
          */}
        <Link className="btn btn-primary entry-action" href="/contact">
          Write to us and we&rsquo;ll let you back in
        </Link>
        <Countdown ms={live.unlocksInMs} onExpire={() => setDismissed(state)} />
      </div>
    );
  }

  if (live.kind === "unverified") {
    const confirmCode = () => {
      const wrong = codeFault(code);
      if (wrong !== null) {
        setCodeWrong(wrong);
        return;
      }
      setCodeWrong(null);
      startCheck(async () => {
        try {
          const out = await confirmSignUp(live.email, code, next);
          if (out.kind === "verified") {
            router.push(out.next);
            return;
          }
          setCodeWrong(out.message);
        } catch (e) {
          unstable_rethrow(e);
          setCodeWrong("That did not go through. Try again in a moment.");
        }
      });
    };

    // A new code retires the one before it, and the screen says so.
    const again = () => {
      setCooldown(45);
      setCode("");
      setCodeWrong(null);
      setFresh(false);
      startCheck(async () => {
        await resendVerification(live.email);
        setFresh(true);
      });
      const tick = window.setInterval(() => {
        setCooldown((n) => {
          if (n <= 1) {
            window.clearInterval(tick);
            return 0;
          }
          return n - 1;
        });
      }, 1000);
    };

    return (
      <form
        key="code"
        className="entry-card"
        onSubmit={(e) => {
          e.preventDefault();
          confirmCode();
        }}
      >
        <div className="notice notice-near">
          <StatusGlyph status="near" size={14} />
          <div className="notice-text">
            <span className="notice-title">One step left</span>
            <span className="notice-copy">
              {live.sent === false ? (
                <>
                  Your password is right, and the address has not been
                  confirmed yet. Several codes have gone to{" "}
                  <span className="figure">{live.email}</span> in the last
                  quarter of an hour, so no new one was sent — type the one in
                  the newest email, or wait a few minutes and ask again.
                </>
              ) : (
                <>
                  Your password is right. The address has not been confirmed
                  yet, so we have just sent a six-digit code to{" "}
                  <span className="figure">{live.email}</span>. Type it and
                  you are in.
                </>
              )}
            </span>
          </div>
        </div>

        <div className="field">
          <div className="field-label-row">
            <label className="field-label" htmlFor="code">
              The code from the email
            </label>
          </div>
          <div
            className={`field-control${codeWrong !== null ? " is-wrong" : ""}${checking ? " is-locked" : ""}`}
          >
            <input
              id="code"
              name="code"
              className="field-input code-input figure"
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456"
              maxLength={12}
              autoFocus
              disabled={checking}
              value={code}
              aria-invalid={codeWrong !== null}
              aria-describedby={codeWrong ? "code-fault" : undefined}
              onChange={(e) => {
                setCode(digitsOf(e.target.value));
                setCodeWrong(null);
              }}
            />
          </div>
          {codeWrong !== null && (
            <span id="code-fault" className="fault">
              {codeWrong}
            </span>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary entry-action"
          disabled={checking || digitsOf(code).length < CODE_LENGTH}
        >
          {checking ? "Checking…" : "Confirm and sign in"}
        </button>

        {fresh && (
          <p className="entry-note">
            A new code is on its way. The one before it has stopped working —
            use the newest email.
          </p>
        )}

        <p className="entry-foot">
          Didn&rsquo;t arrive? Check the spam folder, or{" "}
          <button
            type="button"
            className="link link-sm"
            onClick={again}
            disabled={checking || cooldown > 0}
          >
            {cooldown > 0 ? `send a new code (${String(cooldown)}s)` : "send a new code"}
          </button>
          .{" "}
          <button
            type="button"
            className="link link-sm"
            onClick={() => {
              setDismissed(state);
              setPassword("");
              setCode("");
              setCodeWrong(null);
            }}
          >
            Change email
          </button>
        </p>
      </form>
    );
  }

  if (live.kind === "unreachable") {
    return (
      <div className="entry-card">
        <div className="notice notice-flat">
          <StatusGlyph status="incomplete" size={14} />
          <div className="notice-text">
            <span className="notice-title">We could not reach Costbook</span>
            <span className="notice-copy">
              Your details were not wrong — the connection dropped. Nothing was
              sent anywhere.
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn entry-action"
          onClick={() => setDismissed(state)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M16 10a6 6 0 1 1-1.8-4.2M16 4v3h-3" />
          </svg>
          Try again
        </button>
        <span className="entry-status figure">status.costbook.app</span>
      </div>
    );
  }

  /* ── the form ─────────────────────────────────────────────────────── */

  const unknown = live.kind === "unknown-email" ? live : null;
  const wrong = live.kind === "wrong-password" ? live : null;

  return (
    <form className="entry-card" action={formAction} noValidate>
      {/* Where they were going before the gate stopped them. Validated by
          safeNext on the way back out — it arrived in a query string. */}
      {next === null ? null : <input type="hidden" name="next" value={next} />}
      <div className="entry-head">
        <h1 className="entry-title">Sign in</h1>
        <span className="entry-sub">Back to your menu.</span>
      </div>

      {/* A link from their mail that no longer works. Both answers to it —
          sign in, or ask for another — are on this screen already. */}
      {linkSpent && (
        <div className="notice notice-near">
          <StatusGlyph status="near" size={14} />
          <div className="notice-text">
            <span className="notice-title">That link has been spent</span>
            <span className="notice-copy">
              {LINK_FAILED}{" "}
              <Link className="link" href="/reset">
                Send another
              </Link>
              .
            </span>
          </div>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <div
          className={`field-control${emailMessage ? " is-wrong" : ""}${unknown ? " is-near" : ""}${pending ? " is-locked" : ""}`}
        >
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@yourcafé.com"
            className="field-input"
            data-testid="email-input"
            value={email}
            disabled={pending}
            aria-invalid={emailMessage !== null || unknown !== null}
            aria-describedby={
              emailMessage || unknown ? "email-fault" : undefined
            }
            onChange={(e) => onEmailChange(e.target.value)}
            onBlur={(e) =>
              setBlurFault(
                e.target.value === ""
                  ? null
                  : (emailFault(e.target.value)?.message ?? null),
              )
            }
          />
        </div>
        {emailMessage && (
          <span id="email-fault">
            <Fault tone="over">{emailMessage}</Fault>
          </span>
        )}
        {!emailMessage && unknown && (
          <span id="email-fault">
            <Fault tone="near">
              No account on that address.
              {unknown.suggestion && (
                <>
                  {" "}
                  Did you mean{" "}
                  <button
                    type="button"
                    className="suggestion"
                    onClick={() => {
                      setEmail(unknown.suggestion ?? "");
                      setDismissed(state);
                    }}
                  >
                    {unknown.suggestion}
                  </button>
                  ?
                </>
              )}
            </Fault>
          </span>
        )}
      </div>

      <div className="field">
        <div className="field-label-row">
          <label className="field-label" htmlFor="password">
            Password
          </label>
          {/*
            * A real door now. This pointed at /contact for as long as there
            * was no mail provider — the honest answer then, since the only
            * way back in was a human. There is a link to send now.
            */}
          <Link className="link link-sm" href="/reset">
            Forgot it?
          </Link>
        </div>
        <div
          className={`field-control${passwordMessage || wrong ? " is-wrong" : ""}${pending ? " is-locked" : ""}`}
        >
          <input
            id="password"
            name="password"
            type={shown ? "text" : "password"}
            autoComplete="current-password"
            className={`field-input${shown ? "" : " is-masked"}`}
            data-testid="password-input"
            value={password}
            disabled={pending}
            aria-invalid={passwordMessage !== null || wrong !== null}
            aria-describedby={
              passwordMessage || wrong ? "password-fault" : undefined
            }
            onChange={(e) => {
              setPassword(e.target.value);
              setDismissed(state);
            }}
          />
          <button
            type="button"
            className="field-toggle"
            aria-pressed={shown}
            disabled={pending}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? "Hide" : "Show"}
          </button>
        </div>
        {passwordMessage && (
          <span id="password-fault">
            <Fault tone="over">{passwordMessage}</Fault>
          </span>
        )}
        {!passwordMessage && wrong && (
          <span id="password-fault">
            <Fault tone="over">
              That password does not match this email.
              {/*
               * The count only appears when one is being kept. Against
               * Supabase nobody is counting, and the sentence used to read
               * "0 tries left before we lock the account for 15 minutes" on
               * the first wrong password — a threat that was not true, to a
               * person who has usually just mistyped their own password.
               */}
              {wrong.triesLeft !== null && (
                <>
                  {" "}
                  <span className="figure strong">{wrong.triesLeft}</span>{" "}
                  {wrong.triesLeft === 1 ? "try" : "tries"} left before we lock
                  the account for 15 minutes.
                </>
              )}
            </Fault>
          </span>
        )}
      </div>

      <button
        type="submit"
        className="btn btn-primary entry-action"
        disabled={pending}
      >
        {pending ? (
          <>
            <Spinner />
            Signing in
          </>
        ) : (
          "Sign in"
        )}
      </button>

      {/*
       * FLOWS 8 offers a sign-in link after three wrong passwords, and this
       * is where it goes. It is not here yet because there is nothing behind
       * it: no domain, so no mail provider, so no `signInWithOtp` and no
       * /sign-in/link route — the button linked to a 404 for as long as it
       * existed. Offering a way in that does not work, to the one person on
       * this screen who cannot get in, is worse than not offering it.
       *
       * Restore this with `resend`: a link here, the route, and the callback
       * that exchanges the token for a session.
       */}

      <div className="entry-divider">
        <span />
        <span className="entry-divider-label">new here</span>
        <span />
      </div>

      {/*
        A33: this slot used to hold a second filled button, which left the card
        with two primary actions. Account creation is a foot line now — where
        people look for it — and the card has one thing to press.
      */}
      <span className="entry-foot">
        New here?{" "}
        <Link className="link link-sm" href="/sign-up">
          Create an account.
        </Link>{" "}
        Free for your first {FREE_LIMITS.recipes} dishes. No card.
      </span>
    </form>
  );
}

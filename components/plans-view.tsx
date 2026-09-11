"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import { EXPORT_PASS, FREE_LIMITS, PAID_MONTHLY, type Plan, type Role } from "@/lib/org";
import {
  TERMS,
  type Purchase,
  type Subscription,
  type Term,
  canTakeAway,
  daysLeft,
  endOf,
  lapsed,
  perMonth,
  saving,
  termOf,
} from "@/lib/plan";

import {
  activateExportPassSandbox,
  activateSandbox,
  beginCheckout,
  beginExportPass,
  confirmPayment,
} from "@/app/plans/actions";

/** The provider's checkout, once its script is on the page. */
interface RazorpayWindow {
  Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
}

const rupees = (n: number) =>
  `${PAID_MONTHLY.symbol}${n.toLocaleString("en-IN")}`;
const onDay = (d: Date) =>
  d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * The plans page. Six dishes free; then one of four stretches, paid once.
 *
 * Laid out like Setup: the choice on the left, what it means on the right,
 * from real dates and figures. The button's label says what will happen —
 * pay, or activate in the sandbox — and never says one while doing the other.
 */
export function PlansView({
  plan,
  subscription,
  recipeCount,
  role,
  mode,
  justPaid,
}: {
  plan: Plan;
  subscription: Subscription;
  recipeCount: number;
  role: Role | null;
  mode: "razorpay" | "sandbox" | "none";
  justPaid: boolean;
}) {
  const [termId, setTermId] = useState<Term>("quarter");
  const [fault, setFault] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const term = termOf(termId) ?? TERMS[0]!;
  const owner = role === "owner";
  const today = new Date();
  // A stretch bought while one is running starts when that one ends, so
  // nothing already paid for is lost.
  const current =
    plan === "paid" && subscription.periodEnd !== null
      ? new Date(subscription.periodEnd)
      : null;
  const from = current !== null && current > today ? current : today;
  const until = endOf(from, term.months);
  const left = daysLeft(subscription, today);
  const lapsedNow = lapsed(subscription, today);
  const atLimit = plan === "free" && recipeCount >= FREE_LIMITS.recipes;

  const canTake = canTakeAway(subscription, today);

  /*
   * The pass, bought through the same till as a stretch.
   *
   * Same three steps, same server-recorded amount, same one-shot claim — the
   * only difference is what the confirmation switches on, and that decision
   * is made on the server from what the order said, never from here.
   */
  const buyPass = () => {
    setFault(null);
    start(async () => {
      try {
        const checkout = await beginExportPass();
        if (checkout.mode === "sandbox") {
          const refused = await activateExportPassSandbox();
          if (refused !== undefined) setFault(refused.message);
          return;
        }
        if (checkout.mode === "none") {
          setFault(
            "Payments are not connected yet. Write to us and we will switch it on with you.",
          );
          return;
        }
        await openRazorpay(checkout, "export", setFault);
      } catch (e) {
        /*
         * Next says "it worked" by throwing, and this used to catch it.
         *
         * Every one of these actions ends in `redirect()`, which throws a
         * NEXT_REDIRECT that the framework is meant to catch and turn into a
         * navigation. Caught here instead, it did two things at once: printed
         * the word NEXT_REDIRECT on the page as though it were a refusal, and
         * swallowed the navigation, so a plan that HAD just been switched on
         * looked to the owner like a payment that failed.
         *
         * `unstable_rethrow` goes first, before anything is read off the
         * error, and hands the framework's own signals back to it. What is
         * left in this block is a real fault worth showing.
         */
        unstable_rethrow(e);
        setFault(
          e instanceof Error
            ? e.message
            : "That did not go through. Nothing has changed on your account.",
        );
      }
    });
  };

  const buy = () => {
    setFault(null);
    start(async () => {
      try {
        const checkout = await beginCheckout(term.id);
        if (checkout.mode === "sandbox") {
          const refused = await activateSandbox(term.id);
          if (refused !== undefined) setFault(refused.message);
          return;
        }
        if (checkout.mode === "none") {
          setFault(
            "Payments are not connected yet. Write to us and we will switch the plan on with you.",
          );
          return;
        }
        await openRazorpay(checkout, term.id, setFault);
      } catch (e) {
        /*
         * Next says "it worked" by throwing, and this used to catch it.
         *
         * Every one of these actions ends in `redirect()`, which throws a
         * NEXT_REDIRECT that the framework is meant to catch and turn into a
         * navigation. Caught here instead, it did two things at once: printed
         * the word NEXT_REDIRECT on the page as though it were a refusal, and
         * swallowed the navigation, so a plan that HAD just been switched on
         * looked to the owner like a payment that failed.
         *
         * `unstable_rethrow` goes first, before anything is read off the
         * error, and hands the framework's own signals back to it. What is
         * left in this block is a real fault worth showing.
         */
        unstable_rethrow(e);
        setFault(
          e instanceof Error
            ? e.message
            : "That did not go through. Nothing has changed on your account.",
        );
      }
    });
  };

  return (
    <div className="page plans">
      <header className="page-head">
        <p className="page-kicker">Your plan</p>
        <h1 className="page-title display">
          {plan === "paid"
            ? "Paid, and running."
            : lapsedNow
              ? "Your stretch has ended."
              : atLimit
                ? `Your ${FREE_LIMITS.recipes} free dishes are costed.`
                : `${FREE_LIMITS.recipes} dishes free. Then a plan for the months ahead.`}
        </h1>
        <p className="page-sub">
          {plan === "paid" ? (
            <>
              Everything is open until{" "}
              <b>{onDay(new Date(subscription.periodEnd ?? today))}</b>
              {left !== null ? (
                <>
                  , {left} {left === 1 ? "day" : "days"} from now
                </>
              ) : null}
              . Nothing renews by itself; buy the next stretch here whenever you
              like, and it starts when this one ends.
            </>
          ) : lapsedNow ? (
            <>
              Every dish you costed is still here, still printable. Adding
              another, and importing, wait for the next stretch.
            </>
          ) : (
            <>
              The free trial is {FREE_LIMITS.recipes} dishes, costed properly,
              to see the arithmetic match yours. After that the book is bought
              for a stretch of months, once, up front. No card is kept.
            </>
          )}
        </p>
      </header>

      {justPaid && (
        <div className="card card-note plans-done">
          <b>Done.</b> Your plan is on until{" "}
          {onDay(new Date(subscription.periodEnd ?? today))}. The cap is lifted,
          import is open, and every rate change is kept.
        </div>
      )}

      <div className="plans-body">
        <main className="plans-form">
          <section className="wiz-sec">
            <div className="wiz-sec-head">
              <span className="wiz-sec-no figure">01</span>
              <h2 className="wiz-sec-h">Where you are</h2>
              <p className="wiz-sec-p">
                Counted, not guessed. A dish is a recipe in your book.
              </p>
            </div>
            <div className="wiz-sec-body">
              <dl className="wiz-rows">
                <div className="wiz-row">
                  <dt>Dishes costed</dt>
                  <dd>
                    <b className="figure">{recipeCount}</b>
                    {plan === "free" ? (
                      <>
                        {" "}
                        of <b className="figure">{FREE_LIMITS.recipes}</b> free
                      </>
                    ) : (
                      ", no cap"
                    )}
                  </dd>
                </div>
                <div className="wiz-row">
                  <dt>Plan</dt>
                  <dd>
                    {plan === "paid" ? (
                      <>
                        {termOf(subscription.term)?.label ?? "Paid"}, until{" "}
                        <b>
                          {onDay(new Date(subscription.periodEnd ?? today))}
                        </b>
                      </>
                    ) : lapsedNow ? (
                      <>
                        Free again since{" "}
                        <b>
                          {onDay(new Date(subscription.periodEnd ?? today))}
                        </b>
                      </>
                    ) : (
                      "Free trial"
                    )}
                  </dd>
                </div>
              </dl>
              {plan === "free" && (
                <div
                  className="plans-bar"
                  role="img"
                  aria-label={`${recipeCount} of ${FREE_LIMITS.recipes} free dishes`}
                >
                  <span
                    style={{
                      inlineSize: `${Math.min(100, (recipeCount / FREE_LIMITS.recipes) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="wiz-sec">
            <div className="wiz-sec-head">
              <span className="wiz-sec-no figure">02</span>
              <h2 className="wiz-sec-h">How long for</h2>
              <p className="wiz-sec-p">
                Paid once, in rupees whatever your menu is priced in. A longer
                stretch costs less a month.
              </p>
            </div>
            <div className="wiz-sec-body">
              <div className="plans-terms" role="radiogroup" aria-label="Term">
                {TERMS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`plans-term${termId === t.id ? " is-on" : ""}`}
                    aria-pressed={termId === t.id}
                    onClick={() => setTermId(t.id)}
                  >
                    <span className="plans-term-label">{t.label}</span>
                    <span className="plans-term-amount display">
                      {rupees(t.amount)}
                    </span>
                    <span className="plans-term-said">
                      {rupees(perMonth(t))} a month
                      {saving(t) > 0 ? ` · save ${rupees(saving(t))}` : ""}
                    </span>
                    <span className="plans-term-tag">{t.said}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="wiz-sec">
            <div className="wiz-sec-head">
              <span className="wiz-sec-no figure">03</span>
              <h2 className="wiz-sec-h">What it opens</h2>
            </div>
            <div className="wiz-sec-body">
              <ul className="plans-opens">
                <li>
                  <b>No cap on dishes.</b> The {FREE_LIMITS.recipes} were to see
                  it work; the rest of the menu comes now.
                </li>
                <li>
                  <b>Import.</b> The sheet you already keep becomes a costed
                  menu in a minute.
                </li>
                <li>
                  <b>Every rate change kept</b>, not the last{" "}
                  {FREE_LIMITS.rateHistory}, so the ghee argument has its
                  history.
                </li>
                <li>
                  <b>Nothing taken away when it ends.</b> Every dish stays
                  costed and printable; adding waits for the next stretch.
                </li>
              </ul>
            </div>
          </section>
        </main>

        <aside className="wiz-live plans-live">
          <p className="wiz-live-label">What you would be buying</p>
          <div className="wiz-card">
            <div className="wiz-card-head">
              <span className="wiz-card-name display">{term.label}</span>
              <span className="wiz-card-sub">{term.said}</span>
            </div>
            <div className="wiz-card-money">
              <span className="wiz-card-money-label">Once, today</span>
              <span className="wiz-card-money-fig display">
                {rupees(term.amount)}
              </span>
              <span className="wiz-card-money-more">
                {rupees(perMonth(term))} a month over{" "}
                {term.months === 1 ? "the month" : `${term.months} months`}
                {saving(term) > 0 ? (
                  <>, {rupees(saving(term))} less than month by month</>
                ) : null}
                .
              </span>
            </div>
          </div>
          <dl className="wiz-rows">
            <div className="wiz-row">
              <dt>Runs</dt>
              <dd>
                {current !== null && current > today ? (
                  <>
                    From <b>{onDay(from)}</b>, when the current stretch ends, to{" "}
                    <b>{onDay(until)}</b>
                  </>
                ) : (
                  <>
                    From today to <b>{onDay(until)}</b>
                  </>
                )}
              </dd>
            </div>
            <div className="wiz-row">
              <dt>Then</dt>
              <dd>
                Nothing is charged again. You are told a week before it ends,
                and buy the next stretch here if you want it.
              </dd>
            </div>
            <div className="wiz-row">
              <dt>Billed as</dt>
              <dd>
                {rupees(term.amount)} in {PAID_MONTHLY.currency}, whatever
                currency your menu is in. Costbook never converts.
              </dd>
            </div>
          </dl>

          {mode === "sandbox" && (
            <p className="plans-sandbox">
              Sandbox is on: the button below switches the plan on without a
              payment, and the account records it as a sandbox activation.
            </p>
          )}

          {owner ? (
            <button
              type="button"
              className="btn btn-primary btn-lg plans-buy"
              disabled={pending || mode === "none"}
              onClick={buy}
            >
              {pending
                ? "One moment…"
                : mode === "sandbox"
                  ? `Activate ${term.label.toLowerCase()} in the sandbox`
                  : mode === "razorpay"
                    ? `Pay ${rupees(term.amount)}`
                    : "Payments not connected yet"}
            </button>
          ) : (
            <p className="plans-owner">
              Only the owner can change the plan. Ask whoever set up the
              account.
            </p>
          )}
          {mode === "none" && owner && (
            <p className="plans-owner">
              There is no card form yet.{" "}
              <Link className="link" href="/contact">
                Write to us
              </Link>{" "}
              and we will switch it on with you.
            </p>
          )}
          {fault !== null && (
            <p className="plans-fault" role="alert">
              {fault}
            </p>
          )}
        </aside>
      </div>

      {/*
        * Taking your work out.
        *
        * Its own section under the plan rather than a fifth term beside the
        * four, because it is not a stretch of months and putting it in that
        * row would make somebody compare a hundred rupees with seven hundred
        * and fifty as though they bought the same kind of thing.
        *
        * Drawn whatever the account is on. Unlocked it says so and stops
        * asking; that is the difference between a receipt and a nag.
        */}
      <section className="tk" id="takeaway">
        <div className="tk-say">
          <p className="wiz-live-label">Taking it with you</p>
          <h2 className="tk-h2">
            {canTake
              ? "Your work is yours to take."
              : "Print the cards, take the sheet."}
          </h2>
          <p className="tk-copy">
            {canTake
              ? "Prep cards print, and the whole book downloads as a spreadsheet — the menu costed, or every dish opened all the way down to what is actually in it. Bought once and kept, including if a stretch ends."
              : "Reading is free and stays free: six dishes costed properly, every figure open to its working, the prep card on screen. Carrying it away — a card printed and taped up in a kitchen, a spreadsheet sent to an accountant — is bought once."}
          </p>
          <ul className="tk-has">
            <li>Prep cards to the printer, with everything in a batch opened down to the shelf</li>
            <li>The menu as a spreadsheet: what each dish costs, sells at, and keeps</li>
            <li>The whole restaurant as one sheet — every dish, every line inside it, with its rate</li>
            <li>Kept for good, and included in every paid stretch</li>
          </ul>
        </div>

        <div className="tk-buy">
          {canTake ? (
            <>
              <p className="figure tk-state">Unlocked</p>
              <p className="tk-state-said">
                {plan === "paid"
                  ? "Included while you are on a plan — and it stays after a stretch ends."
                  : "Bought on this account. Nothing further to pay for taking your work out."}
              </p>
              <Link href="/recipes" className="btn btn-primary btn-lg tk-go">
                Go and print one
              </Link>
            </>
          ) : (
            <>
              <p className="figure tk-price">
                {EXPORT_PASS.symbol}
                {EXPORT_PASS.amount}
              </p>
              <p className="tk-once">once, and it stays bought</p>
              {owner ? (
                <button
                  type="button"
                  className="btn btn-primary btn-lg tk-go"
                  disabled={pending || mode === "none"}
                  onClick={buyPass}
                >
                  {pending
                    ? "One moment…"
                    : mode === "sandbox"
                      ? "Unlock it in the sandbox"
                      : mode === "razorpay"
                        ? `Pay ${EXPORT_PASS.symbol}${String(EXPORT_PASS.amount)}`
                        : "Payments not connected yet"}
                </button>
              ) : (
                <p className="plans-owner">
                  Only the owner can buy this. Ask whoever set up the account.
                </p>
              )}
              <p className="tk-note">
                Or take a plan above — every stretch includes it, and keeps it
                afterwards.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/** Put the provider's checkout on the page and open it on the order. */
async function openRazorpay(
  checkout: {
    orderId: string;
    keyId: string;
    amount: number;
    currency: string;
    name: string;
  },
  bought: Purchase,
  onFault: (message: string) => void,
): Promise<void> {
  const w = window as unknown as RazorpayWindow;
  if (w.Razorpay === undefined) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve();
      s.onerror = () =>
        reject(
          new Error(
            "The payment form could not be loaded. Check the connection and try again.",
          ),
        );
      document.body.appendChild(s);
    });
  }
  if (w.Razorpay === undefined)
    throw new Error("The payment form did not load.");
  const rz = new w.Razorpay({
    key: checkout.keyId,
    amount: checkout.amount,
    currency: checkout.currency,
    name: "Costbook",
    description: `${checkout.name} · ${
      bought === "export" ? "Take your work out" : (termOf(bought)?.label ?? bought)
    }`,
    order_id: checkout.orderId,
    /*
     * The order alone. What was bought is on the server, recorded when the
     * order was opened; sending the term from here is what let a month be
     * paid for and a year confirmed.
     *
     * A refusal comes back as a sentence and is shown. It used to be thrown
     * away with the promise, so a payment that failed verification looked to
     * the owner exactly like one that worked.
     */
    handler: (r: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => {
      void confirmPayment({
        orderId: r.razorpay_order_id,
        paymentId: r.razorpay_payment_id,
        signature: r.razorpay_signature,
      })
        .then((refused) => {
          if (refused !== undefined) onFault(refused.message);
        })
        .catch((e: unknown) => {
          /*
           * The worst version of the same bug, and the reason it is worth a
           * comment in three places.
           *
           * `confirmPayment` ends in `redirect()` when it WORKS. Caught here,
           * a payment that went through, verified and switched the plan on
           * told the customer it had not — and told them to write in if they
           * had been charged. They had. The framework's signal goes back to
           * the framework first, and only a real failure reaches the sentence.
           */
          unstable_rethrow(e);
          onFault(
            "Costbook could not confirm that payment. Nothing has changed on " +
              "your account — reload the page, and write to us if you were charged.",
          );
        });
    },
    // Closing the form is not a failure, but it should not leave the page
    // looking as though something is still happening.
    modal: {
      ondismiss: () => onFault("The payment form was closed. Nothing has been charged."),
    },
    theme: { color: "#FF6A3D" },
  });
  rz.open();
}

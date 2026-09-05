"use client";

import Link from "next/link";

import type { CostBuildUp, CostingModel } from "@/lib/costing";
import { SAID, SHORT, whereItGoes } from "@/lib/where";

import { useMoney } from "./currency-provider";

/**
 * Where every hundred a guest pays actually goes.
 *
 * A kitchen prices at cost ÷ 0.2 because the trade says so, and that rule
 * answers one question — what share of the price is food — while leaving the
 * one that matters unanswered: does what remains cover the rent. This is the
 * answer, on the dish, in the words a kitchen uses.
 *
 * It refuses to say "profit" until every cost has been entered. A screen that
 * showed a fat remainder to an account that has never entered its wages would
 * be telling somebody they were making money they were not.
 */
/** "a, b and c" — a list a person would read aloud. */
function said(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1] ?? ""}`;
}

export function WhereItGoes({
  price,
  build,
  model,
}: {
  price: number | null;
  build: CostBuildUp;
  model: CostingModel;
}) {
  const m = useMoney();
  const split = price === null ? null : whereItGoes(price, build, model);
  if (split === null) return null;

  const losing = split.left.amount < 0;

  return (
    <section className="card wig">
      <div className="label">
        Where every {m.withSymbol(100)} of this price goes
      </div>

      <div
        className="wig-bar"
        role="img"
        aria-label={split.slices
          .filter((s) => !s.missing)
          .map((s) => `${s.label} ${String(Math.round(s.share))}`)
          .concat(`${split.left.label} ${String(Math.round(split.left.share))}`)
          .join(", ")}
      >
        {split.slices
          .filter((s) => s.share > 0)
          .map((s) => (
            <span
              key={s.kind}
              className={`wig-seg is-${s.kind}`}
              style={{ inlineSize: `${String(Math.max(0, s.share))}%` }}
            />
          ))}
        {!losing && (
          <span
            className="wig-seg is-left"
            style={{ inlineSize: `${String(Math.max(0, split.left.share))}%` }}
          />
        )}
      </div>

      <dl className="wig-rows">
        {split.slices.map((s) => (
          <div
            key={s.kind}
            className={`wig-row${s.missing ? " is-missing" : ""}`}
          >
            <dt>
              <span className={`wig-dot is-${s.kind}`} aria-hidden="true" />
              {s.label}
              <span className="wig-said">{SAID[s.kind]}</span>
            </dt>
            <dd>
              {s.missing ? (
                <span className="wig-none">not counted</span>
              ) : (
                <>
                  <span className="figure">{m.withSymbol(s.amount)}</span>
                  <span className="figure wig-share">
                    {Math.round(s.share)}
                  </span>
                </>
              )}
            </dd>
          </div>
        ))}

        <div className={`wig-row is-left${losing ? " is-losing" : ""}`}>
          <dt>
            <span className="wig-dot is-left" aria-hidden="true" />
            {losing ? "Short, on every plate" : split.left.label}
          </dt>
          <dd>
            <span className="figure">{m.withSymbol(split.left.amount)}</span>
            <span className="figure wig-share">
              {Math.round(split.left.share)}
            </span>
          </dd>
        </div>
      </dl>

      {split.complete ? (
        <p className="wig-note">
          {losing ? (
            <>
              Every plate of this goes out at a loss, once everything you have
              entered is counted. The price has to rise or the recipe has to
              change.
            </>
          ) : (
            <>
              This is real: every cost you have is counted, so what is left is
              what the plate makes you.
            </>
          )}
        </p>
      ) : (
        <p className="wig-note is-warn">
          {/*
           * The whole reason this component exists. A kitchen pricing at
           * cost ÷ 0.2 is told that four fifths of the price is theirs; the
           * rent and the wages come out of that four fifths and nobody has
           * said how much. Until they do, the figure above is a ceiling.
           */}
          <b>This is the most you could be keeping, not what you make.</b>{" "}
          Nobody has told Costbook what{" "}
          {said(split.notCounted.map((k) => SHORT[k]))} cost a plate, so none of
          it is counted above. Put those in{" "}
          <Link className="link" href="/settings">
            Settings
          </Link>{" "}
          and this becomes your real figure.
        </p>
      )}
    </section>
  );
}

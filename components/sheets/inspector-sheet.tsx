'use client';

import { useState } from 'react';

import type { InspectorStep } from '@/lib/inspector';
import { asText } from '@/lib/inspector';

import { useMoney } from '../currency-provider';
import { Sheet } from '../sheet';

/**
 * The formula inspector (A28 · 2).
 *
 * Every figure on the cost sheet traces to a step here. A costing figure
 * nobody can check is a figure nobody trusts, and an owner who cannot follow
 * the arithmetic goes back to the spreadsheet they could follow.
 *
 * The last question is the honest one: every kitchen counts something
 * differently — gas, the boy who cuts onions, the plate that broke. If a step
 * is wrong or a step is missing, that is worth knowing.
 */
export function InspectorSheet({
  open,
  onClose,
  title,
  subtitle,
  steps,
  onSetForThisDish,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  steps: readonly InspectorStep[];
  onSetForThisDish: () => void;
}) {
  const m = useMoney();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(asText(steps, title)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <Sheet
      title="How that figure is made"
      open={open}
      onClose={onClose}
      footer={
        <div className="ins-foot">
          <p>
            <b>Does this match how you cost?</b> Every kitchen counts something differently — gas,
            the boy who cuts onions, the plate that broke. If a step is wrong or a step is missing,
            that is worth knowing.
          </p>
          <button type="button" className="btn" onClick={onSetForThisDish}>
            Change how it&rsquo;s calculated
          </button>
        </div>
      }
    >
      <div className="ins-head">
        <p className="ins-sub">{title} · {subtitle}</p>
        <button type="button" className="set-pill" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <table className="ins-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Step, and where the figure comes from</th>
            <th>Running total</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.n} data-source={s.source}>
              <td className="figure ins-n">{s.n}</td>
              <td>
                <span className="ins-label">
                  {s.label}
                  {/* Anything Costbook supplied is labelled where it appears,
                      with a way to change it. */}
                  {s.isDefault && <span className="ins-default">DEFAULT</span>}
                </span>
                <span className="ins-from">{s.from}</span>
                {s.children !== undefined && (
                  <span className="ins-kids">
                    {s.children.map((c) => (
                      <span className="ins-kid" key={c.name}>
                        <span>{c.name}<em>{c.note}</em></span>
                        <span className="figure">{m.money(c.amount)}</span>
                      </span>
                    ))}
                  </span>
                )}
              </td>
              <td className="figure ins-run">
                {s.amount !== null && s.running === null
                  ? `+ ${m.money(s.amount)}`
                  : s.running === null
                    ? 'included'
                    : m.money(s.running)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sheet>
  );
}

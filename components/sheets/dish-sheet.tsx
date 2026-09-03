'use client';

import { Sheet } from '../sheet';
import { Stepper } from '../stepper';


import { useMoney } from '../currency-provider';

/**
 * Edit: name, category, station and batch size.
 *
 * The batch stepper recomputes the whole dish live, and the sheet shows the
 * division as you press it — because batch size is the one field on here that
 * moves every figure on the screen, and pressing a stepper without seeing what
 * it did is guessing (A13).
 */
export function DishSheet({
  open,
  onClose,
  name,
  category,
  station,
  portions,
  linesTotal,
  onName,
  onCategory,
  onStation,
  onPortions,
  method,
  onMethod,
  labourMinutes,
  labourRatePerHour,
  onLabourMinutes,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  category: string;
  station: string | null;
  portions: number | null;
  linesTotal: number;
  onName: (v: string) => void;
  onCategory: (v: string) => void;
  onStation: (v: string) => void;
  onPortions: (v: number) => void;
  /** How to prepare it, as typed. Prints on the prep card. */
  method: string | null;
  onMethod: (v: string) => void;
  /** Minutes of kitchen time one batch takes. Null when nobody has said. */
  labourMinutes: number | null;
  /** The account's one kitchen rate, so the sheet can say what the minutes cost. */
  labourRatePerHour: number;
  onLabourMinutes: (v: number | null) => void;
}) {
  const per = portions === null || portions <= 0 ? null : linesTotal / portions;
  const m = useMoney();

  return (
    <Sheet
      title="Edit the dish"
      open={open}
      onClose={onClose}
      footer={<button type="button" className="btn btn-primary wide" onClick={onClose}>Done</button>}
    >
      <label className="field">
        <span className="label">Dish name</span>
        <input value={name} onChange={(e) => onName(e.target.value)} />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="label">Category</span>
          <input value={category} onChange={(e) => onCategory(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Station</span>
          <input value={station ?? ''} onChange={(e) => onStation(e.target.value)} />
        </label>
      </div>

      <div className="field">
        <span className="label">Portions this batch makes</span>
        <Stepper
          label="portions"
          value={portions === null ? '—' : `${portions} plates`}
          min={portions !== null && portions <= 1}
          onDown={() => onPortions(Math.max(1, (portions ?? 1) - 1))}
          onUp={() => onPortions((portions ?? 0) + 1)}
        />
      </div>

      <label className="field">
        <span className="label">Kitchen time, minutes a batch</span>
        <input
          className="field-input"
          inputMode="numeric"
          value={labourMinutes ?? ''}
          placeholder="not counted"
          onChange={(e) => {
            const v = e.target.value.trim();
            onLabourMinutes(v === '' ? null : Math.max(0, Number(v) || 0));
          }}
        />
        <span className="field-help">
          {labourRatePerHour > 0
            ? `At ${m.withSymbol(labourRatePerHour)} an hour, set in Settings. Spread over the portions.`
            : 'Counted once a kitchen rate is set in Settings.'}
        </span>
      </label>

      <label className="field">
        <span className="label">How to prepare</span>
        <textarea
          className="field-textarea"
          value={method ?? ''}
          rows={6}
          spellCheck={false}
          placeholder="One step a line, in your own words. It prints on the prep card."
          onChange={(e) => onMethod(e.target.value)}
        />
      </label>

      <div className="live-note">
        <span className="label">What this changes, live</span>
        <div className="figure live-sum">
          {m.money(linesTotal)} ÷ {portions ?? '—'} = {m.money(per)}
        </div>
        <p className="live-copy">
          Batch size divides the ingredient cost, so it moves every figure on the dish. Lines
          marked <strong>PER PORTION</strong> scale with it instead of being divided by it.
        </p>
      </div>
    </Sheet>
  );
}

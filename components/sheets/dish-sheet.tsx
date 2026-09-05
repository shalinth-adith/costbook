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
  portionSize,
  onPortionSize,
  contains,
  onContains,
  prepTime,
  onPrepTime,
  doNot,
  onDoNot,
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
  /*
   * The four the prep card prints and nothing could type.
   *
   * They arrived only from an imported sheet's columns, so a kitchen that
   * typed its menu in by hand had a card with no portion, no allergens and no
   * prep time — the three lines a cook actually reads off a card taped to a
   * wall — and the "do not" box was hard-coded empty for everybody.
   */
  portionSize: string | null;
  onPortionSize: (v: string) => void;
  contains: string;
  onContains: (v: string) => void;
  prepTime: string | null;
  onPrepTime: (v: string) => void;
  doNot: string | null;
  onDoNot: (v: string) => void;
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
        <span className="label">One portion is</span>
        <input
          className="field-input"
          value={portionSize ?? ''}
          placeholder="2 idly and a ladle of sambar"
          onChange={(e) => { onPortionSize(e.target.value); }}
        />
        <span className="field-help">Prints on the prep card beside PORTION. Costs nothing.</span>
      </label>

      <label className="field">
        <span className="label">Contains</span>
        <input
          className="field-input"
          value={contains}
          placeholder="Peanut, dairy, mustard"
          onChange={(e) => { onContains(e.target.value); }}
        />
        <span className="field-help">
          Separated by commas. Never guessed from ingredient names — a guess under CONTAINS is
          worse than a blank line, because a kitchen cannot tell them apart.
        </span>
      </label>

      <label className="field">
        <span className="label">Prep time</span>
        <input
          className="field-input"
          value={prepTime ?? ''}
          placeholder="20 minutes, plus overnight soaking"
          onChange={(e) => { onPrepTime(e.target.value); }}
        />
      </label>

      <label className="field">
        <span className="label">Do not</span>
        <textarea
          className="field-textarea"
          value={doNot ?? ''}
          rows={2}
          placeholder="Do not boil the coconut. It splits."
          onChange={(e) => { onDoNot(e.target.value); }}
        />
        <span className="field-help">The one thing that ruins it. Prints in its own box.</span>
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

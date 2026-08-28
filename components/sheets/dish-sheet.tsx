'use client';

import { Sheet } from '../sheet';
import { Stepper } from '../stepper';
import { money } from '@/lib/format';

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
}) {
  const per = portions === null || portions <= 0 ? null : linesTotal / portions;

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

      <div className="live-note">
        <span className="label">What this changes, live</span>
        <div className="figure live-sum">
          {money(linesTotal)} ÷ {portions ?? '—'} = {money(per)}
        </div>
        <p className="live-copy">
          Batch size divides the ingredient cost, so it moves every figure on the dish. Lines
          marked <strong>PER PORTION</strong> scale with it instead of being divided by it.
        </p>
      </div>
    </Sheet>
  );
}

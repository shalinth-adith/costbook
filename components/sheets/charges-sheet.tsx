'use client';

import { Sheet } from '../sheet';
import { Stepper } from '../stepper';
import { percent } from '@/lib/format';

import { useMoney } from '../currency-provider';

/**
 * Wastage and packaging.
 *
 * Both start from a figure the operator never entered, which is why they are
 * labelled DEFAULT on the dish. Setting them here changes the label to YOURS.
 * The arithmetic recomputes beside the steppers, so the cost per portion is
 * watched moving rather than discovered afterwards (A13).
 */
export function ChargesSheet({
  open,
  onClose,
  wastagePercent,
  packaging,
  isDefault,
  ingredientsPerPortion,
  onWastage,
  onPackaging,
  onReset,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  wastagePercent: number;
  packaging: number;
  isDefault: boolean;
  ingredientsPerPortion: number;
  onWastage: (v: number) => void;
  onPackaging: (v: number) => void;
  onReset: () => void;
  onApply: () => void;
}) {
  const wast = ingredientsPerPortion * (wastagePercent / 100);
  const total = ingredientsPerPortion + wast + packaging;
  const m = useMoney();

  return (
    <Sheet
      title="Wastage and packaging"
      open={open}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onReset} disabled={isDefault}>
            Back to defaults
          </button>
          <button type="button" className="btn btn-primary" onClick={onApply}>
            Use these figures
          </button>
        </>
      }
    >
      <p className="sheet-copy">
        Both start from a figure you never entered, which is why they are labelled as defaults on
        the dish. Set them here and the label changes to yours.
      </p>

      <div className="field">
        <span className="label">Wastage, as a share of ingredient cost</span>
        <Stepper
          label="wastage"
          value={percent(wastagePercent, 1)}
          min={wastagePercent <= 0}
          onDown={() => onWastage(Math.max(0, Math.round((wastagePercent - 0.5) * 10) / 10))}
          onUp={() => onWastage(Math.round((wastagePercent + 0.5) * 10) / 10)}
        />
        <span className="figure field-work">
          {m.money(ingredientsPerPortion)} × {percent(wastagePercent, 1)} = {m.money(wast)}
        </span>
      </div>

      <div className="field">
        <span className="label">Packaging, flat per portion</span>
        <Stepper
          label="packaging"
          value={m.withSymbol(packaging)}
          min={packaging <= 0}
          onDown={() => onPackaging(Math.max(0, Math.round((packaging - 0.05) * 100) / 100))}
          onUp={() => onPackaging(Math.round((packaging + 0.05) * 100) / 100)}
        />
      </div>

      <div className="live-note">
        <span className="label">Cost per portion, as you change it</span>
        <div className="figure live-sum">
          {m.money(ingredientsPerPortion)} + {m.money(wast)} + {m.money(packaging)}
        </div>
        <div className="figure live-total">{m.withSymbol(total)}</div>
      </div>

      <p className="sheet-foot-note">
        This sets them for this dish only. Settings has the figure every new dish starts from.
      </p>
    </Sheet>
  );
}

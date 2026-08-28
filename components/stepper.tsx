'use client';

/**
 * A quantity, changed by pressing.
 *
 * No text field, deliberately. A wet finger cannot select and retype a number
 * on a tablet in a kitchen, and a field that clears on focus loses the figure
 * it was showing (A13). The targets are 52px, above the 44px floor, because
 * this is the control used most and used worst.
 */
export function Stepper({
  value,
  label,
  onDown,
  onUp,
  min,
  disabled = false,
}: {
  value: string;
  label: string;
  onDown: () => void;
  onUp: () => void;
  min?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper-btn"
        onClick={onDown}
        disabled={disabled || min === true}
        aria-label={`Less ${label}`}
      >
        −
      </button>
      <span className="figure stepper-value" aria-live="polite">{value}</span>
      <button
        type="button"
        className="stepper-btn"
        onClick={onUp}
        disabled={disabled}
        aria-label={`More ${label}`}
      >
        +
      </button>
    </div>
  );
}

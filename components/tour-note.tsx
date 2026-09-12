"use client";

/**
 * One step of the first-dish tour, sitting under the field it is about.
 *
 * Inline, not floating: a note in the flow directly under its field is always
 * beside it, stacks naturally on a narrow screen, and scrolls with what it
 * describes. The outer row takes a full line of whatever it sits in — a flex
 * row of fields or a plain card — so the screen can then line the note itself
 * up with the edges of the lit tile above it.
 *
 * Announced politely rather than grabbing focus from the page.
 */
export function TourNote({
  step,
  index,
  total,
  body,
  next,
  onNext,
  onSkip,
  id,
  label,
}: {
  /** Any tour's step — this reads its heading and nothing else. */
  step: { readonly h: string };
  index: number;
  total: number;
  /** The explanation, which for Check depends on what is on screen. */
  body: string;
  next: string;
  /** What this tour is called, above the count. */
  label: string;
  onNext: () => void;
  onSkip: () => void;
  id: string;
}) {
  return (
    <div className="tn-row">
      <div
        className="tn"
        role="group"
        aria-labelledby={`${id}-h`}
        aria-describedby={`${id}-p`}
        aria-live="polite"
      >
        <p className="tn-count">
          {label} · {index + 1} of {total}
        </p>
        <p className="tn-h" id={`${id}-h`}>
          {step.h}
        </p>
        <p className="tn-p" id={`${id}-p`}>
          {body}
        </p>
        <div className="tn-act">
          <button type="button" className="btn btn-primary tn-next" onClick={onNext}>
            {next}
          </button>
          <button type="button" className="tn-skip" onClick={onSkip}>
            Skip the tour
          </button>
        </div>
      </div>
    </div>
  );
}

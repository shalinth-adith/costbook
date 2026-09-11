"use client";

import type { TourStep } from "@/lib/tour";

/**
 * One step of the first-dish tour, sitting under the field it is about.
 *
 * Inline, not floating. A callout positioned over the page has to chase its
 * field through every scroll, resize and reflow, and loses on a phone; one
 * that sits in the flow directly under the field is always next to it,
 * stacks naturally on a narrow screen, and scrolls with what it describes.
 *
 * It is announced politely rather than grabbing focus from the field — the
 * point is that the owner is typing into the thing it describes.
 */
export function TourNote({
  step,
  index,
  total,
  body,
  refusal,
  next,
  onNext,
  onSkip,
  id,
}: {
  step: TourStep;
  index: number;
  total: number;
  /** The explanation, which for Check depends on what is on screen. */
  body: string;
  /** Why it cannot move on yet, said in a sentence. */
  refusal: string | null;
  next: string;
  onNext: () => void;
  onSkip: () => void;
  id: string;
}) {
  return (
    <div
      className="tn"
      role="group"
      aria-labelledby={`${id}-h`}
      aria-describedby={`${id}-p`}
      aria-live="polite"
    >
      <p className="tn-count">
        Your first dish · {index + 1} of {total}
      </p>
      <p className="tn-h" id={`${id}-h`}>
        {step.h}
      </p>
      <p className="tn-p" id={`${id}-p`}>
        {body}
      </p>
      {refusal !== null ? (
        <p className="tn-err" role="alert">
          {refusal}
        </p>
      ) : null}
      <div className="tn-act">
        <button
          type="button"
          className="btn btn-primary tn-next"
          onClick={onNext}
        >
          {next}
        </button>
        {/* Always one click away, and the screen works exactly the same
            without the tour — skipping costs nothing. */}
        <button type="button" className="tn-skip" onClick={onSkip}>
          Skip the tour
        </button>
      </div>
    </div>
  );
}

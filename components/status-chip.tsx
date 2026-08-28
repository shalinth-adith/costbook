import { STATUS_LABEL, type TargetStatus } from '@/lib/costing';

/**
 * Status is a word plus a shape, never a colour alone — a triangle, a diamond,
 * a bar or a crossed square, so a greyscale printout loses nothing and a
 * colour-blind reader is not guessing.
 */
export function StatusGlyph({ status, size = 10 }: { status: TargetStatus; size?: number }) {
  switch (status) {
    case 'on':
      return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="5" width="10" height="2" fill="currentColor" /></svg>;
    case 'near':
      return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.2 10.8 6 6 10.8 1.2 6Z" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
    case 'over':
      return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11.2 10.6H0.8Z" fill="currentColor" /></svg>;
    case 'incomplete':
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
          <rect x="1.3" y="1.3" width="9.4" height="9.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M1.3 10.7 10.7 1.3" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
  }
}

export function StatusChip({ status, label }: { status: TargetStatus; label?: string }) {
  return (
    <span className={`chip chip-status chip-${status}`}>
      <StatusGlyph status={status} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

/**
 * A figure Costbook supplied rather than the operator. Always beside the number
 * it produced, with a way to change it — never silent, never a wizard question
 * asked before it means anything (FLOWS 2.1).
 */
export function DefaultChip() {
  return <span className="chip chip-default figure">DEFAULT</span>;
}

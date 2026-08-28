/**
 * The costs mark: four bars, line only, on the 16px grid. Rising then falling,
 * because a costing tool that only ever draws a line going up is lying.
 */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3 16V8m4.7 8V4m4.6 12v-6M17 16V6" />
    </svg>
  );
}

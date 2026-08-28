import { describe, expect, it } from 'vitest';

// Proves the toolchain only: TypeScript compiles under strict, Vitest collects
// and runs. Delete this once units.ts has real tests (TRD build step 2).
describe('test harness', () => {
  it('runs', () => {
    expect(true).toBe(true);
  });
});

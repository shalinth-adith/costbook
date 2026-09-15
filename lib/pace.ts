/**
 * Make a reply take at least this long.
 *
 * WHY. The forgotten-password screen says the same sentence to every address,
 * so it cannot be used to find out which addresses have accounts — in words.
 * In time it could: an address with no account failed inside the provider in
 * a moment, while a real one went on to mint a code and post a mail, and the
 * audit of 2026-09-15 measured the two at 317ms and 1333ms from the same
 * button. A stopwatch is a form of the answer the words refuse to give.
 *
 * So both paths are held to a floor. The real one is already near it, the
 * empty one waits, and a person asking for a code sees "Sending…" for a
 * second and a half either way. Not a constant-time guarantee — network and
 * provider jitter remain — but the gap it closes was the whole signal.
 */
export async function atLeast<T>(
  ms: number,
  work: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  const result = await work();
  const left = ms - (Date.now() - started);
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
  return result;
}

/** How long a code send is held to, whatever happened inside it. */
export const CODE_SEND_FLOOR_MS = 1500;

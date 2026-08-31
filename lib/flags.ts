/**
 * A chef noticing a dish has gone wrong, and telling the owner (A40).
 *
 * Not messaging. Not email, not SMS, not a push notification, not a thread. A
 * flag is a small object with a dish attached, and it lives on the one screen
 * the owner already opens — building a messaging product inside a costing
 * product is how both get worse.
 *
 * It is the only signal in this product that does not come from a spreadsheet,
 * which is why it is worth having at all.
 */

export interface Flag {
  readonly id: string;
  readonly recipeId: string;
  readonly dish: string;
  /** Named, never "the owner". In a café of four, a role is nobody. */
  readonly from: string;
  readonly note: string | null;
  /**
   * The figures as they stood when it was raised. A chef never retypes a
   * number, and a flag read next week should say what was true when it was
   * sent rather than what is true now.
   */
  readonly cost: number | null;
  readonly price: number | null;
  readonly foodCost: number | null;
  readonly target: number | null;
  readonly sentAt: string;
  /** Null until the owner actually opened it. Never a tick that implies they did. */
  readonly openedAt: string | null;
  readonly seenAt: string | null;
}

/** Unread first, newest first. What the dashboard card counts. */
export function unread(flags: readonly Flag[]): readonly Flag[] {
  return flags.filter((f) => f.seenAt === null);
}

export function forRecipe(flags: readonly Flag[], recipeId: string): readonly Flag[] {
  return flags.filter((f) => f.recipeId === recipeId);
}

/**
 * The mark a dish keeps once something has been said about it.
 *
 * So nobody flags the same dish three days running wondering whether it went.
 * Null when nothing has been said.
 */
export function markFor(flags: readonly Flag[], recipeId: string, to: string): string | null {
  const mine = forRecipe(flags, recipeId);
  return mine.length === 0 ? null : `SENT TO ${to.toUpperCase()}`;
}

/**
 * How the receipt reads, honestly.
 *
 * "He hasn't opened it yet" rather than a tick implying he has. The pronoun is
 * avoided rather than guessed — a name we hold is not a gender we know.
 */
export function deliveryState(flag: Flag, to: string): string {
  if (flag.seenAt !== null) return `${to} has seen it`;
  if (flag.openedAt !== null) return `${to} has opened it`;
  return `${to} hasn't opened it yet`;
}

/** When it was sent, in the words a kitchen uses. */
export function whenSent(sentAt: string, today: string): string {
  const then = sentAt.slice(0, 10);
  if (then === today) return 'this morning';
  const days = Math.round((Date.parse(today) - Date.parse(then)) / 86_400_000);
  if (Number.isNaN(days)) return then;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return then;
}

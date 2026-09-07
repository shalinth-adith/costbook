/**
 * What the whole product is doing, counted.
 *
 * Pure functions over rows, so every figure on the console has arithmetic
 * that can be tested rather than trusted. A wrong number here is worse than
 * a missing one: it is the number decisions get made on.
 *
 * The funnel is the one in FLOWS 10, not one invented for a dashboard. That
 * document is explicit that the activation moment is not signup — it is the
 * first time a rate change reprices a menu, "when the product does something
 * a spreadsheet cannot, and everything before it is setup". So the last step
 * is a rate that moved after the book existed. Import is reported beside the
 * funnel rather than inside it: FLOWS calls it "the product's only real
 * promise" and the step to watch, and it is still not a stage everybody
 * passes through — see `funnelOf` for what that cost the first version.
 */

/** One kitchen, as `admin_accounts()` returns it. */
export interface AccountRow {
  readonly orgId: string;
  readonly name: string;
  readonly createdAt: string;
  readonly setupDone: boolean;
  readonly ownerEmail: string | null;
  readonly plan: string;
  readonly status: string;
  readonly periodEnd: string | null;
  readonly recipes: number;
  readonly ingredients: number;
  /** When a rate on this book last moved. Null when none ever has. */
  readonly lastRateAt: string | null;
  readonly imports: number;
}

export interface Step {
  readonly key: "signed" | "setup" | "costed" | "activated";
  readonly said: string;
  readonly count: number;
  /** Share of everyone who signed up. Null when nobody has. */
  readonly ofAll: number | null;
  /** How many were lost at this step, against the one before it. */
  readonly lost: number;
}

/**
 * The steps, in the order FLOWS 10 puts them — minus one.
 *
 * FLOWS lists the sequence as signup → wizard → import → dashboard → first
 * rate change, and reading that as a funnel is wrong: importing is optional.
 * A kitchen can cost six dishes by hand, and on the free tier it cannot
 * import at all. The first version put it in the funnel, and on a book that
 * had costed by hand it drew "brought a sheet in: 0" above "changed a rate:
 * 1" — a later step larger than the one before it, which is not a thing a
 * funnel can say. These four are genuinely nested; import is reported beside
 * them by `importReach`, as the branch it is.
 *
 * Counted as "reached at least this far" rather than "is here now", so an
 * account that activated is still counted at every earlier step — a funnel
 * whose earlier steps shrink as people progress reports churn where there
 * was success.
 */
export function funnelOf(rows: readonly AccountRow[]): readonly Step[] {
  const all = rows.length;
  const setup = rows.filter((r) => r.setupDone).length;
  const costed = rows.filter((r) => r.recipes > 0).length;
  const activated = rows.filter((r) => r.lastRateAt !== null).length;

  const share = (n: number) => (all === 0 ? null : round((n / all) * 100));
  const steps: readonly (readonly [Step["key"], string, number])[] = [
    ["signed", "Signed up", all],
    ["setup", "Answered the four questions", setup],
    ["costed", "Has a dish on the book", costed],
    ["activated", "Changed a rate — the product working", activated],
  ];

  let before = all;
  return steps.map(([key, said, count]) => {
    const step: Step = {
      key,
      said,
      count,
      ofAll: share(count),
      lost: Math.max(0, before - count),
    };
    before = count;
    return step;
  });
}

/**
 * How many ever brought a sheet in.
 *
 * Beside the funnel rather than inside it. FLOWS calls import "the product's
 * only real promise" and the step to watch, which is true — and it is still
 * not a stage everybody passes through.
 */
export function importReach(rows: readonly AccountRow[]): {
  readonly count: number;
  readonly ofAll: number | null;
} {
  const count = rows.filter((r) => r.imports > 0).length;
  return {
    count,
    ofAll: rows.length === 0 ? null : round((count / rows.length) * 100),
  };
}

/** Accounts that got as far as a book but never brought a sheet in. */
export function stuckBeforeImport(
  rows: readonly AccountRow[],
): readonly AccountRow[] {
  return rows.filter((r) => r.setupDone && r.imports === 0);
}

/**
 * Accounts that reached the book and stopped.
 *
 * Setup answered, dishes on file, and no rate has ever moved — so the product
 * has been set up and never used for the thing it is for.
 */
export function costedButNeverMoved(
  rows: readonly AccountRow[],
): readonly AccountRow[] {
  return rows.filter((r) => r.recipes > 0 && r.lastRateAt === null);
}

/** One paid order, as `payment_orders` holds it. */
export interface PaidOrder {
  readonly orgId: string;
  readonly term: "monthly" | "quarter" | "half" | "year";
  /** The smallest unit the provider charges in — paise, for rupees. */
  readonly amount: number;
  readonly currency: string;
  readonly paidAt: string;
}

export interface Money {
  /** Whole units, not paise: what a person would say out loud. */
  readonly total: number;
  readonly count: number;
}

export interface Revenue {
  readonly all: Money;
  readonly thisMonth: Money;
  readonly lastMonth: Money;
  readonly byTerm: readonly { readonly term: string; readonly money: Money }[];
  /** Accounts that have paid at least once. */
  readonly payers: number;
}

const TERMS = ["monthly", "quarter", "half", "year"] as const;

export function revenueOf(
  orders: readonly PaidOrder[],
  today: string,
): Revenue {
  const month = today.slice(0, 7);
  const before = monthBefore(month);

  const money = (rows: readonly PaidOrder[]): Money => ({
    // Paise to rupees at the edge, once. Summing rupees would round every
    // order and report a total nobody was charged.
    total: round(rows.reduce((s, o) => s + o.amount, 0) / 100),
    count: rows.length,
  });

  return {
    all: money(orders),
    thisMonth: money(orders.filter((o) => o.paidAt.slice(0, 7) === month)),
    lastMonth: money(orders.filter((o) => o.paidAt.slice(0, 7) === before)),
    byTerm: TERMS.map((term) => ({
      term,
      money: money(orders.filter((o) => o.term === term)),
    })),
    payers: new Set(orders.map((o) => o.orgId)).size,
  };
}

/** Subscriptions that end within the next `days`, soonest first. */
export function renewingWithin(
  rows: readonly AccountRow[],
  today: string,
  days = 30,
): readonly AccountRow[] {
  const from = new Date(`${today}T00:00:00Z`).getTime();
  const to = from + days * 86_400_000;
  return rows
    .filter((r) => {
      if (r.periodEnd === null || r.plan === "free") return false;
      const at = new Date(r.periodEnd).getTime();
      return Number.isFinite(at) && at >= from && at <= to;
    })
    .sort((a, b) => (a.periodEnd ?? "").localeCompare(b.periodEnd ?? ""));
}

/** Signups per month, oldest first, with no gaps between months. */
export function signupsByMonth(
  rows: readonly AccountRow[],
  months: number,
  until: string,
): readonly { readonly period: string; readonly count: number }[] {
  const out: { period: string; count: number }[] = [];
  let p = until.slice(0, 7);
  for (let i = 0; i < months; i += 1) {
    out.unshift({ period: p, count: 0 });
    p = monthBefore(p);
  }
  const at = new Map(out.map((m, i) => [m.period, i]));
  for (const r of rows) {
    const i = at.get(r.createdAt.slice(0, 7));
    if (i !== undefined) {
      const row = out[i];
      if (row !== undefined) row.count += 1;
    }
  }
  return out;
}

function monthBefore(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 2, 1));
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/* ── Coming back, and using it ────────────────────────────────────────────
 *
 * The back office used to count what the books held — dishes costed,
 * ingredients on the shelves, how recently each kitchen moved a rate. Those
 * are the kitchen's figures, not ours, and reading them across every account
 * to judge how the product is doing is both the wrong question and more than
 * we should be holding.
 *
 * These two numbers are the whole of what is watched now: did people come
 * back, and did they use it when they did. Nothing here can say what anybody
 * cooked, because nothing upstream records it.
 */

/** One person, one day, as `app_use` keeps it. */
export interface Use {
  /** `YYYY-MM-DD`, the database's day. */
  readonly day: string;
  readonly orgId: string;
  readonly userId: string;
  readonly logins: number;
  readonly visits: number;
}

export interface UseDay {
  readonly day: string;
  readonly logins: number;
  readonly visits: number;
  /** Distinct kitchens that touched the book that day. */
  readonly kitchens: number;
  /** Distinct people, which is larger once a kitchen has staff. */
  readonly people: number;
}

/**
 * The last `days` days, oldest first, with the empty ones kept.
 *
 * A quiet Sunday is a fact about the product and has to be drawn, so the
 * series is built from the calendar and the rows are laid onto it — never
 * from the rows alone, which would silently close the gaps and turn a week
 * with two dead days into an unbroken line.
 */
export function dailyUse(
  rows: readonly Use[],
  days: number,
  today: string,
): readonly UseDay[] {
  const start = new Date(`${today}T00:00:00Z`).getTime() - (days - 1) * 86_400_000;

  const byDay = new Map<string, Use[]>();
  for (const r of rows) {
    const list = byDay.get(r.day);
    if (list === undefined) byDay.set(r.day, [r]);
    else list.push(r);
  }

  const out: UseDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const on = byDay.get(day) ?? [];
    out.push({
      day,
      logins: on.reduce((n, r) => n + r.logins, 0),
      visits: on.reduce((n, r) => n + r.visits, 0),
      kitchens: new Set(on.map((r) => r.orgId)).size,
      people: new Set(on.map((r) => r.userId)).size,
    });
  }
  return out;
}

export interface UseSpan {
  readonly logins: number;
  readonly visits: number;
  /** Kitchens that appeared at all in the window. */
  readonly kitchens: number;
  /**
   * Kitchens that appeared on more than one day.
   *
   * The one number that separates a product people use from one people tried.
   * A signup that opened the book twice in a fortnight is a different account
   * from one that opened it eight times, and no total can tell them apart.
   */
  readonly cameBack: number;
  /** Days in the window on which nobody at all appeared. */
  readonly quietDays: number;
}

export function useOver(days: readonly UseDay[], rows: readonly Use[]): UseSpan {
  const within = new Set(days.map((d) => d.day));
  const seen = rows.filter((r) => within.has(r.day));

  const daysPerOrg = new Map<string, Set<string>>();
  for (const r of seen) {
    const had = daysPerOrg.get(r.orgId);
    if (had === undefined) daysPerOrg.set(r.orgId, new Set([r.day]));
    else had.add(r.day);
  }

  return {
    logins: days.reduce((n, d) => n + d.logins, 0),
    visits: days.reduce((n, d) => n + d.visits, 0),
    kitchens: daysPerOrg.size,
    cameBack: [...daysPerOrg.values()].filter((s) => s.size > 1).length,
    quietDays: days.filter((d) => d.visits === 0 && d.logins === 0).length,
  };
}

/**
 * Which person the caller is, and what that lets them do.
 *
 * These two rules were both promised in comments before either was written.
 * `proxy.ts` says its redirects are the gate a person meets while "RLS in
 * Postgres plus the checks in every server action remain the guarantee", and
 * the RLS migration says owner-only actions are "checked here AND again in the
 * server action". Neither check could be written while the book knew who was
 * on the account but not which of them was asking.
 */

import { describe, expect, it } from "vitest";

import { canDo, roleOf } from "./org";

/**
 * A book with two people on it, the owner first — which is what Postgres
 * returns often enough that reading position for identity looks correct in
 * development and is wrong for every manager in production.
 */
const ROWS = [
  { user_id: "owner-1", role: "owner" as const },
  { user_id: "manager-1", role: "manager" as const },
];

describe("roleOf", () => {
  it("gives the manager their own role, not the first row's", () => {
    // The regression. `members[0].role` answers "owner" here, and did, and
    // that is what afterSignIn used to route on.
    expect(roleOf(ROWS, "manager-1")).toBe("manager");
  });

  it("gives the owner theirs when they are not first", () => {
    expect(roleOf([...ROWS].reverse(), "owner-1")).toBe("owner");
  });

  it("does not depend on the order rows arrive in", () => {
    for (const rows of [ROWS, [...ROWS].reverse()]) {
      expect(roleOf(rows, "owner-1")).toBe("owner");
      expect(roleOf(rows, "manager-1")).toBe("manager");
    }
  });

  it("is null for a session on no row, not a manager", () => {
    // Someone removed from the book while they still had it open. Null may do
    // nothing; a manager may still cost a dish, which is the wrong answer for
    // somebody who is no longer here.
    expect(roleOf(ROWS, "removed-1")).toBeNull();
  });

  it("is null when nobody is signed in", () => {
    expect(roleOf(ROWS, null)).toBeNull();
  });

  it("is null on an empty book", () => {
    expect(roleOf([], "owner-1")).toBeNull();
  });
});

describe("canDo", () => {
  it("keeps a manager out of billing, the team and the costing model", () => {
    // A27: two roles only. These four are the owner's.
    for (const what of ["billing", "team", "costing", "charges"] as const) {
      expect(canDo("manager", what)).toBe(false);
      expect(canDo("owner", what)).toBe(true);
    }
  });

  it("lets a manager do the work they are on the book to do", () => {
    // FLOWS 9: "Manager can do everything except billing, user management and
    // deleting the organisation."
    for (const what of ["recipes", "rates"] as const) {
      expect(canDo("manager", what)).toBe(true);
      expect(canDo("owner", what)).toBe(true);
    }
  });

  it("gives the owner everything", () => {
    const every = [
      "costing",
      "charges",
      "billing",
      "team",
      "recipes",
      "rates",
    ] as const;
    expect(every.every((what) => canDo("owner", what))).toBe(true);
  });
});

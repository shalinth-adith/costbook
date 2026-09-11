import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Closing an account.
 *
 * The database is stood in for, because what needs proving is not that a
 * delete deletes — it is the ORDER. `mail_outbox.thread_id` is ON DELETE SET
 * NULL, so dropping the org first cascades the threads away and leaves the
 * outbox holding a person's address and the body of their support messages,
 * with nothing left pointing at them to say whose they were. That is exactly
 * the copy the privacy page promises not to keep, and the only thing standing
 * between it and a real account is two statements being in the right order.
 */

interface Row {
  [k: string]: unknown;
}

const db = {
  memberships: [] as Row[],
  support_threads: [] as Row[],
  mail_outbox: [] as Row[],
  organizations: [] as Row[],
  /** Everything that happened, in order, so the order can be asserted. */
  log: [] as string[],
  breaks: new Map<string, string>(),
  users: [] as string[],
};

/** Applies the org cascade the way Postgres would, once the row goes. */
function cascade(orgId: string) {
  db.support_threads = db.support_threads.filter((t) => t["org_id"] !== orgId);
  db.memberships = db.memberships.filter((m) => m["org_id"] !== orgId);
  // ON DELETE SET NULL, not cascade. This is the trap.
  for (const m of db.mail_outbox) m["thread_id"] = null;
}

class Q implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: [string, string, unknown][] = [];
  constructor(
    private table: string,
    private op: "select" | "delete",
  ) {}
  eq(c: string, v: unknown): this {
    this.filters.push([c, "eq", v]);
    return this;
  }
  in(c: string, v: unknown[]): this {
    this.filters.push([c, "in", v]);
    return this;
  }
  limit(): this {
    return this;
  }
  then<R1, R2 = never>(
    ok?: ((v: { data: unknown; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    bad?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.exec()).then(ok, bad);
  }
  private exec() {
    const broken = db.breaks.get(`${this.table}.${this.op}`);
    if (broken !== undefined) return { data: null, error: { message: broken } };

    const rows = (db as unknown as Record<string, Row[]>)[this.table] ?? [];
    const match = (r: Row) =>
      this.filters.every(([c, kind, v]) =>
        kind === "in" ? (v as unknown[]).includes(r[c]) : r[c] === v,
      );
    const hit = rows.filter(match);

    if (this.op === "select") {
      db.log.push(`select ${this.table}`);
      return { data: hit, error: null };
    }

    db.log.push(`delete ${this.table}`);
    (db as unknown as Record<string, Row[]>)[this.table] = rows.filter((r) => !match(r));
    if (this.table === "organizations") {
      for (const r of hit) cascade(r["id"] as string);
    }
    return { data: hit, error: null };
  }
}

const deleteUser = vi.fn(async (id: string) => {
  db.log.push(`deleteUser ${id}`);
  db.users = db.users.filter((u) => u !== id);
  return { error: null as { message: string } | null };
});

vi.mock("./supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => new Q(table, "select"),
      delete: () => new Q(table, "delete"),
    }),
    auth: { admin: { deleteUser } },
  }),
}));

const { eraseOrg } = await import("./erase");

const ORG = "org-a";

beforeEach(() => {
  db.memberships = [{ org_id: ORG, user_id: "u1" }];
  db.support_threads = [{ id: "t1", org_id: ORG }];
  db.mail_outbox = [
    { id: "m1", thread_id: "t1", to_email: "chef@kitchen.test", body: "your answer" },
  ];
  db.organizations = [{ id: ORG }];
  db.users = ["u1"];
  db.log = [];
  db.breaks.clear();
  deleteUser.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("what is left afterwards", () => {
  it("keeps no copy of a support conversation", async () => {
    /*
     * The whole point. Cascade the threads away first and these rows survive
     * with an address and a body and a null thread — unreachable, unowned,
     * and exactly what "we will not keep a copy" promises does not happen.
     */
    const res = await eraseOrg(ORG);
    expect(res.ok).toBe(true);
    expect(db.mail_outbox).toEqual([]);
  });

  it("clears the outbox BEFORE the org, because after is too late", async () => {
    await eraseOrg(ORG);
    const outbox = db.log.indexOf("delete mail_outbox");
    const org = db.log.indexOf("delete organizations");
    expect(outbox).toBeGreaterThan(-1);
    expect(org).toBeGreaterThan(-1);
    expect(outbox).toBeLessThan(org);
  });

  it("takes the book and everything hanging off it", async () => {
    await eraseOrg(ORG);
    expect(db.organizations).toEqual([]);
    expect(db.support_threads).toEqual([]);
    expect(db.memberships).toEqual([]);
  });

  it("removes the sign-in, so there is nothing left to sign in to", async () => {
    const res = await eraseOrg(ORG);
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(db.users).toEqual([]);
    expect(res).toEqual({ ok: true, signIns: 1 });
  });

  it("reads who the members were before the memberships are gone", async () => {
    await eraseOrg(ORG);
    expect(db.log.indexOf("select memberships")).toBeLessThan(
      db.log.indexOf("delete organizations"),
    );
  });
});

describe("what it refuses to take with it", () => {
  it("leaves a sign-in that still has another book", async () => {
    /*
     * One owner and no invitations today, so this never happens — and it is
     * written as a check rather than an assumption because the day it does,
     * closing one kitchen would otherwise lock somebody out of another, and
     * that arrives as a person unable to sign in with no idea why.
     */
    db.memberships.push({ org_id: "org-b", user_id: "u1" });
    const res = await eraseOrg(ORG);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(db.users).toEqual(["u1"]);
    expect(res).toEqual({ ok: true, signIns: 0 });
  });

  it("does not touch another book's outbox", async () => {
    db.mail_outbox.push({ id: "m2", thread_id: "t9", to_email: "other@kitchen.test" });
    await eraseOrg(ORG);
    expect(db.mail_outbox.map((m) => m["id"])).toEqual(["m2"]);
  });
});

describe("when it cannot finish", () => {
  it("stops before deleting anything if the members cannot be read", async () => {
    // Without the member list the sign-ins could never be removed, and a book
    // deleted with its sign-ins left behind is worse than one not deleted.
    db.breaks.set("memberships.select", "statement timeout");
    const res = await eraseOrg(ORG);
    expect(res).toEqual({ ok: false, message: "statement timeout" });
    expect(db.organizations).toHaveLength(1);
  });

  it("stops before the org if the outbox cannot be cleared", async () => {
    db.breaks.set("mail_outbox.delete", "connection lost");
    const res = await eraseOrg(ORG);
    expect(res.ok).toBe(false);
    // The book survives, so the conversation is still reachable and can be
    // cleared on a retry rather than orphaned for ever.
    expect(db.organizations).toHaveLength(1);
    expect(db.mail_outbox).toHaveLength(1);
  });

  it("reports a sign-in it could not remove, and still says the data went", async () => {
    deleteUser.mockResolvedValueOnce({ error: { message: "user not found" } });
    const res = await eraseOrg(ORG);
    // The part that was promised — the data — is gone. Re-creating the book
    // to undo a dangling sign-in would be worse than the dangling sign-in.
    expect(res).toEqual({ ok: true, signIns: 0 });
    expect(db.organizations).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

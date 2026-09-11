import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The three guards in front of an irreversible thing.
 *
 * The screen has its own — the button stays disabled until the name matches —
 * and the screen's guard is not the guard. A server action is a URL; anything
 * that can be called from a browser can be called without the browser, and a
 * check that only exists in a component is a check somebody can skip by
 * knowing that.
 */

const org = { id: "org-a" as string | null, name: "Dev Kitchen" };
const role = { value: "owner" };
const erase = vi.fn(async () => ({ ok: true as const, signIns: 1 }));
const signOut = vi.fn(async () => undefined);
const keyPresent = { value: true };

vi.mock("@/lib/book", () => ({
  book: async () => ({ orgId: org.id, org: { name: org.name } }),
  saveOrg: vi.fn(),
  orgModel: vi.fn(),
}));
vi.mock("@/lib/guard", () => ({
  requireRole: async (what: string) => {
    // The real one throws for a manager. What matters here is that the action
    // asks, and asks for the right thing.
    if (role.value !== "owner") throw new Error(`Only the owner can change ${what}.`);
    return role.value;
  },
}));
vi.mock("@/lib/erase", () => ({ eraseOrg: erase }));
vi.mock("@/lib/supabase/admin", () => ({ serviceKeyPresent: () => keyPresent.value }));
vi.mock("@/app/sign-up/actions", () => ({ signOut }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

class Redirected extends Error {
  constructor(readonly to: string) {
    super("NEXT_REDIRECT");
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

const { closeAccount } = await import("@/app/settings/actions");

/** Where it went, or what it refused with. */
async function close(typed: string) {
  try {
    const refused = await closeAccount(typed);
    return { to: null as string | null, message: refused.message };
  } catch (e) {
    if (e instanceof Redirected) return { to: e.to, message: null };
    throw e;
  }
}

beforeEach(() => {
  org.id = "org-a";
  org.name = "Dev Kitchen";
  role.value = "owner";
  keyPresent.value = true;
  erase.mockClear();
  erase.mockResolvedValue({ ok: true, signIns: 1 });
  signOut.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("when it goes through", () => {
  it("erases, signs out, and lands somewhere that explains itself", async () => {
    expect(await close("Dev Kitchen")).toEqual({ to: "/gone", message: null });
    expect(erase).toHaveBeenCalledWith("org-a");
    expect(signOut).toHaveBeenCalled();
  });

  it("forgives case and surrounding space, which are not the point", async () => {
    // This is a guard against an accidental press, not a password. Making
    // somebody match trailing whitespace teaches nothing.
    expect((await close("  dev kitchen  ")).to).toBe("/gone");
    expect(erase).toHaveBeenCalledWith("org-a");
  });

  it("signs out after erasing, never before", async () => {
    // The session is what proves who was allowed to do this. Dropping it
    // first would leave the last steps running for nobody.
    const order: string[] = [];
    erase.mockImplementation(async () => {
      order.push("erase");
      return { ok: true, signIns: 1 };
    });
    signOut.mockImplementation(async () => {
      order.push("signOut");
    });
    await close("Dev Kitchen");
    expect(order).toEqual(["erase", "signOut"]);
  });
});

describe("what it refuses, and deletes nothing doing it", () => {
  it("refuses a name that does not match, and says which name it wants", async () => {
    const res = await close("dev kitchn");
    expect(res.to).toBeNull();
    expect(res.message).toContain("Dev Kitchen");
    expect(res.message).toContain("Nothing has been deleted");
    expect(erase).not.toHaveBeenCalled();
  });

  it("refuses an empty confirmation", async () => {
    expect((await close("")).to).toBeNull();
    expect(erase).not.toHaveBeenCalled();
  });

  it("refuses a manager, before anything else is considered", async () => {
    /*
     * `requireRole` throws, which is right: a manager reaching this is not a
     * mistake to explain gently, and the gate above it should never have
     * shown them the control.
     */
    role.value = "manager";
    await expect(closeAccount("Dev Kitchen")).rejects.toThrow(/Only the owner/);
    expect(erase).not.toHaveBeenCalled();
  });

  it("refuses rather than lying when it has no key to delete with", async () => {
    /*
     * The worst available outcome is telling somebody their account is gone
     * while every row of it is still there. Without the secret key nothing
     * can be written at all, so this says so — and says it in the log too,
     * because an owner being told to write in is a thing worth knowing about.
     */
    keyPresent.value = false;
    const res = await close("Dev Kitchen");
    expect(res.to).toBeNull();
    expect(res.message).toContain("Nothing has been deleted");
    expect(erase).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("does not sign anybody out when the erase itself failed", async () => {
    // Their book is as it was, so their session should be too — signing them
    // out of an account that still exists is a second fault on top of the
    // first.
    erase.mockResolvedValue({ ok: false, message: "connection lost" } as never);
    const res = await close("Dev Kitchen");
    expect(res.to).toBeNull();
    expect(res.message).toContain("your book is as it was");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("refuses when there is no account signed in", async () => {
    org.id = null;
    expect((await close("Dev Kitchen")).to).toBeNull();
    expect(erase).not.toHaveBeenCalled();
  });
});

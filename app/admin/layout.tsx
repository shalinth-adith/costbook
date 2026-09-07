import Link from "next/link";

import { AdminNav } from "@/components/admin-nav";
import { recentErrors, requireAdmin, threads } from "@/lib/admin";
import { outbox } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * The shell every back-office screen sits in.
 *
 * It was five pages each carrying its own header and a row of text links, and
 * the row was the problem: nothing on it said whether anything was waiting, so
 * the only way to find out was to open all five. A console you have to tour to
 * read is a console nobody opens.
 *
 * The rail carries the counts. Two people waiting on a reply, three letters
 * unsent, one fault nobody has looked at — visible from any screen, without
 * leaving the one you are on. That is the whole point of a back office: it
 * should tell you what needs you before you go looking.
 *
 * The gate lives here too, once, rather than at the top of every page.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  const [support, faults, letters] = await Promise.all([
    threads(),
    recentErrors(80),
    outbox(80),
  ]);

  const counts = {
    support: support.filter((t) => t.status === "open").length,
    mail: letters.filter((l) => l.sentAt === null).length,
    health: faults.filter((f) => !f.seen).length,
  };

  return (
    <div className="ba">
      <aside className="ba-rail">
        <Link href="/admin" className="ba-mark">
          <span className="ba-mark-name">Costbook</span>
          <span className="ba-mark-said">Back office</span>
        </Link>

        <AdminNav counts={counts} />

        <div className="ba-rail-foot">
          <Link href="/dashboard" className="ba-out">
            Your own book →
          </Link>
        </div>
      </aside>

      <main className="ba-main">{children}</main>
    </div>
  );
}

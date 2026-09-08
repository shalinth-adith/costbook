import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminEmpty } from '@/components/admin-empty';
import { AdminHead } from '@/components/admin-head';
import { accounts } from '@/lib/admin';

export const metadata: Metadata = { title: 'Accounts · Costbook' };
export const dynamic = 'force-dynamic';

/**
 * Every kitchen, one to a row.
 *
 * Sorted newest first, because the question asked most often of this screen
 * is "who just joined and did they get anywhere". What each row carries is
 * the shape of that account's use — dishes, ingredients, whether a sheet came
 * in, when a rate last moved — and never a figure from inside their book. The
 * console reports on accounts; it does not read a kitchen's costings.
 */
export default async function AdminAccounts() {
  const rows = await accounts();

  const when = (at: string | null) => {
    if (at === null) return '—';
    const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${String(days)}d ago`;
    return `${String(Math.floor(days / 30))}mo ago`;
  };

  return (
    <div className="bo">
      <AdminHead
        section="Accounts"
        title="Accounts"
        lede="Every kitchen, one to a row. What a row shows is the shape of an account, never a figure from inside its book."
        aside={
          <span className="ba-count">
            <b className="figure">{rows.length}</b> {rows.length === 1 ? 'kitchen' : 'kitchens'}
          </span>
        }
      />

      <section className="bo-block bo-wide">
        <div className="bo-block-head">
          <h2 className="bo-h2">Newest first</h2>
          <span className="bo-h2-meta">Recipes include batches: ten dishes and a gravy read 11</span>
        </div>

        {rows.length === 0 ? (
          <AdminEmpty
            title="No accounts yet"
            said="Or migration 25 has not been applied, in which case the database is refusing to answer rather than reporting nothing."
            would="somebody finishes sign-up."
          />
        ) : (
          <div className="bo-table-wrap">
            <table className="bo-table">
              <thead>
                <tr>
                  <th>Kitchen</th>
                  <th>Owner</th>
                  {/* Recipes, not dishes: the count includes batches, so a
                      book of ten dishes and one gravy reads 11. */}
                  <th className="end">Recipes</th>
                  <th className="end">Ingredients</th>
                  <th className="end">Sheets in</th>
                  <th className="end">Rate last moved</th>
                  <th>Plan</th>
                  <th className="end">Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.orgId} data-idle={r.lastRateAt === null}>
                    <td>
                      <span className="bo-name">{r.name}</span>
                      {!r.setupDone && <span className="bo-tag">setup unfinished</span>}
                    </td>
                    <td className="bo-dim">{r.ownerEmail ?? '—'}</td>
                    <td className="figure end">{r.recipes}</td>
                    <td className="figure end">{r.ingredients}</td>
                    <td className="figure end">{r.imports === 0 ? '—' : r.imports}</td>
                    <td className="figure end bo-dim">{when(r.lastRateAt)}</td>
                    <td>
                      <span className={`bo-plan is-${r.plan === 'free' ? 'free' : 'paid'}`}>
                        {r.plan === 'free' ? 'free' : r.status}
                      </span>
                    </td>
                    <td className="figure end bo-dim">{when(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminEmpty } from '@/components/admin-empty';
import { AdminHead } from '@/components/admin-head';
import { recentErrors } from '@/lib/admin';

export const metadata: Metadata = { title: 'Health · Costbook' };
export const dynamic = 'force-dynamic';

/**
 * What broke.
 *
 * Until migration 25 there was nowhere to write a failure down, so the honest
 * answer to "is it crashing" was "we would not know" — the error boundary
 * showed a person a sentence and told nobody. Every row here is a fault
 * somebody actually hit.
 *
 * A row carries where and what, never a payload. A rate, a dish name or an
 * address inside an error message is a kitchen's data sitting outside its own
 * account with none of the rules that protect it.
 */
export default async function AdminHealth() {
  const errors = await recentErrors(60);
  const unseen = errors.filter((e) => !e.seen);

  return (
    <div className="bo">
      <AdminHead
        section="Health"
        title="Health"
        lede="What broke. Every row is a fault somebody actually hit — where and what, never a payload."
        aside={
          unseen.length > 0 ? (
            <span className="ba-count is-over">
              <b className="figure">{unseen.length}</b> not looked at
            </span>
          ) : null
        }
      />

      <section className="bo-block bo-wide">
        {errors.length === 0 ? (
          <AdminEmpty
            title="Nothing has been reported"
            said="Either a quiet week, or a reporter that is not wired up. Faults are written by the error boundary and by the server actions that would otherwise swallow one."
            would="a page or an action fails for somebody."
          />
        ) : (
          <>
            <p className="bo-lede">
              <b className="figure">{unseen.length}</b> of{' '}
              <b className="figure">{errors.length}</b> not looked at yet, newest
              first.
            </p>
            <ul className="bo-errors">
              {errors.map((e) => (
                <li key={e.id} className={`bo-error${e.seen ? ' is-seen' : ''}`}>
                  <span className="figure bo-error-when">
                    {new Date(e.at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="figure bo-error-where">{e.where}</span>
                  <span className="bo-error-msg">{e.message}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

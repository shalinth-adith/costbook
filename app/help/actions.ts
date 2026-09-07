'use server';

import { revalidatePath } from 'next/cache';

import { book } from '@/lib/book';
import { requireRole } from '@/lib/guard';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

export interface Ack {
  readonly message: string;
  readonly ok: boolean;
}

/**
 * Open a thread, or add to one.
 *
 * The contact page keeps its address and no form — its own comment says a
 * form is a way of not giving somebody one, and for a stranger who cannot
 * sign in that address is the only door. This is the second door, for an
 * operator already inside, and it exists because a reply has to reach them:
 * there is no mail provider, so the answer is read the next time they open
 * Costbook. The same reasoning as `flags`.
 */
export async function askForHelp(subject: string, body: string): Promise<Ack> {
  await requireRole('recipes');
  const said = subject.trim();
  const text = body.trim();
  if (said === '' || text === '') {
    return { ok: false, message: 'A subject and a sentence, and we will read it.' };
  }
  if (!supabaseConfigured()) return { ok: false, message: 'Not connected to an account.' };

  const b = await book();
  if (b.orgId === null) return { ok: false, message: 'Sign in again and it will send.' };
  const supabase = await supabaseServer();

  /*
   * The address, captured now rather than looked up later.
   *
   * The operator who writes may not be the owner and may have left the
   * account by the time we answer, and `auth.users` is not readable from a
   * client — so it is recorded at the one moment it is certainly known and
   * certainly theirs.
   */
  const { data: who } = await supabase.auth.getUser();
  const replyTo = who.user?.email ?? null;

  const opened = await supabase
    .from('support_threads')
    .insert({
      org_id: b.orgId,
      opened_by: b.userId,
      subject: said.slice(0, 160),
      reply_to: replyTo,
    })
    .select('id')
    .limit(1);
  if (opened.error !== null) {
    return { ok: false, message: `Nothing was sent. ${opened.error.message}` };
  }

  const id = ((opened.data ?? [])[0] as { id: string } | undefined)?.id;
  if (id === undefined) return { ok: false, message: 'Nothing was sent, and Costbook cannot say why.' };

  const wrote = await supabase
    .from('support_messages')
    .insert({ thread_id: id, from_admin: false, wrote_by: b.userId, body: text.slice(0, 4000) });
  if (wrote.error !== null) {
    return { ok: false, message: `Nothing was sent. ${wrote.error.message}` };
  }

  revalidatePath('/help');
  return { ok: true, message: 'Sent. The reply appears here, and we usually answer within a day.' };
}

/** Add a line to a thread already open. */
export async function replyFromKitchen(threadId: string, body: string): Promise<Ack> {
  await requireRole('recipes');
  const text = body.trim();
  if (text === '') return { ok: false, message: 'Nothing to send.' };
  if (!supabaseConfigured()) return { ok: false, message: 'Not connected to an account.' };

  const b = await book();
  const supabase = await supabaseServer();
  const wrote = await supabase
    .from('support_messages')
    .insert({ thread_id: threadId, from_admin: false, wrote_by: b.userId, body: text.slice(0, 4000) });
  if (wrote.error !== null) return { ok: false, message: `Nothing was sent. ${wrote.error.message}` };

  // Back to waiting: a kitchen that adds to a thread is asking again.
  await supabase
    .from('support_threads')
    .update({ status: 'open', last_at: new Date().toISOString() })
    .eq('id', threadId);

  revalidatePath('/help');
  return { ok: true, message: 'Sent.' };
}

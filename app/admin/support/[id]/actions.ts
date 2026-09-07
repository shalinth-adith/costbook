'use server';

import { revalidatePath } from 'next/cache';

import { isAdmin } from '@/lib/admin';
import { queueMail } from '@/lib/mail';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Answer a kitchen.
 *
 * The reply lands in the product, on their Help screen. There is no mail
 * provider, and a reply that cannot reach anybody is not a reply — so this
 * writes where they will actually read it, the way a flag on a dish does.
 *
 * `from_admin = true` is set here and refused everywhere else: migration 25's
 * policy lets a kitchen insert only its own messages with `from_admin` false,
 * so nobody can write a line that claims to be from us.
 */
export async function replyToThread(
  threadId: string,
  body: string,
): Promise<{ readonly ok: boolean; readonly message: string }> {
  if (!(await isAdmin())) return { ok: false, message: 'Not yours to answer.' };
  const text = body.trim();
  if (text === '') return { ok: false, message: 'Nothing to send.' };
  if (!supabaseConfigured()) return { ok: false, message: 'Not connected.' };

  const supabase = await supabaseServer();
  const wrote = await supabase
    .from('support_messages')
    .insert({ thread_id: threadId, from_admin: true, body: text.slice(0, 4000) });
  if (wrote.error !== null) return { ok: false, message: wrote.error.message };

  await supabase
    .from('support_threads')
    .update({ status: 'answered', last_at: new Date().toISOString() })
    .eq('id', threadId);

  /*
   * And written to the outbox, addressed and dated now.
   *
   * The reply is already delivered — it is on their Help screen. This is the
   * second copy, for the day there is a provider: it posts then, carrying the
   * date it was written rather than the date it was finally sent, so nobody
   * is told "we replied today" about a thread a week old.
   */
  const thread = await supabase
    .from('support_threads')
    .select('subject, reply_to')
    .eq('id', threadId)
    .limit(1);
  const t = ((thread.data ?? [])[0] as { subject: string; reply_to: string | null } | undefined);

  let posted = 'It is on their Help screen now.';
  if (t !== undefined && t.reply_to !== null) {
    const mail = await queueMail({
      to: t.reply_to,
      subject: `Re: ${t.subject}`,
      body: `${text}\n\n—\nYou can reply on your Help screen in Costbook.`,
      threadId,
    });
    posted = mail.ok ? mail.message : `The mail was not written down: ${mail.message}`;
  } else {
    posted = 'No address on that thread, so nothing was queued to post.';
  }

  revalidatePath('/admin/support');
  revalidatePath('/admin/mail');
  return { ok: true, message: `Replied. ${posted}` };
}

/** Nothing more to say on this one. */
export async function closeThread(
  threadId: string,
): Promise<{ readonly ok: boolean; readonly message: string }> {
  if (!(await isAdmin())) return { ok: false, message: 'Not yours to close.' };
  if (!supabaseConfigured()) return { ok: false, message: 'Not connected.' };
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('support_threads')
    .update({ status: 'closed' })
    .eq('id', threadId);
  if (error !== null) return { ok: false, message: error.message };
  revalidatePath('/admin/support');
  return { ok: true, message: 'Closed.' };
}

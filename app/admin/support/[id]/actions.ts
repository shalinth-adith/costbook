'use server';

import { revalidatePath } from 'next/cache';

import { isAdmin } from '@/lib/admin';
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

  revalidatePath('/admin/support');
  return { ok: true, message: 'Sent. They see it next time they open Costbook.' };
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

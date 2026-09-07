'use server';

import { revalidatePath } from 'next/cache';

import { isAdmin } from '@/lib/admin';
import { mailConfigured, sendQueued } from '@/lib/mail';

/**
 * Post what is waiting.
 *
 * By hand rather than on a timer, because until there is a provider there is
 * nothing to run and a background job that does nothing is a thing to forget
 * about. Once mail is switched on this is the button that clears the backlog;
 * a schedule can come after, when there is something worth scheduling.
 */
export async function postQueued(): Promise<{ readonly message: string }> {
  if (!(await isAdmin())) return { message: 'Not yours to send.' };
  if (!mailConfigured()) {
    return {
      message:
        'No mail provider yet. Set RESEND_API_KEY and MAIL_FROM, restart, and press this again — everything waiting goes out in the order it was written.',
    };
  }

  const out = await sendQueued(50);
  revalidatePath('/admin/mail');
  if (out.sent === 0 && out.failed === 0) return { message: 'Nothing was waiting.' };
  return {
    message:
      out.failed === 0
        ? `${String(out.sent)} sent.`
        : `${String(out.sent)} sent, ${String(out.failed)} refused — the reason is on each row, and they will be tried again.`,
  };
}

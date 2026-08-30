'use server';

import { redirect } from 'next/navigation';

import { MIN_PASSWORD } from '@/components/entry-shell';
import { emailFault } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

export type SignUpState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'fields'; readonly message: string; readonly field: 'email' | 'password' }
  /**
   * A31: the same sentence whether the address has an account or not, so the
   * form cannot be used to find out who does.
   */
  | { readonly kind: 'exists' }
  | { readonly kind: 'sent'; readonly email: string }
  | { readonly kind: 'failed'; readonly message: string };

export const SIGNUP_IDLE: SignUpState = { kind: 'idle' };

/**
 * Create the account.
 *
 * Two fields, because business name is step 1 of the wizard and asking here
 * would ask twice. The organisation, its outlet and the owner membership are
 * created by a trigger on auth.users, so an account cannot exist without the
 * membership that makes it able to see anything.
 */
export async function createAccount(email: string, password: string): Promise<SignUpState> {
  const shape = emailFault(email);
  if (shape !== null) return { kind: 'fields', message: shape.message, field: 'email' };

  if (password.length < MIN_PASSWORD) {
    return {
      kind: 'fields',
      field: 'password',
      message: `${MIN_PASSWORD} characters or more. Nothing else.`,
    };
  }

  if (!supabaseConfigured()) return { kind: 'sent', email };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error !== null) {
    const message = error.message.toLowerCase();
    if (message.includes('already') || message.includes('registered')) return { kind: 'exists' };
    return { kind: 'failed', message: error.message };
  }

  // Email confirmation is off, so a session arrives with the account and the
  // next stop is the four questions.
  if (data.session !== null) redirect('/setup');

  return { kind: 'sent', email };
}

/** Sign out. The book stays; the session does not. */
export async function signOut(): Promise<void> {
  if (supabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  redirect('/sign-in');
}

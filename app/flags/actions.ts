'use server';

import { revalidatePath } from 'next/cache';

import { book } from '@/lib/book';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

export interface FlagAck {
  readonly message: string;
  readonly ok: boolean;
}

/**
 * A chef says something about a dish (A40).
 *
 * The figures attach themselves — a chef never retypes a number — and the note
 * is one optional line for the thing only a person knows. "Mutton went up again
 * on Tuesday" is the whole reason the feature exists; everything else on the
 * card, Costbook already knew.
 */
export async function raiseFlag(input: {
  readonly recipeId: string;
  readonly note: string;
  readonly cost: number | null;
  readonly price: number | null;
  readonly foodCost: number | null;
  readonly target: number;
}): Promise<FlagAck> {
  const b = await book();
  if (b.orgId === null) return { ok: false, message: 'Sign in first.' };

  // Named, because a message to a role is a message to nobody.
  const owner = b.members.find((m) => m.role === 'owner');
  const to = owner?.name ?? 'the owner';

  if (!supabaseConfigured()) return { ok: true, message: `${to} has it.` };

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  /*
   * By id, which is what identity is. Matching on email worked only because
   * `book()` fills that field in for the caller alone and leaves every other
   * member's blank — so an operator whose own email had not been read back
   * yet matched the first member with an empty address instead of themselves.
   */
  const me = b.members.find((m) => m.id === b.userId);

  const { error } = await supabase.from('flags').insert({
    org_id: b.orgId,
    recipe_id: input.recipeId,
    sent_by: auth.user?.id ?? null,
    sent_by_name: me?.name ?? 'Someone in the kitchen',
    note: input.note.trim() === '' ? null : input.note.trim(),
    cost: input.cost,
    price: input.price,
    food_cost: input.foodCost,
    target: input.target,
  });

  if (error !== null) return { ok: false, message: `That did not send. ${error.message}` };

  revalidatePath('/', 'layout');
  return { ok: true, message: `${to} has it.` };
}

/** The owner has read it. Only the person it was sent to can say so. */
export async function markSeen(id: string): Promise<FlagAck> {
  if (!supabaseConfigured()) return { ok: true, message: 'Marked seen.' };

  const supabase = await supabaseServer();
  const now = new Date().toISOString();
  const { error } = await supabase.from('flags').update({ seen_at: now, opened_at: now }).eq('id', id);

  if (error !== null) return { ok: false, message: error.message };

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Marked seen.' };
}

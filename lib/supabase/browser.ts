'use client';

import { createBrowserClient } from '@supabase/ssr';

import { supabaseEnv } from './env';

/**
 * The client for client components.
 *
 * Costbook does almost no client-side data access on purpose — costing happens
 * on the server, where `core/` is the authority. This exists for the two
 * things that genuinely belong in the browser: signing in, and noticing when
 * the session changes underneath an open tab.
 */
export function supabaseBrowser() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient(url, anonKey);
}

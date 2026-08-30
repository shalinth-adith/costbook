import { cookies } from 'next/headers';

import { createServerClient } from '@supabase/ssr';

import { supabaseEnv } from './env';

/**
 * The client for server components, server actions and route handlers.
 *
 * A new one per request, never a module-level singleton: it carries the
 * caller's session, and a shared instance would hand one operator's cookies to
 * the next request. Here that would mean showing one café's rates to another,
 * and RLS would then be blamed for not stopping what it never saw.
 *
 * `cookies()` is awaited — that is Next 16, not an oversight.
 */
export async function supabaseServer() {
  const { url, anonKey } = supabaseEnv();
  const jar = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) jar.set(name, value, options);
        } catch {
          // A server component cannot set cookies. Harmless: proxy.ts refreshes
          // the session on every request, so the write lands there instead.
        }
      },
    },
  });
}

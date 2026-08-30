import { NextResponse, type NextRequest } from 'next/server';

import { createServerClient } from '@supabase/ssr';

import { supabaseConfigured } from '@/lib/supabase/env';

/**
 * Session refresh, on every request that matters.
 *
 * Named `proxy.ts` rather than `middleware.ts`: Next 16 renamed the convention.
 * Every Supabase guide still says middleware, which is why this comment exists.
 *
 * Its whole job is to call `getUser()`, which refreshes an expiring token and
 * writes the rotated cookie onto the response. Server components cannot set
 * cookies, so without this an operator is silently signed out mid-session and
 * blames the product for losing their work.
 *
 * It does NOT authorise. Per the Next docs, proxy is for optimistic checks —
 * the real gate is RLS in Postgres and a re-check in every server action,
 * because a redirect here is a suggestion and a policy there is a guarantee.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Until the project is wired up the app runs on the in-memory store. Doing
  // nothing here keeps that path working rather than throwing on every route.
  if (!supabaseConfigured()) return response;

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be getUser, not getSession: getSession trusts the cookie as it stands,
  // which is exactly the thing being verified here.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  /*
   * Everything except static assets. Without a matcher this runs on every
   * request including _next/static and public/, and auth logic that blocks a
   * stylesheet is a very confusing bug to look at.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)'],
};

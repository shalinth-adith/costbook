import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { gateFor, isPublic } from "@/lib/landing";
import { supabaseConfigured } from "@/lib/supabase/env";

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
 * It also holds the one rule table that decides who may reach what. The Next
 * docs are explicit that proxy "can be helpful for optimistic checks such as
 * permission-based redirects" but must not be the whole authorization story —
 * so the redirects here are the gate a person meets, and RLS in Postgres plus
 * the checks in every server action remain the guarantee. A redirect is a
 * suggestion; a policy on the table is not.
 *
 *   signed out              -> the public paths, else /sign-in?next=<path>
 *   signed in, setup open   -> /setup, and nothing else
 *   signed in, setup done   -> everything, and /setup sends them home
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Until the project is wired up the app runs on the in-memory store. Doing
  // nothing here keeps that path working rather than throwing on every route.
  if (!supabaseConfigured()) return response;

  const supabase = createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "",
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
  const { data: auth } = await supabase.auth.getUser();
  const signedIn = auth.user !== null;

  const path = request.nextUrl.pathname;

  /*
   * The lookup runs only for someone asking for a screen inside the product.
   *
   * The landing page, the legal pages, the four auth screens and the route
   * handlers need no role and no setup state, and between them they are most
   * of the traffic from anyone who is not signed in. Turning a stranger away
   * needs nothing either — there is no account to ask about yet.
   */
  const asking = signedIn && !isPublic(path) && !path.startsWith('/api/');

  /*
   * One indexed lookup, and it answers both questions at once.
   *
   * `memberships` is indexed on user_id and joins straight to the row carrying
   * setup_done, so role and setup state arrive together. RLS makes this safe to
   * run with the anon key: it returns the caller's own membership or nothing.
   */
  const membership = asking
    ? (
        await supabase
          .from('memberships')
          .select('role, organizations(setup_done)')
          .limit(1)
          .maybeSingle()
      ).data
    : null;

  const org = membership?.organizations as { setup_done?: boolean } | null | undefined;

  const to = gateFor(
    {
      signedIn,
      setupDone: org?.setup_done === true,
      role: membership?.role === 'owner' ? 'owner' : 'manager',
    },
    path,
    request.nextUrl.search,
  );

  if (to === null) return response;

  /*
   * The refreshed cookies travel with the redirect.
   *
   * `setAll` above writes any rotated token onto `response`, and this returned
   * a brand new response instead — so a refresh that happened to land on a
   * redirect (an unfinished account asking for any page, a finished one asking
   * for /setup) left the browser holding a refresh token the server had
   * already spent. The next request signed them out, for no reason they could
   * see, which is the exact failure this file exists to prevent.
   */
  const bounce = NextResponse.redirect(new URL(to, request.url));
  for (const cookie of response.cookies.getAll()) bounce.cookies.set(cookie);
  return bounce;
}

export const config = {
  /*
   * Everything except static assets. Without a matcher this runs on every
   * request including _next/static and public/, and auth logic that blocks a
   * stylesheet is a very confusing bug to look at.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};

import { NextResponse } from "next/server";

import { afterSignIn } from "@/lib/after-auth";
import { safeNext } from "@/lib/landing";
import { confirmType, landingAfterConfirm } from "@/lib/recover";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Where every link Costbook posts comes back to.
 *
 * One handler for both flows — confirming an address and recovering a
 * password — because they differ in one thing only: where the person lands
 * once the link has been spent. Two handlers would be two copies of the same
 * careful part.
 *
 * IT ACCEPTS BOTH SHAPES OF LINK, and that is deliberate rather than
 * defensive. `@supabase/ssr` creates its server client with `flowType: "pkce"`
 * (see node_modules/@supabase/ssr — it is not configurable from here), so
 * Supabase's own templates send `?code=`, which is exchanged for a session
 * using a verifier cookie set when the link was requested. A project whose
 * templates have been customised to `{{ .TokenHash }}` sends `token_hash` and
 * `type` instead, which is verified directly. Supporting only the first would
 * break the day somebody edits a template; only the second would require them
 * to edit one before anything worked at all.
 *
 * A ROUTE HANDLER, NOT A PAGE, because this is where the session cookie is
 * written and a server component cannot write cookies. It is exempt from the
 * gate in lib/landing.ts by being under /auth, which is public — a link
 * arriving from somebody's inbox has no session yet, and bouncing it to
 * /sign-in would strand the one person it was sent to.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const wanted = safeNext(url.searchParams.get("next"));

  const fail = (): Response =>
    NextResponse.redirect(new URL("/sign-in?link=spent", request.url));

  if (!supabaseConfigured()) return fail();

  const supabase = await supabaseServer();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = confirmType(url.searchParams.get("type"));

  if (code !== null && code !== "") {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error !== null) return fail();
    /*
     * The PKCE link carries no type, so the destination has to travel with
     * the link. `safeNext` has already refused anything that is not a path on
     * this site — the redirect is a browser following an instruction that
     * arrived on a URL somebody else may have written.
     */
    return NextResponse.redirect(
      new URL(wanted ?? (await afterSignIn(null)), request.url),
    );
  }

  if (tokenHash !== null && tokenHash !== "" && type !== null) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error !== null) return fail();
    const home = landingAfterConfirm(type) ?? wanted ?? (await afterSignIn(null));
    return NextResponse.redirect(new URL(home, request.url));
  }

  return fail();
}

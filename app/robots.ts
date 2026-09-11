import type { MetadataRoute } from "next";

import { PUBLIC_PATHS, UNLISTED } from "@/lib/landing";

/**
 * What a crawler may look at.
 *
 * Only the pages a stranger can already reach. Everything else is behind the
 * gate and would answer a crawler with a redirect to the sign-in screen, which
 * is a worse thing to have indexed than nothing.
 *
 * This file exists because the gate was turning `/robots.txt` itself away:
 * the landing page could not be crawled, because the file saying so was
 * behind a login.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      /*
       * Taken from the gate rather than written out again.
       *
       * This was a third hand-kept copy of the same list, and like the sitemap
       * it had already drifted: /about and /subprocessors were reachable
       * signed out and absent from here. Three lists of one fact is three
       * chances to forget. There is one now, in lib/landing.ts, and adding a
       * page to it is the whole job.
       */
      allow: PUBLIC_PATHS.filter((p) => !UNLISTED.includes(p)),
      disallow: [
        "/dashboard",
        "/recipes",
        "/ingredients",
        "/import",
        "/settings",
        "/setup",
        "/plans",
        "/api/",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

/**
 * Where this deployment answers.
 *
 * Set NEXT_PUBLIC_SITE_URL where it is deployed. The fallback is the local
 * server, which is wrong in production and obviously so — better than a
 * confident guess at somebody's domain.
 */
export function siteUrl(): string {
  return process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";
}

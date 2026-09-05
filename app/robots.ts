import type { MetadataRoute } from "next";

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
      allow: ["/", "/sign-in", "/sign-up", "/privacy", "/terms", "/contact"],
      disallow: [
        "/dashboard",
        "/recipes",
        "/ingredients",
        "/import",
        "/settings",
        "/setup",
        "/plans",
        "/place",
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

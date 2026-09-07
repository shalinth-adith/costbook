import type { Metadata } from "next";

import { AboutView } from "@/components/about-view";

export const metadata: Metadata = {
  title: "About · Costbook",
  description:
    "Why Costbook exists, what it does, and what it deliberately does not do.",
};

/**
 * The page behind the wordmark. The content lives in `AboutView`; this holds
 * the metadata, which a client component cannot export.
 */
export default function AboutPage() {
  return <AboutView />;
}

'use client';

import type {} from 'react/canary';
import { ViewTransition } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Every route change arrives rather than snaps.
 *
 * Route navigations are React transitions in the App Router, so a
 * `<ViewTransition>` keyed by the path treats the old page and the new one as
 * an exit/enter pair and hands them to the browser's View Transitions API.
 * The motion itself is CSS — a short fade with a small rise — on the `page`
 * name (see "page-to-page" in app.css). The top bar is named separately and
 * told not to move, so the content changes under a fixed anchor.
 *
 * Without browser support nothing animates and nothing breaks. Reduced
 * motion turns it off in CSS.
 */
export function PageMotion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} name="page" share="page" enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  );
}

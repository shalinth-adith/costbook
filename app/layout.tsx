import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Libre_Franklin, Spline_Sans_Mono } from 'next/font/google';

import { siteUrl } from './robots';

import './tokens.css';
import './app.css';

/**
 * Libre Franklin for everything that is words: a grotesque with wide apertures
 * and unambiguous 1 / l / I, which matters when a chef reads a quantity off a
 * tablet at arm's length. Weights 400, 500, 600 only.
 */
/**
 * The face for the one figure a screen is about. Tight, wide, alive: it is
 * never used for a sentence, and a sentence is never set in it.
 */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Libre_Franklin({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

/** Every figure, code and unit. Never prose. */
const mono = Spline_Sans_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  // Every relative URL in a page's metadata — the canonical, the social
  // card — resolves against this. Without it Next warns and guesses.
  metadataBase: new URL(siteUrl()),
  title: 'Costbook',
  description: 'Know what every plate costs you, and what to charge for it.',
};

/** The colour a phone paints its own chrome while this is open. */
export const viewport: Viewport = {
  themeColor: '#0F1219',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}

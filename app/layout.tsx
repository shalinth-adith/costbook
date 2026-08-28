import type { Metadata } from 'next';
import { Libre_Franklin, Spline_Sans_Mono } from 'next/font/google';

import './tokens.css';
import './app.css';

/**
 * Libre Franklin for everything that is words: a grotesque with wide apertures
 * and unambiguous 1 / l / I, which matters when a chef reads a quantity off a
 * tablet at arm's length. Weights 400, 500, 600 only.
 */
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
  title: 'Costbook',
  description: 'Know what every plate costs you, and what to charge for it.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

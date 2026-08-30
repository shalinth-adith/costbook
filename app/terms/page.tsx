import type { Metadata } from 'next';

import { LegalPage } from '@/components/legal-page';

import '../legal.css';

export const metadata: Metadata = { title: 'Terms · Costbook' };

export default function Terms() {
  return (
    <LegalPage
      title="Terms"
      changed="12 August 2026"
      sections={[
        {
          h: 'What we do',
          p: 'Costbook works out what your dishes cost from the rates and quantities you give us, and suggests prices from the target you set. The arithmetic is shown in full on every figure so you can check it.',
        },
        {
          h: "What we don't do",
          p: 'We are not your accountant and this is not tax advice. A suggested price is a suggestion — what you charge, what you declare and what you owe are yours. If a rate you entered is wrong, every figure built on it is wrong, and that one is on the rate rather than on us.',
        },
        {
          h: 'Paying and stopping',
          p: 'The paid tier is monthly and cancels in the product, in the Billing tab, with no email required. Cancel and you keep everything you costed — it stays readable, printable and exportable on the free tier. Nothing is deleted for not paying.',
        },
        {
          h: 'Your data, your account',
          p: "Your recipes and rates belong to you; the software belongs to us. Don't resell access or scrape the product, and we won't lock your own numbers away from you.",
        },
        {
          h: 'If we change these',
          p: "We'll email you thirty days before anything that matters changes, and say what changed in one sentence at the top of this page.",
        },
      ]}
    />
  );
}

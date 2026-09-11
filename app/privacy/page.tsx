import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage } from '@/components/legal-page';

import '../legal.css';

export const metadata: Metadata = { title: 'Privacy · Costbook' };

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      changed="12 August 2026"
      note="Written in plain words on purpose."
      summary="We hold your account and the recipes you put in it, and nothing else. Your rates are never pooled, sold, or used to train anything, and you can take everything out or have it deleted whenever you like."
      facts={[
        { n: '30', said: 'days an imported file is kept, so an import can be undone' },
        { n: '3', said: 'companies touch your data: servers, email, card payment' },
        { n: '0', said: 'advertising or analytics companies on that list' },
        { n: '7', said: 'days to delete an account, backups included' },
      ]}
      sections={[
        {
          h: 'What we hold',
          p: 'Your email address, your business name, and the recipes, ingredients and rates you enter or import. That is the account. We do not ask for anything else and we do not buy anything about you from anyone.',
        },
        {
          h: 'Your spreadsheet',
          p: 'A file you import is read once and turned into ingredients and recipes in your account. We keep the original for thirty days so an import can be undone, then delete it. A file sent for the free five-dish review is deleted as soon as the answer is sent, unless you tell us to keep it.',
        },
        {
          h: 'Your rates are yours',
          p: 'We do not pool your prices into a market average, sell them to suppliers, or use them to train anything. Nobody outside your team sees a rate you entered. If a supplier feed is attached to your account, it sends rates in — it does not read yours out.',
        },
        {
          h: 'Who else touches it',
          p: (
            <>
              Three companies: where the servers are, who sends our email, and
              who takes the card payment. Each one, and what it holds, is on{' '}
              <Link href="/subprocessors">who else touches it</Link> — a link
              now rather than an address to type, because a policy that names a
              page should take you to it. No advertising or analytics company
              is on that list.
            </>
          ),
        },
        {
          h: 'Leaving',
          p: 'Export everything as a spreadsheet whenever you like, including on the free tier. Ask us to delete the account and it goes within seven days, backups included. We will not keep a copy to tempt you back.',
        },
        {
          h: 'Questions',
          p: <>Anything here that reads like it&rsquo;s hiding something: <a href="mailto:hello@costbook.in">hello@costbook.in</a>.</>,
        },
      ]}
    />
  );
}

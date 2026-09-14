'use client';

import Link from 'next/link';

import type { Receipt } from '@/lib/receipt';

/**
 * One payment, on one page, ready for somebody's own books.
 *
 * Printed rather than generated as a PDF. The product already prints prep
 * cards this way, every browser turns a page into a PDF on the way to the
 * printer, and the alternative is a PDF library in the bundle for a document
 * somebody looks at twice a year. What that costs is control of the page
 * furniture, which is what the print rules in app.css are for.
 */
export function ReceiptSheet({ receipt }: { receipt: Receipt }) {
  return (
    <main className="rc">
      <div className="rc-bar">
        <Link className="link" href="/plans">
          ← Your plan
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>

      <article className="rc-sheet">
        <header className="rc-head">
          <div>
            <p className="rc-kicker">Receipt</p>
            <h1 className="rc-title">{receipt.seller.name}</h1>
            {receipt.seller.address === null ? null : (
              <p className="rc-said">{receipt.seller.address}</p>
            )}
            <p className="rc-said">{receipt.seller.email}</p>
          </div>
          <dl className="rc-meta">
            <dt>Paid on</dt>
            <dd className="figure">{receipt.paidOn}</dd>
            <dt>Reference</dt>
            <dd className="figure">{receipt.reference}</dd>
          </dl>
        </header>

        <section className="rc-to">
          <p className="rc-label">Billed to</p>
          <p className="rc-strong">{receipt.buyer.name}</p>
          {receipt.buyer.email === null ? null : (
            <p className="rc-said">{receipt.buyer.email}</p>
          )}
        </section>

        <table className="rc-table">
          <thead>
            <tr>
              <th>What</th>
              <th className="rc-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{receipt.what}</td>
              <td className="rc-right figure">{receipt.amount}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="rc-strong">Paid</td>
              <td className="rc-right figure rc-total">{receipt.amount}</td>
            </tr>
          </tfoot>
        </table>

        <footer className="rc-foot">
          <p className="rc-said">{receipt.note}</p>
          <p className="rc-said">Paid with {receipt.paidWith}.</p>
          <p className="rc-said">
            Nothing renews by itself and no card is kept on file.
          </p>
        </footer>
      </article>
    </main>
  );
}

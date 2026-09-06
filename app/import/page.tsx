import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { ImportWizard } from '@/components/import-wizard';
import { book, lastImport } from '@/lib/book';
import { ImportUndo } from '@/components/import-undo';

import { adoptCurrency, adoptTarget, commitImport, undoLastImport } from './actions';
import { importAllowed, requireSetup } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/**
 * A6 and A7. The wedge: upload the sheet you already keep and see your menu
 * costed, rather than retyping forty recipes (PRD 3).
 */
export default async function ImportPage() {
  await requireSetup();

  const b = await book();
  const code = b.org.currency;

  /*
   * Said before the upload, not after the mapping.
   *
   * The server refuses the commit either way, but finding that out at the last
   * step — having uploaded a workbook, mapped its columns and read a review
   * screen — is the version of this that feels like a trick.
   */
  // The account's last import: its map, so this sheet arrives already mapped,
  // and its id, so it can still be put back.
  const last = await lastImport();

  const allowed = await importAllowed();
  if (!allowed.ok) {
    return (
      <AppShell
        orgName={b.org.name}
        current="Import"
        currencyCode={code}
        currencySettable={b.recipes.length === 0}
        dishCount={b.recipes.length}
      >
        <div className="set">
          <div className="set-head">
            <div>
              <h1 className="set-h">Importing a sheet is on the paid tier.</h1>
              <p className="set-lede">{allowed.message}</p>
            </div>
          </div>
          <div className="set-limit">
            <h3>What the import does, when you have it</h3>
            <p>
              You upload the workbook you already keep. Costbook reads its
              columns, costs every dish through its own yields, follows
              sub-recipes into their batches, and hands back the whole menu
              ranked by food cost. Nothing about your sheet is altered and
              nothing is discarded — columns it does not recognise are kept
              against the dish they belong to.
            </p>
            <p className="set-note">
              Until then, Recipes builds a dish by hand and costs it exactly
              the same way. It is the same arithmetic; the sheet is only a
              faster way in.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      orgName={b.org.name}
      current="Import"
      currencyCode={code}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
    >
      <CurrencyProvider code={code}>
        {/*
          * The undo, still open.
          *
          * FLOWS 3.3 gives a repeat import seven days rather than a confirm
          * step, and a window that only exists on the screen you saw once is
          * not a window. Somebody who notices on Thursday that their menu
          * moved comes here, because here is where it moved from.
          */}
        {last !== null && last.undoable ? (
          <ImportUndo last={last} onUndo={undoLastImport} />
        ) : null}
        <ImportWizard
          existing={b.ingredients}
          existingRecipes={b.recipes}
          knownRecipes={b.recipes.map((r) => r.name)}
          currencyCode={code}
          onUseCurrency={adoptCurrency}
          targetPercent={b.org.foodCostTarget}
          onUseTarget={adoptTarget}
          onCommit={commitImport}
          remembered={last?.mapping}
          returning={b.ingredients.length > 0}
          onUndo={undoLastImport}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

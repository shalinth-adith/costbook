import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { ImportWizard } from '@/components/import-wizard';
import { book } from '@/lib/book';

import { commitImport } from './actions';
import { requireSetup } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/**
 * A6 and A7. The wedge: upload the sheet you already keep and see your menu
 * costed, rather than retyping forty recipes (PRD 3).
 */
export default async function ImportPage() {
  await requireSetup();

  const b = await book();
  const code = b.org.currency;

  return (
    <AppShell
      orgName={b.org.name}
      current="Import"
      currencyCode={code}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
    >
      <CurrencyProvider code={code}>
        <ImportWizard
          existing={b.ingredients}
          knownRecipes={b.recipes.map((r) => r.name)}
          onCommit={commitImport}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

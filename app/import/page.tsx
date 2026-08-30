import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { ImportWizard } from '@/components/import-wizard';
import {
  allIngredients,
  allRecipes,
  currencyCode,
  currencyIsSettable,
  org,
} from '@/lib/store';

import { commitImport } from './actions';
import { requireSetup } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/**
 * A6 and A7. The wedge: upload the sheet you already keep and see your menu
 * costed, rather than retyping forty recipes (PRD 3).
 */
export default function ImportPage() {
  requireSetup();
  const code = currencyCode();

  return (
    <AppShell
      orgName={org().name}
      current="Import"
      currencyCode={code}
      currencySettable={currencyIsSettable()}
      dishCount={allRecipes().length}
    >
      <CurrencyProvider code={code}>
        <ImportWizard
          existing={allIngredients()}
          knownRecipes={allRecipes().map((r) => r.name)}
          onCommit={commitImport}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

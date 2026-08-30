import { SetupWizard } from '@/components/setup-wizard';
import { CurrencyProvider } from '@/components/currency-provider';

import { currencyCode } from '@/lib/store';

/**
 * The four questions, asked once after sign-up and before there is any data.
 *
 * Reachable afterwards too: every answer is also in Settings, so this is a
 * first run rather than a gate. Nothing is written until the last step.
 */
export const dynamic = 'force-dynamic';

export default function SetupPage() {
  const code = currencyCode();
  return (
    <CurrencyProvider code={code}>
      <SetupWizard initialCurrency={code} />
    </CurrencyProvider>
  );
}

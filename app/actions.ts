"use server";

import { revalidatePath } from "next/cache";

import { currency, isKnownCurrency } from "@/core/currency";

import { currencyIsSettable, saveOrg } from "@/lib/book";

/**
 * Set the currency the account prices in.
 *
 * Refused once anything is costed, because at that point it is not a setting
 * any more — every rate on file was typed in the currency in force when it was
 * entered.
 *
 * Both halves of this used to come from `lib/store`, the in-memory fixture,
 * while every other screen read through `lib/book`. With a project wired up
 * that made it wrong twice over: the guard counted the memory store's recipes,
 * which is always none, so it reported the currency settable no matter how
 * many dishes were costed in it — and the write landed in a module-level
 * object that the next server restart discarded. The operator chose a
 * currency, the screen agreed, and nothing had changed.
 */
export async function chooseCurrency(code: string): Promise<{
  readonly message: string;
  readonly undoable: boolean;
}> {
  /*
   * Checked here because the store's setter used to check it and this replaced
   * the store's setter. `setCurrency` refused an unknown code silently; a
   * refusal that says so is better, and either is better than writing a code
   * nothing can format and finding out at the first figure on the dashboard.
   */
  if (!isKnownCurrency(code)) {
    return {
      message: `${code} is not a currency Costbook knows.`,
      undoable: false,
    };
  }

  if (!(await currencyIsSettable())) {
    return {
      message:
        "Your currency is already set, because there are dishes costed in it.",
      undoable: false,
    };
  }

  await saveOrg({ currency: code.toUpperCase() });
  revalidatePath("/", "layout");

  return {
    message: `Prices are now in ${currency(code).name}.`,
    undoable: false,
  };
}

import { ingredientCost } from "@/core/ingredient";
import { fromBase } from "@/core/units";

import { book, orgModel, pantry } from "@/lib/book";
import { breakdown } from "@/lib/breakdown";
import { type LibraryRow, library } from "@/lib/library";
import { EXPORT_PASS } from "@/lib/org";
import { lineRate, rateUnitOf } from "@/lib/format";
import { canTakeAway } from "@/lib/plan";

/**
 * The menu, as a file — two of them.
 *
 * `?kind=menu` is one row a dish: what it costs, what it sells at, what it
 * keeps. The summary an owner sends an accountant.
 *
 * `?kind=sop` is the whole restaurant opened out — every dish, every line in
 * it, and every line inside its sub-recipes, with the amount this batch needs
 * and what that amount costs. Coffee stops being "Decoction, 300 ml" and
 * becomes the coffee powder, the water, the milk and the sugar, each named
 * with the pot it goes into. That is the sheet a kitchen actually runs on,
 * and until now there was no way to get it out of the product at all.
 *
 * A route handler rather than a button that builds the file in the browser,
 * because the figures are already worked out on the server and a second copy
 * of the arithmetic is a second answer waiting to disagree.
 *
 * WHAT IS BOUGHT, AND WHAT IS NOT. Reading is free: six dishes costed
 * properly, every figure open to its working, the card on screen. Carrying it
 * away is bought once on a free book, and anyone who has ever paid has it
 * already. The check is here, on the server, because a link is a link — a
 * button hidden in the interface is not a gate.
 */
export const dynamic = "force-dynamic";

/** One CSV field: quoted when it has to be, with quotes doubled inside. */
function field(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const money = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? null : n.toFixed(2);

/**
 * A quantity in the unit the operator typed, not in base units.
 *
 * Every quantity in this system is stored in base units — 8000 for 8 kg of
 * rice (TRD 3) — and `lib/format.ts` documents what happens when one is
 * printed raw beside its display unit: "8000 kg", wrong by a factor of a
 * thousand. On a screen that is a typo somebody notices. In a spreadsheet
 * sent to a supplier it is eight tonnes of rice.
 *
 * Four decimal places rather than the two a screen uses: a quarter gram of
 * saffron is a real line, and a spreadsheet is where somebody multiplies it.
 */
function shown(baseQty: number, unit: string): string {
  if (unit === "") return "";
  try {
    return String(Number(fromBase(baseQty, unit).toFixed(4)));
  } catch {
    // An unknown unit is not convertible; the figure stands as it is rather
    // than passing through a conversion that does not exist.
    return String(Number(baseQty.toFixed(4)));
  }
}

export async function GET(request: Request): Promise<Response> {
  const b = await book();
  if (b.orgId === null) {
    return new Response("Sign in first.", { status: 401 });
  }

  if (!canTakeAway(b.subscription)) {
    /*
     * 402, and a sentence rather than a redirect.
     *
     * This URL is reached by a fetch as often as by a click, and a redirect
     * to a payment screen arrives at a download manager as a corrupt file.
     * The status says why and the body says what to do about it.
     */
    return new Response(
      `Taking your book out is bought once — ${EXPORT_PASS.symbol}${String(EXPORT_PASS.amount)} — ` +
        `on a free account, and it stays bought. Everything you have costed is still on ` +
        `screen and still yours. Open Costbook and go to Your plan.\n`,
      { status: 402, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const asked = new URL(request.url).searchParams;
  /*
   * Three kinds, and the third is one dish.
   *
   * The two files above are the whole book, which is what an accountant or a
   * new head chef is sent. Standing on one cost sheet and wanting that dish
   * in a spreadsheet is a different and more common moment — the owner's
   * words were that export meant the prep card, because from a dish there was
   * nothing else. It is the SOP rows for a single recipe, so the file a
   * kitchen gets for one dish is the same file it gets for all of them.
   */
  const kind =
    asked.get("kind") === "sop"
      ? "sop"
      : asked.get("kind") === "dish"
        ? "dish"
        : "menu";
  const dishId = asked.get("id");
  const only =
    kind === "dish" ? b.recipes.find((r) => r.id === dishId) : undefined;
  if (kind === "dish" && only === undefined) {
    return new Response("No such dish in your book.\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const shelf = await pantry();
  const model = await orgModel();

  const rows: readonly string[][] =
    kind === "dish"
      ? sopRows({ ...b, recipes: only === undefined ? [] : [only] }, shelf)
      : kind === "sop"
        ? sopRows(b, shelf)
        : menuRows(b, shelf, model);

  const today = new Date().toISOString().slice(0, 10);
  const stem =
    b.org.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "costbook";
  const dishStem =
    only === undefined
      ? ""
      : only.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name =
    kind === "dish"
      ? `${dishStem || "dish"}-${today}.csv`
      : `${stem}-${kind === "sop" ? "sop" : "menu"}-${today}.csv`;

  // The currency is named in the preamble rather than printed against every
  // figure: a spreadsheet sums a number and not "AED 12.40".
  const preamble = `${b.org.name} — ${
    kind === "dish"
      ? `${only?.name ?? "one dish"}, opened all the way down`
      : kind === "sop"
        ? "every dish, opened all the way down"
        : "the menu, costed"
  } — every figure in ${b.org.currency}\n`;

  /*
   * A byte-order mark, and CRLF.
   *
   * Excel opens a UTF-8 CSV as the operating system's legacy encoding unless
   * the file says otherwise, which turns ₹ and é into mojibake on the first
   * screen an owner sees. The BOM is three bytes that prevent it.
   */
  const body = `﻿${preamble}${rows.map((r) => r.map(field).join(",")).join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** One row a dish: the summary an accountant reads. */
function menuRows(
  b: Awaited<ReturnType<typeof book>>,
  shelf: Awaited<ReturnType<typeof pantry>>,
  model: Awaited<ReturnType<typeof orgModel>>,
): readonly string[][] {
  const lib = library({
    ids: b.recipes.map((r) => r.id),
    pantry: shelf,
    meta: b.meta,
    model,
  });
  // Dishes first, then the batches they are made from, which is the order the
  // library shows them in and the order somebody reads a menu.
  const list: readonly LibraryRow[] = [...lib.dishes, ...lib.batches];

  return [
    [
      "Dish",
      "Section",
      "Kind",
      "Lines",
      "Cost per portion",
      "Cost per unit",
      "Unit",
      "Selling price",
      "Food cost %",
      "Keeps of every 100",
      "Costed in full",
      "Used in",
      "Updated",
    ],
    ...list.map((r) => [
      r.name,
      r.category,
      r.kind,
      String(r.componentCount),
      money(r.costPerPortion) ?? "",
      money(r.costPerUnit) ?? "",
      r.outputUnit,
      money(r.sellingPrice) ?? "",
      r.foodCostPercent === null ? "" : r.foodCostPercent.toFixed(1),
      r.foodCostPercent === null ? "" : (100 - r.foodCostPercent).toFixed(1),
      r.complete ? "yes" : "no",
      String(r.usedIn),
      r.updatedAt ?? "",
    ]),
  ];
}

/**
 * The standard operating procedure: every dish, opened to the bottom.
 *
 * One row a line, so a spreadsheet can filter, sort and pivot it — the whole
 * point of handing somebody a table rather than a picture of one. `Level` and
 * `Inside` both say where a line sits, because a pivot loses indentation and
 * a person reading straight down loses a path column.
 */
function sopRows(
  b: Awaited<ReturnType<typeof book>>,
  shelf: Awaited<ReturnType<typeof pantry>>,
): readonly string[][] {
  const rows: string[][] = [
    [
      "Dish",
      "Section",
      "Plates a batch",
      "Level",
      "Kind",
      "Component",
      "Inside",
      "Quantity",
      "Unit",
      "Rate",
      "Rate per",
      "Line cost",
      "Note",
    ],
  ];

  for (const recipe of b.recipes) {
    const meta = b.meta[recipe.id];
    // The account's own pantry — every recipe and every ingredient — so a
    // sub-recipe resolves exactly the way the costing screen resolved it.
    const lines = breakdown(recipe, shelf);

    for (const l of lines) {
      /*
       * What a line costs, from the engine's own figure for the ingredient.
       * `effectivePerBaseUnit` is the rate after yield loss — what a recipe
       * actually pays for a usable gram — so this is the same number the
       * costing screen totals, never a second derivation of it.
       */
      const ing =
        l.kind === "ingredient" && l.refId !== null
          ? shelf.ingredients.get(l.refId)
          : undefined;
      const rate =
        ing === undefined ? null : ingredientCost(ing).effectivePerBaseUnit;

      rows.push([
        recipe.name,
        meta?.category ?? "",
        recipe.portions === null ? "" : String(recipe.portions),
        String(l.depth),
        l.kind === "recipe"
          ? "make"
          : l.kind === "flat"
            ? "charge"
            : "ingredient",
        l.name,
        l.via.join(" › "),
        l.kind === "flat" ? "" : shown(l.qty, l.unit),
        l.unit,
        // A rate is said per the unit a kitchen buys in — a kilo, a litre,
        // the piece — never per gram, which is a figure nobody purchases by.
        money(lineRate(rate, rateUnitOf(l.unit))) ?? "",
        l.kind === "flat" ? "" : rateUnitOf(l.unit),
        l.kind === "flat"
          ? (money(l.amount) ?? "")
          : (money(rate === null ? null : rate * l.qty) ?? ""),
        l.note ?? "",
      ]);
    }
  }

  return rows;
}

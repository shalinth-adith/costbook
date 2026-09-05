import { book, orgModel, pantry } from "@/lib/book";
import { type LibraryRow, library } from "@/lib/library";

/**
 * The menu, as a file.
 *
 * The product could print a prep card and nothing else: an owner who wanted
 * their costed menu in a spreadsheet — to send an accountant, to compare
 * against last quarter, to keep when they stop paying — had no way to get it
 * out. A book you cannot take away is not yours.
 *
 * A route handler rather than a button that builds the file in the browser,
 * because the figures are already worked out on the server and a second copy
 * of the arithmetic is a second answer waiting to disagree.
 *
 * The gate turns a signed-out visitor away before this runs, which is the
 * right answer for a link somebody clicked. The check below is for the gap
 * between the two: a session that ended in between should get a sentence, not
 * a spreadsheet of somebody else's menu.
 */
export const dynamic = "force-dynamic";

/** One CSV field: quoted when it has to be, with quotes doubled inside. */
function field(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(): Promise<Response> {
  const b = await book();
  if (b.orgId === null) {
    return new Response("Sign in first.", { status: 401 });
  }

  const shelf = library({
    ids: b.recipes.map((r) => r.id),
    pantry: await pantry(),
    meta: b.meta,
    model: await orgModel(),
  });
  // Dishes first, then the batches they are made from, which is the order the
  // library shows them in and the order somebody reads a menu.
  const rows: readonly LibraryRow[] = [...shelf.dishes, ...shelf.batches];

  const money = (n: number | null) => (n === null ? null : n.toFixed(2));
  const header = [
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
  ];

  const lines = [
    header.map(field).join(","),
    ...rows.map((r) =>
      [
        r.name,
        r.category,
        r.kind,
        r.componentCount,
        money(r.costPerPortion),
        money(r.costPerUnit),
        r.outputUnit,
        money(r.sellingPrice),
        r.foodCostPercent === null ? null : r.foodCostPercent.toFixed(1),
        r.foodCostPercent === null
          ? null
          : (100 - r.foodCostPercent).toFixed(1),
        r.complete ? "yes" : "no",
        r.usedIn,
        r.updatedAt,
      ]
        .map(field)
        .join(","),
    ),
  ];

  // The currency is named in the header row rather than printed against every
  // figure: a spreadsheet sums a number and not "AED 12.40".
  const preamble = `${b.org.name} — every figure in ${b.org.currency}\n`;
  const today = new Date().toISOString().slice(0, 10);
  const name = `${b.org.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "costbook"}-${today}.csv`;

  return new Response(`${preamble}${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

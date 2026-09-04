/**
 * What a sheet's formulas say that its values do not.
 *
 * A costing sheet's "Cost per Item" is usually `=SUM(lines)/portions`. One
 * real sheet writes, for its dosa batter, `=(SUM(G4:G10)-G10)/I4+G10`: the
 * ghee on row 10 is not divided across the batch, it is added to every item.
 * The values alone cannot show that; the formula can. Read here, once, and
 * handed to the parser as the rows that are per item.
 */

const PER_ITEM =
  /\(\s*SUM\(\s*[A-Z]+\d+\s*:\s*[A-Z]+\d+\s*\)((?:\s*-\s*[A-Z]+\d+)+)\s*\)\s*\/\s*[A-Z]+\d+((?:\s*\+\s*[A-Z]+\d+)+)/i;

/**
 * Zero-based sheet rows whose line is added per item, from every formula in
 * the sheet. A row appears once however many formulas name it.
 */
export function perItemRowsFrom(cells: Iterable<readonly [string, string]>): readonly number[] {
  const rows = new Set<number>();
  for (const [, formula] of cells) {
    const m = PER_ITEM.exec(formula);
    if (m === null || m[2] === undefined) continue;
    for (const ref of m[2].matchAll(/[A-Z]+(\d+)/gi)) {
      const row = Number(ref[1]);
      if (Number.isFinite(row) && row > 0) rows.add(row - 1);
    }
  }
  return [...rows].sort((a, b) => a - b);
}

import { describe, expect, it } from 'vitest';

import { perItemRowsFrom } from './formula-hints';

describe('perItemRowsFrom', () => {
  it('reads the row a cost-per-item formula adds per item', () => {
    // Kumbakonam Cafe, Dosa Batter: ghee on row 10 goes on every item.
    expect(perItemRowsFrom([['J4', 'IFERROR((SUM(G4:G10)-G10)/I4+G10,"")']])).toEqual([9]);
  });
  it('reads more than one, and each once', () => {
    const f = '(SUM(G4:G12)-G10-G12)/I4+G10+G12';
    expect(perItemRowsFrom([['J4', f], ['J5', f]])).toEqual([9, 11]);
  });
  it('ignores the ordinary divide-by-portions formula', () => {
    expect(perItemRowsFrom([['J11', 'IFERROR(SUM(G11:G16)/I11,"")'], ['G4', 'IF(OR(D4="",F4=""),"",D4*F4)']])).toEqual([]);
  });
});

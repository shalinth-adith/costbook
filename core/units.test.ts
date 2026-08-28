import { describe, expect, it } from 'vitest';

import {
  BASE_UNIT,
  UnitError,
  convert,
  fromBase,
  isKnownUnit,
  normaliseUnit,
  resolveUnit,
  sameFamily,
  toBase,
  unitFamily,
} from './units';

describe('the acceptance check for build step 2', () => {
  it('converts kg to g', () => {
    expect(convert(1, 'kg', 'g')).toBe(1000);
    expect(convert(2.5, 'kg', 'g')).toBe(2500);
  });

  it('converts l to ml', () => {
    expect(convert(1, 'l', 'ml')).toBe(1000);
    expect(convert(0.6, 'l', 'ml')).toBeCloseTo(600, 10);
  });

  it('normalises gms to g', () => {
    expect(normaliseUnit('gms')).toBe('g');
  });

  it('normalises L to l', () => {
    expect(normaliseUnit('L')).toBe('l');
    expect(normaliseUnit('l')).toBe('l');
  });

  it('rejects cross-family use', () => {
    expect(() => convert(100, 'ml', 'g')).toThrowError(UnitError);
    try {
      convert(100, 'ml', 'g');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnitError);
      expect((error as UnitError).code).toBe('cross_family');
      expect((error as UnitError).units).toEqual(['ml', 'g']);
      expect((error as UnitError).message).toContain('density');
    }
  });
});

describe('families', () => {
  it('assigns every unit to exactly one family', () => {
    expect(unitFamily('kg')).toBe('mass');
    expect(unitFamily('oz')).toBe('mass');
    expect(unitFamily('tbsp')).toBe('volume');
    expect(unitFamily('fl oz')).toBe('volume');
    expect(unitFamily('pcs')).toBe('count');
    expect(unitFamily('nos')).toBe('count');
  });

  it('names a base unit per family', () => {
    expect(BASE_UNIT.mass).toBe('g');
    expect(BASE_UNIT.volume).toBe('ml');
    expect(BASE_UNIT.count).toBe('nos');
  });

  it('knows which units are interchangeable', () => {
    expect(sameFamily('kg', 'g')).toBe(true);
    expect(sameFamily('l', 'tsp')).toBe(true);
    expect(sameFamily('g', 'ml')).toBe(false);
    expect(sameFamily('pcs', 'g')).toBe(false);
  });

  it('never treats an unknown unit as convertible', () => {
    expect(sameFamily('pinch', 'pinch')).toBe(false);
  });
});

describe('alias normalisation', () => {
  it('accepts the mass spellings seen in real sheets', () => {
    for (const raw of ['g', 'gm', 'gms', 'gram', 'grams']) {
      expect(normaliseUnit(raw)).toBe('g');
    }
    for (const raw of ['kg', 'kgs', 'kilo', 'kilos']) {
      expect(normaliseUnit(raw)).toBe('kg');
    }
    expect(normaliseUnit('lbs')).toBe('lb');
  });

  it('accepts the volume spellings seen in real sheets', () => {
    for (const raw of ['l', 'L', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters']) {
      expect(normaliseUnit(raw)).toBe('l');
    }
    for (const raw of ['fl oz', 'fl. oz.', 'FL OZ', 'floz']) {
      expect(normaliseUnit(raw)).toBe('fl oz');
    }
  });

  it('accepts the count spellings seen in real sheets', () => {
    for (const raw of ['nos', 'no', 'pc', 'pcs', 'piece', 'pieces', 'each', 'unit', 'units']) {
      expect(unitFamily(raw)).toBe('count');
    }
  });

  it('ignores case, periods and surrounding whitespace', () => {
    expect(normaliseUnit('  KG  ')).toBe('kg');
    expect(normaliseUnit('K.G.')).toBe('kg');
    expect(normaliseUnit('Gms')).toBe('g');
  });
});

describe('tokens that are not units', () => {
  // Real workbook rows: `1 lot of Blending @ 50`, `1 as req of Salt @ 1.16`,
  // `1 pinch @ 0.95`, `0.3 pkt @ 6`. These are costs with a label, not
  // measurements, and become flat component lines (TRD 3.1).
  it('returns null rather than guessing', () => {
    for (const raw of ['as req', 'lot', 'pinch', 'pkt', 'box', 'bunch', '', '   ', '1/4 tsp']) {
      expect(resolveUnit(raw)).toBeNull();
      expect(normaliseUnit(raw)).toBeNull();
      expect(unitFamily(raw)).toBeNull();
      expect(isKnownUnit(raw)).toBe(false);
    }
  });

  it('throws a named error when one is used in a conversion', () => {
    try {
      toBase(1, 'pinch');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as UnitError).code).toBe('unknown_unit');
      expect((error as UnitError).units).toEqual(['pinch']);
    }
  });
});

describe('base-unit storage', () => {
  it('converts into the base unit', () => {
    expect(toBase(1, 'kg')).toBe(1000);
    expect(toBase(1, 'mg')).toBe(0.001);
    expect(toBase(1, 'l')).toBe(1000);
    expect(toBase(3, 'pcs')).toBe(3);
    expect(toBase(1, 'lb')).toBeCloseTo(453.592, 10);
    expect(toBase(1, 'oz')).toBeCloseTo(28.3495, 10);
  });

  it('round-trips through the base unit', () => {
    for (const unit of ['kg', 'mg', 'lb', 'oz', 'l', 'tsp', 'tbsp', 'cup', 'fl oz']) {
      expect(fromBase(toBase(7.25, unit), unit)).toBeCloseTo(7.25, 10);
    }
  });

  it('holds full precision rather than rounding as it goes', () => {
    // TRD 4: round only at display. A rate rounded mid-calculation multiplies
    // back out across the batch, which is where 21.00-vs-20.97 comes from.
    expect(toBase(1, 'tsp')).toBe(4.92892);
    expect(convert(1, 'cup', 'tsp')).toBeCloseTo(236.588 / 4.92892, 12);
  });

  it('refuses a quantity that is not a finite number', () => {
    for (const qty of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => toBase(qty, 'kg')).toThrowError(UnitError);
    }
  });
});

describe('conversion within a family', () => {
  it('converts in both directions', () => {
    expect(convert(1000, 'g', 'kg')).toBe(1);
    expect(convert(1000, 'ml', 'l')).toBe(1);
    // 1 tbsp is 3 tsp by definition, but the TRD's rounded ml factors put the
    // ratio at 3.0000081, not 3. Real, and harmless: the drift is 8 parts per
    // million on a spoon measure, far below the 2dp everything is displayed at.
    expect(convert(2, 'tbsp', 'tsp')).toBeCloseTo(6, 4);
  });

  it('is identity for the same unit', () => {
    expect(convert(46.3, 'g', 'g')).toBe(46.3);
  });

  it('treats nos and pcs as the same count', () => {
    expect(convert(12, 'nos', 'pcs')).toBe(12);
    expect(convert(12, 'pc', 'no')).toBe(12);
  });

  it('rejects every crossing between families', () => {
    const pairs: readonly (readonly [string, string])[] = [
      ['g', 'ml'],
      ['kg', 'l'],
      ['ml', 'pcs'],
      ['pcs', 'g'],
      ['tsp', 'oz'],
    ];
    for (const [from, to] of pairs) {
      expect(() => convert(1, from, to)).toThrowError(UnitError);
    }
  });
});

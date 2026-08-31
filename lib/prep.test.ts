import { describe, expect, it } from 'vitest';
import { allergensFrom, methodLines, prepTimeFrom } from './prep';

describe('methodLines', () => {
  it('keeps the reference workbook’s own groups and numbering', () => {
    const cell =
      'Step 1: Cake Preparation\n\n' +
      '1. Take 1 kg veg mix in mixing bowl.\n' +
      '2. Add 600 ml water.\n\n' +
      'Step 2: Palkova Cream Preparation\n\n' +
      '1. Take 720 g palkova in bowl.';
    expect(methodLines(cell)).toEqual([
      { text: 'Step 1: Cake Preparation', heading: true },
      { text: '1. Take 1 kg veg mix in mixing bowl.', heading: false },
      { text: '2. Add 600 ml water.', heading: false },
      { text: 'Step 2: Palkova Cream Preparation', heading: true },
      { text: '1. Take 720 g palkova in bowl.', heading: false },
    ]);
  });

  it('does not renumber a plain numbered method', () => {
    const cell =
      '1. Soak the idly rice, urudh dhal and fenugreek together for 3-4 hours.\n' +
      '2. Grind all together for 45-55 mins.';
    expect(methodLines(cell).map((l) => l.text)).toEqual([
      '1. Soak the idly rice, urudh dhal and fenugreek together for 3-4 hours.',
      '2. Grind all together for 45-55 mins.',
    ]);
    expect(methodLines(cell).every((l) => !l.heading)).toBe(true);
  });

  it('keeps a sub-bullet as the operator drew it', () => {
    expect(methodLines('○ Low speed – 1 minute')).toEqual([
      { text: '○ Low speed – 1 minute', heading: false },
    ]);
  });

  it('reads a short label ending in a colon as a group', () => {
    expect(methodLines('Topping:')[0]?.heading).toBe(true);
  });

  it('does not read a sentence containing a colon as a group', () => {
    const line = 'Bake at 180C: check at 20 minutes and again at 25.';
    expect(methodLines(line)[0]?.heading).toBe(false);
  });

  it('has nothing to say when the dish carries no method', () => {
    expect(methodLines(null)).toEqual([]);
    expect(methodLines(undefined)).toEqual([]);
    expect(methodLines('')).toEqual([]);
    expect(methodLines('   \n  \n')).toEqual([]);
  });

  it('survives carriage returns from a Windows sheet', () => {
    expect(methodLines('One\r\nTwo').map((l) => l.text)).toEqual(['One', 'Two']);
  });
});

describe('allergensFrom', () => {
  it('reads a column the sheet actually carried', () => {
    expect(allergensFrom({ Allergens: 'Milk, Sesame' })).toEqual(['Milk', 'Sesame']);
    expect(allergensFrom({ CONTAINS: 'Nuts · Milk' })).toEqual(['Nuts', 'Milk']);
  });

  it('states nothing where nobody stated anything', () => {
    expect(allergensFrom(undefined)).toEqual([]);
    expect(allergensFrom({})).toEqual([]);
    expect(allergensFrom({ 'Cost per Item': '1.21' })).toEqual([]);
    expect(allergensFrom({ Allergens: '' })).toEqual([]);
  });
});

describe('prepTimeFrom', () => {
  it('reads a prep time column', () => {
    expect(prepTimeFrom({ 'Prep Time': '9 min' })).toBe('9 min');
    expect(prepTimeFrom({ 'Cook time': '25 mins' })).toBe('25 mins');
  });

  it('does not invent one', () => {
    expect(prepTimeFrom(undefined)).toBeNull();
    expect(prepTimeFrom({ Station: 'Tawa' })).toBeNull();
    expect(prepTimeFrom({ 'Prep Time': '  ' })).toBeNull();
  });
});

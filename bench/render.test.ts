import { describe, expect, it } from 'vitest';

import { renderBench } from './render.js';

/**
 * The bench renders real engine output, so these assert the figures actually
 * reach the page. Not a substitute for looking at it — a guard that what you
 * look at is what the engine computed.
 */
describe('the bench page', () => {
  const html = renderBench();

  it('renders every fixture dish', () => {
    for (const name of [
      'Parotta Kuruma Plate',
      'Chicken Kuruma',
      'Onion Thakkali Gravy',
      'Veechu Parotta',
      'Ghee Roast Dosa',
      'Filter Coffee',
      'Ghee Podi Idly Fry',
    ]) {
      expect(html).toContain(name);
    }
  });

  it('shows the hand-costed figures for the three-level plate', () => {
    expect(html).toContain('24.28'); // plate, per portion
    expect(html).toContain('101.02'); // its batch pool
    expect(html).toContain('512.29'); // kuruma, whole batch
    expect(html).toContain('114.56'); // gravy, whole batch
    expect(html).toContain('118.64'); // parotta, whole batch
  });

  it('marks the lines that are the operator own recipes', () => {
    expect(html).toContain('own recipe');
  });

  it('states what one unit of a sub-recipe output costs', () => {
    expect(html).toContain('Cost per kg of output');
    expect(html).toContain('128.07'); // kuruma per kg, the figure the plate pays
  });

  it('shows the hand-costed per-portion figures from the earlier steps', () => {
    expect(html).toContain('15.22'); // Filter Coffee, 152.18 / 10
    expect(html).toContain('8.81'); // Ghee dosa with the 50.00 blending lot
    expect(html).toContain('790.64'); // its batch pool
  });

  it('separates a free ingredient from an unknown one', () => {
    expect(html).toContain('no rate on file');
    expect(html).toContain('0.00'); // water
    expect(html).toContain('&mdash;'); // podi, blank rather than zero
  });

  it('says floor rather than cost on the incomplete dish', () => {
    expect(html).toContain('INCOMPLETE');
    expect(html).toContain('Floor per portion');
    expect(html).toContain('This is a floor, not a cost');
    expect(html).toContain('No price is suggested');
  });

  it('names the path to a rate missing three levels down', () => {
    expect(html).toContain('Kuruma masala, house');
    expect(html).toContain('via Chicken Kuruma &rarr; Onion Thakkali Gravy');
  });

  it('labels a per-portion line and an entry mode', () => {
    expect(html).toContain('per portion');
    expect(html).toContain('spend entered');
    expect(html).toContain('flat');
  });

  it('discloses what Costbook assumed rather than what was entered', () => {
    expect(html).toContain('Assumed by Costbook, not entered by you');
    expect(html).toContain('yieldPercent');
  });

  it('escapes text rather than interpolating it raw', () => {
    expect(html).not.toContain('<script>');
  });
});

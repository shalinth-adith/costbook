/**
 * The bench's markup, as a pure function of the engine's output.
 *
 * No DOM here on purpose: the page is a string this module builds, so the
 * figures it renders can be asserted in Node without a browser. main.ts is
 * the four-line shim that writes it into the document.
 *
 * The throwaway bench — TRD build step 11, brought forward.
 *
 * One unstyled page that runs the real engine and renders every figure it
 * produces. Not one of the nine screens. No auth, no database, no design
 * system. It exists so the engine meets real numbers early, and it gets
 * deleted when Phase 3 starts.
 *
 * Workbook loading arrives with parse.ts at step 10; until then the dishes
 * are fixtures.
 */

import { ingredientCost, ratePerUnit } from '../core/ingredient.js';
import { type RecipeCost, isComplete, recipeCost } from '../core/recipe.js';
import { dishes, shelf } from './fixtures.js';

const CURRENCY = '₹';

/** Two decimals at display, and only at display (TRD 4). */
const money = (n: number | null): string =>
  n === null ? '<span class="none">&mdash;</span>' : n.toFixed(2);

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shelfTable(): string {
  const rows = shelf
    .map((ing) => {
      const c = ingredientCost(ing);
      const note = !c.priced
        ? '<span class="warn">no rate on file</span>'
        : c.assumed.length > 0
          ? '<span class="assumed">yield assumed</span>'
          : '';
      return `<tr>
        <td>${esc(ing.name)}</td>
        <td class="n">${money(ratePerUnit(c.ratePerBaseUnit, ing.purchaseUnit))}</td>
        <td class="u">/ ${esc(ing.purchaseUnit)}</td>
        <td class="n">${ing.yieldPercent}%</td>
        <td class="n">${money(ratePerUnit(c.effectivePerBaseUnit, ing.purchaseUnit))}</td>
        <td class="u">/ ${esc(ing.purchaseUnit)}</td>
        <td>${note}</td>
      </tr>`;
    })
    .join('');

  return `<h2>Ingredients &mdash; as the operator entered them</h2>
  <table>
    <thead><tr>
      <th>Ingredient</th><th class="n">As bought</th><th></th>
      <th class="n">Yield</th><th class="n">Usable</th><th></th><th>Note</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="note">A blank rate stays blank. Water at 0.00 is free; podi at &mdash; is unknown.
  They are different facts and the engine never merges them.</p>`;
}

function lineRows(cost: RecipeCost): string {
  return cost.lines
    .map((l) => {
      const scope = l.scope === 'portion' ? '<span class="chip">per portion</span>' : '';
      const entry =
        l.entryMode === 'spend'
          ? '<span class="chip">spend entered</span>'
          : l.entryMode === 'rate'
            ? '<span class="chip">rate entered</span>'
            : l.entryMode === 'flat'
              ? '<span class="chip">flat</span>'
              : '';
      const qty = l.kind === 'flat' ? '' : `${l.qty} <span class="u">${esc(l.unit)}</span>`;
      return `<tr class="${l.cost === null ? 'missing' : ''}">
        <td>${esc(l.name)} ${scope} ${entry}</td>
        <td class="n">${qty}</td>
        <td class="n">${l.ratePerBaseUnit === null ? '' : l.ratePerBaseUnit.toFixed(4)}</td>
        <td class="n">${money(l.cost)}</td>
      </tr>`;
    })
    .join('');
}

function summary(cost: RecipeCost): string {
  if (isComplete(cost)) {
    return `<table class="sum">
      <tr><td>Batch pool</td><td class="n">${money(cost.batch)}</td></tr>
      <tr><td>Applied to each portion</td><td class="n">${money(cost.portionAdd)}</td></tr>
      <tr><td>Portions</td><td class="n">${cost.portions}</td></tr>
      <tr class="total"><td>Cost per portion</td><td class="n">${CURRENCY} ${money(cost.perPortion)}</td></tr>
      <tr><td>Whole batch</td><td class="n">${money(cost.total)}</td></tr>
    </table>`;
  }

  const names = cost.unpriced.map((u) => esc(u.name)).join(', ');
  return `<table class="sum floor">
      <tr><td>Batch floor</td><td class="n">${money(cost.batchFloor)}</td></tr>
      <tr><td>Applied to each portion</td><td class="n">${money(cost.portionAddFloor)}</td></tr>
      <tr><td>Portions</td><td class="n">${cost.portions}</td></tr>
      <tr class="total"><td>Floor per portion</td><td class="n">${CURRENCY} ${money(cost.perPortionFloor)}</td></tr>
    </table>
    <p class="warn">This is a floor, not a cost. ${names} has no rate on file, so the
    real figure can only be higher. No price is suggested for this dish.</p>`;
}

function dishBlock(cost: RecipeCost): string {
  const assumed =
    cost.assumed.length === 0
      ? ''
      : `<p class="assumed">Assumed by Costbook, not entered by you:
         ${cost.assumed.map((a) => `${a.field} = ${a.value} &mdash; ${esc(a.because)}`).join('; ')}</p>`;

  return `<section>
    <h3>${esc(cost.name)} ${cost.kind === 'floor' ? '<span class="chip warn">INCOMPLETE</span>' : ''}</h3>
    <table>
      <thead><tr><th>Line</th><th class="n">Qty</th><th class="n">Rate / base</th><th class="n">Cost</th></tr></thead>
      <tbody>${lineRows(cost)}</tbody>
    </table>
    ${summary(cost)}
    ${assumed}
  </section>`;
}


export function renderBench(): string {
  return `
    <h1>Costbook engine bench</h1>
    <p class="note">TRD build step 11, brought forward. Runs <code>core/</code> directly &mdash;
    no database, no auth, no design system. Deleted when Phase 3 begins.
    Engine complete through step 5: units, ingredient yield, batch and per-portion
    pools, flat lines, rate-or-spend entry. Nesting is step 6.</p>
    ${shelfTable()}
    <h2>Dishes, costed</h2>
    ${dishes.map((d) => dishBlock(recipeCost(d))).join('')}
  `;
}

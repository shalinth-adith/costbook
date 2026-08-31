/**
 * A page stylesheet in Next is global. It must namespace itself.
 *
 * `app/sign-in/entry.css` opened with "Scoped to this route rather than added
 * to app.css" and was not scoped at all — only `.module.css` is. Its `.entry`
 * (min-height 100vh, a 600px/1fr split) therefore also claimed the
 * Add-an-ingredient card on Ingredients, which is `.entry` too: the card grew
 * to fill the viewport, its heading and its fields fell into separate columns,
 * and the rows underneath were pushed off the screen. `.field` had already
 * collided once and been patched with specificity rather than a namespace.
 *
 * This is the check that would have caught both on the day they were written.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Every stylesheet loaded by a page, and the prefix it must keep to. */
const SHEETS: readonly { file: string; prefixes: readonly string[] }[] = [
  { file: 'app/sign-in/entry.css', prefixes: ['.gate'] },
  { file: 'app/landing.css', prefixes: ['.lp'] },
  { file: 'app/legal.css', prefixes: ['.legal'] },
];

/** Selectors, with comments and at-rule bodies handled. */
function leadingSelectors(css: string): readonly string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  let keyframesAt: number | null = null;

  for (const ch of clean) {
    if (ch === '{') {
      const head = buf.trim();
      if (head.startsWith('@keyframes')) keyframesAt = depth;
      else if (!head.startsWith('@') && keyframesAt === null) {
        for (const part of head.split(',')) {
          const first = part.trim().split(/[\s>+~]/)[0];
          if (first !== undefined && first !== '') out.push(first);
        }
      }
      buf = '';
      depth += 1;
    } else if (ch === '}') {
      buf = '';
      depth -= 1;
      if (keyframesAt !== null && depth <= keyframesAt) keyframesAt = null;
    } else {
      buf += ch;
    }
  }
  return out;
}

describe('page stylesheets namespace themselves', () => {
  for (const { file, prefixes } of SHEETS) {
    it(`${file} keeps to ${prefixes.join(', ')}`, () => {
      const selectors = leadingSelectors(readFileSync(file, 'utf8'));
      expect(selectors.length).toBeGreaterThan(4); // the parser found something

      const escaped = selectors.filter(
        (s) => !prefixes.some((p) => s === p || s.startsWith(`${p}-`) || s.startsWith(`${p}.`) || s.startsWith(`${p}:`)),
      );
      expect(escaped, `these leak into every other screen: ${escaped.join(', ')}`).toEqual([]);
    });
  }

  it('reads a sheet that leaks as a failure', () => {
    // The bug itself, so the check above is known to be able to fail.
    const leaky = '.gate { color: red; }\n.entry-row { display: flex; }\n';
    const escaped = leadingSelectors(leaky).filter((s) => !s.startsWith('.gate'));
    expect(escaped).toEqual(['.entry-row']);
  });

  it('does not mistake a keyframe stop for a selector', () => {
    const css = '@keyframes spin { from { opacity: 0; } to { opacity: 1; } }\n.gate a { color: red; }';
    expect(leadingSelectors(css)).toEqual(['.gate']);
  });

  it('reads every selector in a comma-separated list', () => {
    expect(leadingSelectors('.gate .a,\n.b .c { color: red; }')).toEqual(['.gate', '.b']);
  });
});

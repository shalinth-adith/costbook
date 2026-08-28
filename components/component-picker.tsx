'use client';

import { useMemo, useRef, useState } from 'react';

import type { Ingredient } from '@/core/ingredient';
import { ingredientCost, ratePerUnit } from '@/core/ingredient';
import type { Recipe, RecipeBook } from '@/core/recipe';
import { isComplete, recipeCost } from '@/core/recipe';

import { ORG } from '@/lib/data';
import { DASH, rate } from '@/lib/format';

export type PickerChoice =
  | { readonly kind: 'ingredient'; readonly ingredient: Ingredient }
  | { readonly kind: 'recipe'; readonly recipe: Recipe };

interface Row {
  readonly key: string;
  readonly name: string;
  readonly meta: string;
  readonly rateText: string;
  readonly uses: string;
  readonly isSub: boolean;
  readonly noRate: boolean;
  readonly choice: PickerChoice;
}

/**
 * Search sits after the last entered row and caps at four results with
 * internal scroll, so the list opens into empty space rather than over the
 * lines being typed (A11).
 *
 * Ingredients and the operator's own recipes appear in one list, sub-recipes
 * badged — because at the moment of adding, "a parotta" is one thing whether
 * it is bought in or made in house.
 */
export function ComponentPicker({
  shelf,
  recipes,
  book,
  excludeRecipeId,
  usedInCount,
  onPick,
}: {
  shelf: readonly Ingredient[];
  recipes: readonly Recipe[];
  book: RecipeBook;
  excludeRecipeId: string;
  usedInCount: (name: string) => number;
  onPick: (choice: PickerChoice) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo<readonly Row[]>(() => {
    const ing: Row[] = shelf.map((i) => {
      const c = ingredientCost(i);
      return {
        key: `i:${i.name}`,
        name: i.name,
        meta: `${i.purchaseUnit} pack${i.yieldIsAssumed ? ' · no yield on file' : ` · yield ${i.yieldPercent}%`}`,
        rateText:
          c.ratePerBaseUnit === null
            ? 'no rate on file'
            : `${ORG.currencySymbol} ${rate(ratePerUnit(c.ratePerBaseUnit, i.purchaseUnit))} / ${i.purchaseUnit}`,
        uses: `${usedInCount(i.name)} recipes`,
        isSub: false,
        noRate: c.ratePerBaseUnit === null,
        choice: { kind: 'ingredient', ingredient: i },
      };
    });

    const subs: Row[] = recipes
      // A recipe can never be a component of itself. The full loop check runs
      // on add; this only keeps the obvious case out of the list.
      .filter((r) => r.id !== excludeRecipeId)
      .map((r) => {
        const c = recipeCost(r, book);
        const per = isComplete(c) ? c.costPerBase : null;
        return {
          key: `r:${r.id}`,
          name: r.name,
          meta: `own recipe · yields ${r.outputQty} ${r.outputUnit}`,
          rateText:
            per === null
              ? 'a rate is missing inside it'
              : `${ORG.currencySymbol} ${rate(per)} / base unit`,
          uses: `${usedInCount(r.name)} recipes`,
          isSub: true,
          noRate: per === null,
          choice: { kind: 'recipe', recipe: r },
        };
      });

    const all = [...subs, ...ing];
    const q = query.trim().toLowerCase();
    return q === '' ? all : all.filter((r) => r.name.toLowerCase().includes(q));
  }, [shelf, recipes, book, excludeRecipeId, usedInCount, query]);

  const showing = Math.min(rows.length, 4);

  return (
    <div className="picker">
      <label className="label" htmlFor="add-component">Add a component</label>

      <div className="search-field">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="9" cy="9" r="5.4" />
          <path d="m13.2 13.2 3.2 3.2" />
        </svg>
        <input
          id="add-component"
          ref={inputRef}
          value={query}
          placeholder="Search ingredients and your own recipes"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="picker-results"
        />
        {query !== '' ? (
          <button type="button" className="link link-sm" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="picker-panel" id="picker-results">
          <div className="picker-count">
            {rows.length === 0
              ? `Nothing in your list matches “${query}”`
              : `${rows.length} match${rows.length === 1 ? '' : 'es'}${rows.length > showing ? ` · showing ${showing}` : ''}`}
          </div>

          {rows.length > 0 ? (
            <ul className="picker-list">
              {rows.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    className="picker-row"
                    onClick={() => { onPick(r.choice); setQuery(''); setOpen(false); }}
                  >
                    {r.isSub ? <span className="figure sub-badge">SUB</span> : null}
                    <span className="picker-text">
                      <span className="picker-name">{r.name}</span>
                      <span className="picker-meta">{r.meta}</span>
                    </span>
                    <span className={`figure picker-rate${r.noRate ? ' is-missing' : ''}`}>{r.rateText}</span>
                    <span className="picker-uses">in {r.uses}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="picker-foot">
            {query.trim() === '' ? (
              <span className="picker-hint">
                The list stops at four and scrolls, so the lines you have already entered stay in view.
              </span>
            ) : (
              <span className="picker-hint">
                <strong>Add “{query.trim()}” as a new ingredient</strong>
                <br />
                you will be asked for its pack size and rate
              </span>
            )}
            <button type="button" className="link link-sm" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

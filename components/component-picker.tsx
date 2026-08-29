'use client';

import { useMoney } from './currency-provider';

import { useMemo, useRef, useState } from 'react';

import type { Ingredient } from '@/core/ingredient';
import type { Pantry, Recipe } from '@/core/recipe';

import { KIND_HINT, KIND_LABEL } from '@/lib/data';

import { IngredientEntry, type NewIngredient } from './ingredient-entry';
import { type PickerChoice, countRows, pickerGroups } from '@/lib/picker';

export type { PickerChoice };

export function ComponentPicker({
  shelf,
  recipes,
  pantry,
  excludeRecipeId,
  usedInCount,
  onPick,
  alwaysOpen = false,
  onCreateIngredient,
  creating = false,
}: {
  shelf: readonly Ingredient[];
  recipes: readonly Recipe[];
  pantry: Pantry;
  excludeRecipeId: string;
  usedInCount: (name: string) => number;
  onPick: (choice: PickerChoice) => void;
  /** Inside a drawer the list is the whole point, so it does not wait for focus. */
  alwaysOpen?: boolean;
  /**
   * Create an ingredient from here, without leaving the recipe.
   *
   * This is arguably the more common way one gets created - mid-recipe,
   * because something is missing. Navigating to the Ingredients screen would
   * lose the line the chef was in the middle of writing, so it cannot be a
   * redirect (A20).
   */
  onCreateIngredient?: (i: NewIngredient) => void;
  creating?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(alwaysOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(
    () => pickerGroups({ shelf, recipes, pantry, excludeRecipeId, usedInCount, query }),
    [shelf, recipes, pantry, excludeRecipeId, usedInCount, query],
  );

  const total = countRows(groups);

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
          placeholder="Search your ingredients and your dishes"
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
            {total === 0
              ? `Nothing in your list matches “${query}”`
              : `${total} match${total === 1 ? '' : 'es'}, grouped by what each one is`}
          </div>

          <div className="picker-scroll">
            {groups.map((group) => (
              <section key={group.kind} className={`picker-group is-${group.kind}`}>
                <header className="picker-group-head">
                  <span className="picker-group-title">{KIND_LABEL[group.kind]}</span>
                  <span className="picker-group-hint">{KIND_HINT[group.kind]}</span>
                </header>

                <ul className="picker-list">
                  {group.rows.map((r) => (
                    <li key={r.key}>
                      <button
                        type="button"
                        className={`picker-row${r.blocked !== null ? ' is-blocked' : ''}`}
                        disabled={r.blocked !== null}
                        onClick={() => { onPick(r.choice); setQuery(''); setOpen(false); }}
                      >
                        <span className="picker-kind">
                          {r.kind === 'dish' ? (
                            <span className="figure sub-badge">DISH</span>
                          ) : (
                            <span className="figure ing-badge">BUY</span>
                          )}
                        </span>
                        <span className="picker-text">
                          <span className="picker-name">{r.name}</span>
                          <span className={`picker-meta${r.blocked !== null ? ' is-blocked' : ''}`}>
                            {r.blocked ?? r.meta}
                          </span>
                        </span>
                        <span className={`figure picker-rate${r.noRate ? ' is-missing' : ''}`}>{r.rateText}</span>
                        <span className="picker-uses">in {r.uses}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="picker-foot">
            {query.trim() === '' ? (
              <span className="picker-hint">
                The list scrolls, so the lines you have already entered stay in view.
              </span>
            ) : total === 0 ? (
              <span className="picker-hint">
                Nothing called <strong>{query.trim()}</strong>. Add it here — the recipe stays
                open behind this.
              </span>
            ) : (
              <span className="picker-hint">
                Not what you meant? Add <strong>{query.trim()}</strong> as a new ingredient below.
              </span>
            )}
            {alwaysOpen ? null : (
              <button type="button" className="link link-sm" onClick={() => setOpen(false)}>Close</button>
            )}
          </div>
        </div>
      ) : null}

      {/* Same four fields, same default, same live rate as the Ingredients
          screen — one interaction in a smaller space (A20). */}
      {open && query.trim() !== '' && onCreateIngredient !== undefined ? (
        <div className="picker-create">
          <IngredientEntry
            rows={[]}
            compact
            busy={creating}
            seedName={query.trim()}
            onAdd={onCreateIngredient}
          />
        </div>
      ) : null}
    </div>
  );
}

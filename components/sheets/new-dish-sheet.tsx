'use client';

import { useState } from 'react';

import { Sheet } from '../sheet';
import { Stepper } from '../stepper';

const CATEGORIES = [
  'Breakfast', 'Starters', 'Mains', 'Biryani', 'Snacks', 'Beverages', 'Desserts',
] as const;

/**
 * New dish: two things, then out of the way.
 *
 * A name and a batch size are all that is needed, because portions is the
 * divisor under every cost that follows - asking for it later would mean
 * recalculating everything. Category is offered because the list is grouped by
 * it, and defaults rather than blocking. Enter creates the dish and opens it
 * empty, with a dash where the cost will be (A16).
 */
export function NewDishSheet({
  open,
  onClose,
  busy,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onCreate: (dish: { name: string; category: string; portions: number }) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('Mains');
  const [portions, setPortions] = useState(4);

  const ready = name.trim() !== '';

  const create = () => {
    if (!ready || busy) return;
    onCreate({ name: name.trim(), category, portions });
    setName('');
    setPortions(4);
  };

  return (
    <Sheet
      title="Name the dish"
      open={open}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={create}>
            {busy ? 'Creating...' : 'Create and start costing'}
          </button>
        </>
      }
    >
      <p className="sheet-copy">
        Two things now, both changeable later. Everything else - components, price, prep notes -
        comes after, on the dish itself.
      </p>

      <label className="field">
        <span className="label">What is it called</span>
        <input
          value={name}
          autoFocus
          placeholder="Ghee Podi Idly Fry"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }}
        />
        <span className="field-work">
          Write it the way it reads on the menu. This is what a chef will look for.
        </span>
      </label>

      <div className="field">
        <span className="label">Category</span>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`filter-chip${category === c ? ' is-on' : ''}`}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Portions per batch</span>
        <Stepper
          label="portions"
          value={`${portions} ${portions === 1 ? 'portion' : 'portions'}`}
          min={portions <= 1}
          onDown={() => setPortions(Math.max(1, portions - 1))}
          onUp={() => setPortions(portions + 1)}
        />
        <span className="field-work">
          How many portions one batch makes is the divisor for every cost on this dish, which is
          why it is asked now rather than found later. One plate per batch is fine if that is how
          you cook it.
        </span>
      </div>
    </Sheet>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';

import type { Ingredient } from '@/core/ingredient';
import type { Recipe } from '@/core/recipe';
import { looseNumber } from '@/core/loose';
import { isKnownUnit, normaliseUnit } from '@/core/units';

import { type Draft, draftFrom } from '@/lib/draft';

/**
 * New dish — a guided flow, not a form.
 *
 * The brief: somebody who has never seen this screen should understand what
 * is happening and what to do next without asking anyone. The previous
 * version was three unlabelled zones on one page — fields, a box, a table —
 * and the reader had to infer the order. Worse, when a line said "needs a
 * quantity" there was nowhere to put one; the fix was to scroll up and edit
 * the paste.
 *
 * So the page is four named steps in the order they happen, with a rail that
 * shows where you are. Each step says what it is for in one sentence. Before
 * anything is typed there is an example of a pasted recipe and what Costbook
 * makes of it, so the outcome is visible before the work. Every flagged line
 * carries its own "how much?" field. The button says exactly what will happen,
 * and the line under it says where you will land.
 *
 * The numbering is real: these happen in this order, and step 3 does not
 * exist until step 2 has something in it.
 */

const CATEGORIES = [
  'Breakfast',
  'Tiffin',
  'Starters',
  'Mains',
  'Biryani',
  'Snacks',
  'Beverages',
  'Desserts',
] as const;

const PLACEHOLDER = `200 g Onion
Sesame oil - 10 ml
1/2 kg Rice
Sambar 150 g`;

/** What a flagged line was given, right there on its row. */
interface Fix {
  readonly qty: string;
  readonly unit: string;
}

const UNIT_CHOICES = ['g', 'kg', 'ml', 'l', 'pc'] as const;

/**
 * The paste with every inline fix written back into it.
 *
 * The box stays the source of truth and the server is handed one string,
 * exactly as before. A fixed line becomes "<qty> <unit> <name>", which the
 * parser reads cleanly — the same path a line that was typed right the first
 * time takes, so a fixed line and a good line are indistinguishable by the
 * time they are saved.
 */
function withFixes(text: string, draft: Draft, fixes: Readonly<Record<number, Fix>>): string {
  const lines = text.split(/\r?\n/);
  // Draft lines skip blanks and headings, so map draft index back to raw index.
  const rawIndexes: number[] = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t !== '' && !/:$/.test(t)) rawIndexes.push(i);
  });
  const out = [...lines];
  draft.lines.forEach((d, di) => {
    const fix = fixes[di];
    const raw = rawIndexes[di];
    if (fix === undefined || raw === undefined) return;
    const n = looseNumber(fix.qty);
    if (n === null || n <= 0) return;
    out[raw] = `${String(n)} ${fix.unit} ${d.line.name}`;
  });
  return out.join('\n');
}

function Step({
  n,
  title,
  state,
}: {
  n: number;
  title: string;
  state: 'done' | 'current' | 'todo';
}) {
  return (
    <li className={`nd-step is-${state}`}>
      <span className="nd-step-n figure" aria-hidden="true">
        {state === 'done' ? '✓' : n}
      </span>
      <span className="nd-step-t">{title}</span>
    </li>
  );
}

export function NewDishView({
  shelf,
  recipes,
  onCreate,
}: {
  shelf: readonly Ingredient[];
  recipes: readonly Recipe[];
  onCreate: (input: {
    name: string;
    category: string;
    portions: number;
    text: string;
  }) => Promise<{ readonly message: string; readonly id: string | null }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('Mains');
  const [portions, setPortions] = useState(4);
  const [text, setText] = useState('');
  const [fixes, setFixes] = useState<Readonly<Record<number, Fix>>>({});
  const [fault, setFault] = useState<string | null>(null);
  const [showExample, setShowExample] = useState(false);

  // Read the raw paste once to know which rows are flagged...
  const raw = useMemo(() => draftFrom({ text, shelf, recipes }), [text, shelf, recipes]);
  // ...then read the paste with the fixes written in, which is what is shown
  // and what is sent. A fixed row flips to ready the moment its figure lands.
  const finalText = useMemo(() => withFixes(text, raw, fixes), [text, raw, fixes]);
  const draft = useMemo(
    () => draftFrom({ text: finalText, shelf, recipes }),
    [finalText, shelf, recipes],
  );

  const named = name.trim() !== '';
  const counted = draft.lines.length;
  const ready = counted - draft.needing;

  const stepState = (n: number): 'done' | 'current' | 'todo' => {
    const at = !named ? 1 : counted === 0 ? 2 : draft.needing > 0 ? 3 : 4;
    return n < at ? 'done' : n === at ? 'current' : 'todo';
  };

  const submit = () => {
    if (!named || pending) return;
    setFault(null);
    start(async () => {
      const out = await onCreate({ name: name.trim(), category, portions, text: finalText });
      if (out.id === null) {
        setFault(out.message);
        return;
      }
      router.push(`/recipes/${out.id}`);
    });
  };

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <div className="crumbs">
            <Link href="/recipes">Recipes</Link>
            <span aria-hidden="true">/</span>
            <span>New dish</span>
          </div>
          <h1 className="page-title">Add a dish</h1>
          <p className="page-sub">
            Four short steps. Name it, paste what goes in it, check what Costbook
            understood, create. You will land on its cost sheet with everything
            already worked out.
          </p>
        </div>
      </div>

      <div className="nd">
        <ol className="nd-steps" aria-label="Progress">
          <Step n={1} title="Name it" state={stepState(1)} />
          <Step n={2} title="What goes in it" state={stepState(2)} />
          <Step n={3} title="Check" state={stepState(3)} />
          <Step n={4} title="Create" state={stepState(4)} />
        </ol>

        {/* ── 1 ─────────────────────────────────────────────────────── */}

        <section className={`nd-card is-${stepState(1)}`}>
          <div className="nd-card-head">
            <span className="nd-card-n figure">1</span>
            <div>
              <h2 className="nd-h">Name it</h2>
              <p className="nd-lede">
                The name the kitchen uses. Portions is how many plates one batch
                makes — every cost is divided by it, so it is asked now rather
                than later.
              </p>
            </div>
          </div>
          <div className="nd-fields">
            <label className="nd-field nd-field-name">
              <span className="nd-label">Dish name</span>
              <input
                className="set-input"
                value={name}
                autoFocus
                placeholder="Ghee Podi Idly Fry"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  // Enter moves on. A form would submit; this is not a form.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    pasteRef.current?.focus();
                  }
                }}
              />
            </label>
            <label className="nd-field">
              <span className="nd-label">One batch makes</span>
              <div className="nd-portions">
                <input
                  className="set-input figure"
                  type="number"
                  min={1}
                  value={portions}
                  onChange={(e) => setPortions(Math.max(1, Number(e.target.value) || 1))}
                />
                <span className="nd-suffix">portions</span>
              </div>
            </label>
            <label className="nd-field">
              <span className="nd-label">Section</span>
              <select
                className="set-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* ── 2 ─────────────────────────────────────────────────────── */}

        <section className={`nd-card is-${stepState(2)}`}>
          <div className="nd-card-head">
            <span className="nd-card-n figure">2</span>
            <div>
              <h2 className="nd-h">What goes in it</h2>
              <p className="nd-lede">
                Paste the recipe you already have — a note, a message, an old
                sheet. One ingredient a line, written any way you like. Costbook
                reads the amount, the unit and the name; a line it is not sure
                about, it asks you about in the next step.
              </p>
            </div>
            <button
              type="button"
              className="link link-sm nd-example-toggle"
              onClick={() => setShowExample((v) => !v)}
              aria-expanded={showExample}
            >
              {showExample ? 'Hide the example' : 'Show me an example'}
            </button>
          </div>

          {showExample && (
            <div className="nd-example" aria-label="Example">
              <div className="nd-example-col">
                <span className="nd-label">You paste</span>
                <pre className="nd-example-pre">{PLACEHOLDER}</pre>
              </div>
              <span className="nd-example-arrow" aria-hidden="true">→</span>
              <div className="nd-example-col">
                <span className="nd-label">Costbook reads</span>
                <ul className="nd-example-out">
                  <li>
                    <span className="figure">200 g</span> Onion —{' '}
                    <span className="nd-tag is-known">on your shelf</span>
                  </li>
                  <li>
                    <span className="figure">10 ml</span> Sesame oil —{' '}
                    <span className="nd-tag is-known">on your shelf</span>
                  </li>
                  <li>
                    <span className="figure">0.5 kg</span> Rice —{' '}
                    <span className="nd-tag is-linked">your batch</span>
                  </li>
                  <li>
                    <span className="figure">150 g</span> Sambar —{' '}
                    <span className="nd-tag is-linked">your batch</span>
                  </li>
                </ul>
                <p className="nd-example-note">
                  Order does not matter, nor does spacing. A batch you already
                  make is linked, not copied, so its price changes reach this
                  dish on their own.
                </p>
              </div>
            </div>
          )}

          <textarea
            ref={pasteRef}
            className="nd-paste"
            value={text}
            rows={9}
            spellCheck={false}
            placeholder={PLACEHOLDER}
            onChange={(e) => {
              setText(e.target.value);
              // A new paste is a new set of lines; the old fixes point at
              // rows that may no longer exist.
              setFixes({});
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <p className="nd-hint">
            {counted === 0
              ? 'Nothing read yet. Paste, or type a line and press Enter for the next.'
              : `${String(counted)} ${counted === 1 ? 'line' : 'lines'} read. ⌘ Enter creates the dish.`}
          </p>
        </section>

        {/* ── 3 ─────────────────────────────────────────────────────── */}

        {counted > 0 && (
          <section className={`nd-card is-${stepState(3)}`}>
            <div className="nd-card-head">
              <span className="nd-card-n figure">3</span>
              <div>
                <h2 className="nd-h">Check what Costbook understood</h2>
                <p className="nd-lede">
                  {draft.needing === 0 ? (
                    <>Every line is clear. Nothing to do here — go to step 4.</>
                  ) : (
                    <>
                      <span className="figure strong">{draft.needing}</span>{' '}
                      {draft.needing === 1 ? 'line needs' : 'lines need'} something from
                      you, marked below. Type the amount on the row and it is done.
                      Anything you leave, the dish still keeps — it just reports the
                      lowest it could cost until you fill it in.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="nd-sum" aria-label="Summary">
              <span className="nd-chip is-known">
                <b className="figure">{ready}</b> ready to cost
              </span>
              {draft.linked > 0 && (
                <span className="nd-chip is-linked">
                  <b className="figure">{draft.linked}</b> linked to a batch you make
                </span>
              )}
              {draft.created.length > 0 && (
                <span className="nd-chip is-new">
                  <b className="figure">{draft.created.length}</b> new ingredient
                  {draft.created.length === 1 ? '' : 's'} (no price yet)
                </span>
              )}
              {draft.needing > 0 && (
                <span className="nd-chip is-open">
                  <b className="figure">{draft.needing}</b> need you
                </span>
              )}
            </div>

            <div className="card nd-rows">
              {draft.lines.map((row, i) => {
                const { line, match } = row;
                const fix = fixes[i];
                const needsFigure = line.needs === 'quantity' || line.needs === 'unit';
                return (
                  <div key={`${line.raw}-${String(i)}`} className={`nd-row${row.ready ? '' : ' is-open'}`}>
                    <span className="nd-qty figure">
                      {line.qty === null ? '—' : `${String(line.qty)}${line.unit ?? ''}`}
                    </span>
                    <span className="nd-name">{line.name === '' ? line.raw : line.name}</span>
                    <span className="nd-verdict">
                      {match.kind === 'recipe' && (
                        <span className="nd-tag is-linked">your {match.recipe.name}</span>
                      )}
                      {match.kind === 'ingredient' && match.ingredient.purchasePrice !== null && (
                        <span className="nd-tag is-known">on your shelf</span>
                      )}
                      {match.kind === 'ingredient' && match.ingredient.purchasePrice === null && (
                        <span className="nd-tag is-open">on your shelf, no price yet</span>
                      )}
                      {match.kind === 'new' && <span className="nd-tag is-new">new ingredient</span>}
                    </span>

                    {/* The fix, on the row that needs it. "Needs a quantity"
                        with nowhere to type one is a question with no answer
                        box. */}
                    {needsFigure && (
                      <div className="nd-fix">
                        <span className="nd-fix-ask">
                          {line.needs === 'unit' ? 'Which unit?' : 'How much?'}
                        </span>
                        <input
                          className="figure nd-fix-qty"
                          inputMode="decimal"
                          placeholder={line.qty === null ? '250' : String(line.qty)}
                          value={fix?.qty ?? (line.qty === null ? '' : String(line.qty))}
                          aria-label={`amount of ${line.name}`}
                          onChange={(e) => {
                            const typed = e.target.value;
                            // "250 g" typed into the amount box sets both.
                            const m = /^\s*([\d.,/]+)\s*([A-Za-z]+)\s*$/.exec(typed);
                            const tok = m?.[2] ?? '';
                            if (m !== null && isKnownUnit(tok)) {
                              setFixes((f) => ({ ...f, [i]: { qty: m[1] ?? '', unit: normaliseUnit(tok) ?? 'g' } }));
                              return;
                            }
                            setFixes((f) => ({ ...f, [i]: { qty: typed, unit: f[i]?.unit ?? line.unit ?? 'g' } }));
                          }}
                        />
                        <select
                          className="nd-fix-unit"
                          value={fix?.unit ?? line.unit ?? 'g'}
                          aria-label={`unit of ${line.name}`}
                          onChange={(e) =>
                            setFixes((f) => ({
                              ...f,
                              [i]: { qty: f[i]?.qty ?? (line.qty === null ? '' : String(line.qty)), unit: e.target.value },
                            }))
                          }
                        >
                          {UNIT_CHOICES.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 4 ─────────────────────────────────────────────────────── */}

        <section className={`nd-card is-${stepState(4)} nd-card-last`}>
          <div className="nd-card-head">
            <span className="nd-card-n figure">4</span>
            <div>
              <h2 className="nd-h">Create it</h2>
              <p className="nd-lede">
                {!named ? (
                  <>A name is all that is required. Everything else can be added on the cost sheet.</>
                ) : counted === 0 ? (
                  <>
                    Create <b>{name.trim()}</b> empty and add lines on its cost sheet — or paste
                    them above first, which is faster.
                  </>
                ) : (
                  <>
                    Create <b>{name.trim()}</b> with{' '}
                    <span className="figure strong">{counted}</span>{' '}
                    {counted === 1 ? 'line' : 'lines'} —{' '}
                    <span className="figure">{ready}</span> costed straight away
                    {draft.needing > 0 && (
                      <>
                        , <span className="figure">{draft.needing}</span> waiting on a figure
                      </>
                    )}
                    .
                  </>
                )}
              </p>
            </div>
          </div>

          {fault !== null && (
            <div className="card card-note nd-fault">
              <span>{fault}</span>
            </div>
          )}

          <div className="nd-actions">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={!named || pending}
              onClick={submit}
            >
              {pending
                ? 'Creating…'
                : counted > 0
                  ? `Create ${name.trim() === '' ? 'the dish' : name.trim()} with ${String(counted)} ${counted === 1 ? 'line' : 'lines'}`
                  : `Create ${name.trim() === '' ? 'the dish' : name.trim()}`}
            </button>
            <Link href="/recipes" className="btn">
              Cancel
            </Link>
          </div>
          <p className="nd-then">
            <b>Then:</b> you land on {named ? <>{name.trim()}&rsquo;s</> : 'its'} cost sheet. Set a
            selling price there and Costbook tells you what the plate costs, what it keeps, and
            the price that hits your target.
          </p>
        </section>
      </div>
    </>
  );
}

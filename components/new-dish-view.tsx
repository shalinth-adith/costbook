'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';

import type { Ingredient } from '@/core/ingredient';
import type { Recipe } from '@/core/recipe';
import { looseNumber } from '@/core/loose';
import { isKnownUnit, normaliseUnit } from '@/core/units';

import { addIngredient } from '@/app/ingredients/actions';
import { type Draft, draftFrom, matchKey } from '@/lib/draft';
import {
  TOUR,
  TOUR_SKIPPED_KEY,
  type TourStepId,
  checkWords,
  nextLabel,
  shouldTour,
} from '@/lib/tour';

import { IngredientEntry, type NewIngredient } from './ingredient-entry';
import { Sheet } from './sheet';
import { TourNote } from './tour-note';

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

const PLACEHOLDER = `200 g Onion @ 5.08/kg
Sesame oil - 10 ml
1/2 kg Rice
Sambar 150 g per plate`;

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

/**
 * Point one pasted line at the name an ingredient was saved under.
 *
 * The pop-up lets the owner correct a name — "basmati" to "Basmati rice" — and
 * without this the pasted line would go on reading as new and Create would
 * make a second ingredient beside the one just saved. The name is replaced in
 * place, so the amount, the unit and a "per plate" on the same line survive;
 * a line where the old name cannot be found is left exactly as it was.
 */
function renameLine(text: string, index: number, oldName: string, newName: string): string {
  const lines = text.split(/\r?\n/);
  const rawIndexes: number[] = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t !== '' && !/:$/.test(t)) rawIndexes.push(i);
  });
  const at = rawIndexes[index];
  if (at === undefined) return text;
  const line = lines[at] ?? '';
  const pos = line.toLowerCase().indexOf(oldName.toLowerCase());
  if (pos === -1 || oldName === '') return text;
  lines[at] = line.slice(0, pos) + newName + line.slice(pos + oldName.length);
  return lines.join('\n');
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
  tourForced = false,
}: {
  shelf: readonly Ingredient[];
  recipes: readonly Recipe[];
  onCreate: (input: {
    name: string;
    category: string;
    portions: number;
    text: string;
    method: string;
    batchKg: number | null;
  }) => Promise<{ readonly message: string; readonly id: string | null; readonly limit?: boolean }>;
  /** `?tour=1`: run the first-dish tour whatever the book holds. */
  tourForced?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('Mains');
  const [portions, setPortions] = useState(4);
  /** What a batch weighs, for a batter or gravy other dishes use by weight. */
  const [batchKg, setBatchKg] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [method, setMethod] = useState('');
  const [fixes, setFixes] = useState<Readonly<Record<number, Fix>>>({});
  const [fault, setFault] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
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

  /* ── a new ingredient, priced where it is met ─────────────────────────
   *
   * A pasted line naming something that is not in the ingredients list used
   * to be created at Create time with no price, to be dealt with later —
   * which meant a first dish that costed nothing and a promise to come back.
   * Now the line offers a pop-up: the same four fields the Ingredients screen
   * asks, the name already filled, and a price required. Saved, it joins the
   * ingredients list at once, and the line re-reads against it.
   */
  const [adding, setAdding] = useState<{ readonly index: number; readonly name: string } | null>(null);
  const [savingIngredient, setSavingIngredient] = useState(false);
  const [addFault, setAddFault] = useState<string | null>(null);
  /** Bumped to re-seed the form after a refusal, since it clears on commit. */
  const [entryKey, setEntryKey] = useState(0);

  const saveNewIngredient = (input: NewIngredient) => {
    if (adding === null || savingIngredient) return;
    const target = adding;
    setSavingIngredient(true);
    setAddFault(null);
    void (async () => {
      const ack = await addIngredient(input);
      setSavingIngredient(false);
      if (ack.id === null) {
        setAddFault(ack.message);
        setEntryKey((k) => k + 1);
        return;
      }
      if (matchKey(input.name) !== matchKey(target.name)) {
        setText((t) => renameLine(t, target.index, target.name, input.name));
      }
      setAdding(null);
      // The ingredients list arrives from the server with the page. The save
      // revalidates /recipes but not /recipes/new, so the page is re-read here
      // — the paste, the name and everything else typed are kept.
      router.refresh();
    })();
  };

  /* ── the first-dish tour ─────────────────────────────────────────────
   *
   * Each step points at one real field on this screen and waits until it has
   * been answered — see lib/tour.ts for why the tour is the entry and not a
   * lecture about it. Nothing here changes what the four steps do; with the
   * tour off, or skipped, this screen is exactly what it was.
   */

  /** Which step is showing, or null when there is no tour. */
  const [at, setAt] = useState<number | null>(null);

  /** Lines naming an ingredient nobody has priced yet — what Check teaches about. */
  const unpriced = draft.lines.filter(
    ({ line, match }) =>
      line.rate === null &&
      (match.kind === 'new' ||
        (match.kind === 'ingredient' && match.ingredient.purchasePrice === null)),
  ).length;
  const tourState = { counted, unpriced };
  const step = at === null ? null : (TOUR[at] ?? null);

  const endTour = () => {
    setAt(null);
    // Seen, whether finished or skipped: either way it has done its job, and
    // an owner who cancels without creating is not shown it all over again.
    try {
      window.localStorage.setItem(TOUR_SKIPPED_KEY, '1');
    } catch {
      // Storage refused. The book's own state still stops it once a dish exists.
    }
  };

  /*
   * Next always moves on. The tour shows; it does not make anybody type, and
   * "Start typing" at the end hands the screen back at the top — the cursor in
   * the dish name, the page scrolled to it — so filling it in starts where
   * the screen starts. The tour never presses Create for anybody.
   */
  const nextStep = () => {
    if (step === null || at === null) return;
    if (at >= TOUR.length - 1) {
      endTour();
      const first = document.querySelector<HTMLElement>('[data-tour-anchor="name"] input');
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      first?.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
      first?.focus({ preventScroll: true });
      return;
    }
    setAt(at + 1);
  };

  /*
   * Decided after mount, because whether it was skipped lives in this browser.
   * Starting at null means somebody who skipped it never sees it flash in and
   * out; somebody new sees it one frame later.
   */
  useEffect(() => {
    let skipped = false;
    try {
      skipped = window.localStorage.getItem(TOUR_SKIPPED_KEY) === '1';
    } catch {
      // Storage refused — no memory of a skip is the safe reading.
    }
    setAt(shouldTour({ recipeCount: recipes.length, forced: tourForced, skipped }) ? 0 : null);
  }, [tourForced, recipes.length]);

  // Bring the field into view and put the cursor where the step wants it.
  useEffect(() => {
    if (step === null) return;
    const anchor = document.querySelector<HTMLElement>(`[data-tour-anchor="${step.id}"]`);
    if (anchor === null) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    anchor.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    // On the note's button, so Enter moves on without hunting for it. The
    // field is not focused: nobody is being asked to type yet.
    document.querySelector<HTMLElement>('.tn-next')?.focus({ preventScroll: true });
  }, [step]);

  /*
   * The note lines up with the lit tile above it.
   *
   * The tile is the field plus a 10px halo and a 2px outline, so its outer
   * edge sits 12px outside the field on every side. The note is at least as
   * wide as the tile — never narrower than a comfortable reading width — and
   * shares one of its edges: the left, normally; the right, when starting at
   * the left would run past the card, which is what happens to a narrow field
   * at the end of a row. (Pulling it left to the card's edge instead left it
   * lined up with nothing: measured, 124px left of a 160px Section tile.)
   * Measured after layout and again on resize, because only the browser
   * knows how wide the field ended up.
   */
  useLayoutEffect(() => {
    if (step === null || step.id === 'check') return;
    const anchor = document.querySelector<HTMLElement>(`[data-tour-anchor="${step.id}"]`);
    const note = document.querySelector<HTMLElement>('.tn');
    const row = note?.parentElement ?? null;
    if (anchor === null || note === null || row === null) return;
    const RING = 12;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const width = Math.min(r.width + RING * 2, Math.max(a.width + RING * 2, 320));
      let left = a.left - r.left - RING;
      // Would run past the card: share the tile's right edge instead.
      if (left + width > r.width + RING) left = a.right - r.left + RING - width;
      left = Math.max(left, -RING);
      note.style.marginInlineStart = `${String(Math.round(left))}px`;
      note.style.inlineSize = `${String(Math.round(width))}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [step]);

  /*
   * The dimming is done in CSS, by the lit field itself: a near-black shadow
   * spread far enough to cover the whole screen from wherever the field sits
   * (see "the first-dish tour" at the foot of app.css). No overlay element and
   * no walking the page, so nothing here has to run on every render.
   */

  // Escape leaves, from anywhere on the screen.
  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** The note for a step, under the field it is about, or nothing. */
  const note = (id: TourStepId) =>
    step !== null && at !== null && step.id === id ? (
      <TourNote
        step={step}
        index={at}
        total={TOUR.length}
        body={id === 'check' ? checkWords(tourState) : step.p}
        next={nextLabel(id)}
        onNext={nextStep}
        onSkip={endTour}
        id="first-dish-tour"
      />
    ) : null;
  const on = (id: TourStepId) => (step?.id === id ? '' : undefined);

  const submit = () => {
    if (!named || pending) return;
    setFault(null);
    start(async () => {
      const out = await onCreate({ name: name.trim(), category, portions, text: finalText, method, batchKg });
      if (out.id === null) {
        setFault(out.message);
        setLimited(out.limit === true);
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
          {step === null ? (
            <button
              type="button"
              className="link tour-again"
              onClick={() => setAt(0)}
            >
              Show me how this works
            </button>
          ) : null}
        </div>
      </div>

      <div className="nd" data-touring={step !== null ? '' : undefined}>
        <ol className="nd-steps" aria-label="Progress">
          <Step n={1} title="Name it" state={stepState(1)} />
          <Step n={2} title="What goes in it" state={stepState(2)} />
          <Step n={3} title="Check" state={stepState(3)} />
          <Step n={4} title="Create" state={stepState(4)} />
        </ol>

        {/*
          Two columns on a wide screen. The steps read down the left; the
          right is what Costbook understood, updating as you type, and it
          stays in view while you scroll the paste. One column used to stop
          at 1060px and leave a third of the monitor empty.
        */}
        <div className="nd-cols">
        <div className="nd-main">

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
              {/* The tour lights this, not the label: the label stretches
                  across the row, the field does not. */}
              <span className="nd-core nd-core-name" data-tour-anchor="name" data-tour-on={on('name')}>
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
                    // During the tour Enter is its Next; otherwise it moves on to the paste.
                    if (step?.id === 'name') nextStep();
                    else pasteRef.current?.focus();
                  }
                }}
              />
              </span>
            </label>
            {note('name')}
            <label className="nd-field">
              <span className="nd-core nd-core-fit" data-tour-anchor="portions" data-tour-on={on('portions')}>
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
                <span className="nd-suffix nd-suffix-and">and weighs</span>
                <input
                  className="set-input figure nd-kg"
                  inputMode="decimal"
                  placeholder="—"
                  aria-label="Batch weight in kilos"
                  value={batchKg ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setBatchKg(v === '' ? null : Math.max(0, Number(v) || 0));
                  }}
                />
                <span className="nd-suffix">kg</span>
              </div>
              </span>
              <span className="nd-help">
                The weight is optional: give it for a batter or a gravy that other dishes use by the kilo.
              </span>
            </label>
            {note('portions')}
            <label className="nd-field">
              <span className="nd-core" data-tour-anchor="section" data-tour-on={on('section')}>
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
              </span>
            </label>
            {note('section')}
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
                    <span className="figure">200 g</span> Onion at <span className="figure">5.08/kg</span> —{' '}
                    <span className="nd-tag is-known">in your ingredients</span>, this line at the rate you wrote
                  </li>
                  <li>
                    <span className="figure">10 ml</span> Sesame oil —{' '}
                    <span className="nd-tag is-known">in your ingredients</span>
                  </li>
                  <li>
                    <span className="figure">0.5 kg</span> Rice —{' '}
                    <span className="nd-tag is-linked">your batch</span>
                  </li>
                  <li>
                    <span className="figure">150 g</span> Sambar —{' '}
                    <span className="nd-tag is-linked">your batch</span>, <span className="nd-tag is-known">on every plate</span>
                  </li>
                </ul>
                <p className="nd-example-note">
                  A rate on the line — <span className="figure">@ 5.08/kg</span>, or the sheet&rsquo;s own
                  columns, <span className="figure">Onion, 0.26, kg, 5.08</span> — prices that line as
                  your sheet does, and a new ingredient takes it as its rate. &ldquo;per plate&rdquo;
                  puts a line on every plate instead of into the batch.
                  Order does not matter, nor does spacing. A batch you already
                  make is linked, not copied, so its price changes reach this
                  dish on their own.
                </p>
              </div>
            </div>
          )}

          <textarea
            ref={pasteRef}
            data-tour-anchor="paste"
            data-tour-on={on('paste')}
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
          {note('paste')}
          <p className="nd-hint">
            {counted === 0
              ? 'Nothing read yet. Paste, or type a line and press Enter for the next.'
              : `${String(counted)} ${counted === 1 ? 'line' : 'lines'} read. ⌘ Enter creates the dish.`}
          </p>

          {/*
            How it is made, beside what goes in it. Optional: a dish is costed
            without it. It prints on the prep card exactly as typed — the
            cook's own numbering, the cook's own words — and is never costed.
          */}
          <label className="nd-field nd-method">
            <span className="nd-label">
              How to prepare <span className="nd-optional">optional</span>
            </span>
            <textarea
              className="nd-paste nd-paste-method"
              value={method}
              rows={5}
              spellCheck={false}
              placeholder={'1. Soak the dal for 20 minutes.\n2. Grind coarse with the chillies.\n3. Fry in ghee until the raw smell goes.'}
              onChange={(e) => setMethod(e.target.value)}
            />
            <span className="nd-help">
              One step a line, in your own words. It prints on the prep card exactly as you
              write it, and it does not change the cost.
            </span>
          </label>
        </section>


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
              {limited && <Link href="/plans" className="btn btn-primary">See the plans</Link>}
            </div>
          )}

          <div className="nd-actions">
            <span className="nd-core-act" data-tour-anchor="create" data-tour-on={on('create')}>
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
            </span>
          </div>
          {note('create')}
          <p className="nd-then">
            <b>Then:</b> you land on {named ? <>{name.trim()}&rsquo;s</> : 'its'} cost sheet. Set a
            selling price there and Costbook tells you what the plate costs, what it keeps, and
            the price that hits your target.
          </p>
        </section>
        </div>

        <aside
          className="nd-side"
          aria-label="What Costbook understood"
          data-tour-anchor="check"
          data-tour-on={on('check')}
        >
        {note('check')}
        {/* ── 3 ─────────────────────────────────────────────────────── */}

        {counted > 0 ? (
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
                  <b className="figure">{draft.created.length}</b> new —{' '}
                  {draft.created.length === 1 ? 'goes' : 'go'} into your ingredients
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
                      {line.rate !== null ? (
                        <span className="nd-rate"> @ {String(line.rate)}/{line.rateUnit ?? line.unit ?? ''}</span>
                      ) : null}
                    </span>
                    <span className="nd-name">{line.name === '' ? line.raw : line.name}</span>
                    <span className="nd-verdict">
                      {line.perPlate && <span className="nd-tag is-known">on every plate</span>}
                      {match.kind === 'recipe' && (
                        <span className="nd-tag is-linked">your {match.recipe.name}</span>
                      )}
                      {match.kind === 'ingredient' && (match.ingredient.purchasePrice !== null || line.rate !== null) && (
                        <span className="nd-tag is-known">{line.rate !== null ? "in your ingredients, at this line's rate" : 'in your ingredients'}</span>
                      )}
                      {match.kind === 'ingredient' && match.ingredient.purchasePrice === null && line.rate === null && (
                        <span className="nd-tag is-open">in your ingredients, no price yet</span>
                      )}
                      {match.kind === 'new' && line.unit === null && line.rate !== null && (
                        <span className="nd-tag is-known">a cost, {String(line.qty ?? 0)} × {String(line.rate)}</span>
                      )}
                      {match.kind === 'new' && !(line.unit === null && line.rate !== null) && (
                        <span className={`nd-tag ${line.rate !== null ? 'is-known' : 'is-new'}`}>
                          {line.rate !== null
                            ? 'new — added to your ingredients at this rate'
                            : 'new — not in your ingredients yet'}
                        </span>
                      )}
                      {/* Priced here, now, rather than promised for later. */}
                      {match.kind === 'new' && line.rate === null && (
                        <button
                          type="button"
                          className="nd-add"
                          onClick={() => {
                            setAddFault(null);
                            setAdding({ index: i, name: line.name === '' ? line.raw : line.name });
                          }}
                        >
                          Add its price
                        </button>
                      )}
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
        ) : (
          <section className="nd-card is-todo nd-side-rest">
            <div className="nd-card-head">
              <span className="nd-card-n figure">3</span>
              <div>
                <h2 className="nd-h">Check what Costbook understood</h2>
                <p className="nd-lede">
                  Nothing read yet. As you type in step 2, each line appears here with the
                  amount, the unit and the name it read, and one of three tags.
                </p>
              </div>
            </div>
            <ul className="nd-legend">
              <li><span className="nd-tag is-known">in your ingredients</span> Already in your ingredients list with its price, so the line is costed straight away.</li>
              <li><span className="nd-tag is-linked">your batch</span> Something you make — a sambar, a masala. Its own sheet carries the cost.</li>
              <li><span className="nd-tag is-new">new</span> Not in your ingredients list yet. Press <b>Add its price</b> on the line to save it to the list with its pack and price — or leave it, and it is added without a price for later.</li>
            </ul>
          </section>
        )}
        </aside>
        </div>
      </div>

      <Sheet
        title={adding === null ? 'Add an ingredient' : `Add ${adding.name} to your ingredients`}
        open={adding !== null}
        onClose={() => setAdding(null)}
      >
        <p className="nd-add-lede">
          It is not in your ingredients list yet. Give the pack you buy and what the pack
          costs — a 5 kg bag at 200 — and it is saved to the list, so this dish and every
          dish that uses it later is costed from it.
        </p>
        {addFault !== null ? (
          <p className="nd-add-fault" role="alert">
            {addFault}
          </p>
        ) : null}
        <IngredientEntry
          key={`${String(adding?.index ?? -1)}-${String(entryKey)}`}
          rows={[]}
          compact
          requirePrice
          busy={savingIngredient}
          seedName={adding?.name ?? ''}
          onAdd={saveNewIngredient}
        />
      </Sheet>
    </>
  );
}

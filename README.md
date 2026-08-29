# Costbook

Recipe costing for small restaurants. A dish's cost is knowable — ingredient
rates, quantities, yields — but it lives in a spreadsheet that goes stale within
weeks. Costbook reads the sheet you already keep, costs every dish, follows
sub-recipes through their own yields, and reprices the menu the moment one rate
moves.

Web app, desktop and tablet. Single outlet, 20–150 menu items.

## Running it

```sh
npm install
npm run dev        # next dev — the app, on :3000
npm test           # vitest run — 362 tests
npm run typecheck  # core, bench and app, in that order
npm run build      # next build
```

`npm run bench` serves a throwaway page that renders the engine's output with
no interface around it. It gets deleted once the app covers everything it shows.

## The rule that shapes everything

**`core/` is a pure TypeScript package.** Plain objects in, plain objects out,
no imports from Next, React or a database — enforced by its own `tsconfig.json`,
which leaves `DOM` out of `lib` so the engine cannot reach a browser API even by
accident.

The reason is that **a costing bug does not crash.** It produces a plausible
wrong number, which passes every validation and is caught by tests or not at
all. So the engine was built and verified first, against real workbook figures,
with nothing else in the way.

Two rules follow from it, and most of the code exists to keep them true:

- **A figure nobody entered is never invented.** A rate we do not have is
  `null`, never `0` — `0` is reserved for things that are genuinely free, like
  water. A recipe missing one rate reports a *floor*, refuses to suggest a
  price, and never calls that figure a cost.
- **Anything Costbook supplied is labelled where it appears.** An assumed yield,
  a default wastage percentage, a packaging figure: each carries a `DEFAULT`
  chip beside the number it produced, with a way to change it.

## Layout

```
core/       the costing engine — pure functions, no framework dependencies
  units         conversion, aliases, three families that never cross
  ingredient    effective cost after yield; identity, so one onion exists once
  recipe        batch and per-portion pools, flat lines, nesting, cycles
  charges       the ordered compounding stack, forward and reverse
  rounding      every rule, and the lattice each one snaps to
  currency      how each currency writes a figure
  parse         spreadsheets and pasted rows into structured lines

lib/        the view model — what a screen needs, computed from the engine
app/        Next.js App Router: the screens and their server actions
components/ the interface
bench/      a throwaway harness, deleted when Phase 3 is done
```

## What is built

| Screen | Route | |
|---|---|---|
| Sign in | `/sign-in` | Eight states, including every way it goes wrong |
| Dashboard | `/dashboard` | Every dish, worst food cost first, against one target line |
| Recipes | `/recipes` | The library, grouped by category; search reaches into ingredients |
| Cost sheet | `/recipes/[id]` | The core screen. Components, the full sum, the suggested price |
| Ingredients | `/ingredients` | The entry row is the screen; rates, yields, staleness |
| Import | `/import` | Upload, map, review, commit — a sheet becomes a costed menu |

362 tests: 182 on `core/`, 169 on `lib/`, 11 on the bench.

## What is not

- **Settings.** `core/charges.ts` is written and tested and reaches no screen
  yet — the charge stack, tax treatment and costing-model presets all live
  behind it.
- **Persistence.** Edits are held in server memory and lost on restart.
  Supabase replaces `lib/store.ts` at build step 12; the shape it exposes is
  already what a route handler will hand over.
- **Rate history.** The table is specified and nothing records it — a rate
  change overwrites.
- **Auth.** The sign-in screen exists; no session is established behind it.

## Two notes for whoever picks this up

**SheetJS is installed from the vendor, not from npm.** The registry copy is
pinned at 0.18.5 with two high-severity advisories and no fix available, and
this parses files a user hands us. `package.json` points at
`cdn.sheetjs.com/xlsx-0.20.3`, where both are fixed. It will not update through
the registry.

**The engine runs in the browser on the cost sheet.** That is a deliberate
exception to "costing happens on the server": round-tripping a keystroke to
recost a dish would make editing feel broken, and `core/` is pure, so running it
twice costs nothing but agreement. The server's figure is the guarantee; this
one is the user experience — the same trade the cycle check already makes.

## Specification

The PRD, TRD, costing models and flow documents are kept outside this
repository, on purpose. They are what the application is built from, not
something it needs in order to run. The design canvas — foundations and
twenty-one artboards — lives alongside them.

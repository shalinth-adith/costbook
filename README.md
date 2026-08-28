# Costbook

Recipe costing for small restaurants. A dish's cost is knowable — ingredient
rates, quantities, yields — but it lives in a spreadsheet that goes stale within
weeks. Costbook reads the sheet you already keep, costs every dish, follows
sub-recipes through their own yields, and reprices the menu the moment one rate
moves.

Web app, desktop and tablet. Single outlet, 20–150 menu items.

## Current state

Phase 1 — the costing engine. No framework, no database, no auth.

`core/` is a pure TypeScript package: plain objects in, plain objects out, with
no imports from Next, Supabase or React. That boundary is deliberate. A costing
bug does not crash — it produces a plausible wrong number — so it is caught by
tests or it is not caught at all. Building the engine first means it can be
verified exhaustively against real workbook figures with nothing else in the way.

Build step 1 of 25 is complete: repository, TypeScript strict, Vitest.

## Running it

```sh
npm install
npm test         # vitest run
npm run typecheck # tsc --noEmit
```

## Layout

```
core/    the costing engine — pure functions, no framework dependencies
```

Everything else arrives in later build steps, in this order: the engine
(units, ingredient cost with yield, recipe cost with batch and per-portion
pools, nesting, cycle detection, the charge stack, rounding, parsing), then a
throwaway harness that costs a real menu in a browser, then the application.

## Specification

The PRD, TRD, costing models and flow documents are kept outside this
repository, on purpose. They are what the application is built from, not
something it needs in order to run.

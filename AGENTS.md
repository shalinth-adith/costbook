<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# A clean typecheck is not always a clean typecheck

`tsconfig.json` sets `"incremental": true`, so `tsc` caches its results in
`*.tsbuildinfo`. When that cache is stale it will report **zero errors while
real errors exist** — including missing required properties, which cannot
otherwise pass.

This was found by adding a required field to an interface and watching two
construction sites fail to complain. `rm -f *.tsbuildinfo` made both appear:

```
lib/book.ts(179,5): Property 'id' is missing in type ... but required in type 'Member'
lib/store.ts(293,18): Property 'id' is missing in type ... but required in type 'Member'
```

It is the same failure shape as the bugs this codebase keeps turning up: the
tool reports success and nothing happened. Trust a clean typecheck only after

```sh
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit
```

especially after changing a type that other files construct. `*.tsbuildinfo`
is gitignored, so it is per-machine and a colleague's clean run says nothing
about yours.

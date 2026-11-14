# Design extract

Reference material from the Frontguard design import. The live site is built
from [`apps/web`](../../apps/web), so edit `apps/web/src/**`, not this directory.

- `source/`: the authored design pages (`*.dc.html`) and the design tool's
  runtime (`support.js`). Reference only, never built.
- `renders/`: full-page reference renders of those pages.

The design's TanStack Start app used to be copied here as `tanstack/`. It was a
second copy of the code that became `apps/web`, and `src/lib/docs-content.ts`
was byte-identical to the live file, so every docs edit had to be made twice.
The copy was removed. To read it, run
`git show d9249d0:docs/design-extract/tanstack/src/routes/index.tsx`, or list the
tree with `git ls-tree -r --name-only d9249d0 docs/design-extract/tanstack`.

These files are still read by checks:

- `apps/web/src/test/marketing-claims.test.ts` scans `source/*.dc.html` for retired claims.
- `apps/web/scripts/check-doc-links.mjs` scans `source/Docs.dc.html`.
- `npm run sync-version` updates the renderer tag in `source/Docs.dc.html`.

The import write-ups are archived in
[`docs/archive/design-extract.md`](../archive/design-extract.md) and
[`docs/archive/design-spec.md`](../archive/design-spec.md).

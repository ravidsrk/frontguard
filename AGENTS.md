# AGENTS.md

Instructions for coding agents working in this repository. People can use them too.
[CONTRIBUTING.md](CONTRIBUTING.md) covers setup and the pull-request checklist.

## Verify

Run `npm run verify` before you call work done. It runs the build, static checks and tests that
CI gates on, and stops at the first failure. A full run took about 106 s: build 16 s,
typecheck 18 s, lint 6 s, tests 67 s.

- `npm run verify` runs `npm run build`, then `npm run verify:static`, then `npm test`.
- `npm run verify:static` checks version sync, OpenAPI sync, lint, typecheck and doc links.
  CI's `lint` job runs exactly this.
- CI also runs tests on Node 22 and 24, the CLI e2e suite, bundle-size budgets and `npm audit`.
  See `.github/workflows/ci.yml`.
- CLI tests launch Chromium. Install it once with `npx playwright install --with-deps chromium`.

## Tests

- `npm test --workspace=packages/cli` runs the CLI suite plus `scripts/test/`, which checks repo
  structure, workflows and docs. Its coverage floors apply to full runs only.
- Every other workspace except `apps/demo` has a `test` script too, for example
  `npm test --workspace=apps/web` or `npm test --workspace=packages/cloud-api`.
- One file, from inside its package: `cd packages/cli && npx vitest run test/diff/pixel.test.ts`.
- Watch mode: `cd packages/cli && npx vitest`, or `npm run test:watch --workspace=apps/web`.
- CLI e2e needs a build first: `npm run build`, then `npm run test:e2e --workspace=packages/cli`.
- Do not run `npx vitest` from the repository root. It skips each workspace's config and fails.
- `apps/web` tests import `src/routeTree.gen.ts`, which the web build generates. In a fresh clone,
  run `npm run build:web` before running them on their own.

## Where things are

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): package map, run flow and module tables.
- [DECISIONS.md](DECISIONS.md) and [docs/decisions/](docs/decisions/): decision logs and design records.
- [docs/README.md](docs/README.md): index of every maintained doc.

## Synced files

- `VERSION` is the release version. After changing it, run `npm run sync-version`.
  `npm run sync-version:check` fails on drift.
- `apps/web/public/openapi.json` is the API contract. `node scripts/sync-openapi.mjs` copies it
  to `packages/cloud-api/src/openapi.json`, and `npm run build` does the same.
  `npm run check:openapi` fails on drift.
- The GitHub Action is generated. Edit `packages/cli/action.template.yml` and
  `packages/cli/action-run.sh`, then run `node packages/cli/scripts/sync-root-action.mjs`.

## Do not edit casually

- `docs/archive/` holds dated plans, logs and audits. Read it as history, never as current guidance.
- Change `scripts/release.sh` and `.github/workflows/release.yml` only as part of a release.
- `.agent/` is the maintainer's vendored design skill. Leave it as it is.

## Search

The root `.ignore` file hides `.agent/`, `docs/archive/` and old validation outputs from ripgrep
and fd. Pass `--no-ignore` to search them.

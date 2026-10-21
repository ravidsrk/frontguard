# Frontguard Cloud API

Pre-release Cloudflare Workers source. It is **not deployed**. `api.frontguard.dev`
does not resolve, and billing is not a live money path. Stripe code under
`src/billing/` is source only.

This change does not deploy the worker, does not point DNS at `api.frontguard.dev`,
and does not turn billing on.

## Deployment gates

`cloud-api` stays undeployed until all three are true:

1. A user-data erasure path exists (`DELETE /v1/account`), including baselines and reports that account owns.
2. A backup has been restored and compared to its source. The check in this repo is the local fixture drill `test/backup-restore-drill.test.ts`. Production `wrangler d1 time-travel restore` and `wrangler d1 export` were not run.
3. A run never reports `completed` without a baseline comparison.

## Layout

- `src/index.ts` — Hono app + Workers `fetch`/`scheduled` exports. This is
  the single source of truth for the worker bundle. It is not deployed.
- `src/db/` — D1 + in-memory store implementations behind one `Store`
  interface (dev/tests use memory; prod uses D1).
- `src/billing/` — Stripe Checkout source and webhook signature verification
  (SDK-free, Workers-compatible). Not a live billing deployment.
- `src/routes/` — Hono sub-routers (`auth`, `keys`, `screenshots`, `monitors`,
  `dashboard`, `teams`, `billing`).
- `src/storage/screenshots.ts` — R2 + metadata persistence for screenshot
  PNGs produced by the sandbox.
- `src/processor.ts` — Run pipeline. Spins up a Daytona sandbox with
  Playwright when `env.DAYTONA_API_KEY` is set. A run is `completed` only
  after a baseline comparison. With no Daytona key the run is `failed`.
- `src/snapshot.ts`, `src/snapshot-cli.ts` — Node CLI for managing the
  pre-baked Daytona snapshot. Excluded from the Workers bundle (see
  `tsconfig.json`).

## Local dev

```sh
npm run dev               # wrangler dev — Workers runtime
```

`process.env` is not available on Workers; every secret/binding is read
from `env` via Hono's `c.env`. The repo has a pre-commit gate (see
`tsconfig.json`) that keeps `process.env` out of `src/`.

## Tests

```sh
npm test --workspace=packages/cloud-api
npm run typecheck --workspace=packages/cloud-api
npm run lint --workspace=packages/cloud-api
```

## Deploy

Do not run `npm run deploy` or `wrangler deploy` for this package. `wrangler.toml`
still lists a route pattern for `api.frontguard.dev`, but that hostname is not
live and the D1 database id is a placeholder. Deploy stays blocked until the
three gates above are met in production. Meeting them in this tree does not
deploy anything.

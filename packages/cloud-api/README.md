# Frontguard Cloud API

Cloudflare Workers service that backs `api.frontguard.dev` — the API the
CLI, GitHub App, Vercel/Netlify integrations, and Slack app all talk to.

## Layout

- `src/index.ts` — Hono app + Workers `fetch`/`scheduled` exports. This is
  the single source of truth and the bundle wrangler deploys.
- `src/db/` — D1 + in-memory store implementations behind one `Store`
  interface (dev/tests use memory; prod uses D1).
- `src/billing/` — Stripe Checkout + webhook signature verification (SDK-free,
  Workers-compatible).
- `src/routes/` — Hono sub-routers (`auth`, `keys`, `screenshots`, `monitors`,
  `dashboard`, `teams`, `billing`).
- `src/storage/screenshots.ts` — R2 + metadata persistence for screenshot
  PNGs produced by the sandbox.
- `src/processor.ts` — Run pipeline. Spins up a Daytona sandbox with
  Playwright when `env.DAYTONA_API_KEY` is set; otherwise produces a
  baseline-marker result for local dev / tests.
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

```sh
npm run deploy            # wrangler deploy
```

The `routes` block in `wrangler.toml` binds the worker to
`api.frontguard.dev/*`. Cloudflare must own the zone for the route to
attach; see `wrangler.toml` for the secret + DNS prerequisites.

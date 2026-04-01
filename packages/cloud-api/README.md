# Frontguard Cloud API

## Two implementations

- `app/src/index.js` — Deployed to mogra.xyz. Pure fetch handler, zero dependencies. This is production.
- `src/` — Hono-based version for local development and testing. NOT deployed.

The Hono version is the source of truth for business logic. The `app/` version is a manually-synced deployment artifact.

## TODO: Unify
These should be a single implementation. The Hono version should be bundled for deployment.

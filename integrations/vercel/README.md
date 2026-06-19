# @frontguard/vercel-integration

The Vercel-side surface of [Frontguard](https://frontguard.dev) — a small
edge handler that receives Vercel deployment webhooks, validates them, and
forwards preview URLs to the Frontguard Cloud API to run visual regression
checks. Custom-domain previews (e.g. `https://preview.acme.com`) are
accepted out of the box once a user installs the integration on their team.

The user-facing docs live at
[frontguard.dev/docs/integrations/vercel](https://frontguard.dev/docs/integrations/vercel).
This README is the contributor / deployer reference.

## What's in here

```
src/
  handler.ts   Hono app: /api/install, /api/webhook, /health
  install.ts   OAuth flow (authorize URL, token exchange, callback validation)
  webhook.ts   HMAC verify, decision logic, SSRF guard, cloud-api fetch
test/
  install.test.ts   covers install.ts and the /api/install HTTP shell
  webhook.test.ts   covers webhook.ts and the /api/webhook HTTP shell
manifest.yml    Vercel Marketplace listing source-of-truth
vercel.json     Deployment config when hosted on Vercel itself
```

## Endpoints

| Method | Path           | Purpose                                                |
| ------ | -------------- | ------------------------------------------------------ |
| `GET`  | `/health`      | Liveness probe — returns `{status: "ok"}`              |
| `GET`  | `/api/install` | Vercel OAuth install (no `code`) + callback (`?code=`) |
| `POST` | `/api/webhook` | Vercel deployment events (HMAC-signed)                 |

## Install / OAuth flow

`GET /api/install` is dual-mode:

1. **No `code` param** → 302 to Vercel's authorize URL
   (`https://vercel.com/integrations/oauth/authorize?client_id=…&redirect_uri=…`).
2. **`?code=…&configurationId=…&next=…`** → exchange the code for an access
   token at `POST https://api.vercel.com/v2/oauth/access_token`, persist the
   resulting integration record in KV, optionally hit
   `${FRONTGUARD_API_URL}/v1/integrations/vercel/install` to create the matching
   Frontguard team, then 302 to a validated `next` URL.

The token is **never** logged or returned in the response body. The `next` URL
is validated by `safeNextRedirect` — only same-origin relative paths and
allowlisted `vercel.com` / `*.vercel.com` hosts pass; everything else falls back
to `/` to prevent open-redirect abuse.

## Webhook trust model

Why we can accept arbitrary custom-domain preview URLs:

- **HMAC-signed by Vercel.** Every webhook delivery carries an
  `x-vercel-signature` HMAC-SHA1 over the raw body, signed with our integration's
  client secret. The handler fails closed if `VERCEL_CLIENT_SECRET` is missing
  (HTTP 500) or the signature doesn't match (HTTP 401).
- **Install record = consent.** A valid signature proves the event came from
  Vercel for an integration whose secret we hold. The install flow writes a KV
  record per `configurationId` (and per team id). When a webhook arrives, the
  handler looks up `project:<id>` and falls back to `team:<id>` to confirm
  consent.
- **SSRF guard, always on.** Even with consent, the handler rejects any host
  in a private / loopback / link-local range (`127.0.0.0/8`, `169.254.0.0/16`
  including the cloud metadata IP `169.254.169.254`, `10.0.0.0/8`, `172.16/12`,
  `192.168.0.0/16`, `localhost`, `::1`, `fe80::/10`, `fc00::/7`, …) and any
  non-`https:` scheme. `*.vercel.app` is always accepted (Vercel owns the suffix).
- **Idempotent.** When a delivery `id` is present and KV is bound, the handler
  records it for 24h and short-circuits duplicates.

Revoking an installation deletes the KV record, which immediately causes
subsequent custom-domain webhooks to be rejected with HTTP 400.

## Environment variables

| Var                     | Required          | Used for                                                          |
| ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `VERCEL_CLIENT_ID`      | install flow      | Vercel OAuth client id                                            |
| `VERCEL_CLIENT_SECRET`  | always            | OAuth token exchange + webhook signature verification             |
| `VERCEL_REDIRECT_URI`   | install flow      | Public URL of `/api/install` (defaults to `req.url + /api/install`) |
| `FRONTGUARD_API_URL`    | running tests     | Base URL of the Frontguard Cloud API                              |
| `FRONTGUARD_API_KEY`    | running tests     | API key (`Authorization: Bearer …`) for submitting runs           |
| `FRONTGUARD_ROUTES`     | optional          | Comma-separated routes to test (default `/`)                      |

A KV binding called `KV` is optional but **strongly recommended** in production
— without it, install records are not persisted (custom-domain previews stay
locked to `*.vercel.app`) and duplicate-delivery dedup is disabled.

## Local development

```sh
npm install              # at repo root — workspaces install deps
cd integrations/vercel
npm run typecheck
npm test
```

The tests stub `fetch`, time, KV, and `globalThis.crypto.subtle`, so no
external services or secrets are required.

## Deploying

The handler is a Hono app and ships with a `vercel.json` that targets the
Edge runtime. Two supported targets:

### As a Vercel function

```sh
# From integrations/vercel/
vercel link
vercel env add VERCEL_CLIENT_ID
vercel env add VERCEL_CLIENT_SECRET
vercel env add VERCEL_REDIRECT_URI    # https://<your-host>/api/install
vercel env add FRONTGUARD_API_URL
vercel env add FRONTGUARD_API_KEY
vercel deploy --prod
```

Add a KV (Edge Config / Upstash Redis / Workers KV-compatible) binding called
`KV` for persistence.

### As a Cloudflare Worker

The handler is Workers-compatible (no Node APIs, only Web Crypto). Bundle
`src/handler.ts` and bind a KV namespace as `KV`. Drop `vercel.json`; use a
`wrangler.toml` instead.

## Marketplace listing

`manifest.yml` is the source of truth for the Vercel Marketplace listing
(name, scopes, redirect URL, webhook URL, requested permissions). When the
listing is published or edited via Vercel's Integration Console, mirror those
fields back into this file so the repo stays the canonical record.

## Scope explanation

This package is **scoped to `integrations/vercel/`**. It talks to the rest of
the system over HTTP only:

- The Cloud API for run submission (`POST /v1/run`)
- The Cloud API for install registration (`POST /v1/integrations/vercel/install`,
  best-effort — install still completes if the Cloud API is unreachable)

It never imports from `packages/cloud-api/`, `apps/web/`, or any sibling
workspace.

# Frontguard Slack app

A native Slack app for [Frontguard](https://frontguard.dev) — visual regression
checks invoked from Slack, with results posted back into the channel where you
asked.

## What it does

- `/frontguard status <url>` — submits a visual-regression run to the Frontguard
  Cloud API against `<url>`, acks immediately, and posts the result back to the
  same channel via the slash command's `response_url`.
- **SSRF guard (defense-in-depth).** Before any Cloud API call, the worker
  validates `<url>` with the shared `@frontguard/cloud-api/render-target`
  helpers: private / loopback / link-local host literals (including cloud
  metadata `169.254.169.254`) are rejected in the slash-command parser, and
  hostnames are DNS-resolved and re-checked before `POST /v1/run`. The Cloud
  API applies the same guard again at the render entrypoint.
- `/frontguard help` — shows usage.
- OAuth v2 install per workspace — bot tokens are stored in Workers KV keyed by
  Slack `team_id` so a single deployment serves every workspace that installed
  the app (multi-team aware).

## Architecture

The slack-app is a [Hono](https://hono.dev) handler deployed to Cloudflare
Workers. State lives in a single KV namespace (`SLACK_TEAMS`) and all secrets
are set via `wrangler secret put`.

```
Slack →  POST /slack/commands     ← signed (HMAC-SHA256 over body+timestamp)
Slack →  POST /slack/events       ← signed
Slack →  GET  /slack/oauth/callback
                  ↓
        Cloudflare Worker (this package)
                  ↓ submits run
        Frontguard Cloud API (your FRONTGUARD_API_URL)
                  ↓ poll until terminal
        Slack response_url (delayed in-channel reply)
```

## Environment

| Name | Source | Purpose |
|------|--------|---------|
| `SLACK_SIGNING_SECRET` | `wrangler secret` | Verifies the HMAC on `POST /slack/*` requests. |
| `SLACK_CLIENT_ID` | `wrangler secret` | OAuth v2 client id. |
| `SLACK_CLIENT_SECRET` | `wrangler secret` | OAuth v2 client secret. |
| `SLACK_REDIRECT_URI` | `wrangler secret` | Exact OAuth redirect URL — must match the manifest. |
| `SLACK_SCOPES` | `wrangler.toml` `vars` | Bot scopes (default `chat:write,commands`). |
| `FRONTGUARD_API_URL` | `wrangler secret` | **Required.** Cloud API base URL for your self-hosted deployment. |
| `FRONTGUARD_API_KEY` | `wrangler secret` | Server-side API key the worker uses to submit runs on behalf of each Slack workspace. |
| `SLACK_TEAMS` | `wrangler.toml` `kv_namespaces` binding | KV namespace storing per-team installs. |

`SLACK_TEAMS` keys are `team:<team_id>`; values are JSON of the form:

```json
{
  "teamId": "T01234567",
  "teamName": "Acme Corp",
  "accessToken": "xoxb-…",
  "botUserId": "U09876543",
  "scope": "chat:write,commands",
  "installedAt": "2026-06-15T12:00:00.000Z"
}
```

## Deploy (Cloudflare Workers)

1. **Install the toolchain**

   ```bash
   npm install
   npm install --global wrangler
   wrangler login
   ```

2. **Create the KV namespace** that holds per-team installs:

   ```bash
   wrangler kv:namespace create SLACK_TEAMS
   ```

   Paste the returned `id` into `wrangler.toml` (replace
   `REPLACE_WITH_KV_NAMESPACE_ID`).

3. **Set secrets** (do not put these in `wrangler.toml`):

   ```bash
   wrangler secret put SLACK_SIGNING_SECRET
   wrangler secret put SLACK_CLIENT_ID
   wrangler secret put SLACK_CLIENT_SECRET
   wrangler secret put SLACK_REDIRECT_URI
   wrangler secret put FRONTGUARD_API_URL
   wrangler secret put FRONTGUARD_API_KEY
   ```

4. **Pick a host**. Either:
   - Use the default `*.workers.dev` subdomain (good for dev), or
   - Configure a custom Workers route on `slack.frontguard.dev`.

   Whichever you pick, update the three URLs in `manifest.yml` to match —
   they must be identical to what Slack sees.

5. **Deploy**:

   ```bash
   wrangler deploy
   ```

6. **Smoke-test**:

   ```bash
   curl https://<your-host>/health
   # → {"status":"ok","integration":"slack-app"}
   ```

## Register the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From an app manifest**.
2. Choose your workspace, paste `manifest.yml`, and confirm.
3. On the **Basic Information** page, copy:
   - **Signing Secret** → `wrangler secret put SLACK_SIGNING_SECRET`
   - **Client ID** → `wrangler secret put SLACK_CLIENT_ID`
   - **Client Secret** → `wrangler secret put SLACK_CLIENT_SECRET`
4. On the **OAuth & Permissions** page, confirm:
   - Redirect URL matches `SLACK_REDIRECT_URI` exactly.
   - Bot scopes include `chat:write` and `commands`.
5. On the **Event Subscriptions** page, confirm:
   - Request URL is `https://<your-host>/slack/events`.
   - Slack should auto-verify via the `url_verification` challenge.
6. Click **Install to Workspace** and approve. Slack redirects to
   `<your-host>/slack/oauth/callback?code=…`; the worker exchanges the code,
   persists the install to KV, and returns `{ ok: true, team: "T…" }`.

## Submit to the Slack App Directory

When you are ready to make the app installable by any workspace:

1. <https://api.slack.com/apps/<APP_ID>/distribute>
2. Toggle **Public Distribution** on.
3. Fill out:
   - Direct install URL — your hosted "Add to Slack" landing page (the
     marketing site can point at `<your-host>/slack/oauth/callback` to start
     the flow, since that endpoint auto-redirects to Slack's authorize URL
     when no `code` is present).
   - Short / long description, support email, privacy policy, terms.
4. Submit for review. Slack typically reviews within 5–10 business days.

## Local development

```bash
npm install
npm run typecheck
npm run test
```

The unit tests use vitest + a stubbed `KVNamespace` / `fetch` — no live Slack
or Cloud API calls.

## Layout

```
src/
  handler.ts    — Hono routes, signature checks, OAuth callback, slash dispatch.
  verify.ts     — Slack HMAC signature verification (Web Crypto).
  events.ts     — Pure parsing + decisioning for events + slash commands.
  oauth.ts      — `oauth.v2.access` exchange.
  storage.ts    — KV-backed `team_id → install` store.
  runs.ts       — Cloud-API run submission + delayed `response_url` delivery.
  slack-api.ts  — `chat.postMessage` + Block Kit result blocks.
  index.ts      — Default export of the Hono app for `wrangler deploy`.
test/           — vitest unit tests for every module.
manifest.yml    — Slack app manifest (paste into api.slack.com).
wrangler.toml   — Cloudflare Workers deploy config.
```

## Troubleshooting

- **401 Invalid signature** — the signing secret in `wrangler secret put` does
  not match the one on the Slack app page, or the request body is being
  re-encoded by a proxy. Verify with `wrangler tail`.
- **OAuth not configured (500)** — `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`,
  or `SLACK_REDIRECT_URI` is missing or empty.
- **`persisted: false` in OAuth response** — `SLACK_TEAMS` KV binding is not
  set in `wrangler.toml`, so the install was not durably stored. Add the
  binding and re-deploy.
- **Slash command returns "Slack app is missing FRONTGUARD\_API\_URL"** —
  finish setup by adding the cloud-api URL + key (`wrangler secret put`).
- **No follow-up message after a few minutes** — check the worker logs
  (`wrangler tail`) for `Cloud API run submission failed` or
  `pollRunUntilTerminal` errors. The `response_url` is valid for ~30
  minutes after the slash command fires; a delivery older than that will
  drop silently on Slack's side.

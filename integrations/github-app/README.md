# Frontguard for GitHub

The Frontguard GitHub App turns every pull request into a visual-regression
check run, with one-click install and zero CI config.

When a PR opens or its head commit changes the app:

1. Creates an **in-progress** Check Run on the commit.
2. Reads the repo's optional `frontguard.config.ts` / `.github/frontguard.yml`.
3. Resolves the **preview URL** the PR deployed to (Vercel, Netlify or
   Cloudflare Pages — or a configurable template).
4. Calls the Frontguard Cloud API to run visual-regression checks against
   that URL.
5. Updates the Check Run when the run finishes — `success`, `failure`, or
   `neutral` with a summary of pages tested, regressions, and warnings.

On install the app also opens a **bootstrap PR** in every repo that doesn't
have a config yet — `frontguard.config.ts` plus a workflow file pinned to
the tagged release of the action (`ravidsrk/frontguard@v0`).

## Install

The hosted app lives in the GitHub Marketplace:

  → <https://github.com/marketplace/frontguard>

Click **Install**, choose the repositories you want covered, and merge the
bootstrap PR. That's it — your next PR gets a Frontguard check run.

### Choose repositories

The app supports either "All repositories" or a hand-picked subset. The
`installation_repositories` event is honoured, so adding a repo later still
triggers the bootstrap flow.

### Configure the baseline branch

Frontguard compares each PR head against a baseline. By default this is the
repo's default branch (`main` / `master`). To target a different branch, set
`baseline` in `frontguard.config.ts`:

```ts
import { defineConfig } from '@frontguard/cli';

export default defineConfig({
  baseUrl: 'http://localhost:3000',
  routes: ['/'],
  viewports: [375, 768, 1440],
  threshold: 0.01,
});
```

## Self-hosting

The handler is a Cloudflare Worker (see [`wrangler.toml`](./wrangler.toml)).
Self-hosting lets you keep webhooks and the Cloud API inside your own
network — useful for private GHE servers and offline air-gapped setups.

### Deploy target

```bash
cd integrations/github-app
wrangler deploy
```

The default route is `github-app.frontguard.dev/*`; change `[[routes]]` in
`wrangler.toml` to your own hostname before deploying. Whatever hostname
you pick must match the webhook URL configured on the GitHub App.

### Environment variables

| Variable                       | Required | Purpose                                                                   |
| ------------------------------ | -------- | ------------------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET`        | yes      | HMAC secret GitHub signs webhook deliveries with. Fail-closed — without it every webhook is rejected. |
| `GITHUB_APP_ID`                | yes      | Numeric App id from the App settings page.                                |
| `GITHUB_APP_PRIVATE_KEY`       | yes      | PEM-encoded private key (the `.pem` GitHub gives you on App creation).    |
| `FRONTGUARD_API_URL`           | yes      | Base URL of the Cloud API the app forwards runs to.                       |
| `FRONTGUARD_API_KEY`           | yes      | Bearer token the worker presents to the Cloud API.                        |
| `FRONTGUARD_CALLBACK_SECRET`   | yes      | Shared secret the Cloud API presents on `/runs/:id/complete` callbacks. Fail-closed. |
| `FRONTGUARD_PREVIEW_URL_TEMPLATE` | no    | Fallback URL template (e.g. `https://pr-{prNumber}.preview.example.com`) used when no Vercel/Netlify/Cloudflare deployment event has been observed for the PR's head commit. |

Set secrets with `wrangler secret put <NAME>`. Non-secret vars (the template)
can live in `[vars]` in `wrangler.toml`.

### Permissions and scopes

Configured in [`manifest.yml`](./manifest.yml):

| Permission       | Scope  | Why                                                       |
| ---------------- | ------ | --------------------------------------------------------- |
| `pull_requests`  | write  | Read PR metadata + post status; rare write on rebases.    |
| `checks`         | write  | Create / update the visual-regression Check Run.          |
| `contents`       | write  | Read `frontguard.config.*`; open the bootstrap PR.        |
| `metadata`       | read   | Implicit on every GitHub App.                             |
| `statuses`       | read   | Pick up Vercel preview URLs from `commit_status` events.  |
| `deployments`    | read   | Pick up Netlify / Cloudflare Pages preview URLs from `deployment_status` events. |

### Webhook events

The app subscribes to:

- `pull_request` (opened / synchronize / reopened / ready_for_review) — main trigger.
- `installation`, `installation_repositories` — for the bootstrap PR flow.
- `status` — Vercel posts a `success` commit status with `context: "Vercel"` and the preview URL in `target_url`.
- `deployment_status` — Netlify and Cloudflare Pages publish here; we cache the URL keyed by head commit SHA.

## Preview URL detection

The headline bug fix (P0-8): the app no longer hands `pull_request.html_url`
to the Cloud API as the target. That URL points at the PR page on github.com,
not at a deployed preview — running visual checks against it just screenshots
the GitHub UI.

The inference chain, in order:

1. **Provider-observed URL** — a `commit_status` (Vercel) or `deployment_status`
   (Netlify / Cloudflare Pages) seen earlier on the same commit SHA. Cached
   in-memory per worker instance.
2. **`FRONTGUARD_PREVIEW_URL_TEMPLATE`** — rendered with the PR's
   `{owner}`, `{repo}`, `{prNumber}`, `{commitSha}`, `{commitShortSha}`, and
   `{branch}`.
3. **Nothing** — the run is skipped with a `triggered: false` response and
   a `"waiting for a deployment_status…"` reason. We deliberately never fall
   back to the github.com URL.

## Development

```bash
cd integrations/github-app
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
```

The handler is a pure Hono app; tests exercise it without spinning up a real
worker. Mock fetches via `globalThis.fetch = …` in the test scope — see
`test/webhook.test.ts` for the pattern.

## Marketplace listing

The public listing copy and screenshots live in `apps/docs/content/docs/integrations/github.mdx`.
The marketplace flow uses this app's `manifest.yml` for the listing fields:

- `name: Frontguard`
- `url: https://frontguard.dev`
- `hook_attributes.url` — must match the deployed worker route above.
- `default_permissions` — must match the table above; widening these later
  forces existing installs to re-consent.

## License

MIT — see the repo root [`LICENSE`](../../LICENSE) for full terms.

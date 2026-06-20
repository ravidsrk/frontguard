# Frontguard for Netlify

[![npm](https://img.shields.io/npm/v/@frontguard/netlify-plugin.svg)](https://www.npmjs.com/package/@frontguard/netlify-plugin)

A [Netlify Build Plugin](https://docs.netlify.com/integrations/build-plugins/)
that runs [Frontguard](https://frontguard.dev) visual-regression checks against
every deploy preview, posts the results to the originating GitHub PR, and
optionally fails the deploy when regressions are detected.

## What it does

The plugin runs in the `onSuccess` lifecycle (after the deploy is live, so the
preview URL is reachable) and:

1. Resolves the preview URL — `DEPLOY_PRIME_URL`, then `DEPLOY_URL`, then `URL`.
2. POSTs a run to `${apiUrl}/v1/run` using your Frontguard API key.
3. Polls `${apiUrl}/v1/runs/:id` until the run reaches a terminal status
   (`completed` / `failed`), or until the 120s timeout elapses.
4. Posts a Markdown summary to the GitHub PR (when a token is available).
5. If `failBuild = true`, fails the Netlify deploy when the run has any
   regression / changed / failed result, or the top-level status is
   `failed` / `error` / `timeout`.

Production deploys are skipped by default; set `productionToo = true` to
include them. The plugin no-ops when the Netlify `CONTEXT` env var is not set
(for example, when running the same `netlify.toml` locally outside of a
Netlify build).

## Install

```bash
npm install -D @frontguard/netlify-plugin
```

Then add it to `netlify.toml`:

```toml
[[plugins]]
  package = "@frontguard/netlify-plugin"

  [plugins.inputs]
    apiUrl = "https://your-cloud-api.example.com"
    routes = ["/", "/pricing", "/blog"]
    failBuild = false
    productionToo = false
```

## Configuration

### Inputs (`netlify.toml`)

| Input           | Default                      | Description                                                                |
| --------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `apiUrl`        | — **required**               | Frontguard Cloud API base URL. Use your self-hosted deployment or set `FRONTGUARD_API_URL`. |
| `apiKey`        | —                            | Frontguard API key. **Prefer the env var `FRONTGUARD_API_KEY`.**           |
| `routes`        | `["/"]`                      | Routes (paths) to screenshot. Each is appended to the preview URL.         |
| `failBuild`     | `false`                      | Fail the Netlify deploy when the run reports any regression.               |
| `productionToo` | `false`                      | Also run on the `production` deploy context.                               |
| `githubToken`   | —                            | Token to post PR comments. **Prefer the env var `GITHUB_TOKEN`.**          |

### Secrets (Netlify UI → Site settings → Environment variables)

- `FRONTGUARD_API_KEY` — **required**. Create one in your cloud-api dashboard
  or via the API after you deploy `@frontguard/cloud-api`.
- `FRONTGUARD_API_URL` — optional fallback for `apiUrl` when not set in
  `netlify.toml`. Point it at your self-hosted cloud-api base URL.
- `GITHUB_TOKEN` — optional. Enables PR comments. A fine-grained PAT or
  GitHub App token with `issues:write` / `pull_requests:write` is enough.

> Never put `FRONTGUARD_API_KEY` or `GITHUB_TOKEN` in `netlify.toml`. The
> file is committed to your repository. Use Netlify environment variables —
> the plugin will pick them up automatically.

## Plugin manifest

The full manifest is in [`manifest.yml`](./manifest.yml). The Netlify Build
Plugins directory listing is **in review** — until it is live, install via
`netlify.toml` using the in-repo manifest (see the docs site Install section).
Once approved, Netlify reads this manifest when the plugin is installed from
the Marketplace.

```yaml
name: "@frontguard/netlify-plugin"
inputs:
  - name: apiUrl
    required: true
  - name: apiKey
  - name: routes
    default: ["/"]
  - name: failBuild
    default: false
  - name: productionToo
    default: false
  - name: githubToken
```

## How it picks the URL

| Variable             | Set when                                  | Used as                            |
| -------------------- | ----------------------------------------- | ---------------------------------- |
| `DEPLOY_PRIME_URL`   | Always                                    | First-choice preview URL.          |
| `DEPLOY_URL`         | Always                                    | Fallback if the prime URL is empty.|
| `URL`                | Always                                    | Last resort (the production URL).  |
| `REVIEW_ID`          | Deploy previews of GitHub PRs             | PR number for the comment.         |
| `REPOSITORY_URL`     | Always                                    | Parsed to `owner/repo` for comments.|
| `CONTEXT`            | Always (inside a real Netlify build)      | Decides skip / run / production-too.|

If `CONTEXT` is unset — for example, when running `netlify build` locally
without `--cwd-context` — the plugin does nothing. This guards against
accidentally submitting runs from developer machines without a real deploy.

## Failing the build

Set `failBuild = true` to fail the Netlify deploy when Frontguard reports a
regression. A run is considered failing when **any** of the following holds:

- top-level `run.status` is `failed`, `error`, or `timeout`
- any `run.results[].status` is `regression`, `changed`, or `failed`

Warnings and new-baseline results do **not** fail the build.

The full pass/fail rule is implemented in
[`lib/core.js`](./lib/core.js#L218) (`isFailingRun`) — it mirrors the cloud
API's own `deriveOutcome` logic so the Netlify build and the GitHub Check
agree on the verdict.

## Local development

```bash
npm test         # vitest, 36 tests
npm run typecheck # tsc --noEmit on the JS sources (checkJs: true)
```

The plugin is pure ESM JavaScript with JSDoc types. The pure decision logic
lives in [`lib/core.js`](./lib/core.js); [`index.js`](./index.js) only wires
the Netlify lifecycle to it. Unit tests live in
[`test/core.test.js`](./test/core.test.js) and use `fakeFetch` injection —
no network calls.

To test locally against a Netlify deploy without merging, point at a branch
of your repo and trigger a deploy preview from GitHub. Watch the Netlify
deploy log for lines prefixed `[frontguard]`.

## Troubleshooting

### "FRONTGUARD_API_URL / FRONTGUARD_API_KEY not set — skipping run."

The plugin requires both an API URL and an API key. Confirm
`FRONTGUARD_API_KEY` is set in **Site settings → Environment variables**
and that the deploy is using the right scope (you can scope env vars to a
specific deploy context).

### "Skipping: No Netlify CONTEXT set"

You are running outside a Netlify build (for example, `netlify build` locally
without `--cwd-context`, or another tool sourcing `netlify.toml`). This is
expected. To dry-run the plugin locally, set `CONTEXT=deploy-preview`
manually.

### "Skipped: Skipping production context (set productionToo to enable)"

The plugin skips `production` deploys by default to keep your screenshot
budget on previews where reviewers can actually act on regressions. Set
`productionToo = true` in `netlify.toml` to opt in.

### "Run error (non-blocking): ..."

`failBuild = false` (the default) — the plugin logged the error and let the
deploy continue. Set `failBuild = true` if you want errors to surface as
build failures.

### The PR comment never appears

The PR comment is best-effort and requires three things:

- `GITHUB_TOKEN` env var with `pull_requests:write` / `issues:write`.
- `REPOSITORY_URL` parseable as a GitHub URL (Netlify sets this for repos
  connected via GitHub).
- `REVIEW_ID` set — Netlify provides this for deploy previews of GitHub PRs
  but not for branch deploys.

The plugin logs `Could not post PR comment (non-blocking).` when any of
these are missing.

### A timed-out run shouldn't be silent

When the 120s poll deadline elapses, the run is reported as `status: timeout`
and is treated as a failure by `isFailingRun`. With `failBuild = true`, the
build fails; without it, the plugin logs `Run finished: timeout` and
continues. If you regularly hit the timeout, your run is genuinely slow —
reduce the number of routes or contact support to tune your account's
concurrency.

## Migrating from `@frontguard/netlify-plugin@0.1.x`

`0.2.0` changes how the plugin classifies failures. Before, it inspected a
nonexistent `run.results.changed` field; every build looked clean. After,
it inspects `run.results[].status` per the actual cloud API response shape
(see [`packages/cloud-api/src/types.ts`](https://github.com/ravidsrk/frontguard/blob/main/packages/cloud-api/src/types.ts)).
If you had `failBuild = true` set and assumed it was working, expect real
regressions to start failing your deploys after upgrading. Audit recent
deploys against
[app.frontguard.dev](https://app.frontguard.dev) first.

## License

MIT © Frontguard. See [LICENSE](../../LICENSE) at the repo root.

# Frontguard for Netlify

A [Netlify Build Plugin](https://docs.netlify.com/integrations/build-plugins/) that runs [Frontguard](https://frontguard.dev) visual-regression checks against every deploy preview and posts the results to your GitHub PR.

## What it does

On every successful deploy (the `onSuccess` lifecycle), the plugin:

1. Resolves the deploy preview URL (`DEPLOY_PRIME_URL`).
2. Triggers a Frontguard Cloud run against that URL.
3. Polls until the run finishes.
4. Posts a results summary to the originating GitHub PR (if a token is set).
5. Optionally fails the build when visual changes are detected.

Production deploys are skipped by default — set `productionToo = true` to include them.

## Install

```bash
npm install -D @frontguard/netlify-plugin
```

Then add it to `netlify.toml`:

```toml
[[plugins]]
  package = "@frontguard/netlify-plugin"

  [plugins.inputs]
    apiUrl = "https://api.frontguard.dev"
    routes = ["/", "/pricing"]
    failBuild = false
    productionToo = false
```

## Configuration

| Input           | Default                       | Description                                            |
| --------------- | ----------------------------- | ------------------------------------------------------ |
| `apiUrl`        | `https://api.frontguard.dev`  | Frontguard Cloud API base URL.                         |
| `apiKey`        | —                             | API key. **Prefer the env var below.**                 |
| `routes`        | `["/"]`                       | Routes (paths) to screenshot.                          |
| `failBuild`     | `false`                       | Fail the deploy when visual changes are detected.      |
| `productionToo` | `false`                       | Also run on the production context.                    |
| `githubToken`   | —                             | Token for PR comments. **Prefer the env var below.**   |

### Secrets (set in the Netlify UI → Site settings → Environment variables)

- `FRONTGUARD_API_KEY` — **required**. Your Frontguard API key.
- `GITHUB_TOKEN` — optional. Enables PR comments. Needs `issues:write` / `pull_requests:write`.

> ⚠️ Never put `FRONTGUARD_API_KEY` or `GITHUB_TOKEN` in `netlify.toml` — it's committed to your repo. Use Netlify environment variables.

## How it picks the URL

The plugin prefers `DEPLOY_PRIME_URL` (the stable per-deploy permalink), falling back to `DEPLOY_URL`, then `URL`. PR comments require `REVIEW_ID` (set automatically for GitHub deploy previews) and a `REPOSITORY_URL` pointing at GitHub.

## Local development

```bash
npm test        # run unit tests
npm run typecheck
```

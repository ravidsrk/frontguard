# Contributing to Frontguard

Thanks for your interest in contributing! Here's how to get started.

- [AGENTS.md](./AGENTS.md): the short version for coding agents, with the verify and test commands.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): package map, run flow and module tables.
- [docs/README.md](./docs/README.md): index of every maintained doc.

## Development setup

```bash
# Clone the repo
git clone https://github.com/ravidsrk/frontguard.git
cd frontguard

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install --with-deps chromium

# Build
npm run build

# Run tests
npm test
```

## Project structure

The full map, with a module table for each package, is in
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

```
packages/
├── cli/                          # @frontguard/cli — the visual regression engine
│   ├── src/cli/                  # CLI entry + commands (init, run, doctor, render, monitor, …)
│   ├── src/core/                 # Pipeline orchestrator, config, types, plugin system
│   ├── src/diff/                 # Pixelmatch + SSIM + AI vision + fix verification
│   ├── src/discovery/            # Route discovery (crawler, filesystem, storybook, ladle, histoire)
│   ├── src/render/               # Playwright renderer + Docker-renderer adapter
│   ├── src/sandbox/              # Local + Daytona fix-verification sandboxes
│   ├── src/plugins/              # accessibility, figma, monitor, perf-budgets, text-snapshot, third-party-scripts
│   ├── src/storage/              # Baseline orphan branch + fix-pattern DB
│   ├── docker/                   # Pinned render environment (Dockerfile + compose)
│   └── bin/frontguard-render     # Thin render binary used by the Daytona sandbox
├── cloud-api/                    # @frontguard/cloud-api — Cloudflare Workers + Hono + D1 + R2
├── playwright/                   # @frontguard/playwright — Playwright plugin
├── mcp/                          # @frontguard/mcp — MCP server for in-IDE agents
└── create-frontguard-plugin/     # Plugin scaffolder

integrations/
├── github-app/                   # GitHub App (preview-URL detection, Check Runs, bootstrap PR)
├── netlify/                      # @frontguard/netlify-plugin — Build Plugin
├── slack-app/                    # Slack OAuth + slash commands (KV-persisted installs)
└── vercel/                       # Vercel OAuth + custom-domain preview support

apps/
├── web/                          # frontguard.dev — TanStack Start on Cloudflare Workers
└── demo/                         # Small Next.js target app for exercising the CLI

demo/                             # Pre-release demo gate card (GIF + editable SVG source)
validation/                       # OSS-repo harness + measured results (results-v0.2.md)
scripts/                          # sync-version.ts, sync-openapi.mjs, release.sh, stats.ts; tests in scripts/test/
docs/                             # Maintained docs (index: docs/README.md); history in docs/archive/
```

## Running in development

```bash
# Web app (marketing + docs) — TanStack Start dev server
npm run dev:web

# Cloud API worker
npm run dev:api

# CLI against a local app (after npm run build:cli)
node packages/cli/dist/cli/index.js run --url http://localhost:3000

# Lint + typecheck across workspaces
npm run lint
npm run typecheck
```

## Tests

```bash
# Build, then version and OpenAPI sync, lint, typecheck and doc links,
# then all tests. Stops at the first failure.
npm run verify

# Only the static checks (what the CI lint job runs)
npm run verify:static

# Run all tests
npm test

# Run one workspace's tests
npm test --workspace=packages/cli

# Run one test file, from inside its package so that package's config applies
cd packages/cli && npx vitest run test/diff/pixel.test.ts

# Watch mode
cd packages/cli && npx vitest
npm run test:watch --workspace=apps/web
```

Don't run `npx vitest` from the repository root. It ignores each workspace's config,
so suites that rely on it fail.

## Submitting a PR

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add or update tests as needed
4. Run `npm run verify` and make sure it passes. It covers the build, static checks and
   tests that CI gates on; CI also runs the e2e, bundle-size and `npm audit` jobs.
5. Write a clear PR description explaining what and why
6. Submit the PR

## Releasing

Frontguard's release flow is fully reproducible and lives in
[`scripts/release.sh`](./scripts/release.sh) — no hidden steps, no out-of-band
publishes. Maintainers cutting a new version:

1. Bump `VERSION` and run `npm run stats` so `scripts/stats.json` reflects
   the new build.
2. Update [`CHANGELOG.md`](./CHANGELOG.md): move `[Unreleased]` content into
   a dated `[X.Y.Z] - YYYY-MM-DD` section, leave a fresh `[Unreleased]`
   placeholder.
3. `bash scripts/release.sh --dry-run` — verifies `npm pack --dry-run` for
   every workspace, validates manifests for the four marketplaces, drafts
   `.release-notes/X.Y.Z.md`. No `NPM_TOKEN` needed; nothing mutates.
4. Commit, push, and `git tag -a vX.Y.Z -m "..."` + `git push origin vX.Y.Z`.
   [`.github/workflows/release.yml`](./.github/workflows/release.yml) takes
   over: runs `--dry-run` again as a CI sanity check, then publishes with the
   `NPM_TOKEN` repo secret (provenance-signed via GitHub Actions OIDC). The
   marketplace submission URLs are emitted as a workflow summary.

The script is idempotent — already-published versions are skipped via the
`npm view <pkg>@<version>` check — so re-runs are safe. Scoped packages are
forced `public` via `npm access set status=public` after each publish so an
org default can't silently restrict them.

## Code style

- TypeScript strict mode
- No `any` types without justification
- Prefer named exports
- Keep functions small and focused

## Reporting bugs

Open an issue with:
- Frontguard version (`npx -p @frontguard/cli frontguard --version`)
- Node.js version
- Operating system
- Steps to reproduce
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

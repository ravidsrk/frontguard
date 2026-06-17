# Contributing to Frontguard

Thanks for your interest in contributing! Here's how to get started.

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

```
packages/
├── cli/                          # @frontguard/cli — the visual regression engine
│   ├── src/cli/                  # CLI entry + commands (init, run, doctor, render, monitor, …)
│   ├── src/core/                 # Pipeline orchestrator, config, types, plugin system
│   ├── src/diff/                 # Pixelmatch + SSIM + AI vision + fix verification
│   ├── src/discovery/            # Route discovery (crawler, filesystem, storybook)
│   ├── src/render/               # Playwright renderer + Docker-renderer adapter
│   ├── src/sandbox/              # Local + Daytona fix-verification sandboxes
│   ├── src/plugins/              # accessibility, perf-budgets, third-party, monitor, figma
│   ├── src/storage/              # Baseline orphan branch + fix-pattern DB
│   ├── docker/                   # Pinned cross-OS render image (Dockerfile + compose)
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
├── docs/                         # frontguard.dev/docs — Fumadocs on Next.js 16 Turbopack
└── landing/                      # frontguard.dev — Vite + React landing

demo/                             # VHS tape + rendered demo GIF + fg-demo recording wrapper
validation/                       # OSS-repo harness + measured results (results-v0.2.md)
scripts/                          # stats.ts, release.sh, build-daytona-snapshot.ts
```

## Running in development

```bash
# Watch mode — rebuilds on changes
npm run dev

# Run against a local app
node dist/cli/index.js run --url http://localhost:3000

# Type checking
npm run lint
```

## Tests

```bash
# Run all tests
npm test

# Run specific test file
npx vitest test/diff/pixel.test.ts

# Watch mode
npx vitest --watch
```

## Submitting a PR

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add or update tests as needed
4. Run `npm test` and `npm run lint` — ensure both pass
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
- Frontguard version (`npx frontguard --version`)
- Node.js version
- Operating system
- Steps to reproduce
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

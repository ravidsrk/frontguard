# T-28 — dependabot PR triage (11 PRs)

Reviewed 2026-09-01 against `main`. Each PR was assessed on its own evidence, not its title.
Three research agents covered the risky upgrades; the parent ran every verification.

## Disposition

| PR | Package | Verdict | Reason |
|---|---|---|---|
| #208 | `@axe-core/playwright` 4.12.1→4.13.0 | **MERGED** | Minor, `packages/cli` only. Verified against current main: `npm ci`/build/full suite green, 0 vulns |
| #207 | `@modelcontextprotocol/sdk` 1.29.0→1.30.0 | **MERGED** | Minor, `packages/mcp` only. Verified: 1.30.0 installed, 1926 tests green |
| #200 | `lint-staged` 16.4.0→17.4.1 | **MERGED + fix** | Real major. Required tightening root `engines.node` to `>=22.22.1` |
| #198 | `actions/setup-node` v4→v7 | **CLOSED** | Cannot pass CI. Superseded by #215 |
| #204 | `react-dom` 19.2.7→19.2.8 | **CLOSED** | Not mergeable; `npm ci` fails outright |
| #199 | `@types/node` →26.4.0 | **VERIFIED, HELD** | Touches `apps/web` → fires Deploy Web (H-06) |
| #201 | `@vitejs/plugin-react` 6.0.3→6.1.1 | **VERIFIED, HELD** | Same |
| #202 | `@readme/openapi-parser` 6.3.1→8.0.1 | **VERIFIED, HELD** | Same |
| #203 | `@cloudflare/vite-plugin` 1.54.1→1.54.2 | **VERIFIED, HELD** | Same |
| #205 | `vitest` 4.1.9→4.1.11 | **VERIFIED, HELD** | Same |
| #206 | `@vitest/coverage-v8` 4.1.9→4.1.11 | **VERIFIED, HELD** | `packages/cli` only, but peer-coupled to #205 |

## Corrections to prior research

**The vitest bump is NOT a security fix.** Phase 2 research (B1 R-04) claimed 4.1.11 was a
GHSA Critical+Moderate security bump, and that claim was repeated in a status report. It is wrong.
Both vitest advisories were checked against the affected ranges:

| Advisory | Affected | Installed 4.1.9 |
|---|---|---|
| GHSA-5xrq-8626-4rwp (critical, UI server arbitrary file read/exec) | `>= 4.0.0, < 4.1.0` | **not affected** |
| GHSA-9crc-q9x8-hgqq (critical, RCE via malicious website) | all ranges `< 3.0.5` | **not affected** |

`npm audit` reports nothing, consistent with that. 4.1.9 is already patched for both. The bump is a
routine patch and carries no urgency — which removes the argument for rushing a production deploy.

**#198 was earlier called "obsolete".** Also wrong. That conclusion came from grepping only
`.github/workflows/`, which is already on `@v7`. The shipped composite action was not.

## Why #198 could not merge (proven, not assumed)

`action.yml` is generated from `packages/cli/action.template.yml`, and `root-action-contract` runs
the generator then asserts `git diff --exit-code action.yml`. Checked out the branch and ran it:

```
contract FAILS — generator reverted the bump:
-      uses: actions/setup-node@v7
+      uses: actions/setup-node@v4
```

**It also exposed a regression from this run's own P1 work.** The template pinned
`node-version: '20'` — EOL — while P1 raised the published CLI to `engines.node >=22`. The shipped
action would have provisioned Node 20 to run a package requiring 22. Fixed in #215 (merged), which
corrects the template and regenerates; the generator is idempotent afterwards.

Deliberately left alone: `upload-artifact@v3.2.2-node20` on the GitHub Enterprise Server branch.
The github.com branch already uses `@v7`; GHES lacks the v4+ artifact backend, so the conditional
split is correct.

## Why #204 could not merge

Root `package.json` `overrides` exact-pins `react` and `react-dom` to `19.2.7` (lines 62-63). The PR
bumps only the workspace deps, so `npm ci` fails with `Missing: react-dom@19.2.7 from lock file`
(its CI was already red). Even reconciled, the override would win and the bump would be a no-op —
and `react-dom@19.2.8` peers `react@^19.2.8` while react stays 19.2.7, which is a
dispatcher/hydration hazard for two SSR apps.

## Group verification of the six held PRs

All six were merged onto a scratch branch, the lockfile regenerated, and the result verified:

```
npm ci      exit 0
npm run build exit 0
npm test    exit 0   — 1926 tests across 11 workspaces
npm audit   0 vulnerabilities
resolved:   vitest 4.1.11 + @vitest/coverage-v8 4.1.11 (peer satisfied)
            @readme/openapi-parser 8.0.1, @cloudflare/vite-plugin 1.54.2,
            @vitejs/plugin-react 6.1.1
apps/web build emits privacy-*.js, terms-*.js, status-*.js
```

`@readme/openapi-parser` 8.0.1 crosses two majors but neither lands here: `scripts/sync-openapi.mjs`
does not import it (it is a plain file copy), the spec contains zero `$id` and only internal
`#/components` refs, and the single call site passes an in-memory object so the v7 URL-fetch SSRF
change and the v8 orphaned-`$id` strip are both inapplicable.

## Deploy pre-flight (for H-06)

`Deploy Web` is self-verifying: it probes `/`, `/docs`, `/privacy`, `/terms`, `/status`,
`/sitemap.xml`, `/agents.md`, `/openapi.json`, `/.well-known/mcp.json` and three assets with
`curl --fail`, asserts exact `/status` copy, and requires the deployed SHA to match. Every
assertion pre-flights clean against current main:

- both exact `/status` strings present in `apps/web/src`
- all 5 probed routes exist as source files
- all 7 static probe targets exist in `apps/web/public`
- `production` environment has **no** protection rules, so a merge deploys immediately

A deploy from current main would therefore be expected to pass and would republish the legal pages
that currently 404.

## Unrelated red-main incident fixed during this work

`main` went red on `bb7ec1b` with `spawnSync docker ETIMEDOUT` in `docker-build.test.ts` after
~15 minutes (run 33519144250). Independent of these PRs and of the earlier `testTimeout` change —
the timeout is `execFileSync`'s own. CI has no Docker layer cache, so every e2e run does a cold
Playwright base pull plus apt install, which is legitimately 10-25 minutes. Budget raised to 25
minutes in #216 (merged); the test was **not** skipped or weakened. The fix run took **15m11s**,
confirming the old 15-minute budget was the binding constraint.

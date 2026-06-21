# Upgrade Readiness — to-latest run (2026-06-21)

Run complete. BASE = `ravidsrk/upgrade-latest` off main (f26a097). Green gate = CI (Node 20/22) — local Node 26 can't `npm install` (sharp/better-sqlite3 native). Every PR landed CI-green; the final BASE is CI-green and reproduces from a frozen lockfile.

## Bumps (each its own CI-green PR, one major per PR)

| #   | Bump                  | from → to                                  | Major? | Codemod       | PR     | Result                                                                                                                                                                                                                 |
| --- | --------------------- | ------------------------------------------ | ------ | ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TypeScript            | 5.9.3 → 6.0.3                              | yes    | none (manual) | #125   | CI green; tsup baseUrl-injection handled via scoped `ignoreDeprecations`                                                                                                                                               |
| 2   | ESLint + @eslint/js   | 9 → 10 (apps/web; rest already 10)         | yes    | none          | merged | CI green                                                                                                                                                                                                               |
| 3   | Zod                   | 3 → 4 (cli, cloud-api, mcp)                | yes    | none (manual) | #128   | CI green; fixed PATCH-defaults regression (zod4 applies defaults-in-optional) + test                                                                                                                                   |
| 4   | better-sqlite3        | 11 → 12 (cloud-api)                        | yes    | none          | merged | CI green (native built on CI)                                                                                                                                                                                          |
| 5   | commander             | 14 → 15 (cli)                              | yes    | none          | merged | CI green (compatible)                                                                                                                                                                                                  |
| 6   | jsdom                 | 26 → 29 (apps/web test env)                | yes    | none          | #131   | CI green; removed stray root jsdom + `<br>` accessible-name + 30s timeout on 37-slug render test                                                                                                                       |
| 7   | @types/node           | 22 → 26                                    | yes    | none          | merged | CI green (runtime stays 20/22 — see caveat)                                                                                                                                                                            |
| 8   | React + react-dom     | 18 → 19.2 (apps/demo; apps/web already 19) | yes    | react/19      | merged | CI green; pinned react/react-dom to exact 19.2.7 via overrides (exact-version match)                                                                                                                                   |
| 9   | Next.js               | (already 16.2.9 on main)                   | yes    | —             | —      | CLOSED-already: apps/demo already declared next 16.2.9 (latest)                                                                                                                                                        |
| 10  | minor/patch/dev group | ~15 deps                                   | no     | —             | merged | CI green; Playwright 1.59→1.61 (+ both Dockerfiles v1.61.0-jammy lockstep), wrangler, hono, daytona SDK, eslint plugins, tsx, typescript-eslint, ora, pixelmatch, globals, vitest-coverage, @types/react; engines→>=20 |
| 11  | security sweep        | 8 → 0 advisories                           | no     | —             | merged | CI green; undici/ws/postcss/esbuild pinned via overrides                                                                                                                                                               |

## BLOCKED / held — HUMAN DECISIONS

- **@cloudflare/vite-plugin held at 1.41.0** (not 1.42.1). 1.42+ hard-imports `node:module.registerHooks` (Node 22.15+), which breaks apps/web's vite build on the CI **Node-20** matrix. 1.41.0 is the latest release that supports vite 8 without registerHooks. Taking 1.42+ requires **dropping Node 20** from CI — a deliberate support-policy call (the published `@frontguard/cli` still targets Node 18+). `wrangler` kept at 4.103 (its registerHooks only fires at `wrangler deploy`, not CI).
  - To take the latest CF tooling: decide to drop Node 20 (CI matrix → [22, 24]; bump `engines` to `>=22.15`), then bump @cloudflare/vite-plugin → latest + wrangler → latest.

## Final pinned versions

- toolchain: TypeScript ^6.0.3 · ESLint ^10.5.0 · vite ^8.0.1 · tsup/tsx latest
- libs: Zod ^4.4.3 · commander ^15 · jsdom ^29 · better-sqlite3 ^12 · hono ^4.12.26
- frameworks: React ^19.2.7 (web + demo) · Next 16.2.9 (demo) · Playwright 1.61.0
- runtime: Node `engines: >=20` (CI matrix [20, 22]); npm (no corepack pin). `@types/node` 26 — CAVEAT: ahead of the 20/22 runtime; reconcile if you pin types to the runtime.

## Reproducible install

`git clone` of BASE + `npm ci` installs cleanly from the frozen `package-lock.json` (197 packages; verified with `--ignore-scripts` since native sharp/better-sqlite3 build needs Node 20/22 or prebuilds). Lockfile is authoritative.

## Human-owned follow-ups (NOT done — out of scope)

- Promote BASE → main (the meta-PR). NOT done.
- Deploy apps/web / cloud-api. NOT done (merge ≠ deploy).
- The CF/Node-20 decision above (drop Node 20 to take latest @cloudflare/vite-plugin + wrangler).
- @types/node ↔ runtime reconciliation.
- Remove the temporary `ci.yml` trigger entry for `ravidsrk/upgrade-latest` (added so upgrade PRs ran the full suite) when BASE merges to main — or keep it harmlessly.
- OPS items in docs/arch-ops-actions.md (security sweep rationale + CF freeze).

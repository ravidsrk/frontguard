# Upgrade Audit — to-latest (2026-06-21)

Source: `npm outdated --workspaces --include-workspace-root` on `origin/main` (f26a097), npm workspaces monorepo. Single ecosystem (Node/JS); no Python/Go/Rust/etc.

## Environment / green-gate reality (load-bearing)

- Machine runs **Node v26.3.0**; the repo targets **Node 20/22** (CI matrix; `engines: >=18`). A plain `npm install` on this machine FAILS building `sharp` (and `better-sqlite3`) from source — node_modules can't be created locally. So **build/typecheck/test/lint cannot run locally**; the green gate is **CI (GitHub Actions, Node 20 + 22)**. Workers install deps with `npm install --ignore-scripts` to regenerate the lockfile and push; verification is the PR's CI run. (Recorded in DECISIONS.md.)
- Package manager: **npm** (`package-lock.json`). Commands: `npm run build|test|typecheck|lint` (per-workspace via `--workspaces --if-present`). App smoke: `npm run dev:web` / `dev:api`; CI `e2e` job builds + runs the CLI render image.

## MAJOR bumps (11 raw; deduped/scoped below)

| Pkg                 | from → to      | Where                                    | Cost    | Notes                                                                                                                                                             |
| ------------------- | -------------- | ---------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| typescript          | 5.9.3 → 6.0.3  | ALL packages                             | HIGH    | TS 6 (brand-new major): removed deprecations, stricter. Broad blast radius. No official codemod — fix type errors.                                                |
| zod                 | 3.25.x → 4.4.3 | cli, cloud-api, mcp                      | HIGH    | Schema source-of-truth. Zod 4 breaking API (error format, `.parse` paths). Migration guide required.                                                              |
| eslint + @eslint/js | 9.39 → 10.x    | apps/web only (cli/cloud-api already 10) | MED     | Flat-config already. ESLint 10 breaking changes; isolated to apps/web.                                                                                            |
| next                | 14.2 → 16.2    | apps/demo only                           | HIGH    | Skips v15 entirely. Heavy migration. NOTE: demo app — confirm it's CI-built before attempting.                                                                    |
| react + react-dom   | 18.3 → 19.2    | apps/demo only (apps/web already 19)     | MED     | React 19 codemod (`npx codemod@latest react/19/...`). Isolated to demo.                                                                                           |
| better-sqlite3      | 11.10 → 12.11  | cloud-api                                | MED     | Native addon; only CI verifies. Changelog for 12.                                                                                                                 |
| commander           | 14.0 → 15.0    | cli                                      | LOW-MED | Read changelog.                                                                                                                                                   |
| jsdom               | 26.1 → 29.1    | cli (test)                               | LOW-MED | Read changelog (3 majors).                                                                                                                                        |
| @types/node         | 22.19 → 26.0   | dev, global                              | LOW     | CAVEAT: runtime is Node 20/22 — types should track the runtime, not 26. Taken to 26 per user "full to latest"; runtime mismatch flagged for human reconciliation. |

## minor/patch/dev (~19, group + security sweep)

@playwright/test + playwright 1.59→1.61 (also bump the Dockerfile playwright base image in lockstep), wrangler 4.102→4.103, hono 4.12.9→4.12.26, @daytonaio/sdk 0.158→0.189, @cloudflare/vite-plugin 1.13→1.42, eslint-plugin-react-hooks 7.0→7.1, eslint-plugin-react-refresh 0.5.2→0.5.3, tsx 4.21→4.22, typescript-eslint 8.58→8.61, ora 9.3→9.4, pixelmatch 7.1→7.2, globals 17.4→17.6, @vitest/coverage-v8 4.1.2→4.1.9, @types/react 19.2.14→19.2.17, @frontguard/cli 0.2.0→0.2.1. Plus `npm audit` transitive/security sweep.

## Runtime pin decision

Keep Node target at 20/22 (CI matrix, engines). NOT chasing Node 24 as a "runtime bump": the native deps (sharp/better-sqlite3) and the Cloudflare-Workers target make a Node-floor jump risky with no clear benefit. Align `engines` to `>=20` (matches CI) as a minor config tidy. npm (pm) is current; no corepack pin. Recorded in DECISIONS.md.

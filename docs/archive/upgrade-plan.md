# Upgrade Plan — frozen wave order (2026-06-21)

BASE = `ravidsrk/upgrade-latest` off main (f26a097). One MAJOR per PR, serialized on the npm manifest+lockfile (universal hot file). Green gate = CI (Node 20/22). Pull BASE after each merge so the next rebases onto it.

Per-task pipeline: @claude UPGRADE (research → codemod → bump → `npm install --ignore-scripts` to regen lockfile → push) → @claude open PR → CI runs (the real green gate) → @codex read-only review (research note real? codemod applied? lockfile regenerated not hand-edited? one-major-per-PR? no secrets?) → SHIP (merge --merge, never squash) → cleanup worktree (WT_CLEAN).

## WAVE 1 — toolchain floor (serial, FIRST)

1. `ts6` — TypeScript 5.9 → 6.0 (all packages). Research TS 6 breaking changes; fix type errors; build+typecheck green on CI. FOUNDATION — everything builds on it.
2. `eslint10` — eslint + @eslint/js 9 → 10 (apps/web). Research ESLint 10 breaking; lint green.
3. `engines20` — set root+workspaces `engines` to `>=20` (matches CI/runtime). Tidy; no runtime jump.

## WAVE 2 — library majors (one per PR, serial after WAVE 1)

4. `zod4` — zod 3 → 4 (cli, cloud-api, mcp). Migration guide; fix schema/error API; build+test green.
5. `bettersqlite12` — better-sqlite3 11 → 12 (cloud-api). Changelog; CI-only native verify.
6. `commander15` — commander 14 → 15 (cli). Changelog.
7. `jsdom29` — jsdom 26 → 29 (cli test). Changelog.
8. `typesnode26` — @types/node 22 → 26 (dev). CAVEAT recorded (runtime 20/22).
9. `react19demo` — react + react-dom 18 → 19 (apps/demo) + React 19 codemod.
10. `next16demo` — next 14 → 16 (apps/demo). Heavy; confirm demo is CI-built first, else BLOCK with reason.

## WAVE 3 — groups + security

11. `minorgroup` — all ~19 minor/patch/dev bumps in one PR (Playwright 1.61 + Dockerfile base image lockstep, wrangler, hono, daytona SDK, vite-plugin, eslint plugins, tsx, typescript-eslint, ora, pixelmatch, globals, vitest coverage, @types/react, @frontguard/cli). Regen lockfile; CI green.
12. `security` — `npm audit` transitive/security sweep (non-breaking); record any breaking advisory as OPS.

## Acceptance per task

RESEARCHED (changelog/migration read for from→to) · CODEMOD (applied if one exists, else na) · CI green (build + full test + typecheck + lint + e2e on Node 20/22 — the local green gate is unavailable, see audit) · lockfile regenerated with npm (not hand-edited) · @codex PASS. A major that can't go green in 3 CI/fix rounds → BLOCKED with the concrete reason + what the migration needs; draft PR left open; loop continues.

## Human-owned (out of scope, recorded)

BASE→main promotion; deploy; any prod migration. `@types/node` runtime reconciliation. Re-running the full suite on a Node-20/22 dev machine if local verification is wanted.

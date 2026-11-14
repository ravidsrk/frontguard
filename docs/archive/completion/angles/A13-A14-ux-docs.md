# A13–A14 — UX & documentation (static)

Static-only. Scores capped at 1. No npm/test/browser runs. `dist/` churn ignored.

## Angle 13 — UX & frontend

**Score: 1/4 · RAG: R**
**Score justification:** Marketing routes, CLI help, doctor, and the boxed fatal formatter exist in source, but none of the happy paths, TTY behaviour, axe, or keyboard/contrast were observed at runtime.
**Dynamic proof needed to justify a higher score:**
```bash
# Site states / a11y / responsive (from apps/web after `npm run dev:web`)
npx --yes @axe-core/cli http://127.0.0.1:3000 http://127.0.0.1:3000/pricing \
  http://127.0.0.1:3000/docs http://127.0.0.1:3000/changelog \
  http://127.0.0.1:3000/comparisons http://127.0.0.1:3000/status \
  http://127.0.0.1:3000/privacy http://127.0.0.1:3000/terms \
  http://127.0.0.1:3000/docs/not-a-real-slug
# Keyboard: Tab through Nav + InstallTabs (ArrowLeft/Right/Home/End) without a mouse.
# Viewport: 375 / 768 / 1440 screenshots of `/`, `/docs`, `/pricing`.
# CLI UX
npx -p @frontguard/cli frontguard --help
npx -p @frontguard/cli frontguard init --help
# in an empty dir, then a git repo, then with/without Playwright browsers:
npx -p @frontguard/cli frontguard init --ci
npx -p @frontguard/cli frontguard doctor
npx -p @frontguard/cli frontguard run          # no server
npx -p @frontguard/cli frontguard monitor --url not-a-valid-url
FORCE_COLOR=0 npx -p @frontguard/cli frontguard doctor
```

### Per-route UX state table (`apps/web`)

No route defines `loader`, `errorComponent`, or `pendingComponent` (`grep` over `apps/web` is empty). Root only sets `notFoundComponent` (`apps/web/src/routes/__root.tsx:13`). All listed pages are compile-time static except tiny client state (copy buttons, install tabs).

| Route | Data | Fetch | Empty | Loading | Error | Success |
|---|---|---|---|---|---|---|
| `/` | `index.tsx` + `lib/validation-data.ts` | none | n/a | none | none | static landing; copy/tabs are local `useState` |
| `/pricing` | in-module `tiers`/`faqs` | none | n/a | none | none | static; copy-install button |
| `/privacy` | `InfoPage` copy | none | n/a | none | none | static legal |
| `/terms` | `InfoPage` copy | none | n/a | none | none | static legal |
| `/changelog` | `changelog/-releases.ts` | none | n/a | none | none | static; **not** `CHANGELOG.md` |
| `/docs` | redirect → first article (`docs/index.tsx:4-7`) | none | n/a | none | none | redirect |
| `/docs/$` | `lib/docs-content.ts` | none | unknown slug → in-page “Page not found” (`docs/$.tsx:76-90`) | none | in-page 404 only; layout TOC still highlights article 0 (`docs.tsx:70-77`) | `dangerouslySetInnerHTML` article |
| `/comparisons` | `comparisons/-data.ts` | none | n/a | none | none | static matrix |
| `/status` | `InfoPage` copy | none | n/a | none | none | static **release** status, not uptime |
| unmatched | `NotFound.tsx` | none | n/a | none | branded 404 | links home/docs |

`/brand` exists (footer) but is outside the requested set.

### Findings

- **F-13-01** — `@axe-core/playwright` is an **optional CLI plugin** (`packages/cli/package.json:80`, `packages/cli/src/plugins/accessibility.ts:155`), not a site oracle. `apps/web/package.json` has no axe/pa11y dep; `apps/web/src/test/` never imports it. Marketing a11y is unmeasured.
- **F-13-02** — No skip link, no `aria-current`, no nav `aria-label`, no hamburger. Mobile nav is `overflow-x: auto` (`styles.css:120-134`). Docs mobile strip only links **first id per group** (`docs.tsx:97-107`), hiding the rest of the sidebar. TOC items are `cursor: default`, not anchors (`docs.tsx:143-144`).
- **F-13-03** — Focus ring exists (`styles.css:24-27`); low-contrast inline greys are CSS-upgraded to `#8c847a` (`styles.css:29-37`). Contrast, keyboard, and AT were not observed. Copy buttons swallow clipboard failure (`index.tsx:325-329`). Shield is `aria-hidden` with adjacent text (`Shield.tsx:21`). Forms: none (waitlist is `mailto:`).
- **F-13-04** — `/changelog` marks `0.2.0` as `LATEST RELEASE` (`-releases.ts:78-80`) while `CHANGELOG.md:20-35` publishes **0.2.2** (2026-06-21) and `VERSION` is **0.2.3**. Unreleased web copy is Storybook/OTel/Slack (`-releases.ts:41-43`); `CHANGELOG.md` Unreleased is fail-closed remediations. User-visible history is a past product.
- **F-13-05** — No `lorem` / `coming soon` / `TBD` in `apps/web/src`. Hosted tiers are labelled Planned/Waitlist (`pricing.tsx:72-114`). GitHub Action install tab is a comment stub (`index.tsx:375-388`). `/status` is honest that hosted/Action/Docker are pre-release (`status.tsx:22-29`).
- **F-13-06** — CLI help is Commander descriptions (`packages/cli/src/cli/index.ts:215-256,393-463`). Fatal path draws an ASCII `FRONTGUARD ERROR` box with three hints (ECONNREFUSED / no URL / Playwright launch) (`index.ts:162-198`). Unhandled rejection/exception bypass the box (`index.ts:48-56`). `init --yes` is accepted and **unused** (`init.ts:232`, `runInit` never reads `opts.yes` — there are no prompts).
- **F-13-07** — Progress: `ora` spinner + ASCII bar in `ConsoleReporter` (`report/console.ts:58-86`). Colour: `chalk` with **no** repo-level `NO_COLOR`/`isTTY` handling (`logger.ts:72-102`; grep empty). Doctor prints emoji pass/warn/fail to stdout (`doctor.ts:353-401`).

### Exact `frontguard doctor` checks

From `packages/cli/src/cli/doctor.ts` `runChecks` (339-349) and header (9-16):

| # | Name | What it checks | Fail vs warn | Exit |
|---|---|---|---|---|
| 1 | Node.js version | `process.version` major ≥ 20 | fail | critical → 1 |
| 2 | Playwright installed | `import('playwright')` | fail | critical |
| 3 | Browser binaries | `executablePath()` exists for config `browsers` (default `chromium`) | fail | critical |
| 4 | Configuration | `loadConfig()`; missing → warn; invalid → fail | warn / fail | invalid is critical |
| 5 | AI provider keys | `FRONTGUARD_OPENAI_KEY` / `FRONTGUARD_ANTHROPIC_KEY` only | warn if absent | advisory |
| 6 | Git repository | `git rev-parse --is-inside-work-tree` | fail | critical |
| 7 | Baseline branch | `refs/heads/frontguard-baselines` or `refs/remotes/origin/...` | warn if missing | advisory |

Not checked: running `baseUrl`, `origin` remote, npm version, `FRONTGUARD_GEMINI_KEY` / S3 / API / telemetry vars, Docker image, Playwright browser *version*.

`init` next-steps (`init.ts:377-397`) tell the user to start the app, `update-baselines`, then `run`, and to `git push origin frontguard-baselines`. `--ci` **aborts the whole init** (exit 1, no config written) if `package.json` / start script / a single lockfile is missing (`init.ts:306-311`, `69-145`).

---

## Angle 14 — Documentation

**Score: 1/4 · RAG: R**
**Score justification:** README + `docs/` + in-app docs exist, but the Quick Start was not executed, several numeric/version claims are stale or incomplete on the public surfaces, and a stranger cannot recover from the listed breakpoints using the README alone.
**Dynamic proof needed to justify a higher score:**
```bash
# Stranger Test (throwaway dir, Node 20, no prior Playwright browsers):
mkdir /tmp/fg-stranger && cd /tmp/fg-stranger
npm init -y && npm install @frontguard/cli
npx -p @frontguard/cli frontguard init --ci
npx -p @frontguard/cli frontguard doctor
# then with a real app + git remote, follow README.md:56-75 exactly
npm view @frontguard/cli version
npm view @frontguard/playwright version
# confirm mailbox / DNS only if parent owns network: security@frontguard.dev, hello@frontguard.dev
```

### Findings

- **F-14-01 — README Quick Start predicted breakpoints** (`README.md:52-75`). Walked read-only; not executed.
  1. `npx -p @frontguard/cli …` ignores the just-installed local copy (`no-bare-npx-frontguard.test.ts:7-11` explains `-p` is required because unscoped `npx frontguard` 404s). Browser download from `npm install` may not be the binary `npx -p` uses.
  2. Playwright **browsers** are never mentioned (prereqs are only Node 20+ / npm 9+). Doctor check 3 fails without them.
  3. `init --ci` needs `package.json` + a start script + exactly one lockfile or it errors and writes nothing.
  4. Git is a **critical** doctor check; README never says “must be a git repo”.
  5. `npm run dev` is an example; `baseUrl` is framework-port-dependent (`config.ts:604-605`). No “wait until it serves” other than prose.
  6. `update-baselines` needs a reachable `baseUrl` + git; `git push origin frontguard-baselines` needs `origin` (known local `git-orphan` failure mode).
  7. First `run` without accepted baselines is a non-zero new-page path (`index.ts:353-357`).
  8. Clone-this-repo path is **CONTRIBUTING.md**, not README. Contributor `npx vitest test/diff/pixel.test.ts` (`CONTRIBUTING.md:83`) is the wrong path (`packages/cli/test/diff/pixel.test.ts`).

- **F-14-02 — README numeric claims (verified / refuted)**

  | Claim | Location | Verdict |
  |---|---|---|
  | Canonical metrics in `scripts/stats.json` (via `scripts/stats.ts`) | `README.md:14` | **Pointer true.** File exists. Values: `version: "0.2.3"`, `testFiles: 66`, `sourceFiles: 60`, `plugins: 5`, `tarballKB: 497`. File counts match glob of `packages/cli/test/**/*.test.ts` (66) and `packages/cli/src/**/*.ts` (60). Five plugin factories in `plugins/index.ts`. **Bundle bytes not re-packed** (parent). README does **not** reprint 66/60/497 in prose. |
  | “Published package line: 0.2.2” | `README.md:23` | **True vs `CHANGELOG.md:20-35`.** Source `VERSION` / `packages/cli/package.json` / `stats.json` are **0.2.3** (RC; `/status` says so). |
  | “39 of 43 route rechecks … 2 of 5 fixture repositories … AI disabled” | `README.md:25` | **True vs `validation/results-v0.2.md:129-137`** (39 pixelmatch-measured / 43 recheck routes; 2 booted / 5 attempted; AI pending). Landing `validation-data.ts:42` headlines **39** and drops the 4 error routes from the denominator. |
  | “9 lifecycle hooks” + list | `README.md:197-207` | **True** — `FrontguardPlugin` has setup / beforeDiscover / afterDiscover / beforeRender / afterRender / afterCompare / afterRun / onError / teardown (`plugins.ts:59-123`). |
  | “5 built-in plugins” | `README.md:197` | **True** — figma, monitor, perf-budgets, accessibility, third-party-scripts. |
  | Node.js 20+ | `README.md:54` | **True** (`engines.node`, doctor). |
  | npm 9+ | `README.md:54` | **Not in `package.json` engines.** Unstated elsewhere. |
  | Env vars = only `FRONTGUARD_OPENAI_KEY` / `FRONTGUARD_ANTHROPIC_KEY` | `README.md:277-284` | **False as a catalog.** Also consumed: `FRONTGUARD_DEBUG`, `FRONTGUARD_TELEMETRY`, `FRONTGUARD_TELEMETRY_ENDPOINT`, `FRONTGUARD_URL`, `FRONTGUARD_S3_*`, `FRONTGUARD_DOCKER_IMAGE`, `FRONTGUARD_DOCKER_PLATFORM`, `FRONTGUARD_DISABLE_BYTE_COMPARE`, `FRONTGUARD_GEMINI_KEY`, `FRONTGUARD_UPDATE` (Playwright package), `FRONTGUARD_API_URL`/`KEY` (MCP). No dedicated env-var reference. |

- **F-14-03** — `docs/` is a historical ledger, not current operator docs. `docs/README.md` lists 8 files; the tree has 40+ (`IMPLEMENTATION_PLAN.md`, `PRODUCT.md`, `adversarial-*.md`, `production-close-*`, `arch-*`, `agent-ready-*`, …). **5e19c9c** (2026-08-29) added `docs/launch-audit-2026-08.md`, `docs/research/launch-market-refresh-2026-08.md`, and a supersession banner on `docs/launch-readiness.md`. Audit snapshot is `78a5562`, **not** `5f0e141`. Still-relevant at 5f0e141 *as documents*: NO-GO for hosted launch; CLI 0.2.2 on npm vs source ahead; `api`/`app` not a GA onboarding. **Stale vs source now:** live-site CTA/`expectVisual` claims were about production DNS on 2026-08-29; current `pricing.tsx` waitlist + `visualTest` docs (`docs-content.ts:133-138`) already differ. `docs/ARCHITECTURE.md:38,85` still says **6 hooks** and a pre-monorepo `src/` tree (FID, missing a11y/third-party/storybook).

- **F-14-04** — ADRs: `DECISIONS.md` and `docs/DECISIONS.md` are **coordinator run logs** (Orca worktrees, agent roles), not product ADRs. Architecture sketch: `docs/ARCHITECTURE.md` (stale) + README architecture block. Runbook: `docs/ops-actions.md` (maintainer OPS queue, 2026-06-17). API: `apps/web/public/openapi.json`. Env reference: missing (README stub). `CONTRIBUTING.md` omits `apps/demo`, points vitest at a non-root path, and its release steps (bump `VERSION` + `npm run stats`) disagree with README releasing (`README.md:268-274` = tag-only).

- **F-14-05** — `SECURITY.md:5` names `security@frontguard.dev` and forbids public issues. Mailbox/DNS not verified. Supported table still lists 0.1.x (`SECURITY.md:13-14`). Pricing waitlist uses `hello@frontguard.dev` (`pricing.tsx:82`).

### Notes

- In-app docs (`docs-content.ts`) are more cautious than README features (“Zero-config”, “Preview deployments”) and match the CLI-only story.
- `docs/telemetry.md` is the best env-var write-up for telemetry only.
- Score stays 1 until the Stranger Test and axe run exist.

# Frontguard v0.2.0 — Adversarial Remediation Fix-Plan

*Authored by T1 (research) for the autonomous convergence loop. Maps each of the
49 confirmed findings in the v0.2.0 post-ship adversarial dossier to its
file:line target, its Evidence reproduction command, the cluster it belongs to,
and the code-vs-OPS split. The coordinator dispatches each cluster (C1..C16) as
its own remediation task using this plan.*

**Sources.** Recommendations are paraphrased from the raw dossier
(`.frontguard-audit/adversarial-v020-postship.md`, gitignored — it quotes the
live session secret and a forged-cookie example verbatim). The
public/redacted dossier on main (`docs/adversarial-v020-postship.md`) is the
model for safe quotation. The finding-ID → cluster mapping is pinned in
`docs/fix-progress.md` (the coordinator ledger). Policies are in
`docs/DECISIONS.md`.

**Secret-handling rule (applies to every cluster).** This plan references
findings by ID and public file:line only. No literal `DEV_SESSION_SECRET`
value, no forged-cookie string, no API key, token, or `.env` content appears
anywhere in this document or in any commit/PR produced from it. Workers run the
DECISIONS.md secret-scan grep on the staged diff before every commit and every
push; any hit on an *added* line (diff lines beginning `+`, excluding `+++`
headers) blocks the commit.

---

## 1. Frozen scope

**49 findings. Floor + ceiling.** Out of scope: 15 coverage gaps
(`gap-1`…`gap-15` — "we did not look there," not findings) and 112 refuted
candidate findings (did not survive two-lens — code-reality + customer-impact —
verification). The remediation closes exactly the 49; it neither drops a
confirmed finding nor promotes a refuted candidate or a coverage gap.

Severity split: **22 P0 / 15 P1 / 12 P2.** Cluster split: **4 foundation**
(C1, C2, C3, C7) and **12 independent** (C4–C6, C8–C16).

| Cluster | Findings | n | Foundation? |
|---|---|---:|---|
| C1 ts-config-loader | install-1, sb-2 | 2 | ✅ |
| C2 bin/package-name | docs-1, ci-3, install-7, docs-10 | 4 | ✅ |
| C3 hosts/DNS code-side | claim-4, dist-3, docs-2, install-6, claim-6, install-9 | 6 | ✅ |
| C7 cloud-api data model | cloud-1, cloud-9, mcp-1, mcp-2, mcp-7, mcp-9 | 6 | ✅ |
| C4 docker-render | install-4, docker-1, docker-3, docs-3 | 4 | — |
| C5 session-secret | sec-1, cloud-4 | 2 | — |
| C6 ssrf-guard | sec-2, int-7 | 2 | — |
| C8 github-action-ref | int-3, docs-5, docs-6 | 3 | — |
| C9 slack-result-shape | int-1 | 1 | — |
| C10 storybook | sb-1, sb-3 | 2 | — |
| C11 supply-chain | supply-2, supply-6, install-13 | 3 | — |
| C12 mcp-correctness | mcp-3, mcp-6, mcp-8, mcp-10 | 4 | — |
| C13 init-gitignore | install-2 | 1 | — |
| C14 marketing-claims | claim-5, claim-7, claim-9, dist-11 | 4 | — |
| C15 docs-hygiene-residual | docs-4, docs-7, docs-8, docs-9 | 4 | — |
| C16 validation-methodology | val-5 | 1 | — |
| **Total** | | **49** | |

**Closure vocabulary** (matches `docs/fix-progress.md` legend): `CLOSED` —
evidence no longer reproduces from code alone. `CODE_CLOSED (OPS: <action>)` —
the code-side mitigation ships and the evidence no longer reproduces against the
shipped artifact, but full real-world closure additionally requires an
out-of-band OPS action the loop must not execute (DNS attach, image publish, npm
shim/republish, marketplace listing, secret rotation, deploy, tag push). Every
finding below states which terminal status it can reach from code alone.

---

## 2. Per-cluster plan

> Reproduction-command note: several dossier repros invoke the `frontguard` bin
> via `npx frontguard …`. That exact form is itself broken (docs-1: the npm
> package is `@frontguard/cli`, the bin is `frontguard`). To reproduce a
> *downstream* finding you must use the working invocation
> `npx -y -p @frontguard/cli frontguard <cmd>` (or run the local build
> `node packages/cli/dist/cli/index.js <cmd>`). Where a repro is shown with the
> bare `npx frontguard` form it reproduces **two** findings at once (the 404 of
> docs-1 plus the downstream behavior); the `-p` form isolates the downstream
> one.

---

### C1 — ts-config-loader  **[FOUNDATION]**

**Findings:** install-1 (P0), sb-2 (P0).
**Why foundation:** both findings have one root cause — the CLI config loader
cannot read a TypeScript config. Fixing the loader (and/or the `init` default
format) unblocks the documented Quick Start commands #2/#3 that almost every
other manual repro in this plan depends on.
**Shared-file collision:** `packages/cli/src/cli/init.ts` is **also** edited by
C13 (install-2 changes the `.gitignore` entry list at `init.ts:247`; install-1
changes the default `format` at `init.ts:158`). **Not in the directive's
collision list — flagged here.** Serialise C1 and C13 on `init.ts`, or have
one worktree own both edits. C1 also touches `integrations`/docs only via the
doc caveat in sb-2's recommendation (storybook.mdx fixture command) — see the
storybook.mdx collision under C10/C15.

**install-1 — `frontguard init` writes a `.ts` config that `doctor`/`loadConfig` cannot read**
- *Recommendation (paraphrased):* either default `init` to `--format=js` so the
  generated config loads under a plain Node `import()`, or register the bundled
  `tsx` ESM loader (`register()` from `tsx/esm/api`) at CLI startup so `.ts`
  configs actually load. Whichever path is taken, `doctor` and `loadConfig`
  must agree. The `tsx` dependency currently sits in `dependencies` unused.
- *Evidence repro:* in a fresh dir —
  `npm install @frontguard/cli` (0.2.0) →
  `npx -y -p @frontguard/cli frontguard init` (writes `frontguard.config.ts`) →
  `npx -y -p @frontguard/cli frontguard doctor` → prints
  `❌ Configuration: config file is invalid: Unknown file extension ".ts"`.
- *file:line targets:* `packages/cli/src/cli/init.ts:158` (defaults `format` to
  `'ts'`); `packages/cli/src/core/config.ts:337-341` (bare `await import(fileUrl)`,
  no TS hook); published bin `dist/cli/index.js` (plain `#!/usr/bin/env node`,
  no `--import tsx`); `tsx@^4.21.0` in `packages/cli/package.json` deps.
- *Code vs OPS:* **CODE only → CLOSED.** No OPS.

**sb-2 — documented fixture command `frontguard run --config ./frontguard.config.ts` fails**
- *Recommendation (paraphrased):* same root cause as install-1 — either bundle/
  register a `.ts` loader, or rewrite the fixture + storybook doc to use a
  `.mjs`/`.js`/JSON config with an accompanying `.d.ts`. Stop shipping `.ts`
  examples until the loader is wired. The fix to install-1 resolves sb-2's code
  path; the doc/fixture edit closes the documented-command side.
- *Evidence repro:*
  `node packages/cli/dist/cli/index.js run --config packages/cli/__fixtures__/storybook/frontguard.config.ts --update-baselines`
  → `Unknown file extension ".ts"`. (Switching to an equivalent JSON config
  succeeds.)
- *file:line targets:* `packages/cli/src/core/config.ts:337-341`;
  `apps/docs/content/docs/integrations/storybook.mdx:495` (the documented `.ts`
  command); `packages/cli/__fixtures__/storybook/` README + config.
- *Code vs OPS:* **CODE only → CLOSED.** No OPS. (storybook.mdx edit coordinates
  with C10/C15 — see collision note.)

---

### C2 — bin/package-name  **[FOUNDATION]**

**Findings:** docs-1 (P0), ci-3 (P1), install-7 (P1), docs-10 (P2).
**Why foundation:** the canonical decision "how does a user invoke the CLI"
(publish a `frontguard` shim package vs. teach `npx -p @frontguard/cli
frontguard …` everywhere) sets the wording of every getting-started snippet and
every repro command in this plan. It must be frozen before the doc-heavy
clusters (C3/C8/C14/C15) rewrite their command examples.
**Shared-file collisions (docs set — directive: C2, C3, C8, C14, C15):** C2
owns the *getting-started* surface — `apps/docs/content/docs/index.mdx`,
`quick-start.mdx`, `installation.mdx` — plus `packages/cli/README.md` (the
npm-bundled README) and `scripts/build-daytona-snapshot.ts`. It does **not**
touch the root `README.md` (that's C3/C14) or the integration mdx pages (that's
C3/C8). Partition by file → C2 can run alongside C3.

**docs-1 — every `npx frontguard …` snippet invokes a non-existent npm package**
- *Recommendation (paraphrased):* either (a) reserve and publish a thin
  `frontguard` package that re-exports `@frontguard/cli` so `npx frontguard …`
  resolves, or (b) rewrite every getting-started snippet to
  `npx -p @frontguard/cli frontguard <cmd>` and add an explicit
  `npm i -D @frontguard/cli` step before any `npx`. Option (b) is the code-side
  mitigation that ships now; option (a) is the lower-doc-churn path but requires
  an OPS publish.
- *Evidence repro:* `npm view frontguard` → `404 Not Found`;
  `npx -y @frontguard/cli` → `npm error could not determine executable to run`
  (package name ≠ bin name); the working form is
  `npx -y -p @frontguard/cli frontguard --version`.
- *file:line targets:* `apps/docs/content/docs/index.mdx:28-37`;
  `apps/docs/content/docs/quick-start.mdx:21,66,95,124`;
  `apps/docs/content/docs/installation.mdx:46`.
- *Code vs OPS:* **CODE → CLOSED via option (b)** (rewrite snippets to the `-p`
  form). If option (a) is preferred, **CODE_CLOSED (OPS: publish `frontguard`
  npm shim package).**

**ci-3 — Daytona snapshot script installs `frontguard@latest` (404 package)**
- *Recommendation (paraphrased):* change the install line to
  `npm install -g @frontguard/cli@<VERSION>`, reading `VERSION` from the repo
  rather than `latest`. Add a CI/`release.sh` post-publish lane that runs the
  Daytona script with `--dry-run` so this typo surfaces. The script's own
  comments already say "NOT `frontguard@latest`".
- *Evidence repro:* `npm view frontguard@latest` →
  `E404 Not Found … /frontguard - Not found`; inspect
  `scripts/build-daytona-snapshot.ts:260` (`npm install -g frontguard@latest`),
  contradicted by the comment at `:13` and `:139`.
- *file:line targets:* `scripts/build-daytona-snapshot.ts:260` (fix);
  `:13`, `:139` (contradicting comments).
- *Code vs OPS:* **CODE → CLOSED** (the line fix). Note: actually *building and
  publishing* the Daytona snapshot is a separate OPS action (see OPS list /
  C7 verification), but ci-3 itself is closed by the source fix.

**install-7 — npm-bundled README is stale (v0.1.x: "Phase 2", 27 files, 142KB, 395 tests, 3 plugins)**
- *Recommendation (paraphrased):* make `packages/cli/README.md` generated from
  or kept in sync with the repo-root README, or at minimum refresh the bundled
  README for 0.2.0. Add a `prepublishOnly` guard that fails if the bundled
  README's version-string drifts from `package.json`.
- *Evidence repro:* compare
  `node_modules/@frontguard/cli/README.md` (in a fresh `npm install
  @frontguard/cli`) lines 6/12/23/41-49 against the repo-root `README.md`
  lines 7/13/51/201-211 — the bundled file is the older v0.1.x README.
- *file:line targets:* `packages/cli/README.md` (whole file); add
  `prepublishOnly` to `packages/cli/package.json`.
- *Code vs OPS:* **CODE_CLOSED (OPS: re-publish `@frontguard/cli` to npm).** The
  source/guard fix ships now; the npm landing page only refreshes on the next
  publish.

**docs-10 — `installation.mdx` claims `frontguard --version` prints "frontguard"; it prints the SemVer**
- *Recommendation (paraphrased):* replace the expected-output block with `0.2.0`
  (or `0.2.0` with a note that the exact version tracks what's installed). Also
  correct the surrounding invocation to the `-p @frontguard/cli` form per docs-1.
- *Evidence repro:*
  `npx -y -p @frontguard/cli frontguard --version` → `0.2.0` (docs say expect
  the literal word `frontguard`).
- *file:line targets:* `apps/docs/content/docs/installation.mdx:130,132-134`.
- *Code vs OPS:* **CODE only → CLOSED.**

---

### C3 — hosts/DNS code-side  **[FOUNDATION]**

**Findings:** claim-4 (P0), dist-3 (P0), docs-2 (P0), install-6 (P1),
claim-6 (P1), install-9 (P2).
**Why foundation:** every finding here is a dead-host symptom
(`app./api./github-app./telemetry.frontguard.dev` are NXDOMAIN;
`frontguard.dev/docs/*` 404s). The canonical decision — make the API URL a
required input with a self-host fallback and strip dead defaults, vs. wait for
DNS — sets the code-side wording across the landing page, the root README, the
integration docs, and the CLI telemetry default. Frozen first so dependents
inherit it.
**Shared-file collisions:**
- `README.md` lines ~74 and ~101-104 — C3 (install-6/claim-6 doc links at
  `:74`/`:104`) overlaps C14 (claim-7 at `:102`, claim-9 at `:101`) in the
  comparison-table region. **Directive-listed (docs set).** Serialise C3↔C14 on
  `README.md`.
- Integration mdx (`netlify/mcp/slack/vercel/cloud-api`) — docs-2 edits the
  `FRONTGUARD_API_URL` defaults; `slack.mdx`/`vercel.mdx`/`mcp.mdx` are also
  touched by C8 (docs-6) and C12/C7 (mcp.mdx). Partition by line/section.
- `apps/landing/**` — claim-4 edits `pricing.tsx`; C14 (claim-5/dist-11) also
  edits `apps/landing/**`. Different files (`pricing.tsx` route data vs
  `index.html`), low risk.
- `packages/cli` telemetry (install-9) — isolated.

**claim-4 — pricing "Start 14-day trial" CTA points at `app.frontguard.dev` (NXDOMAIN)**
- *Recommendation (paraphrased):* either attach DNS + deploy the dashboard
  before the Pro tier is visible, or point the CTA at a real waitlist
  (Tally/mailto) and badge the Pro tier "coming soon". Code-side mitigation is
  the CTA repoint + badge; the live signup needs DNS+deploy.
- *Evidence repro:* `curl -v https://app.frontguard.dev/signup --max-time 8` →
  `Could not resolve host: app.frontguard.dev` (same for `api.frontguard.dev`).
- *file:line targets:* `apps/landing/src/routes/pricing.tsx:65` (CTA href);
  `apps/landing/src/test/pricing.test.tsx:44` (asserts the broken URL — update
  the assertion).
- *Code vs OPS:* **CODE_CLOSED (OPS: attach `app.frontguard.dev` DNS + deploy
  dashboard).** Repointing the CTA to a live waitlist closes it outright; the
  full $29 trial flow needs the OPS deploy.

**dist-3 — `api.frontguard.dev` NXDOMAIN; every shipped integration defaults to the dead host**
- *Recommendation (paraphrased):* either point `api.frontguard.dev` DNS at the
  Worker, or make `FRONTGUARD_API_URL` a required input with a self-host
  fallback and remove the false default values from the integrations. Add a CI
  guard in `scripts/release.sh` that resolves every referenced subdomain before
  allowing publish.
- *Evidence repro:* `host api.frontguard.dev` → `NXDOMAIN`;
  `host github-app.frontguard.dev` → `NXDOMAIN`;
  `host app.frontguard.dev` → `NXDOMAIN`.
- *file:line targets:* integration defaults — `integrations/github-app/manifest.yml:11`
  (`hook_attributes.url`); Netlify plugin manifest/README default `apiUrl`; MCP
  server default `FRONTGUARD_API_URL`; CLI/integration forwarders.
- *Code vs OPS:* **CODE_CLOSED (OPS: attach `api.frontguard.dev` +
  `github-app.frontguard.dev` DNS + deploy Worker).** Removing the dead defaults
  / requiring the URL is the code mitigation.

**docs-2 — `api.frontguard.dev` hard-coded throughout docs but does not resolve**
- *Recommendation (paraphrased):* provision DNS, or rewrite every integration
  page so `FRONTGUARD_API_URL` is a required input with a self-host fallback and
  the false default values are removed.
- *Evidence repro:* `nslookup api.frontguard.dev` → `NXDOMAIN`.
- *file:line targets:* `apps/docs/content/docs/integrations/netlify.mdx:62,88`;
  `mcp.mdx:290`; `slack.mdx:201`; `vercel.mdx:67`; `cloud-api.mdx:40,76`.
- *Code vs OPS:* **CODE_CLOSED (OPS: attach `api.frontguard.dev` DNS).** Doc
  rewrite ships now.

**install-6 — README documentation links 404 (`frontguard.dev/docs/*` vs `docs.frontguard.dev`)**
- *Recommendation (paraphrased):* rewrite the README doc links to the
  `docs.frontguard.dev` subdomain, or add a `301` redirect for
  `frontguard.dev/docs/*` → `docs.frontguard.dev/docs/*` on the marketing site.
- *Evidence repro:*
  `curl -s -o /dev/null -w '%{http_code}' 'https://frontguard.dev/docs/guides/migrate-from-backstopjs'`
  → `404`; same path under `docs.frontguard.dev/docs/…` → `200`.
- *file:line targets:* `README.md:104` (five links), `README.md:74`.
- *Code vs OPS:* **CODE → CLOSED** (rewrite to `docs.frontguard.dev`). A redirect
  rule is an alternative OPS path; the README rewrite closes it without OPS.
- *Coordination:* C15/docs-8 may *move* `frontguard-vs-percy.mdx` and
  `frontguard-vs-chromatic.mdx` into `comparisons/`, changing their URLs — the
  README links rewritten here must target the final paths. Sequence C15 before
  the README rewrite, or agree the destination paths up front.

**claim-6 — README comparison-table footnote: five migration/comparison links 404**
- *Recommendation (paraphrased):* configure `frontguard.dev/docs/*` to
  rewrite/proxy to `docs.frontguard.dev/docs/*`, or edit `README.md:104` and
  `:74` to use the `docs.frontguard.dev` host. Note one of the five
  (`frontguard-vs-argos`) also 404s on the docs subdomain (content not yet
  deployed) — that page's deploy is OPS.
- *Evidence repro:* identical to install-6
  (`curl … 'https://frontguard.dev/docs/guides/migrate-from-backstopjs'` →
  `404`; `docs.frontguard.dev/docs/…` → `200`).
- *file:line targets:* `README.md:104`, `README.md:74` (same region as install-6
  — fix once, closes both).
- *Code vs OPS:* **CODE → CLOSED** for the link rewrite; **OPS: deploy the
  `frontguard-vs-argos` page content** for the one path that 404s even on the
  docs subdomain.

**install-9 — telemetry endpoint `telemetry.frontguard.dev` NXDOMAIN; undisclosed default-on telemetry**
- *Recommendation (paraphrased):* stand up the telemetry endpoint, or disable
  telemetry by default, or remove the telemetry code; and add a one-line
  disclosure to the README and to `frontguard init`'s next-steps output naming
  `--no-telemetry` / `FRONTGUARD_TELEMETRY=0`. `showFirstRunNotice` exists but
  uses `logger.debug` (invisible) and is never called.
- *Evidence repro:* `nslookup telemetry.frontguard.dev` → `NXDOMAIN`.
- *file:line targets:* CLI telemetry default endpoint + `SEND_TIMEOUT_MS`
  (`packages/cli/src/.../telemetry*`, surfaced in `dist/cli/index.js` as
  `DEFAULT_ENDPOINT`/`SEND_TIMEOUT_MS=1500`); `README.md` (no telemetry
  section); `init` next-steps output; the unused `showFirstRunNotice`.
- *Code vs OPS:* **CODE → CLOSED** if the chosen path is disable-by-default +
  disclosure. **CODE_CLOSED (OPS: stand up telemetry endpoint)** only if the
  team chooses to keep telemetry on and host it.

---

### C7 — cloud-api data model  **[FOUNDATION — internally serialised]**

**Findings:** cloud-1 (P0), cloud-9 (P1), mcp-1 (P1), mcp-2 (P1), mcp-7 (P1),
mcp-9 (P2).
**Why foundation + internal serialisation:** these six findings all reshape the
cloud-api run/result data model and its persistence, then the MCP layer reads
the reshaped data. **cloud-1 lands first** — it adds the R2→sandbox baseline
restore and, with it, the run/result shape that actually carries regression
status out of the sandbox. The remaining five depend on that foundation and on
each other through shared files, so they serialise behind cloud-1:
**cloud-1 → {cloud-9, mcp-1, mcp-2, mcp-7, mcp-9}.**
**Shared-file collisions (directive):**
- `packages/cloud-api/src/**` — collides with C5 and C6. C7 touches
  `daytona-runner.ts`, `processor.ts`, `types.ts`, `db/schema.ts`,
  `db/d1-store.ts`, `report-html.ts`, `otel/index.ts`, and `index.ts`
  (listing region `:377-381`); C5 touches `auth/session.ts` + `index.ts` boot;
  C6 touches `index.ts:54`. Serialise all cloud-api edits (see §3).
- `packages/mcp/**` — collides with C12. C7's mcp findings touch
  `client/cloud.ts`, `tools/list-regressions.ts` (mcp-1 filter `:70-77`),
  `tools/recent-runs.ts` (`:71-78`), `tools/get-suggested-fix.ts`; C12 touches
  `index.ts`, `tools/accept-baseline.ts`, `tools/list-regressions.ts` (`:64`),
  `tools/recent-runs.ts` (`:62`). `list-regressions.ts` and `recent-runs.ts`
  are touched by **both** — serialise C7-mcp → C12.
- Internal to C7: `processor.ts:53-60` is touched by cloud-1, mcp-2, **and**
  mcp-9 — they must serialise within the cluster (the order below respects this).

**cloud-1 — Worker can never detect regressions (Daytona sandbox ephemeral; prior baselines never restored)**
- *Recommendation (paraphrased):* before invoking `frontguard run` in the
  sandbox, the runner must (1) list R2 objects under the user's baseline prefix
  (`<userId>/<projectId-or-run-key>/baseline/*`), (2) download them into the
  sandbox baseline directory, and (3) only then exec. Without this the cloud
  product is a screenshot service, not a regression detector.
- *Evidence repro:* code inspection —
  `grep -n "uploadFile\|baseline" packages/cloud-api/src/daytona-runner.ts`
  shows the only upload is `frontguard.config.json`; no R2-restore path exists.
  Behavioral repro requires a live/emulated sandbox (see §5 / risk register
  stub).
- *file:line targets:* `packages/cloud-api/src/daytona-runner.ts:64-77`
  (ephemeral create), `:102-148` (only uploads config at `:135`);
  `packages/cloud-api/src/processor.ts:84-93` (no-Daytona branch returns
  `new_baseline`); `packages/cloud-api/src/storage/screenshots.ts:49-59` (R2
  keys to read back).
- *Code vs OPS:* **CODE → CLOSED** (the restore path is pure code). Full
  *behavioral* verification depends on a reachable Daytona sandbox → see the
  risk register's stub plan; the marketed live cloud run additionally needs the
  Worker deployed + Daytona snapshot published (OPS), but cloud-1 the *defect*
  is closed by the restore code.

**cloud-9 — report HTML footer still hardcoded "Frontguard v0.1.0"**
- *Recommendation (paraphrased):* wire `PACKAGE_VERSION` through to
  `report-html.ts` and `otel/index.ts` so all version strings track
  `package.json`. Add a test that greps `\d+\.\d+\.\d+` across `src/` and fails
  if any literal differs from `pkg.version`.
- *Evidence repro:*
  `grep -n "0.1.0" packages/cloud-api/src/report-html.ts` → hit at `:201`;
  `grep -n "0.2.0" packages/cloud-api/src/otel/index.ts` → hit at `:122`
  (a second hard-coded literal).
- *file:line targets:* `packages/cloud-api/src/report-html.ts:201`;
  `packages/cloud-api/src/otel/index.ts:122`;
  `packages/cloud-api/src/index.ts:28-32` (the comment citing the prior drift).
- *Code vs OPS:* **CODE only → CLOSED.** (Independent of cloud-1's data model —
  serialised only because it shares the cloud-api worktree.)

**mcp-1 — D1 store drops `run.github`; `list_regressions(pr_id)` never matches in production**
- *Recommendation (paraphrased):* add `github_owner` / `github_repo` /
  `github_pr_number` / `github_commit_sha` columns to the runs table (or fold
  them into the existing config JSON blob), persist them in `createRun()`,
  reconstruct them in `rowToRun()`, and add a D1 integration test that
  round-trips a run with GitHub linkage. The same gap affects `recent-runs`.
- *Evidence repro:*
  `grep -rnE 'github' packages/cloud-api/src/db/d1-store.ts` → zero matches
  (the in-memory store keeps it via shallow copy, so tests pass while D1 drops
  it).
- *file:line targets:* `packages/cloud-api/src/db/schema.ts:8` (no github_*
  columns); `packages/cloud-api/src/db/d1-store.ts:64-74` (runConfig omits
  github), `:77-97` (rowToRun never sets `.github`);
  `packages/mcp/src/tools/list-regressions.ts:70-77` (filter);
  `packages/mcp/src/tools/recent-runs.ts:71-78`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS. (Depends on cloud-1's persisted-run
  shape.)

**mcp-2 — `get_suggested_fix` is structurally null; cloud-api never emits `suggestedFix`**
- *Recommendation (paraphrased):* plumb `suggestedFix` from the CLI report
  through `processor.ts` into the cloud-api `Run.results`, add it to the wire
  schema and D1 storage (results JSON blob), and add an e2e test where an
  AI-flagged regression survives a round-trip through `GET /v1/runs/:id`. The
  alternative is to pull the `suggestedFix` claim from the MCP docs and tool
  description.
- *Evidence repro:*
  `grep -rnE 'suggestedFix' packages/cloud-api/src` → zero matches (the CLI
  produces it at `packages/cli/src/diff/ai-vision.ts:531`, but it never crosses
  the cloud-api boundary).
- *file:line targets:* `packages/cloud-api/src/types.ts:30-37` (RunResult has no
  field); `packages/cloud-api/src/processor.ts:53-60` (object-literal whitelist
  strips it); `packages/cloud-api/src/daytona-runner.ts:27-42`; MCP doc claim at
  `apps/docs/content/docs/integrations/mcp.mdx:217-228`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS. (Shares `processor.ts:53-60` with
  cloud-1 and mcp-9 → serialise.) mcp.mdx edit coordinates with C3/C12.

**mcp-7 — `listRuns` is per-user, not per-team; agent keys see only the key owner's runs**
- *Recommendation (paraphrased):* make listing team-aware in the cloud-api —
  return runs from any team the user is a member of, or accept `?teamId=` like
  `POST /v1/run` already does — and add a team-scope smoke test in
  `packages/mcp/test` that exercises the cross-user-key case.
- *Evidence repro:* code inspection — `POST /v1/run` enforces team membership
  but `GET /v1/runs` filters strictly by `user_id`
  (`grep -n "user_id" packages/cloud-api/src/db/d1-store.ts` → `:186-191`).
- *file:line targets:* `packages/cloud-api/src/index.ts:377-381`;
  `packages/cloud-api/src/db/d1-store.ts:186-191`;
  `packages/mcp/src/client/cloud.ts:106-108`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS. (Touches `index.ts` listing region —
  serialise vs C5/C6 cloud-api edits.)

**mcp-9 — `diff_id` loses the browser dimension; multi-browser runs collapse**
- *Recommendation (paraphrased):* encode browser into the diff id as
  `${runId}:${route}:${viewport}:${browser}`, add a `browser` field to
  `CloudRunResult`, update `parseDiffId` to handle four segments (carefully —
  routes can contain colons), and add a test for a two-browser sample run.
  Requires the browser field to survive `processor.ts` (which currently strips
  it).
- *Evidence repro:* code inspection — `diffIdFor` is route+viewport only
  (`packages/mcp/src/client/cloud.ts:151-153`); the sandbox result includes
  `browser` (`daytona-runner.ts:28-37`) but the MCP `CloudRunResult` interface
  (`cloud.ts:21-31`) has no browser field.
- *file:line targets:* `packages/mcp/src/client/cloud.ts:151-153`, `:21-31`;
  `packages/mcp/src/tools/get-suggested-fix.ts:51-53`;
  `packages/cloud-api/src/daytona-runner.ts:28-37`;
  `packages/cloud-api/src/processor.ts:53-60` (must stop stripping browser).
- *Code vs OPS:* **CODE → CLOSED.** No OPS. (Shares `processor.ts:53-60` with
  cloud-1/mcp-2 → land after them.)

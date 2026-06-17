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

---

### C4 — docker-render  **[INDEPENDENT]**

**Findings:** install-4 (P0), docker-1 (P0), docker-3 (P0), docs-3 (P0).
**Shared-file collision:** `apps/docs/content/docs/cross-os-rendering.mdx` is
edited by docs-3 (lines 69/93/100/228) **and** by C15/docs-9 (line 273
relabel). **Not in the directive's collision list — flagged here.** Also
`sandbox.mdx` (docs-3) overlaps C15/docs-8's sidebar work (meta.json, different
file — low risk). Serialise C4↔C15 on `cross-os-rendering.mdx`. The code surface
(`docker.ts`, `Dockerfile`, `release.yml`) is C4-exclusive.

**install-4 / docker-1 — `frontguard/render:latest` is not published; `--docker` fails out of the box**
*(install-4 and docker-1 are the same defect from the install-path and
docker-render lenses; fix once.)*
- *Recommendation (paraphrased):* either add a Docker buildx + multi-arch push
  step to `release.yml` that publishes `frontguard/render:vX.Y.Z` and `:latest`
  (and smoke-pulls before claiming the feature ships), or flip `--docker` to a
  build-locally-from-source path and add a preflight `docker manifest inspect`
  that, on miss, surfaces an actionable "build it yourself from
  `packages/cli/docker/Dockerfile`" error instead of a raw `pull access denied`.
- *Evidence repro:*
  `curl -s -o /dev/null -w '%{http_code}' https://hub.docker.com/v2/repositories/frontguard/render/`
  → `404`;
  `curl -s https://hub.docker.com/v2/repositories/frontguard/` → `{"count":0,…}`.
- *file:line targets:* `packages/cli/src/render/docker.ts:42` (`DEFAULT_IMAGE`);
  `packages/cli/src/cli/index.ts:265` (advertises `--docker`);
  `packages/cli/src/render/docker.ts:144-186` (`runDocker`, add preflight);
  `.github/workflows/release.yml` (no buildx/push today).
- *Code vs OPS:* **CODE_CLOSED (OPS: publish `frontguard/render` image to Docker
  Hub/GHCR).** The preflight + build-locally fallback + actionable error is the
  code mitigation that removes the raw-failure evidence now.

**docker-3 — no `--platform` pin; arm64 vs amd64 images produce different bytes**
- *Recommendation (paraphrased):* pin `FROM --platform=linux/amd64 …` in the
  Dockerfile so the same machine code rasterizes everywhere; inject
  `--platform linux/amd64` into the `docker run` argv; document the Apple-Silicon
  emulation perf cost; publish multi-arch tags only if byte-equivalence is proven
  across them.
- *Evidence repro:*
  `grep -n 'platform' packages/cli/docker/Dockerfile packages/cli/docker/docker-compose.yml packages/cli/src/render/docker.ts`
  → no matches.
- *file:line targets:* `packages/cli/docker/Dockerfile:37` (base image);
  `packages/cli/src/render/docker.ts:144-186` (`buildDockerArgs`).
- *Code vs OPS:* **CODE → CLOSED** (the Dockerfile pin + argv injection is pure
  code). Multi-arch publication, if pursued, is OPS — but the byte-divergence
  defect is closed by pinning to a single platform.

**docs-3 — `cross-os-rendering.mdx` tells users to pull an unpublished image**
- *Recommendation (paraphrased):* publish the image as part of the release
  pipeline, or gate `--docker` behind an explicit `frontguard build-image` step
  in the doc and drop the "just `--docker` and it works" framing.
- *Evidence repro:*
  `curl -s https://hub.docker.com/v2/repositories/frontguard/render/` →
  `{"message":"object not found"}`.
- *file:line targets:* `apps/docs/content/docs/cross-os-rendering.mdx:69,93,100,228`;
  `apps/docs/content/docs/sandbox.mdx:41-45` (inherits the same image).
- *Code vs OPS:* **CODE_CLOSED (OPS: publish image)** — doc gating ships now.
  (Coordinate `cross-os-rendering.mdx` with C15/docs-9.)

---

### C5 — session-secret  **[INDEPENDENT]**

**Findings:** sec-1 (P0), cloud-4 (P0). *(Same root defect from the
security-auth and cloud-api lenses; fix once.)*
**Shared-file collision:** `packages/cloud-api/src/index.ts` (boot-time check)
collides with C6 (`:54`) and C7 (`:377-381`); `auth/session.ts` is C5-exclusive.
Serialise cloud-api `index.ts` edits (see §3).
**SECRET-HANDLING (critical):** never write the literal `DEV_SESSION_SECRET`
value, never reproduce or quote a forged cookie. Reference by ID and public
file:line only.

**sec-1 / cloud-4 — dashboard session secret has a hardcoded production fallback shipped in published code**
- *Recommendation (paraphrased):* fail closed — when `isProduction(env)` is true
  and `DASHBOARD_SESSION_SECRET` is unset, refuse to mint any session cookie
  (return 503 / throw at startup on first request). Remove the `DEV_SESSION_SECRET`
  constant from shipped source, or gate it strictly behind a
  non-production runtime check (and rename it to make misuse obvious). Add
  `DASHBOARD_SESSION_SECRET` to `wrangler.toml`'s documented-secrets list and to
  `docs/launch-readiness.md`. **Rotation of the secret and revocation of any
  sessions signed with the old value is OPS (per DECISIONS.md), not code.**
- *Evidence repro (SAFE — no forging):*
  `grep -n "DEV_SESSION_SECRET" packages/cloud-api/src/auth/session.ts` (shows
  the exported constant + the `|| DEV_SESSION_SECRET` fallback at `:32-34`);
  `grep -n "DASHBOARD_SESSION_SECRET" packages/cloud-api/wrangler.toml` (shows
  it is **absent** from the documented secrets at `:39-49`). The dossier's
  cookie-forge step is **deliberately omitted** here per the secret-handling
  rule.
- *file:line targets:* `packages/cloud-api/src/auth/session.ts:29` (constant),
  `:32-34` (silent fallback); `packages/cloud-api/wrangler.toml:39-49`
  (documented secrets, missing the session secret);
  `packages/cloud-api/src/index.ts` (add the boot-time `isProduction` guard);
  `packages/cloud-api/dist/index.js:1498` (where the constant currently ships);
  `docs/launch-readiness.md` (add the required secret).
- *Code vs OPS:* **CODE_CLOSED (OPS: rotate `DASHBOARD_SESSION_SECRET` /
  remove the public constant's value from the deployed env + revoke in-flight
  sessions signed with the old key + set the secret in prod).** The
  fail-closed guard + constant removal ships now and removes the
  forge-from-source vector; rotation closes the residual real-world exposure.

---

### C6 — ssrf-guard  **[INDEPENDENT]**

**Findings:** sec-2 (P1), int-7 (P1).
**Shared-file collisions:** `packages/cloud-api/src/index.ts:54` collides with
C5 (boot) and C7 (`:377-381`) — serialise. `integrations/slack-app/src/runs.ts`
collides with C9 (int-1 `summarizeRun`) — **directive-listed**; serialise
C6↔C9 on `runs.ts`.

**sec-2 — `POST /v1/run` accepts any http/https URL; no SSRF guard on the cloud-api**
- *Recommendation (paraphrased):* port the `isPrivateOrLoopbackHost` helper from
  the Vercel integration into a shared module and run it on `data.url` in
  `/v1/run`; reject plain `http://` (https-only) in production; resolve the
  hostname at fetch time and re-check (DNS-rebinding guard).
- *Evidence repro (SAFE local check):* with the bundled zod —
  `z.string().url().safeParse('http://127.0.0.1/')` → `{ success: true }`
  (proving the schema admits loopback);
  `grep -rnE 'isPrivateOrLoopbackHost|169\.254|SSRF' packages/cloud-api/src`
  → no matches.
- *file:line targets:* `packages/cloud-api/src/index.ts:54` (the
  `z.string().url()` validator); source of the helper to port —
  `integrations/vercel/src/webhook.ts:127-154`;
  `integrations/slack-app/src/runs.ts:17` (accepts `http:`).
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

**int-7 — Slack `/frontguard status <url>` has no SSRF guard; pivots through the cloud-api**
- *Recommendation (paraphrased):* import the Vercel `isPrivateOrLoopbackHost`
  helper into the Slack app and reject before submitting, or — preferable —
  move SSRF guarding into the cloud-api so every entry point inherits it (the
  sandbox is the actual fetcher). Fixing sec-2 at the cloud-api layer largely
  subsumes this.
- *Evidence repro:* code inspection —
  `integrations/slack-app/src/runs.ts:17-24` and
  `integrations/slack-app/src/events.ts:89` check only the URL scheme, never a
  private/loopback host.
- *file:line targets:* `integrations/slack-app/src/runs.ts:17-24`;
  `integrations/slack-app/src/events.ts:82-101` (esp. `:89`);
  `packages/cloud-api/src/index.ts:53`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

---

### C8 — github-action-ref  **[INDEPENDENT]**

**Findings:** int-3 (P0), docs-5 (P0), docs-6 (P0).
**Shared-file collisions (docs set):** `apps/docs/content/docs/integrations/slack.mdx`
and `vercel.mdx` are touched by docs-6 and also by C3/docs-2 (api-url) and
C15/docs-9 (vercel.mdx link). `distribution.mdx` is C8-exclusive. Partition by
section. The code surface (`integrations/github-app/**`, repo-root `action.yml`)
is C8-exclusive.

**int-3 — GitHub App bootstrap PR pins to `ravidsrk/frontguard@v1` (nonexistent ref; no repo-root `action.yml`)**
- *Recommendation (paraphrased):* add an `action.yml` shim at the repo root that
  re-uses `packages/cli/action.yml` (GitHub resolves `<owner>/<repo>` against the
  root only), change `ACTION_REF` to a working pinned ref (a `v0`/`v0.2.0` major
  tag), and add a CI smoke test that runs the action against the local repo so
  the drift cannot ship again.
- *Evidence repro:* `git tag --list` → only `v0.1.0`, `v0.2.0` (no `v1`);
  `find . -name action.yml -not -path '*/node_modules/*'` → only
  `packages/cli/action.yml`.
- *file:line targets:* `integrations/github-app/src/github-api.ts:362`
  (`ACTION_REF`), `:373-391` (`DEFAULT_WORKFLOW_YML`);
  `integrations/github-app/README.md:19`; new repo-root `action.yml`.
- *Code vs OPS:* **CODE_CLOSED (OPS: push the `v0` git tag pointing at a stable
  commit).** The root `action.yml` shim + corrected `ACTION_REF` ship now; the
  tag must be pushed out-of-band.

**docs-5 — GH Actions/App docs reference `@main` and `@v1`, but `action.yml` isn't at root and no `v1` tag exists**
- *Recommendation (paraphrased):* pick one canonical reference — add the root
  `action.yml` shim, tag a `v0` major tag pinned to `v0.2.0`, rewrite every doc
  to `uses: ravidsrk/frontguard@v0`, and delete the phantom
  `frontguard/frontguard-action@v0` reference.
- *Evidence repro:* `find . -maxdepth 2 -name action.yml` → only
  `packages/cli/action.yml`;
  `git ls-remote --tags https://github.com/ravidsrk/frontguard` → only `v0.1.0`,
  `v0.2.0`; `curl -sI https://github.com/frontguard/frontguard-action` →
  `HTTP/2 404`.
- *file:line targets:* `apps/docs/content/docs/ci-cd/github-actions.mdx:31,82,123,134,157`;
  `apps/docs/content/docs/integrations/github.mdx:106`;
  `apps/docs/content/docs/distribution.mdx:45,53`.
- *Code vs OPS:* **CODE_CLOSED (OPS: push `v0` tag).** Doc rewrite + root
  `action.yml` ship now.

**docs-6 — marketplace listings claimed live but 404 (GitHub Marketplace/App, Slack directory, Vercel)**
- *Recommendation (paraphrased):* add a `<Callout type="warn">` banner at the top
  of every integration page stating the marketplace listing is in review and the
  manifest can be self-hosted today; propagate `distribution.mdx`'s honest
  "Coming soon" tone; remove or 404-proof every dead link; and either implement
  or delete the Vercel post-install `frontguard.dev/api/install` endpoint.
- *Evidence repro:* `curl -sI https://github.com/marketplace/frontguard` → `404`;
  `curl -sI https://github.com/apps/frontguard` → `404`;
  `curl -sI https://frontguard.dev/api/install` → `404`.
- *file:line targets:* `apps/docs/content/docs/integrations/github.mdx`;
  `apps/docs/content/docs/distribution.mdx`;
  `apps/docs/content/docs/integrations/slack.mdx`;
  `apps/docs/content/docs/integrations/vercel.mdx` (+ the `/api/install` backend
  if implemented).
- *Code vs OPS:* **CODE_CLOSED (OPS: submit/publish the GitHub/Slack/Vercel
  marketplace listings; implement the `/api/install` backend if the listing is
  pursued).** The honest callouts + dead-link removal ship now.

---

### C9 — slack-result-shape  **[INDEPENDENT]**

**Findings:** int-1 (P0).
**Shared-file collision:** `integrations/slack-app/src/runs.ts` is touched by C6
(int-7 SSRF). **Directive-listed.** Serialise C9↔C6 on `runs.ts`.

**int-1 — Slack app reads a fabricated run-result shape; every message reports "No visual regressions"**
- *Recommendation (paraphrased):* replace `summarizeRun()` with the same
  status-string logic the Netlify integration uses
  (`status === 'regression' | 'changed' | 'failed'`, etc.) and add a
  fixture-driven test parallel to Netlify's `FIXTURE_FAILING`, so the test
  exercises the real cloud-api wire shape rather than a hand-fed one.
- *Evidence repro:* code inspection — `integrations/slack-app/src/runs.ts:45`
  declares `results` as `Array<{ regression?; warning? }>`, but the real wire
  shape is `status:'passed'|'regression'|…`
  (`packages/cloud-api/src/types.ts:30-37`); `summarizeRun()` at `:128-144`
  counts fields that never exist on the payload, so it always reports zero
  regressions. The existing unit test (`test/runs.test.ts:178-202`) hand-feeds
  the wrong shape.
- *file:line targets:* `integrations/slack-app/src/runs.ts:45`, `:128-144`;
  `integrations/slack-app/test/runs.test.ts:178-202`; reference correct logic at
  `integrations/netlify/lib/core.js:215-227` and test
  `integrations/netlify/test/core.test.js:177-200`;
  wire shape `packages/cloud-api/src/types.ts:30-37`, `processor.ts:53-60`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

---

### C10 — storybook  **[INDEPENDENT]**

**Findings:** sb-1 (P0), sb-3 (P0).
**Shared-file collision:** `apps/docs/content/docs/integrations/storybook.mdx`
is touched by the doc-retraction parts of sb-1/sb-3 **and** by C15/docs-4 (strip
nonexistent flags) **and** by C1/sb-2 (fixture `.ts` command). **Not in the
directive's collision list — flagged here.** Serialise the `storybook.mdx`
edits across C10, C15, and C1. The code surface
(`discovery/storybook.ts`, `render/playwright.ts`) is C10-exclusive.

**sb-1 — real Storybook 8 strips `parameters` from `/index.json`; per-story overrides silently no-op**
- *Recommendation (paraphrased):* extract per-story parameters from a source
  that actually has them — either navigate to each
  `iframe.html?id=…&viewMode=story` and read
  `window.__STORYBOOK_PREVIEW__.storyStore.fromId(id).parameters?.frontguard`,
  or static-parse the `.stories` files via `@storybook/csf-tools`. If neither is
  wired before shipping, retract the docs claim that `parameters.frontguard`
  works today.
- *Evidence repro:* in `packages/cli/__fixtures__/storybook` —
  `npm install && npm run storybook`, then
  `curl -s localhost:6006/index.json -o /tmp/sb-index.json` and
  `python3 -c "import json; d=json.load(open('/tmp/sb-index.json')); print(list(next(iter(d['entries'].values())).keys()))"`
  → keys are `type/id/name/title/importPath/componentPath/tags` (no
  `parameters`).
- *file:line targets:* `packages/cli/src/discovery/storybook.ts:350-354`
  (`entry.parameters?.frontguard`);
  `packages/cli/test/discovery/storybook.test.ts:107-147` (hand-fabricated
  index); doc claim in `apps/docs/content/docs/integrations/storybook.mdx`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

**sb-3 — `STORYBOOK_READY_SCRIPT` ready-wait throws on every story; play()-await is silently best-effort**
- *Recommendation (paraphrased):* invoke the ready-script as a function —
  wrap it as an immediately-invoked arrow in the evaluate string
  (`(STORYBOOK_READY_SCRIPT)(sbTimeout)`) or pass a real function, because
  `page.evaluate(string, arg)` does not invoke the function on the Playwright
  side, so the result is `undefined` and `result.reason` throws. Add
  an integration test that boots the fixture's Storybook and asserts no
  ready-wait warnings appear and that a play()-driven story matches a known-good
  baseline. Until fixed, drop the "first-class play()-aware" claim.
- *Evidence repro:* a live run against the fixture's seven stories emits
  `⚠ Storybook ready-wait failed for /iframe.html?id=…` on every story
  (visible in `frontguard run` output / logs against the fixture Storybook).
- *file:line targets:* `packages/cli/src/render/playwright.ts:269` (the
  `page.evaluate(STORYBOOK_READY_SCRIPT, sbTimeout)` call), `:275`
  (`result.reason`), `:281-285` (the swallowing catch); doc claim at
  `apps/docs/content/docs/integrations/storybook.mdx:13-15,264-296`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

---

### C11 — supply-chain  **[INDEPENDENT]**

**Findings:** supply-2 (P1), supply-6 (P1), install-13 (P2).
**Shared-file collision:** `packages/cli/package.json` is edited by supply-2 and
install-13 — internal to C11. `package-lock.json` regenerates here (large diff,
isolated to this cluster). No cross-cluster collision (C7 doesn't change
package manifests).

**supply-2 — two critical CVEs in the runtime dep tree (protobufjs, shell-quote) via `@daytonaio/sdk`**
- *Recommendation (paraphrased):* bump `@daytonaio/sdk` to the audit's listed fix
  (`^0.187.0`) in both `packages/cli/package.json` and
  `packages/cloud-api/package.json`, regenerate `package-lock.json`, run
  `npm audit` until critical/high is 0, then cut and re-publish 0.2.1. Add a CI
  gate that runs `npm audit --audit-level=high` and fails the build.
- *Evidence repro:* `npm audit` (summary shows the critical/high counts);
  `npm ls shell-quote` and `npm ls protobufjs` show the prod (`dev=false`)
  subtree under `@daytonaio/sdk`.
- *file:line targets:* `packages/cli/package.json` and
  `packages/cloud-api/package.json` (`@daytonaio/sdk` version);
  `package-lock.json` (regenerate); `.github/workflows/ci.yml` (add audit gate).
- *Code vs OPS:* **CODE_CLOSED (OPS: cut + publish `@frontguard/cli@0.2.1` to
  npm).** The dep bump + lock regen + CI gate close the audit locally; consumers
  only get the fix on the next publish.

**supply-6 — no CI gate on `npm audit`; no dependabot/renovate automation**
- *Recommendation (paraphrased):* add `.github/dependabot.yml` (npm +
  github-actions ecosystems, weekly), add a CI job that runs
  `npm audit --audit-level=high --omit=dev` and fails the build, and add a
  separate scheduled weekly audit that posts the diff into an issue.
- *Evidence repro:* `grep -RE "audit|trivy|snyk" .github/` → no matches;
  `ls .github/dependabot.yml renovate.json .renovaterc* 2>/dev/null` → not found.
- *file:line targets:* `.github/workflows/ci.yml`; new `.github/dependabot.yml`;
  optional new scheduled workflow.
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

**install-13 — clean install ships 28 npm vulnerabilities (13 high) via `@daytonaio/sdk`'s OTel exporters; sdk deprecated**
- *Recommendation (paraphrased):* move `@daytonaio/sdk` to an
  `optionalDependency` / `peerDependencyMeta` entry so users who never use
  Daytona don't pull the chain; migrate to the renamed `@daytona/sdk`; track the
  upstream OTel CVEs and pin past them or ship a `package-lock.json` override.
- *Evidence repro:* `npm install @frontguard/cli` in a fresh dir prints the
  deprecation warning and the vulnerability count; `npm audit --json` enumerates
  the high CVEs in `@opentelemetry/exporter-*` and `protobufjs`.
- *file:line targets:* `packages/cli/package.json` (`dependencies` →
  `optionalDependencies` / `peerDependencyMeta`); `package-lock.json`.
- *Code vs OPS:* **CODE_CLOSED (OPS: re-publish to npm).** Source change ships
  now; consumers see the smaller tree only after publish.

---

### C12 — mcp-correctness  **[INDEPENDENT]**

**Findings:** mcp-3 (P1), mcp-6 (P1), mcp-8 (P2), mcp-10 (P2).
**Shared-file collisions:** `packages/mcp/**` collides with C7 — both edit
`tools/list-regressions.ts` (C7/mcp-1 at `:70-77`, C12/mcp-8 at `:64`) and
`tools/recent-runs.ts` (C7/mcp-1 at `:71-78`, C12/mcp-8 at `:62`).
**Directive-listed.** Serialise C12 **after** C7's mcp work.
`apps/docs/content/docs/integrations/mcp.mdx` is touched by mcp-6/mcp-10 **and**
by C7/mcp-2 (doc claim) **and** C3/docs-2 (api-url at `:290`) — serialise the
mcp.mdx edits. `accept-baseline.ts` reaches into
`packages/cloud-api/src/index.ts:405-414` (collision with C5/C6/C7 on
`index.ts`).

**mcp-3 — `invokedDirectly` path-equality check fails via `/tmp`, firmlinks, symlinks (silent no-op on every npx)**
- *Recommendation (paraphrased):* replace the path-equality guard with a robust
  idiom — drop the conditional entirely (the file only runs as a bin) and gate
  the test-side import via a named `main()` export, or compare realpaths
  (`realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])`).
- *Evidence repro:* `cd /tmp/mcp-test && cat init.jsonl | npx -y @frontguard/mcp@0.2.0`
  → exit 0 with zero bytes of stdout/stderr (no tools registered). Prefer
  reproducing against the **local build** rather than the published 0.2.0:
  `node packages/mcp/dist/index.js < init.jsonl` from a `/tmp` cwd.
- *file:line targets:* `packages/mcp/src/index.ts:152-159`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS. (mcp-10 depends on this fix.)

**mcp-6 — `accept_baseline` silently approves an entire run when the agent thinks it accepted one diff**
- *Recommendation (paraphrased):* add per-diff approval to the cloud-api
  (`POST /v1/baselines/:runId/approve` with a `{diffIds:[…]}` body) and have the
  MCP tool take and forward an array; or rename the tool to
  `accept_run_baselines` and rewrite the docs so the agent performs an explicit
  "I reviewed all N regressions" check before calling it. As shipped, an LLM
  following the docs can promote broken UI to canonical.
- *Evidence repro:* code inspection — `accept-baseline.ts:29-37` parses
  `diff_id` only to extract the `runId` and discards the per-diff selector;
  `index.ts:405-414` sets `baselinesApproved=true` on the whole run; the docs
  prompt at `mcp.mdx:353-360` encourages the per-diff phrasing.
- *file:line targets:* `packages/mcp/src/tools/accept-baseline.ts:29-37`;
  `packages/cloud-api/src/index.ts:405-414`;
  `apps/docs/content/docs/integrations/mcp.mdx:353-360`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS. (Touches cloud-api `index.ts` →
  serialise with C5/C6/C7.)

**mcp-8 — treating `status='new'` as a regression mislabels first-time baselines**
- *Recommendation (paraphrased):* drop `'new'` from `REGRESSION_STATUSES` in both
  tools (or rename the set `BASELINE_ISSUE_STATUSES` and document the semantic),
  and add a regression test with a sample run whose results include
  `status='new'`. The codebase already knows the right answer — the cloud-api
  emits `new_baseline`, which is correctly excluded.
- *Evidence repro:* code inspection —
  `grep -n "'new'" packages/mcp/src/tools/list-regressions.ts packages/mcp/src/tools/recent-runs.ts`
  shows `'new'` inside the regression set (`list-regressions.ts:64`,
  `recent-runs.ts:62`); the CLI sets `status:'new'` for first-time baselines
  (`packages/cli/src/diff/pixel.ts:207`).
- *file:line targets:* `packages/mcp/src/tools/list-regressions.ts:64`;
  `packages/mcp/src/tools/recent-runs.ts:62`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS. (Shares the two files with C7/mcp-1 →
  serialise.)

**mcp-10 — documented "tools/list empty → Node version" troubleshooting is wrong (real cause is mcp-3)**
- *Recommendation (paraphrased):* after fixing mcp-3, add a real launch
  diagnostic — have the binary write a one-line
  `frontguard-mcp v<version> starting on stdio` to stderr on launch — and update
  the troubleshooting table to add "no output at all → likely a path-resolution
  bug; file an issue with `which npx` and your cwd."
- *Evidence repro:* `apps/docs/content/docs/integrations/mcp.mdx:381-391` states
  the empty-tools case is "almost always a Node version issue"; reproduced on
  Node 22 (see mcp-3 repro) — the real cause is the silent-exit path bug.
- *file:line targets:* `apps/docs/content/docs/integrations/mcp.mdx:381-391`;
  the MCP binary launch path (`packages/mcp/src/index.ts`, add the stderr line).
- *Code vs OPS:* **CODE → CLOSED.** No OPS. **Depends on mcp-3** (land mcp-3
  first within C12).

---

### C13 — init-gitignore  **[INDEPENDENT]**

**Findings:** install-2 (P0).
**Shared-file collision:** `packages/cli/src/cli/init.ts` — C13 edits the
`.gitignore` entry list at `:247`; C1/install-1 edits the default `format` at
`:158`. **Not in the directive's collision list — flagged here.** Serialise
C13↔C1 on `init.ts` (or fold both into one worktree).

**install-2 — first-run baseline init explodes when `node_modules` is in the worktree (init's `.gitignore` omits `node_modules/`)**
- *Recommendation (paraphrased):* add `node_modules/` to the entries `init`
  appends to `.gitignore`; more robustly, have `GitOrphanStorage` detect a
  worktree containing a `package.json` and refuse to check out unless the working
  tree is clean of ignorable dirs, and emit a real error message rather than
  "All screenshots will be treated as new" followed by an internal
  "not initialized" panic. Add a `maxBuffer` override to the `git` spawn.
- *Evidence repro:* in a fresh dir —
  `git init && npm install && <frontguard init> && git commit -am init`, then
  serve a local site (`npx serve` on `:8765`) and run
  `<frontguard run>` → fails with
  `Baseline storage init failed: git rm failed: spawnSync git ENOBUFS` and
  `Comparison failed: GitOrphanStorage not initialized.` (use the
  `-p @frontguard/cli` invocation form for the `frontguard` commands).
- *file:line targets:* `packages/cli/src/cli/init.ts:247` (the `entriesToAdd`
  list); the `GitOrphanStorage` checkout / `execFileSync` site
  (`packages/cli/src/.../git-orphan.ts:88-92`, no `maxBuffer`).
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

---

### C14 — marketing-claims  **[INDEPENDENT]**

**Findings:** claim-5 (P0), claim-7 (P2), claim-9 (P2), dist-11 (P2).
**Shared-file collisions:** `README.md` comparison-table region (claim-7 `:102`,
claim-9 `:101`) overlaps C3 (install-6/claim-6 at `:74`/`:104`).
**Directive-listed (docs set).** Serialise C14↔C3 on `README.md`.
`apps/landing/**` (claim-5 `pricing.tsx`, dist-11 `index.html`) overlaps C3
(claim-4 `pricing.tsx`) — `pricing.tsx` is touched by **both** claim-4 (C3) and
claim-5 (C14); serialise on `pricing.tsx`.

**claim-5 — Pro tier advertises "Production monitoring scheduler" but the plan flag is `false` (Business-only); runtime returns 402**
- *Recommendation (paraphrased):* decide intent — either flip
  `pro.limits.productionMonitoring` to `true` (and let the cron route allow the
  Pro plan), or remove the feature from the Pro tier's `features` array and from
  the comparison `MATRIX` row. Add a snapshot/integration test asserting every
  feature claim on the pricing page maps back to a `hasFeature()` returning
  `true` for that plan id.
- *Evidence repro:* code inspection —
  `apps/landing/src/routes/pricing.tsx:71` lists the feature;
  `packages/cloud-api/src/billing/plans.ts:59` has
  `pro.limits.productionMonitoring: false` while `:73` has business `true`;
  `packages/cloud-api/src/routes/monitors.ts:68` returns HTTP 402 to Pro.
- *file:line targets:* `apps/landing/src/routes/pricing.tsx:71`, `:115` (MATRIX);
  `packages/cloud-api/src/billing/plans.ts:48-61`, `:63-76`, `:107-110`;
  `packages/cloud-api/src/routes/monitors.ts:68`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

**claim-7 — README "BackstopJS — 6yr (quiet)" cell is fabricated**
- *Recommendation (paraphrased):* change the cell to a claim defensible from the
  project's own cited source (e.g. `❌ (low activity)` or
  `❌ (last release ~2024)`). Add a test asserting every quantitative claim in
  the README comparison table maps to a citation in `docs/research.md`.
- *Evidence repro:* `npm view backstopjs time` → last release `v6.3.25` ~2024
  (not six years); `docs/research.md:230-238` does not say "6 years".
- *file:line targets:* `README.md:102`; reference `docs/research.md:230-238`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

**claim-9 — README "Chromatic Pro entry per-snapshot" is misleading (Starter is flat $179/mo)**
- *Recommendation (paraphrased):* replace "per-snapshot" with "$179/mo" in the
  README table to match the project's own research.md and the live
  `/comparisons` page.
- *Evidence repro:* `docs/research.md:93-98` documents Chromatic Starter at
  `$179/mo` (35,000 snapshots); `apps/landing/src/routes/comparisons/data.ts:79`
  already says `$179/mo`.
- *file:line targets:* `README.md:101`; reference `docs/research.md:93-98`,
  `apps/landing/src/routes/comparisons/data.ts:79`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

**dist-11 — live site Schema.org `aggregateRating` 4.8/36 on a 0-star repo**
- *Recommendation (paraphrased):* strip the `AggregateRating` block. The fix is
  already in `apps/landing/index.html` on main — but the **live** site still
  serves the old build, so the remaining work is deployment (or a Cloudflare
  HTML Rewriter hot-fix that strips the block immediately).
- *Evidence repro:* `curl -s https://frontguard.dev/ | grep -i aggregateRating`
  (the live HTML still includes it); `curl -s https://api.github.com/repos/ravidsrk/frontguard | python3 -c "import json,sys;print(json.load(sys.stdin)['stargazers_count'])"`
  → `0`.
- *file:line targets:* `apps/landing/index.html` (verify the source no longer
  contains the block — already removed on main).
- *Code vs OPS:* **CODE_CLOSED (OPS: deploy/redeploy the landing site so the live
  HTML matches main).** Source is clean; the live misrepresentation persists
  until the deploy.

---

### C15 — docs-hygiene-residual  **[INDEPENDENT]**

**Findings:** docs-4 (P0), docs-7 (P2), docs-8 (P1), docs-9 (P2).
**Shared-file collisions (heavy — partition carefully):**
- `storybook.mdx` (docs-4 flag strip) ↔ C10 (sb-1/sb-3 doc retraction) ↔ C1
  (sb-2 fixture command).
- `cross-os-rendering.mdx` (docs-9 `:273`) ↔ C4 (docs-3 `:69/93/100/228`).
- `vercel.mdx` (docs-9 `:281`) ↔ C3 (docs-2 `:67`) ↔ C8 (docs-6 install URL).
- moving `frontguard-vs-percy.mdx`/`frontguard-vs-chromatic.mdx` into
  `comparisons/` (docs-8) changes URLs that C3 (install-6/claim-6 README links)
  point to — coordinate destinations.
Sequence C15 **last** among the doc clusters (after C2/C3/C4/C8/C10 settle their
shared mdx), or partition each file by line and serialise.

**docs-4 — Storybook integration doc invokes CLI flags that don't exist (`--baseline-strategy`, `--ai`)**
- *Recommendation (paraphrased):* strip `--baseline-strategy` and `--ai` from the
  Storybook CI recipe (AI is enabled by config + env keys; baseline strategy is
  config-only today) and fix the "Next steps" claim that lists them as documented
  flags. Either implement the flags or fix the docs — fixing the docs is
  recommended since `frontguard.config.ts` already covers both.
- *Evidence repro:*
  `node packages/cli/dist/cli/index.js run --baseline-strategy git --ai` →
  `error: unknown option '--baseline-strategy'`;
  `grep -n "option('--" packages/cli/src/cli/index.ts` lists the real flags
  (`:256-263`).
- *file:line targets:* `apps/docs/content/docs/integrations/storybook.mdx:356,505`;
  actual flags at `packages/cli/src/cli/index.ts:256-263`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

**docs-7 — `self-host.mdx` claims `/health` returns `0.1.0`; ghcr image isn't published**
- *Recommendation (paraphrased):* update the `/health` sample output to `0.2.0`
  (or a `<your release>` placeholder). Either publish a public
  `ghcr.io/ravidsrk/frontguard-cloud-api` image and verify anonymous pulls, or
  drop the GHCR pattern and document `docker compose build` from source.
- *Evidence repro:* `curl -sI https://ghcr.io/v2/ravidsrk/frontguard-cloud-api/manifests/latest`
  → `HTTP/2 401`; `/health` actually returns `PACKAGE_VERSION`
  (`packages/cloud-api/src/index.ts:132`).
- *file:line targets:* `apps/docs/content/docs/self-host.mdx:117` (version
  sample), `:357`, `:406` (ghcr deploy lines).
- *Code vs OPS:* **CODE_CLOSED (OPS: publish public `ghcr.io` cloud-api image)**
  if the GHCR pattern is kept; **CODE → CLOSED** if the doc switches to
  build-from-source (the version-string fix is pure doc either way).

**docs-8 — sandbox / cross-os / distribution / results pages orphaned from the sidebar**
- *Recommendation (paraphrased):* add `sandbox`, `cross-os-rendering`, and
  `distribution` to the top-level `meta.json` (e.g. under a new
  Deployment/Advanced group), and move `frontguard-vs-percy.mdx` /
  `frontguard-vs-chromatic.mdx` into `comparisons/` and list all three in
  `comparisons/meta.json`.
- *Evidence repro:*
  `grep -n "sandbox\|cross-os\|distribution" apps/docs/content/docs/meta.json`
  → no entries; `cat apps/docs/content/docs/comparisons/meta.json` →
  `"pages": ["frontguard-vs-argos"]` only.
- *file:line targets:* `apps/docs/content/docs/meta.json:3-22`;
  `apps/docs/content/docs/comparisons/meta.json:3`;
  `apps/docs/content/docs/guides/meta.json:20-22`.
- *Code vs OPS:* **CODE → CLOSED.** No OPS. *(Coordinate moved-file URLs with C3
  README links.)*

**docs-9 — internal links to nonexistent docs + a `frontguard approve` command that doesn't exist**
- *Recommendation (paraphrased):* replace `/docs/guides/scheduled-monitors` with
  `/docs/guides/production-monitoring`; relabel the cross-os link to the
  Playwright-plugin-setup page; replace the invented `frontguard approve` with
  `frontguard update-baselines` (or `accept-fix <id>`) and rephrase the
  surrounding sentence.
- *Evidence repro:*
  `ls apps/docs/content/docs/guides/scheduled-monitors* 2>/dev/null` → no match;
  `grep -rn "frontguard approve" apps/docs/content/docs` → hits in comparison/
  migration pages;
  `grep -n ".command('" packages/cli/src/cli/index.ts` → real commands (`run`,
  `init`, `update-baselines`, `doctor`, `monitor`, `accept-fix`, `reject-fix`,
  `export-patterns`, `plugin …`) — no `approve`.
- *file:line targets:* `apps/docs/content/docs/integrations/vercel.mdx:281`;
  `apps/docs/content/docs/cross-os-rendering.mdx:273`;
  `apps/docs/content/docs/guides/frontguard-vs-chromatic.mdx:98` (+ the other
  `frontguard approve` occurrences across the comparison/migration files).
- *Code vs OPS:* **CODE → CLOSED.** No OPS.

---

### C16 — validation-methodology  **[INDEPENDENT]**

**Findings:** val-5 (P2).
**Shared-file collision:** none — `validation/**` and the validation results doc
are C16-exclusive. `packages/cli/src/diff/pixel.ts` is referenced read-only
(the byte-identical fast path is correct behavior; the issue is the harness
methodology, not the fast path).

**val-5 — two-pass recheck against unchanged code is not an independent measurement (pixelmatch short-circuits on byte-identical PNGs)**
- *Recommendation (paraphrased):* make the recheck pass an actual independent
  measurement — boot a fresh dev-server process (fresh CSS/JS hashes, font
  sub-pixel decisions), or render against a separate clone, or seed the recheck
  with a no-op `git commit --allow-empty` plus a forced server restart — then
  re-run the harness and update the methodology write-up. The current setup
  shares dev-server PID, work dir, SHA, and baseline between passes, so it
  measures Chromium encoder determinism, not false-positive rate.
- *Evidence repro:* code inspection — `packages/cli/src/diff/pixel.ts:51-63`
  takes a `Buffer.compare(current, baseline) === 0` fast path;
  `validation/results/tailwind-dashboard.json:40-99` shows every diff entry at
  `diffPercentage: 0` (consistent with the fast path firing on every entry).
- *file:line targets:* `validation/**` (the recheck harness);
  `packages/cli/src/diff/pixel.ts:51-63` (the fast path it exploits);
  `validation/results/results-v0.2.md:46-49` (methodology claim to revise).
- *Code vs OPS:* **CODE → CLOSED** (harness change + re-run + corrected
  methodology write-up). No OPS — but a local validation re-run is required; if
  the re-run isn't feasible in the loop, the minimum closure is the corrected
  methodology disclosure plus the harness change that forces an independent
  second pass.

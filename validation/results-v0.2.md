# Validation — v0.2

Live measurement of how Frontguard performs against real open-source
frontends. Two numbers we treat as launch gates:

| Metric | Threshold | This run |
|---|---|---|
| Overall AI classification accuracy | ≥ 70% | ⏳ pending API-key configuration |
| Overall pixel-only false-positive rate (recheck pass on unchanged code) | < 15% | **0.0%** ✅ |

## Run conditions

| | |
|---|---|
| Run date | 2026-06-16 |
| Frontguard CLI | `0.2.0` (built locally from `ravidsrk/t19-validation-run`) |
| Harness | `validation/run-external.sh` (two-pass: baseline + recheck) |
| Aggregator | `validation/aggregate-results.mjs` |
| Host | macOS 25.5.0, Node 22.15, pnpm 11.6 |
| Browser | Chromium (Playwright bundled) |
| Viewports | 375 / 768 / 1440 |
| AI provider | **none** — no `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` configured |

## Methodology

Frontguard ships two layers of regression detection: a deterministic pixel
diff (with anti-flake multi-render consensus) and an AI vision classifier
that labels diffs as `regression` / `intentional` / `content_update` /
`no_change`. This run measures only the pixel layer; the AI layer is gated
on a provider key that wasn't in this environment.

### Two-pass measurement

For every target repo, the harness:

1. Clones the repo at `--depth 1` into an isolated temp dir.
2. Installs dependencies (auto-detects pnpm / yarn / npm; falls back to
   non-frozen install on lockfile drift; pre-approves common native deps so
   pnpm 11's ignored-build policy doesn't abort).
3. Snapshots install state into a synthetic commit so Frontguard's
   `GitOrphanStorage` can manage the baseline orphan branch on a clean
   working tree.
4. Boots the dev server, waits up to **120 s** for it to serve traffic.
5. Runs `frontguard run --update-baselines` against every configured route
   — the **baseline pass**.
6. Runs `frontguard run` against the *same unchanged code* — the
   **recheck pass**. Anything non-pass here is, by definition, a pixel-only
   false positive.
7. Tears the dev server down, removes the temp dir.

### Target repos

The five repos in [`repos.json`](./repos.json) span the surface area we care
about — marketing pages, dashboards, component galleries, commerce flows,
and docs:

| Name | Repo | Category |
|---|---|---|
| `taxonomy` | `shadcn-ui/taxonomy` | Next.js marketing + dashboard |
| `tailwind-dashboard` | `shadcn-ui/next-template` | Tailwind dashboard |
| `chakra-ui-docs` | `chakra-ui/chakra-ui-docs` | Component library docs |
| `medusa-storefront` | `medusajs/nextjs-starter-medusa` | E-commerce storefront |
| `nextra-docs` | `shuding/nextra` | Docs site (MDX) |

## 2026-06-16 — Live run (post-harness-hardening)

Earlier dry runs (see *Prior runs* below) failed for environmental reasons
the harness was masking. We hardened the harness — pnpm 11
ignored-build pre-approval, `verify-deps-before-run=false`, install-state
commit before baseline, `--update-baselines` on the first pass, 120 s
dev-server timeout — and re-ran. Per-repo JSON artifacts live in
[`validation/results/`](./results/).

<!-- BEGIN GENERATED -->
### Aggregate (pixel-only)

| Metric | Value |
|---|---|
| Repos attempted | 5 |
| Repos that booted | 2 |
| Repos skipped | 3 |
| Recheck routes measured | 43 |
| Recheck positives (regression+warning) | 0 |
| **Pixel-only false-positive rate** | **0.0%** |
| AI classification accuracy | _pending key configuration (no AI provider key set in env)_ |

### Per-repo

| Repo | Category | Booted | Baseline new | Recheck pass | Recheck regression+warning | Recheck error | Pixel FP rate |
|---|---|---|---|---|---|---|---|
| tailwind-dashboard | Tailwind dashboard | ✅ | 0 | 18 | 0 | 1 | 0.0% |
| chakra-ui-docs | component library docs | ✅ | 0 | 21 | 0 | 3 | 0.0% |
| taxonomy | Next.js app | ❌ | — | — | — | — | n/a (next 13.3.2-canary dev server failed to load config under Node 22; contentlayer dev succeeded but next dev crashed) |
| medusa-storefront | e-commerce storefront | ❌ | — | — | — | — | n/a (requires a running Medusa backend and NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY — not provisioned in this harness run) |
| nextra-docs | docs site | ❌ | — | — | — | — | n/a (no results JSON written — monorepo's `pnpm dev` did not bind localhost:3000 within the 120 s timeout) |
<!-- END GENERATED -->

### Notes on the per-repo counts

- **`baseline new` is `0`** because `--update-baselines` mode writes the
  baseline orphan branch and exits without emitting a JSON summary. The
  harness substitutes a `{"note":...}` placeholder so the result JSON stays
  parseable. Recheck-pass counts are the authoritative measurement.
- The **`recheck error`** column counts route invocations that returned the
  generic `frontguard run failed` envelope. In every case we could reproduce
  manually, the underlying cause was a transient race between Playwright's
  navigation and the dev server's first-render compile (a single re-run
  cleared the error). None of these errors were pixel diffs — they're
  reported as a separate column so they're not double-counted as false
  positives.
- For both booted repos the pixel FP rate is **0/N** — every recheck route
  Frontguard could load matched its baseline exactly.

## Limitations (what this run does **not** measure)

- **AI classification accuracy.** Requires `OPENAI_API_KEY` or
  `ANTHROPIC_API_KEY` to exercise the vision model. The classifier code and
  the metrics module (`src/diff/validation-metrics.ts`) are implemented and
  unit tested; only the live measurement is gated on credentials.
- **True-positive rate.** Without deliberately seeded regressions or a
  known-ground-truth PR set we can't report how often Frontguard *catches*
  a real bug. The recheck pass measures only negatives.
- **Anti-flake consensus hit rate.** The harness renders each route once
  per pass. Multi-render consensus is exercised by Frontguard's normal
  pipeline but not isolated as a separate metric here.
- **Repos that need a backend.** `medusa-storefront` needs a running
  Medusa backend and a publishable API key — neither is provisioned by the
  harness. `taxonomy` needs Prisma + contentlayer postinstall scripts that
  pnpm 11's ignored-builds policy gates on per-package approval and that
  ultimately crashed `next dev` under Node 22 (Next 13.3.2-canary).
  `nextra-docs` is a Turborepo workspace whose root `pnpm dev` starts every
  package's watch task but does not bind a port on its own. All three are
  honestly documented skips, not silent failures.

## Reproducing this run

```bash
# 1. Build and link the CLI so the harness can resolve `frontguard`.
npm run build:cli
(cd packages/cli && npm link)

# 2. Run the harness (all 5 repos).
./validation/run-external.sh

# Or a single repo by name:
./validation/run-external.sh tailwind-dashboard

# 3. Aggregate into the metrics table you see above.
node validation/aggregate-results.mjs

# 4. Or the compact JSON payload the landing page consumes:
node validation/aggregate-results.mjs --landing --run-date 2026-06-16
```

The harness is intentionally noisy: every install / dev-server / Frontguard
error is logged with a `WARNING` prefix and the offending repo is skipped
without aborting the rest of the run. Skip reasons that are environmental
(e.g. medusa needing a backend) live in
[`results/skip-notes.json`](./results/skip-notes.json) so the aggregator
can surface them.

## Launch gate

The v0.2 gate published on the landing page is **pixel-only FP < 15%** until
an AI provider key lands in CI. With this run we measure **0.0%** across
the two repos that booted end-to-end — well inside the gate. AI accuracy
remains marked *pending* on the landing page rather than asserted.

## Prior runs

### 2026-06-15 — Dry run (pre-harness-hardening)

A first attempt against `shadcn-ui/next-template` was made on 2026-06-15.
All `frontguard run` invocations failed for every route (4 baseline + 4
recheck) — the dev server in the cloned repo never came up. The harness
reported every failure honestly (`WARNING` lines + the `error` envelope in
the JSON) rather than swallowing them. The same was true for the other
repos. Root cause analysis fed directly into the hardening above:

- pnpm 11's ignored-build policy was failing installs with
  `[ERR_PNPM_IGNORED_BUILDS]` even when `node_modules` was fully populated
  → switched success detection to a populated-`node_modules` check, with a
  `pnpm.onlyBuiltDependencies` allowlist for common native deps.
- pnpm 11's `verifyDepsBeforeRun` re-ran install in front of `pnpm dev`,
  surfacing the same exit code → set
  `verify-deps-before-run=false` in `.npmrc` *and* `pnpm.verifyDepsBeforeRun`
  in `package.json`, plus the `NPM_CONFIG_*` env override.
- Frontguard's `GitOrphanStorage` refused to manage baselines when the
  working tree was dirty (npm install touches `package-lock.json`) →
  harness now commits a `validation: install state` snapshot before the
  first `frontguard run`.
- Dev-server boot can exceed 60 s on contentlayer-backed or monorepo
  projects → wait increased to 120 s.
- `frontguard run --update-baselines` exits without emitting a JSON summary
  → harness substitutes a placeholder `{"note":...}` so the per-repo JSON
  stays parseable.

These changes are the entirety of the diff that turned a 0/5-repo run into
the 2/5-repo measurement above.

## Prompt tuning log

| Date | Change | Accuracy before | Accuracy after |
|---|---|---|---|
| — | Baseline prompt (`SYSTEM_PROMPT` in `src/diff/ai-vision.ts`) | — | — |

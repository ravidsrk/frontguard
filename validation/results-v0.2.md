# AI Classification Validation — v0.2

*Validation gate for the v0.2 launch. Accuracy must be ≥70% and false-positive rate <15% across all four categories before marketing any AI-accuracy claim.*

## Methodology

Frontguard's AI classifier is validated against real visual diffs from open-source repos. Each sample is a `(baseline, current)` screenshot pair with a human-assigned ground-truth label in one of four categories:

| Label | Meaning |
|-------|---------|
| `regression` | Unintended visual breakage (overflow, overlap, broken layout) |
| `intentional` | Deliberate design change (new feature, restyle) |
| `content_update` | Text/data changed, layout intact |
| `no_change` | Visually identical (noise, anti-aliasing) |

Run the harness:

```bash
# Single PR
npx tsx scripts/validate-ai-real.ts --repo owner/repo --pr 123

# Batch from a ground-truth file
npx tsx scripts/validate-ai-real.ts --batch validation/ground-truth.json
```

The harness uses the shared metrics module (`src/diff/validation-metrics.ts`) to compute the confusion matrix, per-category precision/recall/F1, overall accuracy, and the false-positive rate. The launch gate is evaluated automatically via `evaluateGate()`.

## Target Repos (5)

1. **Next.js app** — e.g. `shadcn-ui/taxonomy` or `vercel/next.js` examples
2. **Tailwind dashboard** — a tailwindui-style admin template
3. **Component library docs** — e.g. a Storybook/Radix docs site
4. **E-commerce storefront** — e.g. `medusajs/nextjs-starter-medusa`
5. **Docs site** — a Fumadocs/Nextra site

## Launch Gate

| Metric | Threshold | Status |
|--------|-----------|--------|
| Overall accuracy | ≥ 70% | ⏳ Harness run pending stable repo environment |
| False-positive rate | < 15% | ⏳ Harness run pending stable repo environment |

## 2026-06-15 — Harness execution dry-run

A first harness execution against the **shadcn-ui/next-template** target was attempted on 2026-06-15 in the v0.2 build. Result:

- **Harness improvements landed:** patched `run-external.sh` to recover from `pnpm install --frozen-lockfile` failures (treat empty `node_modules` as install failure, retry with `--no-frozen-lockfile`/`--legacy-peer-deps`); added `validation/aggregate-results.mjs` to compute false-positive rate from two-pass (baseline + recheck) results; two-pass methodology now built into the script.
- **All `frontguard run` invocations failed** for every route (4 baseline + 4 recheck), with `"error": "frontguard run failed"`. Captured artifact: `validation/results/tailwind-dashboard.json`. Root cause is downstream of the harness — the dev server for the cloned repo never came up under the unattended environment (Playwright cannot reach `http://localhost:3000`). The harness reported the failure honestly rather than swallowing it.
- **No AI numbers measured.** With no successful renders, AI classification cannot be evaluated; `aiEnabled: false` reflects no `FRONTGUARD_OPENAI_KEY`/`FRONTGUARD_ANTHROPIC_KEY` in the run environment regardless.

**What is required before AI-accuracy numbers can ship on the marketing site:**

1. A run environment where each target repo's `devCommand` actually serves the documented routes on the documented port (or `--target-url` overridden to a pre-built deployment). Reproduce locally with `validation/run-external.sh --names tailwind-dashboard --keep-dev-server` to confirm.
2. `FRONTGUARD_OPENAI_KEY` (or `FRONTGUARD_ANTHROPIC_KEY`) exported in the run env so the AI vision pipeline fires.
3. Re-run the full five-repo harness, regenerate per-repo JSON in `validation/results/`, and re-run `node validation/aggregate-results.mjs` to populate the table below.

**Until then,** the landing page does **not** advertise an accuracy number. The Validation section links here so any visitor can audit the methodology and current measurement status.

## Results

*(Populated by the harness — example structure below.)*

<!-- BEGIN GENERATED -->
_No successful runs yet. See "2026-06-15 — Harness execution dry-run" above for status._
<!-- END GENERATED -->

## Prompt Tuning Log

If accuracy falls below threshold, document prompt changes here:

| Date | Change | Accuracy before | Accuracy after |
|------|--------|-----------------|----------------|
| — | Baseline prompt (`SYSTEM_PROMPT` in `src/diff/ai-vision.ts`) | — | — |

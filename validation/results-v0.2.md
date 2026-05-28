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
| Overall accuracy | ≥ 70% | ⏳ Pending live run |
| False-positive rate | < 15% | ⏳ Pending live run |

> **Note:** This document is the results template. Live numbers are populated by running the harness against the target repos with valid `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. The metrics module and gate logic are fully implemented and unit-tested (`test/diff/validation-metrics.test.ts`); only the live API run is gated on credentials + browser availability in CI.

## Results

*(Populated by the harness — example structure below.)*

<!-- BEGIN GENERATED -->
_No live run recorded yet. Run the harness to populate._
<!-- END GENERATED -->

## Prompt Tuning Log

If accuracy falls below threshold, document prompt changes here:

| Date | Change | Accuracy before | Accuracy after |
|------|--------|-----------------|----------------|
| — | Baseline prompt (`SYSTEM_PROMPT` in `src/diff/ai-vision.ts`) | — | — |

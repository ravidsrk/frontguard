# Frontguard — External Validation Harness

This directory contains a dogfooding harness that runs **Frontguard** against a
curated set of real-world, production-grade open-source frontends. The goal is
to measure how Frontguard performs in the wild — specifically its **false
positive rate** and the accuracy of its AI regression classification — rather
than against toy fixtures.

## Why

The #1 pain point with existing visual regression tools is false positives
(~40% of runs in the broader market). The only honest way to validate that
Frontguard's anti-flake multi-render consensus + AI classification actually move
that number is to point it at diverse, real codebases and inspect the results.

## Files

| File              | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `repos.json`      | The 5 target repos, their dev commands, URLs, and routes.      |
| `run-external.sh` | The harness: clone → install → boot → run Frontguard → tear down. |
| `results/`        | Per-repo JSON output (`<name>.json`). Git-ignored except `.gitkeep`. |

## Requirements

- **node** (>= 20) and **npx**
- **git**
- **jq**
- Optional: **pnpm** / **yarn** (auto-detected from each repo's lockfile)

## Usage

```bash
# Run all repos defined in repos.json
./validation/run-external.sh

# Run a single repo by its "name"
./validation/run-external.sh taxonomy
```

Each repo is cloned into an isolated temp directory, dependencies are installed,
the dev server is started, Frontguard is run against every configured route, and
everything is torn down afterward (via a `trap`-based cleanup). A failure in any
single repo is logged as a `WARNING` and skipped — the harness keeps going.

## The 5 Target Repos

| Name                 | Repo                              | Category                | Notes                              |
| -------------------- | --------------------------------- | ----------------------- | ---------------------------------- |
| `taxonomy`           | `shadcn-ui/taxonomy`              | Next.js app             | App Router, marketing + dashboard. |
| `tailwind-dashboard` | `shadcn-ui/next-template`         | Tailwind dashboard      | Tailwind-heavy UI surfaces.        |
| `chakra-ui-docs`     | `chakra-ui/chakra-ui-docs`        | component library docs  | Many components, theming.          |
| `medusa-storefront`  | `medusajs/nextjs-starter-medusa`  | e-commerce storefront   | Cart/checkout flows, port 8000.    |
| `nextra-docs`        | `shuding/nextra`                  | docs site               | MDX docs, dark/light themes.       |

> Repos and routes are intentionally diverse (marketing pages, dashboards,
> component galleries, commerce flows, docs) to stress different rendering
> characteristics.

## Interpreting Results

Each run writes `results/<name>.json` with this shape:

```json
{
  "name": "taxonomy",
  "repo": "shadcn-ui/taxonomy",
  "category": "Next.js app",
  "baseUrl": "http://localhost:3000",
  "timestamp": "2026-01-01T00:00:00Z",
  "runs": [
    {
      "route": "/",
      "url": "http://localhost:3000/",
      "result": { "...": "frontguard run --output json payload" }
    }
  ]
}
```

What to look at in each `result`:

- **status / verdict** — `pass` vs `fail` for the route.
- **classification** — Frontguard's AI label for any diff:
  - `regression` — a genuine, unintended visual change. _This is what we want
    to catch._
  - `intentional` — a deliberate design change. Should not block.
  - `content_update` — dynamic/data-driven change (e.g. a new blog post). Should
    not block.
- **flake / consensus** — whether multi-render consensus suppressed a flaky diff.
  A high suppression count on first runs is expected; persistent flake is a
  signal to investigate.

### How to judge a run "good"

1. **Baseline run** (first run on a repo) should produce baselines with **zero
   false failures** — every route should pass since nothing has changed.
2. **Re-run with no code changes** should be **100% green**. Any failure here is
   a false positive — the metric we're driving to zero.
3. **Run after an intentional UI tweak** should classify the change as
   `intentional` (not `regression`).

Aggregate the per-route `classification` counts across all 5 repos to compute
the harness-level false-positive rate. A summary of a manual run lives in
[`results-v0.2.md`](./results-v0.2.md).

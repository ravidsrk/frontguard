# 🛡️ @frontguard/cli

[![CI](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml/badge.svg)](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@frontguard/cli)](https://www.npmjs.com/package/@frontguard/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Local visual regression testing with reviewed git baselines, inspectable reports, and optional model-assisted analysis.**

Frontguard runs without a hosted account and keeps the deterministic comparison path in your repository and CI environment.

> **multi-browser** · **optional AI analysis** · **local-first** · **MIT**
>
> _Numbers are derived from source by [`scripts/stats.ts`](https://github.com/ravidsrk/frontguard/blob/main/scripts/stats.ts); see [`scripts/stats.json`](https://github.com/ravidsrk/frontguard/blob/main/scripts/stats.json) for the canonical snapshot._

## Install

The npm package is **`@frontguard/cli`**; the command it installs is **`frontguard`**.

```bash
npm install -D @frontguard/cli
```

Or run it without installing — note `npx` needs the package name (`-p @frontguard/cli`) because the bin (`frontguard`) differs from the package:

```bash
npx -p @frontguard/cli frontguard run --url http://localhost:3000
```

## Quick Start (Two-Terminal Workflow)

**Prerequisites:** Node.js 22+, a git repository, and an `origin` remote if CI should compare against published baselines.

```bash
# One-time per machine: install the Chromium build that matches this package.
# GitHub-hosted runner images update browsers on their own, and that drift
# flaked screenshot tests (https://x.com/karlhorky/status/2082458846031696091).
# --with-deps installs Linux system packages; on macOS the dependency
# warning is safe to ignore.
npx -p @frontguard/cli playwright install --with-deps chromium

# Generate frontguard.config.ts (--yes skips prompts).
# Add --ci only if this repo already has package.json, a start script,
# and a supported lockfile (set package.json "packageManager" if more than
# one lockfile exists) — otherwise `init --ci` writes nothing.
npx -p @frontguard/cli frontguard init --yes
npx -p @frontguard/cli frontguard doctor

# Commit only the files init wrote. The published CLI needs a clean tree
# to create the baseline branch.
git add frontguard.config.ts .gitignore && git commit -m "Add Frontguard"
```

Check the `routes` in `frontguard.config.ts` before capturing: for non-framework apps `init` guesses (`/`, `/about`, `/contact`), and a route that does not exist baselines its 404 page without warning.

**App terminal (leave this running):** start your app and wait until the `baseUrl` in `frontguard.config.ts` responds. A static folder works too (`npx serve`):

```bash
npm run dev
```

**Frontguard terminal:** review the running app in your browser, capture baselines with `update-baselines`, then compare with `run`. Local comparison needs no `origin` remote:

```bash
npx -p @frontguard/cli frontguard update-baselines --confirm-baselines
npx -p @frontguard/cli frontguard run
```

Only CI comparisons need the published orphan branch:

```bash
git push origin frontguard-baselines
```

Once `@frontguard/cli` is installed as a dependency, the `frontguard` bin is on your `PATH` and you can drop the `npx -p @frontguard/cli` prefix (e.g. `frontguard run`). `run` exits `0` when pages match, `1` on a regression or unaccepted new page, and `2` on a tool error. `update-baselines` and `run --update-baselines` exit `2` and write nothing without `--confirm-baselines`. Judge mode cannot supply that flag, and an advisory caption cannot set it. An agent setting `confirm_reviewed: true` on itself is not a human review. MCP promotion is refused in local-report mode; this CLI command is the local write. Cloud `approveRun` is not a production path. The default `threshold` is `0.1`, which means 10% of pixels. The pixelmatch color distance on the comparison is a separate `0.1` on a 0–1 scale where 1 is black versus white. Playwright's per-pixel default is `0.2`. A compact text or icon edit fails when any 16×16 window contains more than 64 differing pixels. Scattered speckle under that count stays inside the default gate.

---

## Commands Reference

| Command                              | Description                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `frontguard run`                     | Run visual regression tests (default command)                                           |
| `frontguard init [--ci] [--yes]`     | Generate a starter config; `--ci` also writes a GitHub Actions workflow                 |
| `frontguard doctor`                  | Diagnose environment readiness (Node, Playwright, browsers, config, git)                |
| `frontguard guide [topic] [--json]`  | Print offline reference guides (`setup`, `diffing`, `mcp`, `playwright`, `ci`)          |
| `frontguard update-baselines --confirm-baselines` | Accept current screenshots as new baselines. Refuses, exit 2, without the flag. |
| `frontguard monitor`                 | Monitor live production URLs for visual regressions                                     |
| `frontguard accept-fix <id>`         | Mark a suggested fix as accepted (improves future suggestions)                          |
| `frontguard reject-fix <id>`         | Mark a suggested fix as rejected (negative training signal)                             |
| `frontguard export-patterns`         | Export the local fix-pattern database as JSON                                           |
| `frontguard plugin install <name>`   | Install a Frontguard plugin from npm                                                    |
| `frontguard plugin uninstall <name>` | Uninstall a Frontguard plugin                                                           |
| `frontguard plugin list`             | List installed plugins                                                                  |

### Key `frontguard run` Flags

- `--url <url>` — Override `baseUrl` from `frontguard.config.ts`
- `--threshold <ratio>` — Changed-pixel ratio threshold (`0–1` scale; `0.01` = 1%)
- `--wait-for-stability` — Wait for consecutive animation frames to converge before capturing
- `--redact-sensitive` — Redact password, payment, and `[data-frontguard-redact]` inputs and scrub DOM snapshots before capture
- `--color-scheme <scheme>` — Emulate `light` or `dark` `prefers-color-scheme`. This compares against the same baseline file as the default scheme until named capture modes exist, and warns when the stored scheme differs. The warning does not change the exit code.
- `--freeze-time [timestamp]` — Freeze `Date.now()` / `new Date()` (boolean default, epoch ms, or ISO 8601 date string)
- `--seed-random [seed]` — Seed `Math.random()` with a deterministic PRNG (`true` or numeric seed)
- `--block-urls <patterns...>` — Abort matching third-party / analytics / ad request URLs during render
- `--output <console|json>` — Emit console summary or structured JSON to stdout
- `--all-routes` — Render every discovered route. Skips smartFilter for this run and leaves animation freeze and font waiting on.
- `--update-baselines` — Accept current screenshots as new baselines. Requires `--confirm-baselines`.
- `--confirm-baselines` — Human confirmation for a baseline write. `--mode judge` and an advisory caption cannot set it.

---

## Practical Configuration Recipes

### 1. Deterministic Rendering & Per-Route Actions (`frontguard.config.ts`)

```typescript
// frontguard.config.ts
export default {
  version: 1,
  baseUrl: "http://localhost:3000",

  // Explicit routes with per-route UI interactions & custom thresholds
  routes: [
    "/",
    {
      path: "/pricing",
      threshold: 0.005,
      actions: [
        { type: "waitForSelector", selector: "[data-ready]" },
        { type: "click", selector: "[data-billing='annual']" },
      ],
    },
  ],

  viewports: [375, 768, 1440],
  browsers: ["chromium"],
  colorScheme: "dark",
  waitForStability: true,
  redactSensitive: true,
  freezeTime: "2026-01-01T00:00:00Z", // boolean | number | ISO date string
  seedRandom: 42,                     // boolean | number
  blockUrls: ["*google-analytics.com*", "*intercom.io*"],
  threshold: 0.01, // changed-pixel ratio: 0.01 = 1%

  // AI analysis (optional, BYOK: 'openai' | 'anthropic' | 'gemini', plus optional custom baseUrl)
  ai: {
    provider: "openai",
    model: "gpt-4o",
    // baseUrl: "https://openrouter.ai/api/v1", // OpenRouter, Ollama, or vLLM
  },

  // Ignore dynamic content. `since` is the date the rule was added.
  ignore: [{ selector: ".dynamic-timestamp", since: "2026-01-01" }],
};
```

`frontguard ignores --older-than <days>` lists rules whose `since` date is strictly older than that, and the shots they cover. The list follows one vendor account, not a consensus. The command does not remove a rule. A model, a prompt, or a flake heuristic does not either. Add `since` as `YYYY-MM-DD` for a rule to be counted. Shot coverage comes from configured `routes` only. When `routes` is omitted, the command says coverage is unavailable and does not discover Storybook, crawl, or filesystem routes.

### 2. Built-in Plugins (WCAG Accessibility, Performance Budgets & Script Drift)

Frontguard executes plugins across 9 ordered lifecycle hooks (`setup`, `beforeDiscover`, `afterDiscover`, `beforeRender`, `afterRender`, `afterCompare`, `afterRun`, `onError`, `teardown`):

```typescript
import {
  createAccessibilityPlugin,
  createPerfBudgetPlugin,
  createThirdPartyScriptPlugin,
} from "@frontguard/cli/plugins";

export default {
  version: 1,
  baseUrl: "http://localhost:3000",
  routes: ["/", "/pricing", "/checkout"],
  plugins: [
    createAccessibilityPlugin({ impact: "serious", failOnViolation: true }),
    createPerfBudgetPlugin({ budgets: { lcp: 2500, cls: 0.1 } }),
    createThirdPartyScriptPlugin(),
  ],
};
```

`failOnViolation: true` also refuses `frontguard update-baselines` when a violation is at or above `impact`, including when the pixel status is not a regression, and when an audit does not complete. The audit uses the same storage state, color scheme, viewport height, wait, and route actions as the capture. The report lists those violations beside the pixel result, says the baselines were not written, and does not call them accepted. It does not change the pixel status. A clean audit leaves a pixel regression as a regression.

Optional text snapshots use `createTextSnapshotPlugin({ aria: true, json: "#payload", markdown: "article" })`. Each enabled kind writes a sibling of the PNG (`.aria.txt`, `.json`, or `.md`) and diffs it as text. A mismatch is reported on its own, with a short excerpt. It does not change `comparisonMethod` from pixelmatch and does not pass or fail a pixel regression. axe-core remains the accessibility plugin. Text diff is not a gate.

---

## Story discovery

Story discovery is off unless you set it. Default route discovery stays the crawler and the filesystem scan. Explicit `routes` still win. When a story runner is set, Frontguard uses one of them, in this order: Storybook, then Ladle, then Histoire. Discovered stories are ordinary routes on the same pixelmatch path. A 1px difference is not auto-approved.

Storybook 7 is read from `/stories.json`. Storybook 8, 9, 10, and 11 alpha serve the same `/index.json` entries index, so they share one parser. Point `storybook.url` at the running server. Each story is captured at `/iframe.html?id=<story>&viewMode=story`.

Ladle is read from its own `meta.json`: a `stories` object keyed by story id, with `name`, `levels`, `locStart`, `locEnd`, `filePath`, and `meta`. Set `ladle.dir` to a local build (Ladle's default output folder is `build`) or `ladle.url` to a server such as `http://localhost:61000`. Each story opens at `/?story=<id>&mode=preview` and the capture waits for `[data-storyloaded]`. `meta.frontguard` is a Frontguard annotation inside Ladle's `meta` object and accepts the same overrides as Storybook `parameters.frontguard`.

Histoire is read from `histoire.json` while its native visual testing is still unreleased. The file has a `stories` array. Each story has `id`, `title`, and `variants` of `{ id, title }`, plus optional `group` and `docsOnly`. Set `histoire.dir` to a local build (Histoire's default output folder is `.histoire/dist`) or `histoire.url` to that build. Each variant opens at `/__sandbox.html?storyId=<id>&variantId=<id>`. Docs-only stories are skipped.

`FRONTGUARD_CAPTURE_RUNNER` or config `captureRunner` records which runner produced the baselines. If that name differs from the runner selected above, Frontguard logs that baselines from the previous runner are not comparable. An Argos maintainer reported that a Storybook runner switch made 16 of 22 shots 1px wider or taller (https://x.com/gregberge_/status/2110303101538451874). That figure is a vendor measurement, not a Frontguard statistic. Pixelmatch stays the pass/fail gate. Which runner wrote each baseline file is tracked separately.

---

## Sample CLI Output

```
 frontguard v0.2.3

 🔍 Discovering routes... found 47 routes
 📊 12/47 routes affected by changed files
 🖥  Rendering 12 routes × 3 viewports

 ───────────────────────────────────────────
  RESULTS                        12 routes
 ───────────────────────────────────────────
  ✓ /                375  768  1440   PASS
  ✓ /pricing         375  768  1440   PASS
  ⚠ /checkout        375  768  1440   WARNING
  ✘ /dashboard       375  768  1440   REGRESSION
  ★ /settings        375  768  1440   NEW
 ───────────────────────────────────────────

  ✘ /dashboard @ 375px
    AI: "At 375px, the current screenshot shows the sidebar overlapping
         the main content; the baseline keeps both regions separate."
    Guidance: Review responsive stacking for this viewport.
    Severity: 🔴 Critical (confidence: 94%)

  1 regression · 1 warning · 9 passed · 1 new
```

## Current CLI Scope

The supported path is the local CLI. Hosted cloud, MCP, GitHub App, and Docker Compose onboarding remain pre-release:

- **Spatial diff clusters & DOM selector attribution** — Connected-component diff clusters report Chroma-SSIM, CW-SSIM, and `cluster.targetSelector` (the most-specific DOM selector at the cluster center).
- **Optional AI analysis** — Multi-provider BYOK (`openai`, `anthropic`, `gemini`, plus custom OpenAI-compatible `baseUrl` for OpenRouter / Ollama / vLLM) can classify a pixel change on the default compare path; it does not change pass/fail and has no published accuracy benchmark. Experimental `frontguard run --mode judge --experimental` prints advisory notes only. A failing note does not set exit code 1, and a note of "no change" does not pass a pixel comparison. Exit 2 means the judge run could not complete. There is no published accuracy figure for this mode. `docs/ROADMAP.md` records the external studies (WUICC-bench, arXiv:2607.01728; LLMShot, arXiv:2507.10062, whose semantic-diff scalar splits about 0.921 versus 0.079 across model sizes). Those figures are not Frontguard detection accuracy, and a scalar is not a threshold. The advisory protocol, including what this repo has not measured, is `docs/judge-protocol.md`.
- **Experimental AI fixes** — `--generate-fixes` and `--verify-fixes` are separate opt-ins; unverified suggestions remain labeled for review.
- **Fix-pattern database** — `accept-fix` / `reject-fix` / `export-patterns` train and share a local pattern store that the pipeline reuses before calling the AI.
- **`frontguard doctor`** — environment diagnostics for sources of non-determinism (Node, Playwright/Chromium, browsers, config, git).
- **`frontguard monitor`** — live production-URL monitoring with daemon polling, history, and webhook alerts.
- **Accessibility + performance-budget plugins** — axe-core audits captured route/viewport pairs in Chromium pages that use the same storage state, color scheme, viewport height, wait, and route actions as the capture; performance budgets report LCP/CLS/TTFB evidence alongside visual diffs. Optional ARIA, JSON, and Markdown text snapshots are a separate plugin and do not replace axe-core or the pixel gate.
- **Inspectable artifacts** — HTML reports retain baseline/current/diff images; remote thumbnails require an explicit image-upload backend.

See the [full CHANGELOG](https://github.com/ravidsrk/frontguard/blob/main/CHANGELOG.md), [interactive documentation](https://frontguard.dev/docs), and [validation results](https://github.com/ravidsrk/frontguard/tree/main/validation). The published run used AI-disabled local comparisons and is not an AI-accuracy or cross-OS benchmark.

## Telemetry

Anonymous usage telemetry is **off by default**. Nothing is sent unless you opt in with `FRONTGUARD_TELEMETRY=1` or `telemetry: true` in config.

Opt out with any of `--no-telemetry`, `FRONTGUARD_TELEMETRY=0`, `DO_NOT_TRACK=1`, or `telemetry: false`.

When enabled, the CLI POSTs one JSON event to `https://telemetry.frontguard.dev/v1/events` (override with `FRONTGUARD_TELEMETRY_ENDPOINT`). Fields: `command`, `version`, `routes`, `regressions`, `aiProvider`, `antiFlake`, `ci`, `durationMs`, `errorType`, `ts`. No URLs, paths, screenshots, or keys. The HTTP peer can see the source IP. There is no published retention period for the default collector.

Full schema: [telemetry.md](https://github.com/ravidsrk/frontguard/blob/main/docs/telemetry.md).

Capture and compare traces are separate from those events. They are sent only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, as OTLP/HTTP JSON to that collector. Each span records a screenshot count and no URL, path, or image.

## License

MIT

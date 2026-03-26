# 🛡️ Frontguard

**AI-powered frontend visual regression testing. Detect, understand, and fix visual bugs before production.**

Backend has Datadog, Sentry, PagerDuty — a $20B+ monitoring ecosystem. Frontend gets... manual QA and hoping for the best. Frontguard changes that.

## What It Does

```
Developer pushes code → Frontguard renders every page → Compares to baselines →
AI explains what changed and why → Suggests fixes → Posts PR comment
```

- **Detect** — Pixel diff + DOM diff catches what humans miss
- **Understand** — AI explains *why* something broke, not just "pixels differ"
- **Fix** — Verified code fixes, re-rendered to confirm they work (Phase 2)

## Quick Start

```bash
# Initialize config (auto-detects your framework)
npx frontguard init

# Run visual regression tests
npx frontguard run --url http://localhost:3000

# Accept current screenshots as new baselines
npx frontguard update-baselines
```

## Features

- **Zero-config route discovery** — Auto-crawls your app to find all pages
- **Multi-browser** — Chromium, Firefox, WebKit via Playwright
- **AI-powered analysis** — BYOK (OpenAI/Anthropic) classifies regressions vs intentional changes
- **Smart rendering** — Dependency graph renders only pages affected by your changes
- **Preview deployments** — Auto-detects Vercel/Netlify preview URLs
- **Git-native baselines** — Stored in orphan branch, zero main branch bloat
- **Framework detection** — Next.js, Remix, SvelteKit, Nuxt, Astro out of the box

## Configuration

```typescript
// frontguard.config.ts
export default {
  version: 1,
  baseUrl: 'http://localhost:3000',

  // Auto-discover routes (zero config)
  discover: {
    startUrl: '/',
    maxDepth: 3,
    exclude: ['/admin/*', '/api/*'],
  },

  // Or explicit routes
  // routes: ['/', '/pricing', '/checkout'],

  viewports: [375, 768, 1440],
  browsers: ['chromium'],
  threshold: 0.1,

  // AI analysis (optional, BYOK)
  ai: {
    provider: 'openai',
    model: 'gpt-4o',
  },

  // Ignore dynamic content
  ignore: [
    { selector: '.dynamic-timestamp' },
  ],
};
```

## How It Works

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  ROUTE DISCOVERY │───▶│  RENDER PAGES    │───▶│  PIXEL DIFF     │
│  Crawl / Config  │    │  Playwright ×    │    │  pixelmatch     │
│  / Filesystem    │    │  viewports ×     │    │  fast gate      │
│                  │    │  browsers        │    │  (90% pass here)│
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │ changed
                                                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  PR COMMENT     │◀───│  AI ANALYSIS     │◀───│  DOM DIFF       │
│  Visual diffs   │    │  GPT-4V / Claude │    │  Structural +   │
│  Explanation    │    │  Classify +      │    │  computed styles │
│  Fix suggestion │    │  explain + fix   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## CLI Output

```
 frontguard v0.1.0

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
    AI: "Sidebar overlaps main content on mobile.
         flex-direction change in Dashboard.module.css:28"
    Severity: 🔴 Critical (confidence: 94%)

  1 regression · 1 warning · 9 passed · 1 new
```

## Architecture

```
src/
├── cli/              # CLI entry point (Commander.js)
├── core/             # Pipeline orchestrator, types, config
├── discovery/        # Route discovery (crawler + filesystem)
├── render/           # Playwright rendering engine
├── diff/             # Pixel diff + AI vision analysis
├── storage/          # Git orphan branch baselines
├── report/           # Console, JSON, HTML, GitHub PR reporters
└── utils/            # Redaction, logging, retry
```

Pipeline: `discover → filter → render → diff → analyze → report`

Each stage is independent with error boundaries — one page failing doesn't kill the run.

## Documentation

See [`docs/`](./docs/) for:
- [Product deep-dive](./docs/PRODUCT.md) — Architecture, business model, competitive analysis
- [Research](./docs/research/) — Market data, technical feasibility, competitive landscape
- [CEO Review](./docs/ceo-review/) — Founder-mode review with 50+ failure modes mapped

## Roadmap

- **M1** ✅ Core rendering + pixel diff + CLI
- **M2** 🔲 Dependency graph for smart rendering
- **M3** 🔲 GitHub Action + preview deployment integration
- **M4** 🔲 AI analysis against real PRs
- **M5** 🔲 Documentation site + launch

## Validating AI Accuracy

Frontguard's value depends on AI vision models correctly classifying visual changes. The validation framework tests this empirically with 10 synthetic test cases and a scaffold for real-world PR validation.

**Synthetic validation** (`scripts/validate-ai.ts`) — generates 10 programmatic before/after screenshot pairs using `pngjs` with known ground truth:

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Identical images (red square) | pass — no regression |
| 2 | Color change (blue→red button) | regression / critical |
| 3 | Content change (price $49→$59) | content_update |
| 4 | Layout break (50px shift + overflow) | regression / critical |
| 5 | Missing element (nav bar removed) | regression / critical |
| 6 | Added element (new banner + badge) | intentional |
| 7 | Spacing change (subtle 5px shift) | intentional / info |
| 8 | Full theme change (light→dark) | intentional |
| 9 | Overflow (wider element on mobile) | regression / warning |
| 10 | Image swap (green→purple region) | content_update |

For each pair the script generates a pixel diff via `pixelmatch`, calls `analyzeWithAI()`, compares the classification and severity against expected values, and prints a results table. Missing API keys are handled gracefully with a clear error message.

```bash
# Set your AI provider key
export FRONTGUARD_OPENAI_KEY=sk-...
# Or: export FRONTGUARD_ANTHROPIC_KEY=sk-ant-...

# Run the 10-case synthetic validation suite
npx tsx scripts/validate-ai.ts

# Optional: configure provider and model
VALIDATION_PROVIDER=anthropic VALIDATION_MODEL=claude-sonnet-4-20250514 npx tsx scripts/validate-ai.ts
```

**Real-world validation** (`scripts/validate-ai-real.ts`) — scaffold for validating against actual GitHub PRs:

```bash
# Single PR
npx tsx scripts/validate-ai-real.ts --repo shadcn-ui/ui --pr 1234

# With ground truth expectations
npx tsx scripts/validate-ai-real.ts --repo shadcn-ui/ui --pr 1234 \
  --ground-truth ground-truth/shadcn-1234.json

# Batch mode
npx tsx scripts/validate-ai-real.ts --batch ground-truth/cases.json
```

Accepts `--repo` and `--pr` flags, clones the repo, checks out base/head refs, and scaffolds the before/after rendering pipeline. Key stages (framework detection, dev server startup, Playwright capture) are marked as TODOs for Phase 2 implementation.

Results are saved to `validation-results/` as JSON for tracking accuracy over time.

## Environment Variables

```bash
# AI Analysis (BYOK — pick one)
FRONTGUARD_OPENAI_KEY=sk-...
FRONTGUARD_ANTHROPIC_KEY=...

# GitHub PR comments
GITHUB_TOKEN=ghp_...
```

## License

MIT

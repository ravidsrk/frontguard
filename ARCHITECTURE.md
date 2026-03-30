# Architecture

Frontguard is an AI-powered visual regression testing pipeline for frontend applications. This document covers the system architecture and key design decisions.

## Pipeline

```
URL → Discovery → Render → Diff → AI Analysis → Report
```

```
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐
│  Discovery   │──▶│  Render      │──▶│  Diff        │──▶│  AI         │
│  crawl/fs/   │   │  Playwright  │   │  pixelmatch  │   │  GPT-4V /   │
│  config      │   │  × viewports │   │  + SSIM      │   │  Claude     │
│              │   │  × browsers  │   │  (gate: 90%  │   │  classify + │
│              │   │              │   │   pass here)  │   │  explain    │
└─────────────┘   └──────────────┘   └──────┬───────┘   └──────┬──────┘
                                            │                   │
                                            ▼                   ▼
                                     ┌──────────────────────────────────┐
                                     │  Report                          │
                                     │  Console / JSON / HTML / GitHub  │
                                     └──────────────────────────────────┘
```

Each stage is independent with error boundaries — one page failing doesn't kill the run.

## Directory Structure

```
src/
├── cli/                    # CLI entry point (Commander.js)
│   └── index.ts            #   run, init, update-baselines commands
├── core/                   # Pipeline orchestration
│   ├── pipeline.ts         #   Main pipeline: discover → render → diff → report
│   ├── config.ts           #   Zod-validated config loading
│   ├── plugins.ts          #   Plugin lifecycle manager (9 hooks)
│   └── types.ts            #   Core interfaces
├── discovery/              # Route discovery
│   ├── crawler.ts          #   BFS link crawler from start URL
│   └── filesystem.ts       #   Framework-aware: Next.js, Remix, SvelteKit, Nuxt, Astro
├── graph/                  # Dependency graph (smart rendering)
│   ├── parser.ts           #   TypeScript AST + CSS import parsing
│   ├── resolver.ts         #   Module resolution
│   └── filter.ts           #   Git diff → affected pages filter
├── render/                 # Screenshot capture
│   └── playwright.ts       #   Multi-browser, multi-viewport rendering
├── diff/                   # Comparison engines
│   ├── pixel.ts            #   pixelmatch pixel-level diff
│   ├── ssim.ts             #   Structural similarity (perceptual)
│   └── ai-vision.ts        #   OpenAI/Anthropic vision model analysis
├── storage/                # Baseline management
│   └── git-orphan.ts       #   Git orphan branch read/write
├── report/                 # Output formatters
│   ├── console.ts          #   Terminal output with progress
│   ├── json.ts             #   Machine-readable JSON
│   ├── html.ts             #   Interactive HTML report
│   └── github-pr.ts        #   PR comment with diffs
├── plugins/                # Built-in plugins
│   ├── index.ts            #   Plugin exports
│   ├── figma.ts            #   Figma design compliance
│   ├── perf-budgets.ts     #   LCP/CLS/FID budget tracking
│   └── monitor.ts          #   Production visual monitoring
├── types/
│   └── pixelmatch.d.ts     #   Type declarations
└── utils/
    ├── redact.ts           #   API key / secret redaction (global)
    ├── logger.ts           #   Structured logging
    ├── preview-url.ts      #   Vercel/Netlify URL auto-detection
    └── retry.ts            #   Retry with exponential backoff
```

## Module Breakdown

| Module | Responsibility | Key Interfaces |
|--------|---------------|----------------|
| **core** | Pipeline orchestration, config validation, plugin lifecycle | `Pipeline`, `Config`, `PluginManager` |
| **discovery** | Find routes: BFS crawler or filesystem scanner (5 frameworks) | `RouteDiscoverer` |
| **graph** | Parse imports/CSS → page dependency map → filter to affected pages | `DependencyGraph`, `PageFilter` |
| **render** | Playwright screenshot capture: pages × viewports × browsers | `Renderer` |
| **diff** | Pixel comparison (pixelmatch), SSIM, AI vision analysis | `Differ`, `VisionAnalyzer` |
| **storage** | Git orphan branch baseline read/write | `BaselineStorage` |
| **report** | Format and output results (console, JSON, HTML, GitHub PR) | `Reporter` |
| **plugins** | Extensibility: Figma compliance, perf budgets, monitoring | `FrontguardPlugin` (9 hooks) |

## Key Design Decisions

**Orphan Branch Storage**
Baselines live in a `frontguard-baselines` orphan branch, not in main. This avoids bloating the repo with binary WebP files, eliminates merge conflicts on binary files, and keeps baseline history in dedicated commits. The CLI reads/writes this branch transparently.

**Gate-then-AI Architecture**
Pixel diff (pixelmatch) runs first as a fast, free gate. ~90% of pages pass unchanged — only pages that fail the gate go to AI vision analysis. This keeps AI costs at ~$0.50-2.00/PR instead of 10x that.

**Playwright-Native**
Playwright is the rendering engine (not Puppeteer, not Selenium). It provides multi-browser support (Chromium, Firefox, WebKit) from a single API, built-in screenshot comparison, DOM snapshots, and HAR replay — all needed for deterministic rendering.

**Plugin System (9 Hooks)**
Lifecycle hooks: `onInit`, `onDiscover`, `onFilter`, `onRender`, `onDiff`, `onAnalyze`, `onReport`, `onError`, `onCleanup`. Plugins can modify routes, inject page scripts, transform screenshots, customize reports. Three built-in plugins ship: Figma compliance, performance budgets, production monitoring.

**Error Boundaries Per Stage**
Each pipeline stage catches errors independently. A single page failing to render doesn't abort the entire run — it's reported as a failure while other pages proceed normally.

**BYOK AI**
Users provide their own OpenAI/Anthropic API keys. No managed AI service dependency. Keys are redacted from all output (logs, reports, PR comments) via `utils/redact.ts`.

**Framework Detection**
`frontguard init` auto-detects the project framework (Next.js, Remix, SvelteKit, Nuxt, Astro) and generates appropriate config defaults. Route discovery uses framework-specific filesystem scanners when available, falling back to BFS crawling.

## Data Flow Detail

```
1. Config loaded + validated (Zod schema)
2. Plugins initialized (onInit)
3. Routes discovered:
   - Filesystem scan (framework-specific) OR
   - BFS crawler from startUrl OR
   - Manual route list from config
4. Routes filtered by dependency graph:
   - Parse git diff → changed files
   - Trace imports/CSS → affected pages
   - Only render affected pages (60-80% reduction)
5. Pages rendered via Playwright:
   - Per route × viewport × browser
   - Captures: screenshot (WebP), DOM snapshot, console logs
   - Memory-managed: streaming buffers, bounded concurrency
6. Screenshots compared against baselines:
   - Layer 1: pixelmatch (fast, free) — 90% pass here
   - Layer 2: SSIM perceptual diff (reduces noise)
   - Layer 3: AI vision (expensive, only for failures)
7. Results reported:
   - Console summary + HTML report + JSON
   - GitHub PR comment with visual diffs
   - AI explanation + severity + confidence
8. Cleanup: temp files removed, buffers disposed
```

## Security

- **Secret redaction**: Global filter masks API keys in all output paths
- **Shell injection prevention**: No user input passed to shell commands
- **Path traversal guards**: Route paths validated before filesystem access
- **Minimal token scopes**: GitHub integration uses `contents:read` + `pull-requests:write` only

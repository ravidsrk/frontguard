# Frontguard — Adversarial Product Review

*Audit date: 2026-06-14. Branch: `ravidsrk/t1-adversarial-review`. Repo head: `561d86f` on `main`.*

> **Positioning under review:** "AI-powered frontend visual regression testing for web teams — detect, understand, and fix visual bugs before they ship to production."
>
> **Verdict (one line):** The CLI engine is real and impressive; the *product around it* — landing, docs, cloud, integrations, validation, demo — is a developer-built scaffold full of broken links, wrong package names, hallucinated marketing stats, an "in-production" API that returns `Math.random()` diffs, and integrations that target hosts that don't resolve. A paying customer hitting the install path today would not get through the first `npm install` line in the README.

---

## 1. Critical-Path Walkthrough

A first-time user starts at `frontguard.dev`, opens the README on GitHub, or lands on the docs. Here is what they actually hit, step by step, with severity tags inline. P0 = blocks calling this a product; P1 = a paying customer would call it out; P2 = polish.

### Step 1 — Landing page (`apps/landing`)
**Status: builds and runs (Vite, 148ms build), polished visual design — but the copy is loaded with fabricated marketing.**

- Hero CTA "Install in 30 Seconds" anchors to `#getting-started`. That section's CLI tab shows:
  ```bash
  npm install -g frontguard
  frontguard init
  ```
  (`apps/landing/src/components/GettingStarted.tsx:6-8`).
  **There is no published `frontguard` npm package.** The actual CLI is `@frontguard/cli` (`packages/cli/package.json:2`). Following the landing-page instruction will install a different (third-party or non-existent) package. **P0**.
- The SEO fallback (server-rendered HTML inside `index.html` for crawlers) tells users the same thing twice more — `npm install -g frontguard` (`apps/landing/index.html:395,490-491`) — and links every "npm" footer link to `https://www.npmjs.com/package/frontguard` (`:452,486`), which 404s for the real product. **P0**.
- `<meta name="last-modified" content="2026-05-26">`, `og:image:width 1200` referencing `og-image.png` that *does* exist, but the SEO fallback footer reads `© 2025 Frontguard` (`index.html:463`) while the React footer says `{new Date().getFullYear()}` (`apps/landing/src/components/Footer.tsx:73`). Two copyright years in the same page. **P2**.
- The SEO fallback hallucinates marketing data that does not exist anywhere in this repo or in the public record:
  - "200 visual regressions, AI correctly identified the root-cause CSS property 87% of the time on the first analysis" (`index.html:285`).
  - "Frontguard averages over 2,000 weekly downloads" (`:342`).
  - "Cart abandonment rates increase by 7% when checkout pages display layout issues … one million dollars in monthly revenue … seventy thousand dollars or more" (`:298`).
  - "59% of frontend teams reported shipping visual bugs — 2024 State of Frontend Development survey by The Software House" (`:247`).
  - "85% of online shoppers will not return — 2023 Stripe developer survey" (`:298`).
  - "Testim's 2024 testing automation report" — does not exist (`:298`).
  These are AI-style invented stats that read as fluent but are unverifiable. The `<script type="application/ld+json">` block also publishes a fabricated `aggregateRating: { ratingValue: 4.8, ratingCount: 36 }` (`index.html:69-75`) — i.e. lies to Google's rich-results crawler about reviews that never happened. **P0**.
- The author bio on the same page (`index.html:417`): "Ravindra Kumar is a developer tools engineer with over 12 years of experience … creator of [Android Mining], contributed to [NiceHash], and authored multiple testing and automation libraries." Then "Follow Ravindra on … [X (Twitter)](https://x.com/anthropicdev)". The X link points to **`@anthropicdev`**, not the actual owner. Whole paragraph reads as AI-generated placeholder bio that someone forgot to replace. **P1**.
- Nav has `Docs → https://docs.frontguard.dev` (`apps/landing/src/components/Nav.tsx:6`). `docs.frontguard.dev` is not deployed anywhere we can verify — the docs Next.js app builds cleanly locally but no public host is set up (see step 3).
- The "See it in action" `DemoSection` (`apps/landing/src/components/DemoSection.tsx`) advertises itself in a comment as "Renders the demo GIF when available … falling back to a static terminal mock" (lines 3-9). **The fallback is the only thing the component can render** — there is no code path that ever loads `demo/frontguard-demo.gif`. The GIF has never been generated (the VHS tape script lives at `demo/frontguard-demo.tape:1-54`, the actual `.gif` does not exist anywhere in the repo). **P1**.
- `apps/landing/public/sitemap.xml:5` advertises `<lastmod>2026-04-01</lastmod>` (frozen, never updated by build) and lists exactly one URL — the home page. The landing is a single-page Vite app, so there's nothing else to list, but it also means search engines have no way to discover the docs (which are on a different host that doesn't resolve). **P2**.

### Step 2 — README on GitHub
**Status: real but cross-quotes inconsistent counts; tests/coverage badge is fake; demo is a placeholder caption.**

- `README.md:7` shows `[![Tests](https://img.shields.io/badge/tests-1000+-brightgreen)]()`. The badge href is empty (`()`), so clicking it goes to the current page. The number is also inconsistent: `CHANGELOG.md:135` says "395 tests"; `apps/docs/content/docs/index.mdx:72` says "395 tests"; root README claims "1000+". **P1**.
- README:15-19 has an embedded `<p align="center"><em>📽️ Demo: …</em></p>` describing a GIF that does not exist. Users on GitHub see a captioned non-image. **P1**.
- "5 built-in plugins" is correctly enumerated (`README.md:188-194`) but the docs site contradicts this — see Step 3. **P2**.
- README:71 advertises "Memory managed — Streaming buffers, temp file cleanup, bounded concurrency" — this is real (`packages/cli/src/...`), but the very next page (`Quick Start`) starts with `npm install @frontguard/cli`, which is at least the correct package name *here*. So the landing/docs and README disagree about how to install. **P0** (already counted).

### Step 3 — Docs site (`apps/docs`)
**Status: Fumadocs Next.js app, 28 pages, builds cleanly. Every install instruction is wrong.**

- `apps/docs/content/docs/installation.mdx:13-41` documents the CLI as:
  ```
  | `frontguard`              | CLI for standalone visual regression testing |
  | `@frontguard/playwright`  | Plugin for visual assertions inside Playwright tests |
  ```
  Then says `npm install -D frontguard` for npm/pnpm/yarn/bun. The actual published name is `@frontguard/cli`. So every docs reader who copy-pastes installs the wrong package. **P0**.
- Same file at line 124-134: `npx frontguard --version` "You should see: `frontguard v0.1.0`". Actual `VERSION` is `0.2.0` (`VERSION:1`). Docs are a release behind. **P2**.
- `apps/docs/content/docs/index.mdx:71-73` claims:
  > Frontguard ships with **395 tests**, **27 source files**, a **142KB bundle**, and **3 built-in plugins**.
  - "395 tests" matches CHANGELOG v0.1, but README says 1000+ (Step 2).
  - "27 source files" is wildly out of date (`packages/cli/src/` alone has 50+ `.ts` files now — see `find packages/cli/src -name '*.ts'`).
  - "3 built-in plugins" contradicts README (5) and ROADMAP (5).
  - "142KB bundle" — the real bundle is `dist/index.js 147.38 KB + dist/plugins/index.js 36.92 KB + dist/cli/index.js 247.53 KB` (~432KB). The number was a snapshot from one entry point at one moment, frozen as a Callout, never updated. **P1**.
- `apps/docs/content/docs/cli/configuration.mdx`, `quick-start.mdx`, `playwright/setup.mdx` — every code sample still uses placeholder version `v0.1.0` in terminal output blocks. **P2**.
- `apps/docs/content/docs/guides/accessibility.mdx:25`:
  ```typescript
  import { createAccessibilityPlugin } from 'frontguard/plugins';
  ```
  The actual import path is `@frontguard/cli/plugins` (`packages/cli/package.json:exports`). The bare name `frontguard` doesn't exist. Every plugin guide (`accessibility`, `production-monitoring`, `custom-plugins`, `ai-fixes`, `performance-budgets`, `third-party-scripts`) imports from the wrong specifier. **P0**.
- `apps/docs/content/docs/guides/custom-plugins.mdx:14-19` is even worse — it both names the wrong package (`frontguard/plugins`) **and** the wrong export (`figmaPlugin` lowercased). The real export is `createFigmaPlugin` (`packages/cli/src/plugins/figma.ts:206`). The example in the docs will throw `TypeError: figmaPlugin is not a function`. **P0**.
- `apps/docs/content/docs/cli/commands.mdx:36` lists `--update-baselines` as a flag of `frontguard run`, which is correct — but the same docs also document `frontguard update-baselines` as a separate command, and the actual CLI implements *both*. Harmless but documentation duplication. **P2**.
- The migration guides (`migrate-from-backstopjs.mdx`, `migrate-from-lost-pixel.mdx`) and competitor pages (`frontguard-vs-percy.mdx`, `frontguard-vs-chromatic.mdx`) are written confidently in tone, but the same wrong import path / wrong package name issues cascade through every code sample.
- `apps/docs/content/docs/ci-cd/github-actions.mdx:31,82,123,134,157`:
  ```yaml
  uses: ravidsrk/frontguard@main
  ```
  This references a composite action that exists in `packages/cli/action.yml`, but the action itself runs `npm install -g frontguard@latest` (`packages/cli/action.yml` — confirmed by `grep`) — same wrong package name. The published action won't work. **P0**.
- `apps/docs/content/docs/ci-cd/github-actions.mdx:104`: "Install Frontguard — `npm install -g frontguard@latest`" makes the wrong-package mistake one more time. **P0**.

### Step 4 — `npm install @frontguard/cli`
**Status: builds fine locally; tsup 28ms; CLI prints version 0.2.0.**

After 30s of building locally, `node packages/cli/dist/cli/index.js --version` correctly returns `0.2.0`. So the engine itself works. The product fails earlier — at finding the right package.

### Step 5 — `frontguard doctor` (the table-stakes "is everything set up?" check)
**Status: works, but contains a wrong-env-var bug that silently breaks the AI critical path.**

Run against a clean `/tmp/fg-trial` with `git init`:
```
✅ Node.js version: v22.15.0 (>= 18 required)
✅ Playwright installed: playwright package is resolvable
❌ Browser binaries: no Playwright browser binaries found
   → Install browsers: npx playwright install
🟡 Configuration: no config file found
🟡 AI provider keys: no AI keys found (AI classification disabled)
   → Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable AI analysis.
✅ Git repository: inside a git work tree
🟡 Baseline branch: 'frontguard-baselines' not found
```

Now set `FRONTGUARD_OPENAI_KEY=test` (the env var the docs and ai-vision code actually read — `apps/docs/content/docs/installation.mdx:111-118`, `packages/cli/src/diff/ai-vision.ts:213`) and re-run:

```
🟡 AI provider keys: no AI keys found (AI classification disabled)
   → Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable AI analysis.
```

Doctor still says "no AI keys found." Why? Because `packages/cli/src/cli/doctor.ts:209-210` checks `env.OPENAI_API_KEY` and `env.ANTHROPIC_API_KEY` — the *other* convention. The codebase has at least **three** disagreeing conventions:

| Where | Env var read |
|---|---|
| `packages/cli/src/diff/ai-vision.ts:213` (the real AI module) | `FRONTGUARD_OPENAI_KEY` / `FRONTGUARD_ANTHROPIC_KEY` |
| `packages/cli/src/cli/doctor.ts:209-210` | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` |
| `packages/playwright/src/ai.ts:42` (playwright plugin) | Accepts EITHER |
| `apps/docs/content/docs/installation.mdx:111-118` (README + most docs) | `FRONTGUARD_OPENAI_KEY` |
| `apps/docs/content/docs/ci-cd/github-actions.mdx:87-89` (GitHub Actions guide) | `OPENAI_API_KEY` |
| `packages/cli/src/templates/github-actions.ts:89-90` (generated CI workflow) | `OPENAI_API_KEY` |

**A user who follows the docs and sets `FRONTGUARD_OPENAI_KEY` will be told by doctor "AI is disabled" — but the AI module *does* read it, so AI is actually live.**
**A user who follows the GitHub Actions template and sets `OPENAI_API_KEY` will see doctor say "AI is enabled" — but `ai-vision.ts` does NOT read that env var, so AI silently never runs.**
Both of these break the "Detect → Understand → Fix" promise that is the entire product positioning. **P0**.

### Step 6 — `frontguard init`
**Status: works mechanically, generates a config that imports a non-existent package.**

```
$ frontguard init
✅ Created frontguard.config.ts
$ cat frontguard.config.ts
import type { FrontguardConfig } from 'frontguard';
…
```

The CLI hardcodes the wrong import specifier at `packages/cli/src/core/config.ts:524`:
```ts
? "import type { FrontguardConfig } from 'frontguard';\n\n"
```

The user's first TypeScript build fails: `Cannot find module 'frontguard'`. They have to know to manually change it to `@frontguard/cli`. **P0**.

### Step 7 — `frontguard run --url http://localhost:9999` (no server running)
**Status: surfaces three stacked errors instead of bailing on the first.**

```
✘ Discovery failed: Cannot reach base URL "http://localhost:9999/": ECONNREFUSED
  …falling back to /
Smart filter: no changes detected (70ms)
✔ 📊 Filtering — 1/1 route(s) to render — no changes detected
- 🖥  Rendering — Capturing 3 screenshot(s)…
  ✘ Task failed [chromium 375px /]: ECONNREFUSED
  ✘ Task failed [chromium 768px /]: ECONNREFUSED
  ✘ Task failed [chromium 1440px /]: ECONNREFUSED
```

The pipeline already knows the base URL is unreachable (discovery told it), but it falls back to `/` and tries to render anyway, producing four ECONNREFUSED errors per run instead of one. A first-time user reads four scary stack traces and assumes the tool itself is broken. **P1**.

### Step 8 — AI analysis end-to-end
**Status: code is real and reasonably tested; the broken env-var contract above means the most likely user never reaches it.**

`packages/cli/src/diff/ai-vision.ts` and the dual-model + a11y-fused prompt are implemented. The launch gate that should verify this end-to-end on real diffs has never been run.

### Step 9 — Fix-pattern database + AI fix verification
**Status: code is real; Daytona sandbox depends on an unpublished snapshot and an unpublished CLI package.**

- `packages/cli/src/sandbox/local.ts` works — Playwright + inject-CSS + screenshot.
- `packages/cli/src/sandbox/daytona.ts:18` declares `const FRONTGUARD_SNAPSHOT = 'frontguard-playwright-v1';` and `:81` calls `daytona.create({ snapshot: FRONTGUARD_SNAPSHOT })`. Nothing in the repo has ever created that snapshot on any Daytona org — it's a literal string with no provisioning behind it. **P1**.
- `packages/cli/src/sandbox/daytona.ts:119` shells out to `frontguard-render --url … --viewport … --browser … --inject-css-file …`. No binary named `frontguard-render` exists anywhere in the repo (`grep -rn 'frontguard-render' .` returns only the call site and the snapshot script). The Daytona path is dead. **P1**.
- `packages/cloud-api/src/snapshot.ts:24-25` is the script that would build the snapshot; it runs `npm install -g frontguard@latest` — the wrong package name yet again. Even if a user runs the snapshot-builder script, the resulting image will have an unrelated `frontguard` package and no `frontguard-render` binary. **P0**.

### Step 10 — CI integration (`frontguard init --ci`)
**Status: workflow templated correctly; generated env block uses the wrong env var convention.**

`packages/cli/src/templates/github-actions.ts:89-90` emits:
```yaml
# OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
# ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```
A user uncommenting these gets the "doctor says ✅ but ai-vision silently never fires" bug from Step 5. **P0**.

### Step 11 — Cloud API (`packages/cloud-api`)
**Status: two divergent implementations; the one that ships is a `Math.random()` stub. The "source of truth" Hono code uses Node-only APIs that no-op on Workers.**

`packages/cloud-api/README.md:5-8` documents two implementations and admits they are not unified:

> `app/src/index.js` — Production deployment. Pure fetch handler, zero dependencies.
> `src/` — Hono-based version for local development and testing. NOT deployed.

The "production" version simulates diff results with `Math.random()`:

```js
// packages/cloud-api/app/src/index.js:36-48
function processRun(run) {
  …
  const diffPercent = hasBaseline ? +(Math.random() * 5).toFixed(2) : 0;
  …
  const status = !hasBaseline ? 'new_baseline'
               : diffPercent > threshold ? 'failed' : 'passed';
```

Auth in the same file (`:347-353`) accepts any Bearer token ≥ 10 chars — no lookup, no hashing, no rate limit:

```js
if (!auth || !auth.startsWith('Bearer ') || auth.length < 10) {
  return json({ error: 'Missing or invalid API key…' }, 401);
}
return null; // auth passed
```

The "source of truth" Hono service at `packages/cloud-api/src/index.ts` would actually be a credible product if deployed — D1, R2, hashed keys, OAuth, billing — but `packages/cloud-api/src/processor.ts:26` gates the real work on `process.env.DAYTONA_API_KEY`, and Cloudflare Workers doesn't expose `process.env`. In the target runtime that branch never fires; every run falls through to the simulated path at `processor.ts:63-80` and emits `status: 'new_baseline', diffPercentage: 0` for every route × viewport. **P0**.

Plus `api.frontguard.dev` (the URL the integrations and Daytona runner all talk to) does not resolve to a working host. Every "integration" pretends to call it and would 502. **P0** (this gates the entire cloud story).

### Step 12 — Slack app (`integrations/slack-app`)
**Status: real OAuth/signature verification, but every meaningful flow is a no-op.**

- `integrations/slack-app/src/handler.ts:103-106` explicitly admits the OAuth callback doesn't persist tokens: *"A real deployment persists `install` (token per team) to a store here."* No store, no follow-on Slack postings work. **P0**.
- `integrations/slack-app/src/events.ts:75-80` — the `/frontguard status <url>` command's entire implementation is:
  ```ts
  return { response_type: 'ephemeral',
    text: `🔍 Queued a visual check for \`${arg}\`. I'll post the result here when it's done.` };
  ```
  No run is queued. `FRONTGUARD_API_URL`/`FRONTGUARD_API_KEY` are defined on the env type and never used. **P0**.
- `integrations/slack-app/manifest.yml:23,30,38` ships `https://example.com/slack/…` placeholder URLs and no deployment artifact (no `wrangler.toml`, no `fly.toml`, no `vercel.json`, no README). **P1**.

### Step 13 — GitHub App (`integrations/github-app`)
**Status: signature verification real; the bootstrap PR ships a config that imports a package that doesn't exist; the URL it screenshots is github.com.**

- `integrations/github-app/src/github-api.ts:336` opens a bootstrap PR with this config:
  ```ts
  export const DEFAULT_CONFIG_TS = `import { defineConfig } from '@frontguard/core';
  ```
  There is no `@frontguard/core` package in the repo. The PR introduces an unbuildable file into the customer's repo on first install. **P0**.
- `integrations/github-app/src/handler.ts:181` forwards `payload.pull_request.html_url` to the cloud API as the URL to screenshot. That's `https://github.com/owner/repo/pull/123` — the PR page on github.com, not the preview deployment. The cloud-api will dutifully visual-test github.com pages. **P0**.
- `integrations/github-app/manifest.yml:7-8` points the webhook at `https://github-app.frontguard.dev/webhook`, which is not deployed.

### Step 14 — Vercel integration (`integrations/vercel`)
**Status: real OAuth + webhook; preview-URL allowlist is `*.vercel.app` only, so custom domains (the common case) silently 400.**

`integrations/vercel/src/webhook.ts:98-108` only accepts hostnames ending in `.vercel.app`. Vercel customers routinely attach custom preview domains (e.g. `preview-pr-42.acme.com`); these are rejected with HTTP 400 "Preview URL not allowed." Most real installs would silently fail. **P1**.

### Step 15 — Netlify plugin (`integrations/netlify`)
**Status: published-package mismatch + plugin can't detect failure.**

- `integrations/netlify/README.md:19-21` documents `npm install -D @frontguard/netlify-plugin`. `package.json:4` is `private: true`. The package has never been published. Following the README fails immediately. **P0**.
- `integrations/netlify/lib/core.js:228` (`isFailingRun`) inspects `run.results.changed`, a field the cloud API never returns. So the plugin never marks a Netlify build as failing — even regression-positive runs ship green. **P0**.

### Step 16 — Real-world validation
**Status: the harness exists; it has never been run.**

`validation/results-v0.2.md:Launch Gate` says:

| Metric | Threshold | Status |
|--|--|--|
| Overall accuracy | ≥ 70% | ⏳ Pending live run |
| False-positive rate | < 15% | ⏳ Pending live run |

`validation/results/` contains only `.gitkeep`. The "AI accuracy" that the landing page hardcodes at 87% and 94% has never been measured against a single real PR.

### Step 17 — Demo asset
**Status: tape script exists; GIF does not.**

`demo/frontguard-demo.tape` is well-written. `demo/frontguard-demo.gif` and `demo/frontguard-report.mp4` (both referenced by the README and the demo README) are not present anywhere in the repo. The DemoSection on the landing page is therefore a hardcoded mockup pretending to be a recording. **P1**.

---

## 2. Inventory vs Claims — gap table

| # | Claim | Where claimed | Reality | Evidence | Severity |
|--|--|--|--|--|--|
| C-1 | Install with `npm install -g frontguard` | `apps/landing/src/components/GettingStarted.tsx:6`, `apps/landing/index.html:395,490`, `apps/docs/content/docs/installation.mdx:23-39` | Published package is `@frontguard/cli`; bare `frontguard` is not this project | `packages/cli/package.json:2` | P0 |
| C-2 | Generated config uses `import type { FrontguardConfig } from 'frontguard'` | `frontguard init` runs in clean dir | Module specifier doesn't exist; user's first build errors | `packages/cli/src/core/config.ts:524` | P0 |
| C-3 | Plugins import from `frontguard/plugins` | `apps/docs/content/docs/guides/*` (all six guides) | Real specifier is `@frontguard/cli/plugins`; wrong specifier throws at runtime | `packages/cli/src/plugins/index.ts:12` | P0 |
| C-4 | "Doctor checks if AI is configured" | `README.md:243-247`, `docs/cli/commands.mdx:112-124` | Doctor checks the wrong env vars (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`), while the AI module reads `FRONTGUARD_OPENAI_KEY`/`FRONTGUARD_ANTHROPIC_KEY` | `packages/cli/src/cli/doctor.ts:209-210` vs `packages/cli/src/diff/ai-vision.ts:213` | P0 |
| C-5 | "1000+ tests" badge | `README.md:7` | CHANGELOG: 395 tests; docs index: 395 tests; one-of-three numbers is correct | `CHANGELOG.md:135`, `apps/docs/content/docs/index.mdx:72` | P1 |
| C-6 | 142KB bundle | `apps/docs/content/docs/index.mdx:72` | Real bundle ≥ 432KB across three entrypoints | `packages/cli/dist/*` after `npm run build` | P1 |
| C-7 | "3 built-in plugins" | `apps/docs/content/docs/guides/custom-plugins.mdx:14`, `apps/docs/content/docs/index.mdx:72` | README says 5 (and ROADMAP says 5); the code has 5 — accessibility + third-party-scripts were added but docs not updated | `packages/cli/src/plugins/index.ts:42-62`, `README.md:188-194` | P1 |
| C-8 | Demo GIF in README and DemoSection | `README.md:15-19`, `apps/landing/src/components/DemoSection.tsx:3-9`, `demo/README.md` | Tape script exists; GIF has never been rendered; component falls back to mock-only | `demo/`, `apps/landing/public/` | P1 |
| C-9 | "AI correctly identified the root-cause CSS property 87% of the time" | `apps/landing/index.html:285` | No validation run has been performed; `validation/results-v0.2.md` says "Pending live run" | `validation/results/` (empty), `validation/results-v0.2.md` | P0 (false claim) |
| C-10 | "2,000 weekly downloads" | `apps/landing/index.html:342` | Package name in the marketing copy doesn't exist; nothing to count | `apps/landing/index.html:395`, `packages/cli/package.json:2` | P0 |
| C-11 | `aggregateRating: 4.8 / 36 reviews` in SoftwareApplication structured data | `apps/landing/index.html:69-75` | Fabricated — no reviews source exists | `apps/landing/index.html` | P0 |
| C-12 | "Author: creator of Android Mining, contributed to NiceHash; X: @anthropicdev" | `apps/landing/index.html:417-418` | AI-generated placeholder bio with an X handle that's not the author | `apps/landing/index.html` | P1 |
| C-13 | "Vercel Integration Marketplace listing" coming | `docs/ROADMAP.md:123` | Vercel integration accepts only `*.vercel.app` preview URLs, so it doesn't work for the common custom-domain case | `integrations/vercel/src/webhook.ts:98-108` | P1 |
| C-14 | Slack: "OAuth install, `chat.postMessage`" | `docs/ROADMAP.md:107`, `CHANGELOG.md:17-20` | OAuth callback explicitly skips token persistence; chat.postMessage works only for incoming-webhook-based monitors, not the installed app | `integrations/slack-app/src/handler.ts:103-106`, `integrations/slack-app/src/events.ts:75-80` | P0 |
| C-15 | GitHub App "PR → check run" loop | `docs/ROADMAP.md:160` | Forwards github.com PR page as the URL to screenshot; bootstrap PR imports `@frontguard/core` which doesn't exist | `integrations/github-app/src/handler.ts:181`, `integrations/github-app/src/github-api.ts:336` | P0 |
| C-16 | Netlify Build Plugin | `docs/ROADMAP.md:159`, `CHANGELOG.md:72` | Plugin is `private:true` so README install steps 404; never detects a failing run | `integrations/netlify/package.json:4`, `integrations/netlify/lib/core.js:228` | P0 |
| C-17 | Cloud platform with D1/R2/Stripe/OAuth/hashed keys | `docs/ROADMAP.md:85-95` | The "source of truth" Hono code is correct in design but uses Node-only APIs (`process.env`, `process.on`) that no-op on Workers; the actually-deployed version returns `Math.random()` for diffs | `packages/cloud-api/src/processor.ts:26`, `packages/cloud-api/app/src/index.js:36-48` | P0 |
| C-18 | Stripe webhook accepts unsigned events when config absent | (implicit) | Unauthenticated POST to `/v1/billing/webhook` upgrades any team to `business` | `packages/cloud-api/src/routes/billing.ts:69-75` | P0 |
| C-19 | OTel export "no-op when unset" | `CHANGELOG.md:11-17`, `docs/ROADMAP.md:105` | The `/health` endpoint reports `version: 0.1.0` while everything else is `0.2.0` — service identity is wrong on the OTel side too | `packages/cloud-api/src/index.ts:123`, `packages/cli/package.json`, VERSION | P2 |
| C-20 | "Real-world validation on 5 OSS repos" — *harness built, just needs runs* | `docs/ROADMAP.md:119` | Harness exists; never run; the "87%/94%" the marketing site claims comes from nowhere | `validation/results/.gitkeep` only | P0 |
| C-21 | "Daytona sandbox fix verification — shipped" | `docs/ROADMAP.md:103` | Snapshot `frontguard-playwright-v1` has never been built; the `frontguard-render` binary it shells to doesn't exist; snapshot-builder script installs the wrong npm package | `packages/cli/src/sandbox/daytona.ts:18,119`, `packages/cloud-api/src/snapshot.ts:24-25` | P1 (engineering complete) / P0 (claim of "shipped" is overstated) |
| C-22 | "Frontguard ships with a plugin architecture (6 lifecycle hooks)" | `README.md:186` | Real, accurate — but docs guide says 3 plugins (Inventory item C-7) | — | — |
| C-23 | "Migrate from BackstopJS" / "Migrate from Lost Pixel" guides | `README.md:87`, `docs/ROADMAP.md:67` | Real and well-written — but every code sample uses the wrong import / package name (C-3) | `apps/docs/content/docs/guides/migrate-from-*` | P1 |
| C-24 | "Native Slack app shipped" | `docs/ROADMAP.md:107`, `CHANGELOG.md:17-20` | Slack OAuth doesn't persist tokens; slash command is an echo. "Functional handler + tests" is generous | C-14 evidence | P0 |
| C-25 | `Comparison.tsx`: "Frontguard ✔ Anti-flake consensus" | `apps/landing/src/components/Comparison.tsx:15` | This is *true* — anti-flake is real (`packages/cli/src/render/playwright.ts`). One of the few claims that holds. | — | — |
| C-26 | "Free forever (CLI)" | `apps/landing/index.html:67-68`, `README.md` | This is also true | — | — |

---

## 3. Stub & dead-end census

`grep -rn "TODO\|FIXME\|XXX\|stub\|coming soon\|placeholder\|lorem ipsum"` over the source tree returns surprisingly few literal stubs — the repo is past the rough-draft stage. The dead ends instead hide in *behavior*: things that exist as code but cannot fire in production.

Concrete hits:

| File:line | Kind | Severity |
|--|--|--|
| `packages/cli/src/types/axe-core-playwright.d.ts:3` | Type-only stub for an optional peer dep — fine | — |
| `packages/cli/src/report/html.ts:85,626,777,794` | HTML "placeholder" is a UI element ID for the empty-results branch — fine | — |
| `packages/cloud-api/src/dashboard/render.ts:211-300` | `placeholder=` attrs in input fields — fine | — |
| `packages/cloud-api/src/index.ts:373` | Returns 202 "Run not yet completed" for in-flight runs — fine | — |
| `integrations/vercel/src/webhook.ts:154` | Comment: *"…does not yet model git…"* — flags a known gap in the schema | P2 |
| `integrations/vercel/src/handler.ts:6` | Self-describes `/api/install` as "OAuth-style installation landing (stub)" | P1 |
| `integrations/slack-app/src/handler.ts:67-68` | Comment: *"Events are acknowledged immediately; real processing would be queued"* — there is no queue | P1 |
| `integrations/slack-app/src/handler.ts:103-106` | Comment: *"A real deployment persists `install` (token per team) to a store here"* — there is no store | P0 |
| `packages/cloud-api/README.md:10` | Markdown TODO header: "TODO: Unify" | P0 (admits the split) |

**Behavioural dead ends** (code that exists but cannot reach its declared end state without external steps that have not been taken):

- `packages/cli/src/sandbox/daytona.ts:18,119` → `frontguard-playwright-v1` snapshot + `frontguard-render` binary. Both nonexistent. **P1**.
- `packages/cloud-api/src/snapshot.ts:24` → snapshot-builder installs the wrong package. **P0**.
- `packages/cloud-api/src/processor.ts:26` → real Daytona branch is gated on `process.env.DAYTONA_API_KEY` which is `undefined` on Workers; production runs always fall through to the simulated branch. **P0**.
- `integrations/slack-app/src/events.ts:75-80` → `/frontguard status` says "queued" but enqueues nothing. **P0**.
- `integrations/github-app/src/handler.ts:181` → the URL forwarded for screenshot is the PR's `html_url` (github.com), not the preview deploy. **P0**.
- `integrations/github-app/src/github-api.ts:336` → bootstrap PR imports `@frontguard/core`, a package that doesn't exist. **P0**.
- `integrations/netlify/lib/core.js:228` → `isFailingRun` looks for a `changed` field the API never returns. Build is always green. **P0**.
- `apps/landing/src/components/DemoSection.tsx:3-9` → "renders GIF when available, falls back to mock" — the GIF code path doesn't exist. **P1**.
- `validation/results/` → empty; marketing site already claims AI accuracy numbers. **P0**.

**Reachable dead-end screens / UIs:**

- The cloud-api `dashboard/render.ts` is the only "team dashboard" — pure SSR HTML emitted by the cloud-api itself. No `apps/dashboard` deployment exists. If/when the cloud-api ships, the dashboard ships; today neither does.
- The `404.html` static page on the landing site is fine (`apps/landing/public/404.html`), but every "Sign in" / "Get started" link in any cloud-touching doc has no destination.

---

## 4. Broken-states audit

I ran each web surface locally and noted what users would see.

### Landing (`apps/landing`)
- `npm run build` succeeds (`vite v8.0.3 building … ✓ built in 148ms`). No errors. Tailwind 4 picks up clean.
- Total assets ~ 280KB gzipped — fine.
- Static SEO fallback in `index.html` is large (37KB), which is a sane trade-off for crawlers, but it doubles the fabricated-stat surface area (see Section 1).
- I did not boot a real browser in this audit, so I cannot confirm console-error cleanliness, but the React tree uses standard Tailwind + plain DOM, with no obvious runtime hazards beyond the `GitHubStars` component depending on `api.github.com` being reachable from the user's network.
- Mobile breakpoints exist on every component (`md:hidden` / `lg:col-span-7`), and the comparison table has a separate card layout below `md`. Visual structure is professional.

### Docs (`apps/docs`)
- `npm run build` succeeds: Next.js 16.2.2 Turbopack, 28 static pages, 0 errors.
- Build artifact statically renders every doc page; 404s are handled by `not-found.tsx`.
- The first-impression problem isn't build-time, it's content: every install snippet is wrong (Section 1, Step 3).

### Demo (`demo/frontguard-demo.tape`)
- Cannot run VHS in this audit shell. Tape file is well-formed; would produce a GIF on a developer's box with `brew install vhs`.
- The GIF and MP4 are unavailable.

### CLI (`packages/cli`)
- `npm run build` clean (28ms ESM, ~2s DTS).
- `--version` returns `0.2.0`.
- `doctor` returns wrong AI-keys verdict (Section 1, Step 5).
- `run` against an unreachable URL produces stacked errors (Section 1, Step 7).
- I did not install Playwright browsers (out of scope), so I did not end-to-end render against a live app.

### Cloud-api
- I did not boot wrangler. Static analysis (Section 1, Step 11) is conclusive.

---

## 5. Polish-bar audit

For each shipping web surface, does the copy and visual language read as a finished product?

### Landing
- **Visual design:** *Good.* Distinct typography (Outfit + Plus Jakarta + JetBrains Mono), considered color tokens (`--color-accent`, `--color-cta`, `--color-text-secondary`), bento grid for Features, asymmetric problem cards. Above the indie-dev average.
- **Copy:** *Fails the bar.* Specifically:
  - The hero ("Your CSS broke the checkout page. Frontguard caught it.") is sharp.
  - The SEO fallback paragraph (`index.html:245`) drops into AI-essay mode: "Frontend teams ship CSS changes every day. New components, design system updates, responsive tweaks, dark mode adjustments. Any of these can silently break layouts on pages you never thought to check. CSS and styling bugs account for roughly 30% of all frontend issues reported by end users." — generic, source-free, AI-flavored.
  - The "200 visual regressions, 87% accuracy" stat is a brand-killing lie if a reviewer probes. So is the `aggregateRating` block, so is "2,000 weekly downloads," so is the made-up Stripe / Testim / Software House citations.
  - The author bio is for a different person.
- **Imagery:** All real, no stock photos. Mostly inline SVG + Tailwind. Hero asset (`/src/assets/hero.png`) imported but not actually rendered by `Hero.tsx`. The "see it in action" terminal is a hardcoded JSX block, not a recording.
- **Internal consistency:** The Comparison table on the landing page (`Comparison.tsx`) accepts that Percy & Chromatic have managed dashboards (honest). The SEO fallback (`index.html:340`) goes adversarial: "Despite being newer, Frontguard's zero-cost model and AI capabilities position it as the fastest-growing open-source alternative." Two different voices.

### Docs
- **Visual design:** Fumadocs default. Clean, professional.
- **Copy:** Less marketing-flavored than landing; mostly technical reference. But every install snippet copy-paste fails, every plugin example throws, the AI env-var doc disagrees with the AI runtime, and the "Frontguard v0.1.0" hardcoded version in the output blocks reads as stale.
- **Coherence with landing:** Different positioning ("AI-powered frontend visual regression testing" vs landing's "Visual regression testing for Playwright"). README/landing/docs each subtly reframe what the product *is*.

### README
- Generally the most honest surface — but mentions a tests badge with a fabricated number and a GIF that doesn't exist.

### Cloud-api dashboard
- SSR HTML form with `placeholder=` attributes. Functional, not designed. Not where a paying customer would land.

---

## 6. Critical-path summary

A paying customer's most damning specific finger-point would be this:

> "I copy-pasted the install line from your landing page (`npm install -g frontguard`), got 404 from npm. I tried the docs (`npm install -D frontguard`), same 404. I found the actual package on GitHub (`@frontguard/cli`), ran `frontguard init`, the generated config has `import type { FrontguardConfig } from 'frontguard'` — which is the package that doesn't exist. I set my `FRONTGUARD_OPENAI_KEY` like the docs said, but `frontguard doctor` told me AI was disabled. I tried the GitHub Action — it ran `npm install -g frontguard@latest` (404 again). I clicked the landing page's structured-data review snippet — there are no reviews. The demo GIF is missing. The 'AI is 87% accurate' line on your landing page has no source; your own `validation/results-v0.2.md` says no live run has been done."

Where signup → core value breaks **today**: at line 1 of every published install instruction. The wrong package name is repeated in **at least 9 places** (landing tab, landing SEO fallback, landing noscript, docs install page, docs CI page × 6, generated `init` config, generated GitHub Actions template, snapshot-builder script, Netlify integration README, action.yml). It is the single highest-leverage fix in the entire codebase.

---

## 7. Severity-ordered fix list

Stable IDs so subsequent tasks can reference them.

### P0 — blocks calling this a product

| ID | Fix |
|--|--|
| **P0-1** | Settle on a single npm package name (`@frontguard/cli`) and replace every `frontguard` / `frontguard@latest` / `npm install -g frontguard` mention. At minimum: `apps/landing/src/components/GettingStarted.tsx:6`, `apps/landing/index.html:395,452,486,490-491`, `apps/docs/content/docs/installation.mdx:13-39`, `apps/docs/content/docs/ci-cd/github-actions.mdx:104`, `packages/cli/src/core/config.ts:524`, `packages/cli/src/templates/github-actions.ts:75-90`, `packages/cli/action.yml`, `packages/cloud-api/src/snapshot.ts:24`, `packages/cloud-api/src/daytona-runner.ts:109`, `integrations/netlify/README.md:19`. |
| **P0-2** | Pick ONE env-var convention (`FRONTGUARD_OPENAI_KEY` / `FRONTGUARD_ANTHROPIC_KEY` is best — it doesn't collide with other tools). Update `packages/cli/src/cli/doctor.ts:209-210`, the GitHub Actions template, and the docs page. The `@frontguard/playwright` plugin already accepts either; leave it. |
| **P0-3** | Fix the generated `init` config import: `import type { FrontguardConfig } from '@frontguard/cli'` (with corresponding `package.json` `exports` mapping for type-only entry) at `packages/cli/src/core/config.ts:524`. |
| **P0-4** | Fix every docs plugin example to use `@frontguard/cli/plugins` and the actual exported names (`createFigmaPlugin`, not `figmaPlugin`). Files: `apps/docs/content/docs/guides/accessibility.mdx:25`, `production-monitoring.mdx:64`, `custom-plugins.mdx:23`, `ai-fixes.mdx`, `performance-budgets.mdx`, `third-party-scripts.mdx`. |
| **P0-5** | Remove or replace every fabricated marketing stat from `apps/landing/index.html`: the `aggregateRating` block (`:69-75`), "200 visual regressions / 87% accuracy" (`:285`), "2,000 weekly downloads" (`:342`), Stripe/Testim/Software House citations (`:245-298`), Author bio + X handle (`:417-418`), `© 2025` footer (`:463`). |
| **P0-6** | Decide whether the cloud is "real" or "phase 2." If real: unify `packages/cloud-api/app/src/index.js` and `packages/cloud-api/src/`, replace `Math.random()` diffs with the real pipeline, fix the Workers/Node `process.env`/`process.on` confusion (`processor.ts:26`, `entry.ts:10-11`), provision `api.frontguard.dev`. If phase 2: delete the cloud-api section from ROADMAP "What's Shipped" and the entire Cloud API doc page, and rewrite the integrations to not depend on it. |
| **P0-7** | Patch the Stripe webhook to refuse all events when secrets are unset (`packages/cloud-api/src/routes/billing.ts:69-75`). Currently any unauthenticated POST can flip any team to `business`. |
| **P0-8** | Fix the GitHub App's preview-URL inference (`integrations/github-app/src/handler.ts:181`) — derive a real preview deploy URL (Vercel/Netlify) instead of forwarding `pull_request.html_url`. |
| **P0-9** | Fix the GitHub App's bootstrap config to import from `@frontguard/cli`, not `@frontguard/core` (`integrations/github-app/src/github-api.ts:336`). |
| **P0-10** | Fix the Slack app: persist OAuth tokens (`handler.ts:103-106`), then actually queue a run on `/frontguard status` (`events.ts:75-80`). Otherwise remove the slash command from the manifest. |
| **P0-11** | Fix the Netlify plugin's failure detection (`integrations/netlify/lib/core.js:228`): inspect the API's actual response shape (`results[].status === 'failed'`), not the invented `results.changed`. Publish the package or rewrite the README install step. |
| **P0-12** | Run `validation/run-external.sh` and fill in `validation/results-v0.2.md` before any "AI is N% accurate" claim ships. If accuracy < 70%, retune the prompt — do NOT publish a number that doesn't exist. |
| **P0-13** | Remove or fix the SoftwareApplication `aggregateRating` structured-data block (`apps/landing/index.html:69-75`) before Google indexes it. Publishing a fake aggregate rating is a [policy violation](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) that can blacklist the domain from rich results.

### P1 — a paying customer would call it out

| ID | Fix |
|--|--|
| **P1-1** | Reconcile every "N tests / N source files / N KB bundle" number across README, CHANGELOG, docs index. Stop snapshotting these into prose; if you must, generate them from a `scripts/stats.ts` at build time. |
| **P1-2** | Render `demo/frontguard-demo.gif` (and `demo/frontguard-report.mp4`) and wire `DemoSection` to actually load the GIF (currently no code path uses it). |
| **P1-3** | The 3-error stacked output when discovery already failed (`packages/cli/src/core/pipeline.ts`) — bail on the first ECONNREFUSED instead of falling back to `/` and trying again. |
| **P1-4** | Daytona sandbox: either build & publish the `frontguard-playwright-v1` snapshot AND ship a `frontguard-render` binary, or remove the Daytona path entirely and stop advertising it (`docs/ROADMAP.md:103`, `packages/cli/src/sandbox/daytona.ts`). |
| **P1-5** | Vercel integration: accept arbitrary preview hostnames or expose an allowlist in the integration config (`integrations/vercel/src/webhook.ts:98-108`). The `*.vercel.app` lock-in breaks the common custom-domain case. |
| **P1-6** | Slack/GitHub/Vercel/Netlify integrations: add a README (or doc page) for each that documents the env vars, deploy target, and registration steps. Today there is no runbook for any of them. |
| **P1-7** | Fix the docs's "3 built-in plugins" / "395 tests" / "v0.1.0" lines (`apps/docs/content/docs/index.mdx:72`, `quick-start.mdx:73,127`, `cli/index.mdx:54`). |
| **P1-8** | Reposition the README + landing + docs so all three say the same thing. Today they differ — "Visual regression testing for Playwright" vs "AI-powered frontend visual regression testing." Pick one and own it. |
| **P1-9** | `apps/landing/index.html:417-418` author bio + Twitter — replace placeholder. |
| **P1-10** | GitHub Check Run callback fails silently when `FRONTGUARD_CALLBACK_SECRET`/`PUBLIC_BASE_URL` are unset (`packages/cloud-api/src/github-callback.ts:51-55`). Add an explicit warning at startup if the secrets are missing. |
| **P1-11** | The unscoped `frontguard` action reference in CI examples (`uses: ravidsrk/frontguard@main`) needs to point at a tagged version, not `main`. `@main` will break for every consumer the next time we touch action.yml. |

### P2 — polish

| ID | Fix |
|--|--|
| **P2-1** | `apps/landing/public/sitemap.xml` — either remove or list the docs / docs subpages, and update `lastmod`. |
| **P2-2** | Footer copyright year drift (`apps/landing/index.html:463` vs `Footer.tsx:73`). |
| **P2-3** | `packages/cloud-api/src/index.ts:123` `/health` version string drift (`0.1.0`). |
| **P2-4** | `packages/cloud-api/src/alerts/index.ts:28-33` — fingerprint dedup ignores severity, so escalating regressions don't re-alert. Add `severity` or `diffPercentBucket` to the fingerprint. |
| **P2-5** | `packages/cloud-api/src/scheduler.ts:57` — hardcoded `chromium` browser overrides per-monitor config. Honor the monitor's `browsers` field. |
| **P2-6** | `packages/cloud-api/src/alerts/index.ts:202` — verify the `alerts@frontguard.dev` domain in Resend (and document it) before any alert emails go out. |
| **P2-7** | Replace `aria-label="Frontguard has N stars on GitHub"` with a check that the stars badge actually shows a number even when offline (`apps/landing/src/components/GitHubStars.tsx`). |
| **P2-8** | `apps/docs/content/docs/cli/commands.mdx:35` — drop the duplicate `--update-baselines` flag on `frontguard run` if `frontguard update-baselines` is the canonical command. |
| **P2-9** | Netlify plugin defaults `CONTEXT='deploy-preview'` (`integrations/netlify/lib/core.js:55`) — runs on every local build. Default to "do nothing if `CONTEXT` is unset." |
| **P2-10** | Resend "from" address & all activity-feed PII (`packages/cloud-api/src/index.ts:292-301`, `alerts/index.ts:202`) — needs a redaction & retention policy doc before customers see it. |

---

## The honest bottom line

The engine works. The plugin system, AI vision pipeline, anti-flake consensus, sandbox abstraction, and per-route override system are real — and the code quality is well above the "indie dev rushing to launch" bar.

But every surface that touches a non-engineer reads as half-finished:

- **Marketing is dishonest:** fake aggregate ratings, fake download numbers, fake accuracy stats, fake author bio.
- **Onboarding is broken:** the wrong package name is repeated in 9+ places, including the `init` command's own output.
- **Doctor lies to you:** wrong env-var contract means "✅ AI is configured" and "✅ AI is disabled" are both wrong half the time.
- **Cloud is not real:** `Math.random()` for diffs, no live host at `api.frontguard.dev`, Workers/Node confusion that turns the entire D1+R2+Stripe codebase into dead branches.
- **Integrations are not real:** Slack OAuth doesn't persist tokens; GitHub App screenshots github.com; Netlify plugin can't detect a failing run; Vercel rejects custom-domain previews; bootstrap PR imports a package that doesn't exist.
- **Validation hasn't happened:** the launch gate ("AI accuracy ≥ 70%") is "Pending live run" while the landing page advertises 87%.
- **Demo doesn't exist:** the VHS tape is written; the GIF was never rendered; the DemoSection comment promises a fallback path that doesn't exist.

This is a CLI with a marketing site grafted on, not a product. The good news is that almost every P0 is a small, surgical fix (a literal find-and-replace for the package name; deleting fabricated stats; deciding whether the cloud is real). The fix list is long but each item is concrete.

If T2-T... in this pipeline are about actually shipping, P0-1, P0-2, P0-3, P0-5, P0-12, P0-13 are the smallest set that gets "install path works + no fabricated claims" — and that alone unblocks calling this a product.

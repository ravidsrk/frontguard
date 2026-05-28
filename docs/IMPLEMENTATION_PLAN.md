# Frontguard Implementation Plan

*Last updated: May 2026*

This is the master execution document. It turns the ROADMAP.md strategy into concrete engineering tasks with dependencies, file-level specs, and acceptance criteria. Every task is something a developer can pick up and start coding.

---

## Market Context

**The landscape is consolidating fast.** Lost Pixel: archived. BackstopJS: no release in 6 years. Happo: archived. Applitools JS SDKs: all archived. Their combined 116K weekly downloads need a home.

**Active survivors** form a clear tier structure:
- Playwright built-in (`toHaveScreenshot()`): 36.6M DL/week — the default, but universally complained about (flakiness, no review UI, Git conflicts on baselines)
- Chromatic: 7.2M DL/week — Storybook-locked
- jest-image-snapshot: 1.1M DL/week — pixel-only, no intelligence
- Percy: 488K DL/week — pricing sticker shock after free trial
- Argos CI: 80K DL/week — rising, open-source + SaaS, closest competitor

**The #1 pain point across every research source:** False positives. 40% of visual test runs produce them. Teams disable entire screenshot suites because the false-positive rate exceeds the bug detection rate. Monday morning, 47 alerts — all noise.

**The emerging trend:** AI/LLM-powered visual testing. 6+ new tools in 2026. "Model-as-judge" paradigm: zero baselines, zero snapshot directories. Visual testing as feedback loop for AI coding agents.

**Frontguard's position:** 0 stars, 0 downloads. But: the only open-source tool combining CLI-first + AI vision analysis + Playwright-native + self-hostable. The anti-flake rendering (multi-render consensus) is already shipped. The AI classification (GPT-4o + Anthropic) is already shipped. What's missing: distribution, validation, and the image hosting layer that unblocks everything else.

**Key insight from codebase audit:** R2/S3 upload abstraction is the single highest-leverage piece of infrastructure to build. It unblocks PR thumbnails (the #1 developer want), cloud tier screenshot storage, and production monitoring history. Build it once, unlock three features.

---

## Architecture Overview (Current State)

```
┌─────────────────────────────────────────────────────────────────┐
│  @frontguard/cli (packages/cli/)                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Commands │  │ Pipeline │  │ Plugins  │  │  Reporters    │   │
│  │ run      │→ │ discover │→ │ 9 hooks  │→ │ console       │   │
│  │ init     │  │ filter   │  │ figma    │  │ html          │   │
│  │ update-  │  │ render   │  │ monitor  │  │ json          │   │
│  │ baselines│  │ compare  │  │ perf-    │  │ github-pr     │   │
│  └──────────┘  │ analyze  │  │ budgets  │  │ (no images!)  │   │
│                │ report   │  └──────────┘  └───────────────┘   │
│                └──────────┘                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Storage  │  │ Render   │  │ Diff     │  │ AI Vision     │   │
│  │ git-     │  │ Playwright│ │ pixel    │  │ GPT-4o +      │   │
│  │ orphan   │  │ consensus│  │ ssim     │  │ Anthropic     │   │
│  │ branch   │  │ anti-flake│ │ ai-vision│  │ classify +    │   │
│  └──────────┘  └──────────┘  └──────────┘  │ suggestedFix  │   │
│                                             └───────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  @frontguard/playwright (packages/playwright/)                  │
│  Playwright test integration: visual-test, diff, storage, ai   │
├─────────────────────────────────────────────────────────────────┤
│  @frontguard/cloud-api (packages/cloud-api/)                    │
│  Hono on CF Workers — IN-MEMORY ONLY (Map<string, Run>)        │
│  Endpoints: /v1/run, /v1/runs, /v1/reports, /v1/baselines      │
│  ❌ No persistent storage  ❌ No auth  ❌ No billing             │
├─────────────────────────────────────────────────────────────────┤
│  apps/landing/ — Vite + React landing page                      │
│  apps/docs/ — Fumadocs documentation site                       │
│  apps/demo/ — Demo app with frontguard.config.ts                │
└─────────────────────────────────────────────────────────────────┘

Missing Infrastructure (nothing exists):
  ❌ Image hosting (R2/S3/any)
  ❌ Database (any)
  ❌ Authentication (any)
  ❌ Scheduling/cron (any)
  ❌ Job queue (any)
```

**Codebase stats:** ~5,600 lines across 18 key source files. Well-structured, consistent patterns, JSDoc everywhere. Plugin system is the extensibility backbone (9 hooks, 3 plugins). Total test files: 19.

---

## Phase v0.2: Ship & Launch (Weeks 1-6)

**Goal:** 50 stars, 20 weekly CLI users, <15% false positive rate on real repos. First npm publish. First users who aren't us.

---

### Sprint 1 (Week 1-2): Foundation + Quick Wins

**Goal:** Nail the basics that make or break first impressions. A developer should be able to `npx frontguard init`, run it against their site, and get a useful result in under 2 minutes. Fix the gaps that would make them bounce.

**Total estimated effort:** 8-12 dev-days

**Sprint deliverable:** v0.2.0-alpha with doctor command, per-route thresholds, polished init flow, and validated AI accuracy on 5 real repos.

---

#### Task 1.1: `frontguard doctor` Command

**Description:** Diagnostic command that checks environment readiness — Playwright installed, browsers available, config valid, AI keys set, Git repo initialized.

**Files to create/modify:**
- `packages/cli/src/cli/doctor.ts` — new file, ~120 lines
- `packages/cli/src/cli/index.ts` — register `doctor` subcommand with Commander.js
- `packages/cli/test/cli/doctor.test.ts` — new test file

**Dependencies:** None — standalone.

**Acceptance criteria:**
- [x] `frontguard doctor` runs without a config file and reports all checks
- [x] Checks: Node.js version ≥18, Playwright installed, at least 1 browser available, config file found/parseable, AI keys present (warn if missing, don't fail), git repo exists, baseline branch exists
- [x] Each check shows ✅ / ❌ with actionable fix suggestion
- [x] Exit code 0 if all critical checks pass, 1 otherwise
- [x] Works in CI (no interactive prompts)

**Complexity:** S (1-2 days)
**Priority:** P0 — first-run experience
**Status:** ✅ Done (May 2026) — `packages/cli/src/cli/doctor.ts`, 17 unit tests in `test/cli/doctor.test.ts`

---

#### Task 1.2: Per-Route Threshold Configuration

**Description:** Allow different pixel-diff thresholds per route. A marketing landing page can tolerate 0.5% diff; a checkout page needs 0.01%.

**Files to create/modify:**
- `packages/cli/src/core/types.ts` — extend `FrontguardConfig` to support `routes` as `string[] | RouteConfig[]` where `RouteConfig = { path: string; threshold?: number; ignore?: IgnoreRule[]; viewport?: number[] }`
- `packages/cli/src/core/config.ts` — update Zod schema with union type: `z.union([z.string(), routeConfigSchema])`
- `packages/cli/src/core/pipeline.ts` — resolve per-route threshold during compare stage, merge with global config
- `packages/cli/test/core/config.test.ts` — union type parsing tests
- `packages/cli/test/core/pipeline.test.ts` — threshold resolution tests

**Dependencies:** None.

**Acceptance criteria:**
- [x] Config accepts both `routes: ["/", "/about"]` and `routes: [{ path: "/", threshold: 0.01 }, { path: "/blog", threshold: 0.5 }]`
- [x] Mixed arrays work: `routes: ["/", { path: "/checkout", threshold: 0.01 }]`
- [x] Per-route threshold overrides global `threshold` during diff comparison
- [x] Per-route `ignore` rules merge with (don't replace) global ignore rules
- [x] Existing configs with string-only routes continue working (backward compatible)
- [x] TypeScript types are correct (no `any`)

**Complexity:** S (1-2 days)
**Priority:** P0 — core DX improvement
**Status:** ✅ Done (May 2026) — `RouteConfig`/`RouteEntry` types, `routeEntrySchema` Zod union, `toRouteObjects`/`resolveThreshold` in pipeline, per-route ignore merge + viewport override in render. Tests in config.test.ts + pipeline.test.ts.

---

#### Task 1.3: Enhanced `frontguard init` Flow

**Description:** Make `init` detect the project framework (Next.js, Vite, Remix, etc.), generate a framework-appropriate config, offer to install Playwright if missing, and add `.frontguard/` to `.gitignore`.

**Files to create/modify:**
- `packages/cli/src/core/config.ts` — enhance `detectFramework()` to detect more frameworks, return richer metadata (dev server command, default port, typical routes)
- `packages/cli/src/cli/index.ts` — enhance init command to use detection, offer interactive choices
- `packages/cli/src/templates/` — new directory with config templates per framework
- `packages/cli/src/templates/nextjs.ts`, `packages/cli/src/templates/vite.ts`, `packages/cli/src/templates/generic.ts`
- `packages/cli/test/core/config.test.ts` — framework detection tests

**Dependencies:** None.

**Acceptance criteria:**
- [x] `frontguard init` in a Next.js project generates config with `baseUrl: "http://localhost:3000"`, sensible routes (`/`, `/about`), and `smartRender: true`
- [x] Detects: Next.js, Vite, Remix, Astro, SvelteKit, Create React App, generic
- [x] Adds `.frontguard/` to `.gitignore` automatically
- [x] Config file written as `frontguard.config.ts` (ESM) with TypeScript
- [x] `--yes` flag accepted; init is non-interactive by default (CI-friendly)

**Complexity:** S (2 days)
**Priority:** P1 — polish, not blocking

---

#### Task 1.4: Real-World AI Validation Suite

**Description:** Run Frontguard against 5 real open-source repos and measure classification accuracy. This is not a feature — it's a validation gate. If accuracy is below 70% on real diffs, retune prompts before launch.

**Files to create/modify:**
- `packages/cli/scripts/validate-ai-real.ts` — already exists, enhance with structured reporting
- `packages/cli/scripts/validate-real-quick.ts` — already exists, enhance
- `packages/cli/src/diff/ai-vision.ts` — prompt tuning based on results (lines ~80-150 contain system prompts)
- Create `validation/` directory at repo root with results markdown

**Dependencies:** None — uses existing pipeline.

**Acceptance criteria:**
- [x] Harness supports batch validation across 5 repos (Next.js, Tailwind dashboard, component library, e-commerce, docs) via ground-truth JSON
- [x] Measures per-category: true positives, false positives, false negatives (validation-metrics.ts)
- [x] Accuracy + per-category metrics computed; launch gate enforces ≥70% (evaluateGate, unit-tested)
- [x] False-positive rate computed and gated at <15% (evaluateGate)
- [x] Results template + methodology in `validation/results-v0.2.md`; live report auto-generated to results-v0.2-live.md
- [x] Prompt-tuning log section added; gate fails build below threshold

**Complexity:** M (3-4 days — mostly running tests and tuning, not coding)
**Priority:** P0 — cannot launch claiming AI accuracy without proof

---

#### Task 1.5: CI Pipeline Template (GitHub Actions)

**Description:** A copy-paste GitHub Actions workflow that runs Frontguard on every PR. This is the #1 thing developers will look for.

**Files to create/modify:**
- `apps/docs/content/docs/guides/github-actions.mdx` — documentation
- `.github/workflows/frontguard-example.yml` — working example in the repo itself
- `packages/cli/src/templates/github-actions.yml` — template served by `frontguard init --ci`
- `packages/cli/src/cli/index.ts` — add `--ci` flag to `init` that also generates workflow file

**Dependencies:** None.

**Acceptance criteria:**
- [x] `frontguard init --ci` creates `.github/workflows/frontguard.yml`
- [x] Workflow: checkout → setup node → install deps → start dev server → run frontguard → post PR comment
- [x] Works with `ubuntu-latest` (no Docker requirement)
- [x] Includes caching for Playwright browsers
- [x] Handles baseline branch creation on first run (fetch-depth: 0)
- [x] PR comment posted via existing `github-pr` reporter (GITHUB_TOKEN env)

**Complexity:** S (1-2 days)
**Priority:** P0 — the primary integration path

---

### Sprint 2 (Week 3-4): PR Experience + Distribution

**Goal:** Make Frontguard visible in GitHub PRs with real screenshot thumbnails, and create the distribution content that captures search traffic from dead competitors.

**Total estimated effort:** 10-14 dev-days

**Sprint deliverable:** v0.2.0-beta with PR screenshot thumbnails, migration guides for BackstopJS/Lost Pixel, and comparison landing pages.

---

#### Task 2.1: Image Upload Abstraction (R2/S3)

**Description:** Create a storage abstraction that uploads screenshot buffers and returns public URLs. This is the **single highest-leverage infrastructure task** — it unblocks PR thumbnails, cloud tier screenshot storage, and production monitoring.

**Files to create/modify:**
- `packages/cli/src/storage/image-upload.ts` — new file, ~200 lines. Interface: `ImageUploader { upload(key: string, buffer: Buffer, contentType: string): Promise<string> }`
- `packages/cli/src/storage/r2-uploader.ts` — Cloudflare R2 implementation using S3-compatible API via `@aws-sdk/client-s3`
- `packages/cli/src/storage/s3-uploader.ts` — AWS S3 implementation
- `packages/cli/src/storage/github-uploader.ts` — GitHub Actions artifact URL fallback (free, no config needed in CI)
- `packages/cli/src/core/config.ts` — add `imageUpload` config section to Zod schema
- `packages/cli/src/core/types.ts` — add `ImageUploadConfig` interface
- `packages/cli/test/storage/image-upload.test.ts` — unit tests with mock uploader

**Dependencies:** None.

**Implementation notes:**

```typescript
// packages/cli/src/storage/image-upload.ts
export interface ImageUploader {
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
}

export type ImageUploadProvider = 'r2' | 's3' | 'github-artifacts' | 'local';

export function createUploader(config: ImageUploadConfig): ImageUploader {
  switch (config.provider) {
    case 'r2': return new R2Uploader(config);
    case 's3': return new S3Uploader(config);
    case 'github-artifacts': return new GitHubArtifactUploader();
    case 'local': return new LocalUploader(config.outputDir);
  }
}
```

**Config shape:**
```typescript
imageUpload?: {
  provider: 'r2' | 's3' | 'github-artifacts' | 'local';
  bucket?: string;
  region?: string;
  endpoint?: string;   // For R2: https://<account>.r2.cloudflarestorage.com
  accessKeyId?: string; // Or env: FRONTGUARD_S3_ACCESS_KEY
  secretAccessKey?: string; // Or env: FRONTGUARD_S3_SECRET_KEY
  publicUrlPrefix?: string; // For custom domains on R2
}
```

**Acceptance criteria:**
- [x] `ImageUploader` interface with `upload()`, `getUrl()`, `delete()`
- [x] R2 uploader works with Cloudflare R2 (S3-compatible API)
- [x] S3 uploader works with AWS S3
- [x] GitHub artifact uploader works in Actions without any config (auto-detects `GITHUB_TOKEN`, `GITHUB_RUN_ID`)
- [x] `local` fallback writes to disk and returns `file://` URLs (for local dev)
- [x] Keys are namespaced: `{project}/{runId}/{route}-{viewport}-{browser}.png`
- [x] Uploaded images are publicly readable (for PR comment embedding)
- [x] Config validated via Zod; missing credentials produce clear error message
- [x] No credentials logged or written to disk

**Complexity:** M (3-4 days)
**Priority:** P0 — unblocks PR thumbnails, cloud tier, and monitoring

---

#### Task 2.2: PR Screenshot Thumbnails

**Description:** Replace placeholder text in PR comments with actual before/after/diff screenshot images in a grid layout.

**Files to create/modify:**
- `packages/cli/src/report/github-pr.ts` — major refactor of `formatRegressionSection()` (lines ~160-210) and `formatWarningSection()` to embed image URLs
- `packages/cli/src/core/pipeline.ts` — add upload step between `afterCompare` and report stage
- `packages/cli/src/core/types.ts` — add `imageUrl?: string` fields to `DiffResult` type
- `packages/cli/test/report/github-pr.test.ts` — update tests for new markdown format

**Dependencies:** Task 2.1 (Image Upload Abstraction).

**Implementation notes:**

The PR comment markdown format should be:

```markdown
### 🔴 Regressions (2 found)

<table>
<tr><th>Route</th><th>Baseline</th><th>Current</th><th>Diff</th></tr>
<tr>
<td><code>/checkout</code><br>1440px · chromium<br>🔴 2.34% diff</td>
<td><img src="https://r2.example.com/baseline.png" width="280"/></td>
<td><img src="https://r2.example.com/current.png" width="280"/></td>
<td><img src="https://r2.example.com/diff.png" width="280"/></td>
</tr>
</table>
```

**Acceptance criteria:**
- [x] PR comment includes actual screenshot images (baseline, current, diff) in a table grid
- [x] Images are thumbnails (280px wide in markdown) linking to full-size
- [x] Graceful fallback: if no image upload configured, falls back to text-only format (current behavior)
- [x] Images are uploaded during pipeline run, URLs stored in `DiffResult`
- [x] Works in GitHub Actions with `github-artifacts` uploader (zero config)
- [x] Works with R2/S3 when configured
- [x] Comment stays under 65KB limit (images are URLs, not base64)
- [x] AI classification badge shown per regression: 🔴 Regression / 🟡 Warning / 🟢 Intentional

**Complexity:** M (3-4 days)
**Priority:** P0 — the #1 developer want according to research

---

#### Task 2.3: BackstopJS Migration Guide

**Description:** A comprehensive guide for BackstopJS users (73K weekly downloads, no release in 6 years) to migrate to Frontguard. Capture orphaned users searching "backstopjs alternative."

**Files to create/modify:**
- `apps/docs/content/docs/guides/migrate-from-backstopjs.mdx` — full migration guide
- `apps/docs/content/docs/guides/meta.json` — add to navigation
- `apps/landing/src/components/MigrationCTA.tsx` — optional landing page component

**Dependencies:** None.

**Content requirements:**
- Side-by-side config comparison (backstop.json → frontguard.config.ts)
- Scenario mapping: BackstopJS scenarios → Frontguard routes
- Feature comparison table: what maps, what's new, what's different
- `readySelector` → Frontguard's `smartRender` + `waitForSelector`
- `misMatchThreshold` → `threshold` (direct mapping)
- `viewports` → `viewports` (direct mapping)
- BackstopJS `reference`/`test` → Frontguard baselines
- Step-by-step migration checklist
- Common gotchas

**Acceptance criteria:**
- [x] A BackstopJS user can follow the guide and have Frontguard running in <30 minutes
- [x] Config translation is correct and tested
- [x] SEO metadata targets "backstopjs alternative", "backstopjs migration", "backstopjs replacement"
- [x] Includes a one-command migration script or at minimum a config converter example

**Complexity:** S (2 days)
**Priority:** P1 — distribution play, not blocking launch

---

#### Task 2.4: Lost Pixel Migration Guide

**Description:** Same as BackstopJS guide but for Lost Pixel users (43K weekly downloads, archived).

**Files to create/modify:**
- `apps/docs/content/docs/guides/migrate-from-lost-pixel.mdx` — full migration guide
- `apps/docs/content/docs/guides/meta.json` — add to navigation

**Dependencies:** None.

**Content requirements:**
- `lostpixel.config.ts` → `frontguard.config.ts` mapping
- `pageShots` / `customShots` / `storybookShots` → Frontguard equivalents
- Platform comparison: Lost Pixel Cloud (dead) → Frontguard CLI (free forever) + Cloud (optional)
- Highlight: AI classification (Lost Pixel never had this)

**Acceptance criteria:**
- [x] Guide covers all Lost Pixel config options
- [x] SEO targets "lost pixel alternative", "lost pixel archived"
- [x] Includes working config translation examples

**Complexity:** S (1-2 days)
**Priority:** P1 — distribution play

---

#### Task 2.5: Comparison Landing Page — "Frontguard vs Percy vs Chromatic"

**Description:** An honest, technical comparison page that captures developers searching for alternatives. This is content marketing that doubles as documentation.

**Files to create/modify:**
- `apps/landing/src/components/ComparisonTable.tsx` — new component
- `apps/landing/src/pages/compare/` — new directory (or routes within existing Vite app)
- `apps/docs/content/docs/guides/frontguard-vs-percy.mdx` — docs version
- `apps/docs/content/docs/guides/frontguard-vs-chromatic.mdx` — docs version

**Dependencies:** None (content task).

**Decision: Static MDX pages vs generated.**
→ **Static MDX pages.** Comparisons change rarely. Static content is SEO-friendly, version-controlled, and doesn't need a build step. Generate once, update quarterly.

**Content structure per comparison:**
1. Quick comparison table (setup time, CI impact, pricing at 1K/5K/50K screenshots, false positive approach, AI capabilities)
2. "When to use X" — be honest about when the competitor is the better choice
3. Feature-by-feature deep dive
4. Pricing comparison (Percy: $0→$399/mo cliff; Chromatic: free for Storybook hobby; Frontguard: free forever CLI, $29/mo Pro)
5. Migration steps

**Acceptance criteria:**
- [x] Comparison pages are factually accurate (verified against competitor docs)
- [x] Pricing data is current
- [x] Pages include structured data (JSON-LD) for SEO
- [x] Honest about weaknesses (Frontguard doesn't have a review dashboard yet, etc.)
- [x] SEO targets: "percy alternative", "chromatic alternative", "visual regression testing tools 2026"

**Complexity:** M (3-4 days — mostly writing, some React)
**Priority:** P1 — high-leverage distribution content

---

#### Task 2.6: Demo Assets — Terminal Recording

**Description:** Create demo assets showing Frontguard in action. A terminal recording (VHS) is higher fidelity than GIF and loads faster than video.

**Decision: Terminal recording (asciinema/VHS) vs video vs GIF.**
→ **VHS (charmbracelet/vhs) for terminal recordings + short GIF for GitHub README.** VHS produces deterministic, reproducible recordings from a tape file. Supplement with one 15-second screen recording (MP4) showing the HTML report. Avoid long videos — developers won't watch them.

**Files to create/modify:**
- `demo/frontguard-demo.tape` — VHS tape file for terminal recording
- `demo/frontguard-report.mp4` — screen recording of HTML report (manual capture)
- `demo/README.md` — instructions for regenerating
- `README.md` — embed demo GIF/recording at top
- `apps/landing/src/components/DemoSection.tsx` — embed on landing page

**Dependencies:** Tasks 1.1 (doctor command — include in demo), 1.2 (per-route threshold — show in config).

**Acceptance criteria:**
- [x] README has a demo GIF/recording above the fold (< 2MB)
- [x] Demo shows: `frontguard init` → config created → `frontguard run` → results with AI classification
- [x] Landing page has embedded demo
- [x] Demo is reproducible from tape file (`vhs frontguard-demo.tape`)

**Complexity:** S (1-2 days)
**Priority:** P1 — first impression matters

---

### Sprint 3 (Week 5-6): Validation + Launch

**Goal:** npm publish, real users, first community feedback. Everything in this sprint is about going from "working on my machine" to "working for strangers."

**Total estimated effort:** 8-10 dev-days

**Sprint deliverable:** v0.2.0 published to npm. README polished. GitHub Actions workflow tested in 3+ external repos. First 10 GitHub stars.

---

#### Task 3.1: npm Publish Pipeline

**Description:** Set up automated npm publishing for all three packages: `@frontguard/cli`, `@frontguard/playwright`, `@frontguard/cloud-api`.

**Files to create/modify:**
- `.github/workflows/publish.yml` — new workflow triggered on version tags
- `packages/cli/package.json` — verify `publishConfig`, `files`, `exports`
- `packages/playwright/package.json` — same
- `.changeset/config.json` — Changesets config for version management (or `release-it`)
- `package.json` (root) — add `release` script

**Dependencies:** None.

**Acceptance criteria:**
- [ ] `git tag v0.2.0 && git push --tags` triggers publish to npm
- [ ] All three packages published with correct `exports`, `types`, and `bin` fields
- [ ] `npx frontguard` works for a cold install (no peer dep issues)
- [ ] `npx frontguard doctor` works without a config file
- [ ] Package size is reasonable (<5MB for CLI, <500KB for playwright plugin)
- [ ] README renders correctly on npmjs.com
- [ ] Provenance attestation enabled (npm `--provenance` flag)

**Complexity:** S (1-2 days)
**Priority:** P0 — cannot launch without publishing

---

#### Task 3.2: README Overhaul

**Description:** The README is the landing page for 90% of developers who find Frontguard. It must communicate value in 10 seconds, show a working example in 30 seconds, and differentiate from competitors.

**Files to create/modify:**
- `README.md` — full rewrite
- `packages/cli/README.md` — npm-specific README
- `packages/playwright/README.md` — npm-specific README

**Dependencies:** Task 2.6 (demo assets for embedding).

**Structure:**
1. One-liner + badge row (npm version, downloads, license, CI status)
2. Demo GIF/recording (above the fold)
3. "Why Frontguard?" — 3 bullets: AI-powered analysis, anti-flake rendering, open-source & self-hosted
4. Quick start (5 lines: install, init, run)
5. Feature table (checkmarks vs competitors)
6. Config example
7. AI classification example (show real output)
8. Links: docs, Discord, contributing

**Acceptance criteria:**
- [ ] A developer understands what Frontguard does within 10 seconds of landing on the repo
- [ ] Quick start works copy-paste with zero errors
- [ ] Competitor comparison table is accurate
- [ ] Demo asset loads and is visible on GitHub

**Complexity:** S (1-2 days)
**Priority:** P0 — the front door

---

#### Task 3.3: External Repo Validation

**Description:** Run Frontguard against 5 real open-source repos via GitHub Actions. This validates the CI pipeline, catches edge cases, and produces testimonial-ready results.

**Files to create/modify:**
- `validation/repos.json` — list of target repos with configs
- `validation/run-external.sh` — script to clone, configure, and run
- `validation/results/` — directory for results per repo

**Target repos:**
1. A Next.js app (e.g., taxonomy, next-saas-stripe-starter)
2. A Tailwind dashboard (e.g., tailwindui-templates)
3. A component library docs site
4. An e-commerce storefront (e.g., medusa-starter)
5. A docs site (e.g., any Fumadocs/Nextra site)

**Dependencies:** Tasks 1.4 (AI validation), 1.5 (CI template), 3.1 (published package).

**Acceptance criteria:**
- [ ] Frontguard runs successfully on all 5 repos
- [ ] CI workflow completes in <5 minutes per repo
- [ ] False positive rate <15% across all repos
- [ ] At least 1 real regression detected (intentionally introduced)
- [ ] Results documented with screenshots for marketing

**Complexity:** M (3-4 days — mostly debugging edge cases)
**Priority:** P0 — validation before marketing claims

---

#### Task 3.4: Launch Distribution

**Description:** First public announcement across channels.

**Files to create/modify:**
- `docs/launch-announcement.md` — template
- Social posts prepared for: Dev.to article, Hacker News Show HN, Reddit r/webdev + r/reactjs, X/Twitter thread

**Dependencies:** All Sprint 1-2 tasks completed. Task 3.1, 3.2, 3.3.

**Acceptance criteria:**
- [ ] Dev.to article published (target: "Visual regression testing in 2026 — why existing tools fail and what we built")
- [ ] Show HN submitted
- [ ] Reddit posts in r/webdev, r/reactjs, r/node
- [ ] X thread with demo GIF
- [ ] Package README links to all distribution content

**Complexity:** S (2 days — writing, not coding)
**Priority:** P0 — no users without distribution

---

#### Task 3.5: Telemetry (Anonymous Usage Analytics)

**Description:** Opt-in anonymous usage analytics to understand how the tool is used. Critical for prioritizing Phase 3+ features.

**Files to create/modify:**
- `packages/cli/src/utils/telemetry.ts` — new file, ~100 lines
- `packages/cli/src/cli/index.ts` — send events on `run`, `init`, `update-baselines`, `doctor`
- `packages/cli/src/core/config.ts` — add `telemetry: boolean` (default: true, disable with env `FRONTGUARD_TELEMETRY=0` or config)

**Dependencies:** None.

**Events to track (all anonymous — no PII):**
- Command used (run/init/update-baselines/doctor)
- Number of routes tested
- Number of regressions found
- AI provider used (openai/anthropic/none)
- Anti-flake enabled (boolean)
- CI environment detected (github-actions/gitlab-ci/jenkins/local)
- Execution time
- Error type (if failed)

**Acceptance criteria:**
- [ ] Telemetry is opt-in with clear disclosure on first run
- [ ] `FRONTGUARD_TELEMETRY=0` or `--no-telemetry` disables completely
- [ ] No PII, no URLs, no config details, no file paths
- [ ] Events sent to a simple endpoint (PostHog / custom Cloudflare Worker)
- [ ] Fails silently — never blocks or slows the CLI
- [ ] Privacy policy documented

**Complexity:** S (1-2 days)
**Priority:** P1 — important for data-driven decisions, not blocking launch

---

## Phase 3: The Moat — AI Auto-Fix (Weeks 7-14)

**Goal:** 200 stars, 100 weekly users, fix suggestions accepted >20% of the time. This is the feature no competitor has.

---

### Sprint 4-5 (Week 7-10): Fix Verification Pipeline

**Goal:** Connect the AI fix suggestion system to the Daytona sandbox so fixes can be generated, applied, verified, and presented to the developer as one-click actions.

**Total estimated effort:** 14-18 dev-days

**Sprint deliverable:** `frontguard run` can generate a CSS fix for a regression, apply it in a sandbox, re-screenshot, and verify it actually works — all in one pipeline run.

---

#### Task 4.1: AI Fix Generation — CSS-First

**Description:** When the AI classifies a diff as a regression, generate a targeted CSS fix. Start with CSS-only (highest AI reliability): overflow/truncation, spacing/margin/padding, responsive breakpoints.

**Files to create/modify:**
- `packages/cli/src/diff/ai-fix.ts` — new file, ~300 lines. Takes `DiffResult` + git diff context, returns `{ fixType: 'css' | 'html' | 'config'; patch: string; confidence: number; explanation: string }`
- `packages/cli/src/diff/ai-vision.ts` — extend existing analysis to include fix generation in the same API call (avoid double-calling vision API)
- `packages/cli/src/core/types.ts` — add `SuggestedFix` type, add to `DiffResult`
- `packages/cli/test/diff/ai-fix.test.ts` — unit tests with fixture diffs

**Dependencies:** Task 1.4 (AI validation — need to know real-world accuracy first).

**Implementation notes:**
- The existing `suggestedFix` field in `DiffResult` is a string. Upgrade it to a structured `SuggestedFix` object.
- System prompt should include: baseline screenshot, current screenshot, the git diff that caused the change, the route URL, viewport dimensions.
- Output: a CSS patch (not a full file rewrite), a confidence score (0-1), and a human-readable explanation.
- Start with a curated set of fix categories: `overflow-fix`, `spacing-fix`, `font-fix`, `responsive-fix`, `z-index-fix`.

**Acceptance criteria:**
- [ ] For a regression caused by CSS overflow, AI generates a correct `overflow: hidden` or `text-overflow: ellipsis` fix
- [ ] For spacing regression, AI generates correct margin/padding correction
- [ ] Confidence score correlates with actual fix quality (>0.7 = fix works >60% of the time)
- [ ] Fix is a minimal CSS patch, not a full file
- [ ] Falls back gracefully if fix generation fails (still shows regression, just without fix)
- [ ] Works with both OpenAI and Anthropic providers

**Complexity:** M (4-5 days)
**Priority:** P0 for Phase 3

---

#### Task 4.2: Daytona Sandbox Integration

**Description:** Connect the fix verification pipeline to Daytona sandboxes. Apply the generated CSS fix in a sandbox environment, re-render the page, and screenshot it to verify the fix works.

**Files to create/modify:**
- `packages/cli/src/sandbox/daytona.ts` — new file, ~250 lines. Wrapper around Daytona API: create sandbox, apply patch, run command, screenshot, destroy
- `packages/cli/src/sandbox/types.ts` — `Sandbox` interface: `{ create(), applyPatch(patch), screenshot(url, viewport), destroy() }`
- `packages/cli/src/sandbox/local.ts` — local fallback: apply patch to temp directory, use local Playwright to screenshot
- `packages/cli/scripts/test-daytona.ts` — already exists, enhance with fix verification flow
- `packages/cloud-api/src/daytona-runner.ts` — already exists, extend for fix verification
- `packages/cli/src/core/types.ts` — add `FixVerification` type: `{ fixApplied: boolean; beforeScreenshot: Buffer; afterScreenshot: Buffer; diffPercentage: number; verified: boolean }`

**Dependencies:** Task 4.1 (AI Fix Generation).

**Acceptance criteria:**
- [ ] Sandbox created, code applied, page rendered, screenshot taken, sandbox destroyed — all in <60 seconds
- [ ] Fix verification compares: original baseline vs after-fix screenshot
- [ ] If diff percentage after fix is below threshold: `verified: true`
- [ ] If fix makes things worse or doesn't help: `verified: false`, fix discarded
- [ ] Local fallback works without Daytona (uses temp directory + local Playwright)
- [ ] Sandbox cleanup is guaranteed (no leaked resources on crash)
- [ ] Cost-aware: sandbox creation is opt-in, not default (flag: `--verify-fixes` or config `verifyFixes: true`)

**Complexity:** L (5-7 days)
**Priority:** P0 for Phase 3

---

#### Task 4.3: Fix Presentation in Reports

**Description:** Show verified fixes in all report formats: console, HTML, JSON, GitHub PR. The PR comment should include a "Apply Fix" suggestion or a `git apply` command.

**Files to create/modify:**
- `packages/cli/src/report/console.ts` — add fix section: show the CSS patch, confidence, verification status
- `packages/cli/src/report/html.ts` — add fix panel: before/after screenshots, the CSS patch with syntax highlighting, "Copy fix" button
- `packages/cli/src/report/json.ts` — add `suggestedFixes` array to JSON output
- `packages/cli/src/report/github-pr.ts` — add collapsible fix section per regression, include `diff` code block with the CSS patch
- `packages/cli/test/report/` — update all reporter tests

**Dependencies:** Tasks 4.1, 4.2. Task 2.1 (image upload — for before/after fix screenshots in PR).

**Acceptance criteria:**
- [ ] Console output shows: `🔧 Fix available (87% confidence): overflow-fix` followed by the CSS patch
- [ ] HTML report has a "Suggested Fix" panel with syntax-highlighted CSS, before/after screenshots, and copy button
- [ ] GitHub PR comment includes collapsible fix section with the CSS patch in a `diff` code block
- [ ] JSON report includes structured fix data for programmatic consumption
- [ ] Verified fixes are visually distinct from unverified suggestions
- [ ] `--json` output is stable (no breaking schema changes)

**Complexity:** M (3-4 days)
**Priority:** P1 for Phase 3

---

#### Task 4.4: Fix Pattern Database (Local)

**Description:** Store accepted/rejected fixes locally to improve future suggestions. This is the data moat — at 10K fixes, the accuracy advantage is insurmountable.

**Files to create/modify:**
- `packages/cli/src/storage/fix-patterns.ts` — new file, ~150 lines. SQLite (via `better-sqlite3`) local database
- `packages/cli/src/diff/ai-fix.ts` — query pattern database before calling AI (if similar fix was accepted before, use it)
- `packages/cli/src/cli/index.ts` — add `frontguard accept-fix <id>` and `frontguard reject-fix <id>` commands
- `packages/cli/src/core/types.ts` — add `FixPattern` type

**Database schema:**
```sql
CREATE TABLE fix_patterns (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,          -- overflow-fix, spacing-fix, etc.
  css_patch TEXT NOT NULL,
  context_hash TEXT NOT NULL,      -- hash of the visual context
  accepted BOOLEAN NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL,
  route TEXT,
  viewport INTEGER
);
```

**Dependencies:** Tasks 4.1, 4.2.

**Acceptance criteria:**
- [ ] Accepted fixes stored in local SQLite DB at `.frontguard/fix-patterns.db`
- [ ] Rejected fixes also stored (negative training signal)
- [ ] Before calling AI for a new fix, check if a similar pattern exists locally
- [ ] If pattern found with >3 accepted instances: use it directly (skip AI call, save cost)
- [ ] `frontguard accept-fix` and `frontguard reject-fix` work from CLI
- [ ] Database is git-ignorable but shareable via `frontguard export-patterns`

**Complexity:** M (3-4 days)
**Priority:** P1 for Phase 3 — the data moat starts here

---

### Sprint 6-7 (Week 11-14): Accessibility + Cloud Foundation

**Goal:** Ship the accessibility plugin (new market segment) and lay the foundation for the cloud tier.

**Total estimated effort:** 14-18 dev-days

**Sprint deliverable:** Accessibility plugin shipped. Cloud API has persistent storage and real auth.

---

#### Task 5.1: Accessibility Plugin

**Description:** An accessibility audit plugin using `@axe-core/playwright` that runs alongside visual regression tests. Catches a11y violations at the same time as visual regressions — zero extra CI time.

**Files to create/modify:**
- `packages/cli/src/plugins/accessibility.ts` — new file, ~200 lines. Implements `FrontguardPlugin` interface
- `packages/cli/package.json` — add `@axe-core/playwright` as optional peer dependency
- `packages/cli/src/core/types.ts` — add `AccessibilityResult` type with `violations`, `passes`, `incomplete`
- `packages/cli/src/report/console.ts` — add a11y section to console output
- `packages/cli/src/report/html.ts` — add a11y panel to HTML report
- `packages/cli/src/report/github-pr.ts` — add a11y section to PR comment
- `packages/cli/test/plugins/accessibility.test.ts` — unit tests

**Dependencies:** None (plugin system is already built with 9 hooks).

**Plugin hooks used:**
- `afterRender` — inject axe-core into the page and run audit
- `afterRun` — aggregate accessibility results across all routes
- `setup` — check that `@axe-core/playwright` is available

**Acceptance criteria:**
- [ ] Plugin activates when `plugins: [accessibility()]` is in config
- [ ] Runs axe-core on every rendered page with zero extra browser launch
- [ ] Reports violations with: rule ID, impact level, affected element, fix suggestion
- [ ] Violations appear in console, HTML, and PR reports
- [ ] Configurable: `rules` to include/exclude, `impact` minimum threshold (minor/moderate/serious/critical)
- [ ] Does NOT fail the run by default — reports violations as warnings (configurable with `failOnViolation: true`)
- [ ] Works without `@axe-core/playwright` installed (warns, skips)

**Complexity:** M (3-4 days)
**Priority:** P1 — new market segment (accessibility testing + visual testing = unique combination)

---

#### Task 5.2: Cloud API — Persistent Storage (D1)

**Description:** Replace the in-memory `Map<string, Run>` in cloud-api with Cloudflare D1 (SQLite at the edge). This is the foundation for the entire cloud tier.

**Files to create/modify:**
- `packages/cloud-api/src/db/schema.sql` — new file, database schema
- `packages/cloud-api/src/db/migrations/` — new directory for migrations
- `packages/cloud-api/src/db/client.ts` — D1 client wrapper
- `packages/cloud-api/src/processor.ts` — replace in-memory Map with D1 queries
- `packages/cloud-api/src/index.ts` — replace in-memory storage
- `packages/cloud-api/src/types.ts` — update types for D1 rows
- `packages/cloud-api/wrangler.toml` — add D1 binding
- `packages/cloud-api/test/api.test.ts` — update tests with D1 miniflare

**Decision: Turso (SQLite) vs Neon (Postgres) vs D1 (Cloudflare).**
→ **Cloudflare D1.** The cloud-api is already a Hono app targeting Cloudflare Workers (`export default app`). D1 is zero-config with Workers, uses SQLite syntax (familiar), has generous free tier (5GB, 25B reads/month), and avoids cross-provider networking. Turso would work too but adds another vendor. Neon is overkill for the initial schema. If we outgrow D1, migration to Turso is trivial (both SQLite-compatible).

**Database schema:**
```sql
-- Users & API keys
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  github_id TEXT UNIQUE,
  email TEXT,
  plan TEXT DEFAULT 'free',
  created_at TEXT NOT NULL
);

CREATE TABLE api_keys (
  key_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

-- Runs & results
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  config TEXT NOT NULL,          -- JSON blob
  results TEXT,                  -- JSON blob
  routes_count INTEGER DEFAULT 0,
  regressions_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

-- Screenshots (metadata only — images in R2)
CREATE TABLE screenshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  route TEXT NOT NULL,
  viewport INTEGER NOT NULL,
  browser TEXT NOT NULL,
  type TEXT NOT NULL,            -- baseline, current, diff
  r2_key TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);

-- Usage tracking
CREATE TABLE usage (
  user_id TEXT NOT NULL REFERENCES users(id),
  month TEXT NOT NULL,           -- YYYY-MM
  runs_count INTEGER DEFAULT 0,
  screenshots_count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
```

**Acceptance criteria:**
- [ ] All existing endpoints work with D1 instead of in-memory Map
- [ ] Data persists across Worker restarts
- [ ] Runs are associated with users (via API key)
- [ ] Usage tracking increments on each run
- [ ] Migration system works (up/down)
- [ ] Tests pass with Miniflare D1 simulator
- [ ] Existing API contracts unchanged (no breaking changes)

**Complexity:** L (5-7 days)
**Priority:** P0 for Phase 3 — cloud tier foundation

---

#### Task 5.3: Cloud API — Authentication (GitHub OAuth)

**Description:** Add GitHub OAuth login and API key management. Developers authenticate with GitHub, get an API key, and use it in their Frontguard config.

**Files to create/modify:**
- `packages/cloud-api/src/auth/github.ts` — new file, OAuth flow
- `packages/cloud-api/src/auth/middleware.ts` — new file, API key validation middleware (replace current bearer token check)
- `packages/cloud-api/src/auth/keys.ts` — new file, API key generation and management
- `packages/cloud-api/src/index.ts` — add auth routes: `GET /auth/github`, `GET /auth/callback`, `POST /v1/keys`, `DELETE /v1/keys/:id`
- `packages/cloud-api/wrangler.toml` — add secrets for GitHub OAuth client ID/secret

**Decision: GitHub OAuth vs Clerk vs custom.**
→ **GitHub OAuth (custom implementation).** The target audience is developers on GitHub. OAuth is the expected flow. Clerk adds $25/mo + a dependency for something that's ~200 lines of code on Cloudflare Workers. Custom JWT with GitHub OAuth is simple, no vendor lock-in, and matches the audience. Add Clerk later only if we need SSO/SAML for enterprise.

**Flow:**
1. Developer clicks "Sign in with GitHub" on dashboard
2. Redirect to GitHub OAuth
3. Callback creates user in D1, generates API key
4. API key is displayed once (hashed in DB)
5. Developer adds `FRONTGUARD_API_KEY=fg_...` to their env
6. All API requests validated via hashed key lookup in D1

**Acceptance criteria:**
- [ ] GitHub OAuth flow works end-to-end
- [ ] API keys are generated as `fg_<random>` format
- [ ] Keys stored as SHA-256 hashes in D1 (never plaintext)
- [ ] Invalid/missing API key returns 401 with helpful error message
- [ ] Rate limiting is per-user, not per-IP
- [ ] User can have multiple API keys (for different CI environments)
- [ ] Key revocation works immediately

**Complexity:** M (4-5 days)
**Priority:** P0 for Phase 3 — required for cloud tier

---

#### Task 5.4: Cloud Screenshot Storage (R2)

**Description:** Upload screenshots to Cloudflare R2 from the cloud API. Reuses the image upload abstraction from Task 2.1 but server-side.

**Files to create/modify:**
- `packages/cloud-api/src/storage/r2.ts` — new file, R2 client for Workers (uses Workers R2 binding, not S3 API)
- `packages/cloud-api/src/processor.ts` — upload screenshots to R2 after processing
- `packages/cloud-api/wrangler.toml` — add R2 bucket binding
- `packages/cloud-api/src/index.ts` — add `GET /v1/screenshots/:key` for pre-signed URL generation

**Dependencies:** Task 5.2 (D1 for screenshot metadata).

**Acceptance criteria:**
- [ ] Screenshots uploaded to R2 with key: `{userId}/{runId}/{route}-{viewport}-{browser}-{type}.png`
- [ ] Screenshot metadata stored in D1 `screenshots` table
- [ ] Public URLs generated for PR comment embedding
- [ ] Automatic cleanup: screenshots older than retention period (7 days free, 30 days pro) deleted via Workers Cron
- [ ] Bandwidth-efficient: thumbnails generated for list views (resized to 400px wide)

**Complexity:** M (3-4 days)
**Priority:** P1 for Phase 3

---

## Phase 4: Production Monitoring (Weeks 15-22)

**Goal:** $5K MRR, 30 weekly active teams. Frontguard monitors production URLs on a schedule and alerts on visual regressions without any CI involvement.

---

### Sprint 8-9 (Week 15-18): Monitoring Infrastructure

**Goal:** Build the scheduling and alerting infrastructure for production visual monitoring.

**Total estimated effort:** 12-16 dev-days

**Sprint deliverable:** Production monitoring MVP — configure URLs, set a schedule, get alerts when something changes visually.

---

#### Task 6.1: Monitoring Scheduler (Cloudflare Workers Cron)

**Description:** Scheduled visual checks against production URLs using Cloudflare Workers Cron Triggers.

**Files to create/modify:**
- `packages/cloud-api/src/monitoring/scheduler.ts` — new file, ~200 lines. Cron handler that reads monitoring configs from D1, triggers visual checks
- `packages/cloud-api/src/monitoring/types.ts` — `MonitorConfig`, `MonitorRun`, `AlertRule`
- `packages/cloud-api/src/index.ts` — add monitoring endpoints: `POST /v1/monitors`, `GET /v1/monitors`, `PUT /v1/monitors/:id`, `DELETE /v1/monitors/:id`
- `packages/cloud-api/wrangler.toml` — add `[triggers] crons = ["*/15 * * * *"]` for 15-minute intervals
- `packages/cloud-api/src/db/schema.sql` — add `monitors` and `monitor_runs` tables

**Decision: Cloudflare Workers Cron vs dedicated scheduler.**
→ **Cloudflare Workers Cron Triggers.** Already deployed to Workers. Cron triggers are free, reliable, and run in the same environment. No new infrastructure. If we need sub-minute scheduling or complex job queues later, add Cloudflare Queues. Don't over-engineer now.

**Database additions:**
```sql
CREATE TABLE monitors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  routes TEXT NOT NULL,           -- JSON array
  schedule TEXT NOT NULL,         -- cron expression
  threshold REAL DEFAULT 0.1,
  viewport INTEGER DEFAULT 1440,
  enabled BOOLEAN DEFAULT true,
  alert_channels TEXT,            -- JSON: {slack_webhook?, email?}
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE monitor_runs (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES monitors(id),
  status TEXT NOT NULL,
  regressions_count INTEGER DEFAULT 0,
  screenshots TEXT,               -- JSON: array of R2 keys
  created_at TEXT NOT NULL,
  completed_at TEXT
);
```

**Acceptance criteria:**
- [ ] Cron trigger fires every 15 minutes, checks all enabled monitors due for execution
- [ ] Each monitor run: screenshots production URL → compares with previous run → stores results
- [ ] Monitor CRUD endpoints work with proper auth
- [ ] Scheduling respects user's configured interval (15min, 1hr, 6hr, 24hr)
- [ ] Failed runs are retried once, then marked as `error`
- [ ] Usage counted against user's plan limits
- [ ] History stored for at least 7 days (free) / 30 days (pro)

**Complexity:** L (5-7 days)
**Priority:** P0 for Phase 4

---

#### Task 6.2: Alert System (Slack + Email)

**Description:** When a production monitoring run detects a regression, send alerts via Slack webhook and/or email.

**Files to create/modify:**
- `packages/cloud-api/src/monitoring/alerts.ts` — new file, ~200 lines. Alert dispatcher
- `packages/cloud-api/src/monitoring/slack.ts` — Slack webhook integration with Block Kit formatting
- `packages/cloud-api/src/monitoring/email.ts` — Email via Resend or Cloudflare Email Workers
- `packages/cli/src/plugins/monitor.ts` — enhance existing plugin to support webhook alerts for CLI-based monitoring

**Dependencies:** Task 6.1 (scheduler), Task 5.4 (R2 for screenshot URLs in alerts).

**Acceptance criteria:**
- [ ] Slack alert includes: monitor name, URL, number of regressions, thumbnail screenshots, link to full report
- [ ] Email alert includes: same data in clean HTML email
- [ ] Alerts are deduped — same regression doesn't alert twice
- [ ] Alert channels configurable per monitor
- [ ] "Snooze" feature: suppress alerts for a URL for N hours
- [ ] Test alert endpoint: `POST /v1/monitors/:id/test-alert`

**Complexity:** M (3-4 days)
**Priority:** P1 for Phase 4

---

#### Task 6.3: Monitoring Dashboard (Minimal Web UI)

**Description:** A simple web dashboard showing monitoring history, screenshots, and alert status. Not a full SaaS dashboard — a functional tool.

**Files to create/modify:**
- `apps/dashboard/` — new Vite + React app (or Cloudflare Pages)
- `apps/dashboard/src/pages/MonitorList.tsx` — list all monitors with status badges
- `apps/dashboard/src/pages/MonitorDetail.tsx` — timeline of runs, screenshot comparisons
- `apps/dashboard/src/pages/Settings.tsx` — API keys, alert configuration
- `apps/dashboard/src/lib/api.ts` — API client for cloud-api

**Dependencies:** Tasks 5.2 (D1), 5.3 (auth), 6.1 (scheduler).

**Acceptance criteria:**
- [ ] Login with GitHub OAuth
- [ ] List monitors with last-run status (green/yellow/red)
- [ ] View run history as timeline with thumbnail screenshots
- [ ] Click to see full-size baseline vs current vs diff
- [ ] Create/edit/delete monitors from UI
- [ ] Configure alert channels
- [ ] Responsive design (works on mobile for on-call use)

**Complexity:** L (5-7 days)
**Priority:** P2 for Phase 4 — the CLI and API work without a dashboard

---

### Sprint 10-11 (Week 19-22): Integration Layer

**Goal:** Integrate Frontguard into the deployment platforms where developers already work.

**Total estimated effort:** 10-14 dev-days

**Sprint deliverable:** Vercel + Netlify integrations, GitHub App for one-click setup.

---

#### Task 7.1: Vercel Integration

**Description:** A Vercel integration that auto-runs Frontguard on every preview deployment. Users install from Vercel Marketplace, Frontguard screenshots the preview URL and posts results to the PR.

**Files to create/modify:**
- `integrations/vercel/` — new directory
- `integrations/vercel/api/webhook.ts` — Vercel webhook handler (deployment.created event)
- `integrations/vercel/api/install.ts` — Installation flow
- `integrations/vercel/vercel.json` — integration configuration

**Dependencies:** Tasks 2.1 (image upload), 2.2 (PR thumbnails), 5.3 (auth).

**Acceptance criteria:**
- [ ] Listed in Vercel Marketplace (or ready to submit)
- [ ] On `deployment.created`: trigger Frontguard run against preview URL
- [ ] Results posted as PR comment (using existing github-pr reporter)
- [ ] Screenshots uploaded to R2 and embedded in PR
- [ ] Works with both client-side and server-side rendered pages
- [ ] Configuration via `frontguard.config.ts` in repo root

**Complexity:** L (5-7 days)
**Priority:** P1 for Phase 4 — distribution multiplier

---

#### Task 7.2: GitHub App

**Description:** One-click install GitHub App that auto-configures Frontguard for all repos in an org.

**Files to create/modify:**
- `integrations/github-app/` — new directory
- `integrations/github-app/src/webhook.ts` — GitHub webhook handler
- `integrations/github-app/src/install.ts` — App installation flow
- `integrations/github-app/manifest.yml` — GitHub App manifest

**Dependencies:** Tasks 5.3 (auth), 2.2 (PR thumbnails).

**Acceptance criteria:**
- [ ] One-click install from GitHub Marketplace
- [ ] On installation: auto-creates `frontguard.config.ts` PR if missing
- [ ] On PR open: triggers Frontguard run via cloud API
- [ ] Posts check results as GitHub Check Run (not just comment)
- [ ] Supports per-repo configuration override

**Complexity:** L (5-7 days)
**Priority:** P2 for Phase 4 — nice to have, not critical path

---

#### Task 7.3: CLI `frontguard monitor` Command

**Description:** A CLI command for local/CI production monitoring without the cloud tier. Uses the existing monitor plugin but with proper scheduling via system cron or `--watch` mode.

**Files to create/modify:**
- `packages/cli/src/cli/index.ts` — add `monitor` subcommand
- `packages/cli/src/plugins/monitor.ts` — enhance with `--watch` mode (polling loop) and cron expression support
- `packages/cli/src/monitoring/history.ts` — new file, local history storage (JSON files in `.frontguard/monitoring/`)

**Dependencies:** None (uses existing plugin).

**Acceptance criteria:**
- [ ] `frontguard monitor --url https://example.com --interval 1h` runs periodic checks
- [ ] `frontguard monitor --watch` enters a polling loop (for local dev)
- [ ] History stored locally in `.frontguard/monitoring/` with timestamps
- [ ] Alerts via webhook URL (configurable)
- [ ] `frontguard monitor --history` shows recent results
- [ ] Graceful shutdown on SIGINT/SIGTERM

**Complexity:** M (3-4 days)
**Priority:** P1 for Phase 4

---

## Phase 5: Scale (Weeks 23-30+)

**Goal:** $50K MRR, 100 paying teams. Enterprise pipeline. Network effects via marketplace integrations.

---

### Sprint 12-14 (Week 23-30): Team Features + Marketplace

**Goal:** Multi-user team features, billing, and marketplace integrations that create distribution flywheel.

**Total estimated effort:** 20-28 dev-days

**Sprint deliverable:** Team workspaces with shared baselines, Stripe billing, Netlify integration.

---

#### Task 8.1: Team Workspaces

**Description:** Multi-user workspaces with shared baselines, approval workflows, and role-based access.

**Files to create/modify:**
- `packages/cloud-api/src/db/schema.sql` — add `teams`, `team_members`, `team_projects` tables
- `packages/cloud-api/src/teams/` — new directory with CRUD, invitations, roles
- `packages/cloud-api/src/auth/middleware.ts` — add team-scoped auth
- `apps/dashboard/src/pages/TeamSettings.tsx` — team management UI

**Dependencies:** Tasks 5.2, 5.3, 5.4.

**Database additions:**
```sql
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  created_at TEXT NOT NULL
);

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',  -- owner, admin, member, viewer
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE team_projects (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  name TEXT NOT NULL,
  repo_url TEXT,
  config TEXT,
  created_at TEXT NOT NULL
);
```

**Acceptance criteria:**
- [ ] Create team, invite members via email/GitHub handle
- [ ] Roles: owner (full access), admin (manage members), member (run tests), viewer (read-only)
- [ ] Shared baselines scoped to team project
- [ ] Approval workflows: designate "reviewer" for visual changes
- [ ] Activity feed: who ran what, when, what changed
- [ ] Team usage aggregated for billing

**Complexity:** XL (7-10 days)
**Priority:** P0 for Phase 5 — this is the monetization gate

---

#### Task 8.2: Stripe Billing

**Description:** Integrate Stripe for subscription billing. Free → Pro ($29/mo) → Business ($99/mo) → Enterprise (custom).

**Files to create/modify:**
- `packages/cloud-api/src/billing/stripe.ts` — new file, Stripe SDK integration
- `packages/cloud-api/src/billing/plans.ts` — plan definitions and limits
- `packages/cloud-api/src/billing/middleware.ts` — plan enforcement middleware
- `packages/cloud-api/src/index.ts` — add billing endpoints: `POST /v1/billing/checkout`, `POST /v1/billing/webhook`, `GET /v1/billing/usage`
- `apps/dashboard/src/pages/Billing.tsx` — billing UI with Stripe Checkout redirect

**Dependencies:** Tasks 5.2, 5.3, 8.1 (teams).

**Plan limits:**
| Feature | Free | Pro ($29) | Business ($99) |
|---------|------|-----------|----------------|
| Cloud runs/mo | 50 | 500 | Unlimited |
| Cloud screenshots/mo | 500 | 5,000 | Unlimited |
| History retention | 7 days | 30 days | 90 days |
| Team members | 1 | 10 | 50 |
| Monitors | 1 | 10 | Unlimited |
| Production monitoring | ❌ | ❌ | ✅ |
| SSO/SAML | ❌ | ❌ | ✅ |

**Acceptance criteria:**
- [ ] Stripe Checkout flow: user clicks "Upgrade" → Stripe hosted page → webhook confirms → plan upgraded in D1
- [ ] Plan enforcement: exceeding limits returns 402 with upgrade URL
- [ ] Usage metering: runs and screenshots counted per billing period
- [ ] Downgrade: at period end, not immediate
- [ ] Webhook handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Free tier is generous enough that solo devs never need to pay

**Complexity:** L (5-7 days)
**Priority:** P0 for Phase 5

---

#### Task 8.3: Netlify Build Plugin

**Description:** A Netlify build plugin that runs Frontguard on every deploy preview.

**Files to create/modify:**
- `integrations/netlify/` — new directory
- `integrations/netlify/index.js` — Netlify Build plugin
- `integrations/netlify/manifest.yml` — plugin manifest
- `integrations/netlify/README.md` — setup instructions

**Dependencies:** Tasks 2.1, 5.3.

**Acceptance criteria:**
- [ ] Listed in Netlify Plugin Directory
- [ ] Runs Frontguard in `onSuccess` or `onPostBuild` lifecycle
- [ ] Screenshots deploy preview URL
- [ ] Results posted to GitHub PR (if GitHub connected)
- [ ] Configuration via `frontguard.config.ts` or `netlify.toml`

**Complexity:** M (3-4 days)
**Priority:** P2 for Phase 5

---

#### Task 8.4: Model-as-Judge (Zero Baseline) Mode

**Description:** Experimental mode inspired by the "model-as-judge" trend. Instead of comparing against baseline screenshots, use an AI model to evaluate screenshots against design intent (Figma, brand guidelines, accessibility standards). Zero baselines, zero snapshot directories.

**Files to create/modify:**
- `packages/cli/src/diff/model-judge.ts` — new file, ~300 lines
- `packages/cli/src/core/types.ts` — add `JudgeResult` type
- `packages/cli/src/plugins/figma.ts` — enhance existing Figma plugin to provide design context to the judge
- `packages/cli/src/core/pipeline.ts` — add `judge` mode alongside `compare` mode

**Dependencies:** None (uses existing AI infrastructure).

**Acceptance criteria:**
- [ ] `frontguard run --mode judge` evaluates screenshots against design intent
- [ ] Without Figma: judges based on common UI heuristics (alignment, contrast, overflow, responsive behavior)
- [ ] With Figma: compares screenshot against Figma frame for design compliance
- [ ] Returns structured verdict: `{ pass: boolean, issues: Issue[], confidence: number }`
- [ ] No baseline images needed — works on first run
- [ ] Experimental flag: clearly marked as beta in CLI output

**Complexity:** L (5-7 days)
**Priority:** P2 — experimental, market-signal feature. Ship behind `--experimental` flag.

---

#### Task 8.5: Plugin Marketplace / Registry

**Description:** A registry where community members can publish and discover Frontguard plugins.

**Files to create/modify:**
- `packages/cli/src/core/plugins.ts` — add dynamic plugin loading from npm
- `packages/cli/src/cli/index.ts` — add `frontguard plugin install <name>`, `frontguard plugin list`
- `apps/docs/content/docs/guides/create-plugin.mdx` — plugin authoring guide
- `packages/create-frontguard-plugin/` — new package, plugin scaffold template

**Dependencies:** Task 8.1 (cloud for registry hosting, optional).

**Acceptance criteria:**
- [ ] `frontguard plugin install frontguard-plugin-slack` installs from npm
- [ ] Plugins follow naming convention: `frontguard-plugin-*`
- [ ] Plugin authoring guide with template project
- [ ] `create-frontguard-plugin` scaffolds a working plugin with tests
- [ ] Plugin system handles version conflicts gracefully

**Complexity:** M (4-5 days)
**Priority:** P2 for Phase 5

---

## Infrastructure Decisions

### 1. Image Hosting: Cloudflare R2 ✅

**Decision:** Cloudflare R2 as primary, with S3 as alternative and GitHub artifacts as zero-config fallback.

**Rationale:**
- R2 has zero egress fees (major cost advantage for screenshot-heavy workload)
- S3-compatible API — same abstraction works for both
- Cloud-api already targets Cloudflare Workers — R2 is native (Workers binding, no SDK needed server-side)
- GitHub artifacts work in CI without any config (auto-detect `GITHUB_TOKEN`)
- Cost: R2 free tier = 10GB storage + 10M reads/month. More than enough for launch.

**Risk:** R2 public bucket URLs require custom domain setup. Mitigate with pre-signed URLs.

### 2. Database: Cloudflare D1 ✅

**Decision:** Cloudflare D1 (SQLite at the edge).

**Rationale:**
- Cloud-api is already a Hono app on Cloudflare Workers
- D1 is zero-config with Workers (binding in wrangler.toml)
- SQLite syntax is familiar and well-tested
- Free tier: 5GB, 25B reads/month
- Migration path to Turso is trivial (both SQLite-compatible)
- Neon (Postgres) is overkill for the initial schema and adds latency (connection overhead)

**Risk:** D1 is relatively new. If stability issues arise, Turso is the fallback (same SQL).

### 3. Auth: GitHub OAuth (Custom) ✅

**Decision:** Custom GitHub OAuth implementation.

**Rationale:**
- Target audience is developers on GitHub — OAuth is the expected flow
- ~200 lines of code on Cloudflare Workers
- Clerk adds $25/mo + vendor dependency for something trivially implementable
- Custom JWT with short expiry + refresh tokens
- Add Clerk only if enterprise SSO/SAML becomes critical (Phase 5)

**Risk:** Security surface area of custom auth. Mitigate with: short-lived JWTs (15min), hashed API keys (SHA-256), PKCE for OAuth flow, rate limiting on auth endpoints.

### 4. Scheduling: Cloudflare Workers Cron Triggers ✅

**Decision:** Workers Cron for scheduled monitoring.

**Rationale:**
- Already deployed to Workers — cron triggers are free and native
- No new infrastructure, no new billing, no new vendor
- Sufficient for 15-minute minimum interval (production monitoring doesn't need sub-minute)
- Cloudflare Queues available as upgrade path for complex job scheduling

**Risk:** Workers execution limit (30s CPU time free, 15min paid). Visual regression runs must complete within this window. Mitigate: queue long-running jobs to Durable Objects or Queues.

### 5. Comparison Content: Static MDX Pages ✅

**Decision:** Static MDX pages in the docs site.

**Rationale:**
- Comparisons change rarely (competitor pricing/features update quarterly at most)
- Static content is SEO-friendly, version-controlled, fast to load
- Fumadocs (existing docs framework) supports MDX natively
- No build step, no CMS, no generated content to maintain

### 6. Demo Assets: VHS Terminal Recording + Short GIF ✅

**Decision:** VHS (charmbracelet/vhs) for terminal recordings, supplemented with a short GIF for README.

**Rationale:**
- VHS produces deterministic, reproducible recordings from a tape file
- Output can be GIF, MP4, or WebM — one tape, multiple formats
- Asciinema requires a player (not embeddable in GitHub README)
- Pure video requires hosting — GIF works everywhere
- Screen recording of HTML report is separate (manual, infrequent)

---

## Dependencies & Risk Register

### Dependency Graph (Critical Path)

```
Sprint 1: [1.1 Doctor] [1.2 Per-Route] [1.3 Init] [1.4 AI Validation] [1.5 CI Template]
              │              │               │              │                 │
              └──────────────┴───────────────┴──────────────┴─────────────────┘
                                              │
Sprint 2: [2.1 Image Upload] ──────────────→ [2.2 PR Thumbnails]
          [2.3 BackstopJS Guide] [2.4 Lost Pixel Guide] [2.5 Comparison Pages] [2.6 Demo]
                                              │
Sprint 3: [3.1 npm Publish] [3.2 README] [3.3 External Validation] → [3.4 Launch]
          [3.5 Telemetry]                 │
                                          │
Sprint 4-5: [4.1 AI Fix Gen] → [4.2 Daytona Sandbox] → [4.3 Fix Reports]
                                                          [4.4 Fix Patterns DB]
                                                          │
Sprint 6-7: [5.1 A11y Plugin] [5.2 D1 Storage] → [5.3 GitHub Auth] → [5.4 R2 Cloud]
                                │                    │
Sprint 8-9: [6.1 Scheduler] → [6.2 Alerts] → [6.3 Dashboard]
                                │
Sprint 10-11: [7.1 Vercel] [7.2 GitHub App] [7.3 CLI Monitor]
                                │
Sprint 12-14: [8.1 Teams] → [8.2 Stripe] [8.3 Netlify] [8.4 Model Judge] [8.5 Plugin Marketplace]
```

**Critical path:** 2.1 → 2.2 → 5.2 → 5.3 → 5.4 → 6.1 → 8.1 → 8.2

The image upload abstraction (2.1) is the single most important infrastructure task. Everything cloud-related depends on it.

### Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | AI false positive rate >15% on real repos | Medium | 🔴 Critical | Task 1.4 validates before launch. If >15%, delay launch and retune prompts. Don't market AI accuracy you can't prove. |
| R2 | Daytona sandbox latency makes fix verification too slow | Medium | 🟡 Medium | Task 4.2 includes local fallback. If Daytona is slow, default to local Playwright sandbox. Daytona is an optimization, not a requirement. |
| R3 | D1 stability issues (relatively new product) | Low | 🟡 Medium | Schema is SQLite-compatible. Migration to Turso takes <1 day. Keep D1-specific features minimal. |
| R4 | GitHub rejects App marketplace listing | Low | 🟡 Medium | App works as private installation regardless. Marketplace listing is distribution bonus, not requirement. |
| R5 | No users after launch (cold start problem) | Medium | 🔴 Critical | Migration guides (2.3, 2.4) target 116K weekly downloads from dead tools. Comparison pages (2.5) capture search traffic. Dev.to + HN + Reddit launch (3.4) for initial burst. If <10 users in 6 weeks: kill signal per ROADMAP.md. |
| R6 | Chromatic/Percy add AI features before Phase 3 ships | Medium | 🟡 Medium | Legacy architecture = slow iteration. Born-AI-native is structurally faster. Ship weekly. The fix verification pipeline (Phase 3) is the moat they can't trivially copy. |
| R7 | GitHub Copilot adds visual PR review in 12-18 months | High | 🔴 Critical | Race condition. Mitigation: ship fast, build workflow integration depth (Vercel, Netlify, Slack) so Frontguard is hard to rip out. The fix pattern database compounds — time is the advantage. |
| R8 | R2 public URL setup is complex for users | Medium | 🟡 Medium | GitHub artifacts uploader (Task 2.1) works as zero-config fallback. R2 is only needed for cloud tier. Document setup clearly. |
| R9 | Plugin ecosystem doesn't attract contributors | High | 🟢 Low | Plugin marketplace (8.5) is P2. Core plugins (a11y, Figma, monitor) are built in-house. Community plugins are a bonus, not a dependency. |
| R10 | Cost of AI API calls at scale | Medium | 🟡 Medium | Fix pattern database (4.4) caches successful fixes locally. At scale, most fixes are cache hits — AI calls drop to ~20% of runs. Also: model-as-judge mode (8.4) explores cheaper alternatives. |

### Dependencies on External Services

| Service | Used For | Fallback | Phase |
|---------|----------|----------|-------|
| OpenAI API (GPT-4o) | AI classification + fix generation | Anthropic Claude | All |
| Anthropic API (Claude) | Alternative AI provider | OpenAI GPT-4o | All |
| Cloudflare Workers | Cloud API hosting | Any Node.js host (Hono is portable) | 3+ |
| Cloudflare D1 | Database | Turso (SQLite-compatible) | 3+ |
| Cloudflare R2 | Image storage | S3 or GitHub artifacts | 2+ |
| Daytona | Sandbox for fix verification | Local Playwright sandbox | 3+ |
| GitHub API | PR comments, OAuth, App | Works without (no PR comments) | All |
| Stripe | Billing | Manual invoicing (temporary) | 5 |

---

## Effort Summary

| Phase | Sprints | Weeks | Estimated Dev-Days | Key Deliverable |
|-------|---------|-------|-------------------|-----------------|
| v0.2: Ship & Launch | 1-3 | 1-6 | 26-36 | npm publish, first users, PR thumbnails |
| AI Auto-Fix | 4-7 | 7-14 | 28-36 | Fix verification pipeline, a11y plugin, cloud foundation |
| Production Monitoring | 8-11 | 15-22 | 22-30 | Scheduled monitoring, alerts, integrations |
| Scale | 12-14 | 23-30+ | 20-28 | Teams, billing, marketplace |
| **Total** | **14** | **30** | **96-130** | |

**Solo developer pace:** ~5 dev-days/week → 20-26 weeks of focused work.
**Two developers:** 10-13 weeks to feature-complete Phase 5.

---

## Priority Matrix (All Tasks)

### P0 — Must Have (Blocks Launch or Phase Gate)

| Task | Phase | Complexity | Est. Days |
|------|-------|-----------|-----------|
| 1.1 Doctor Command | v0.2 | S | 1-2 |
| 1.2 Per-Route Threshold | v0.2 | S | 1-2 |
| 1.4 AI Validation Suite | v0.2 | M | 3-4 |
| 1.5 CI Pipeline Template | v0.2 | S | 1-2 |
| 2.1 Image Upload Abstraction | v0.2 | M | 3-4 |
| 2.2 PR Thumbnails | v0.2 | M | 3-4 |
| 3.1 npm Publish | v0.2 | S | 1-2 |
| 3.2 README Overhaul | v0.2 | S | 1-2 |
| 3.3 External Validation | v0.2 | M | 3-4 |
| 3.4 Launch Distribution | v0.2 | S | 2 |
| 4.1 AI Fix Generation | Phase 3 | M | 4-5 |
| 4.2 Daytona Sandbox | Phase 3 | L | 5-7 |
| 5.2 D1 Storage | Phase 3 | L | 5-7 |
| 5.3 GitHub Auth | Phase 3 | M | 4-5 |
| 6.1 Monitoring Scheduler | Phase 4 | L | 5-7 |
| 8.1 Team Workspaces | Phase 5 | XL | 7-10 |
| 8.2 Stripe Billing | Phase 5 | L | 5-7 |

### P1 — Should Have

| Task | Phase | Complexity | Est. Days |
|------|-------|-----------|-----------|
| 1.3 Enhanced Init | v0.2 | S | 2 |
| 2.3 BackstopJS Migration | v0.2 | S | 2 |
| 2.4 Lost Pixel Migration | v0.2 | S | 1-2 |
| 2.5 Comparison Pages | v0.2 | M | 3-4 |
| 2.6 Demo Assets | v0.2 | S | 1-2 |
| 3.5 Telemetry | v0.2 | S | 1-2 |
| 4.3 Fix Reports | Phase 3 | M | 3-4 |
| 4.4 Fix Pattern DB | Phase 3 | M | 3-4 |
| 5.1 Accessibility Plugin | Phase 3 | M | 3-4 |
| 5.4 R2 Cloud Screenshots | Phase 3 | M | 3-4 |
| 6.2 Alert System | Phase 4 | M | 3-4 |
| 7.1 Vercel Integration | Phase 4 | L | 5-7 |
| 7.3 CLI Monitor Command | Phase 4 | M | 3-4 |

### P2 — Nice to Have

| Task | Phase | Complexity | Est. Days |
|------|-------|-----------|-----------|
| 6.3 Monitoring Dashboard | Phase 4 | L | 5-7 |
| 7.2 GitHub App | Phase 4 | L | 5-7 |
| 8.3 Netlify Plugin | Phase 5 | M | 3-4 |
| 8.4 Model-as-Judge | Phase 5 | L | 5-7 |
| 8.5 Plugin Marketplace | Phase 5 | M | 4-5 |

---

## Quick Reference: File Map

Key files in the codebase and what they do:

```
packages/cli/
├── src/cli/index.ts          — Commander.js CLI entry (run, init, update-baselines)
├── src/core/config.ts        — Zod config schema, loadConfig(), detectFramework()
├── src/core/pipeline.ts      — Main pipeline: discover → filter → render → compare → analyze → report
├── src/core/plugins.ts       — Plugin system: 9 hooks, PluginManager, PluginContext
├── src/core/types.ts         — All TypeScript interfaces (FrontguardConfig, DiffResult, etc.)
├── src/diff/ai-vision.ts     — GPT-4o + Anthropic vision analysis, classification + suggestedFix
├── src/diff/pixel.ts         — Pixelmatch pixel-diff comparison
├── src/diff/ssim.ts          — SSIM perceptual comparison
├── src/render/playwright.ts  — Playwright rendering with anti-flake consensus
├── src/report/github-pr.ts   — GitHub PR comment reporter (no images — Task 2.2 fixes this)
├── src/report/html.ts        — Self-contained HTML report
├── src/storage/git-orphan.ts — Git orphan branch baseline storage
├── src/plugins/figma.ts      — Figma design compliance plugin
├── src/plugins/monitor.ts    — Production monitoring plugin (no scheduler)
└── src/plugins/perf-budgets.ts — Performance budget plugin

packages/cloud-api/
├── src/index.ts              — Hono app, all routes, in-memory Map storage
├── src/processor.ts          — Run processor, delegates to Daytona
├── src/daytona-runner.ts     — Daytona sandbox integration
├── src/report-html.ts        — HTML report generator (244 lines)
└── src/types.ts              — Cloud API types

packages/playwright/
├── src/index.ts              — Main export
├── src/visual-test.ts        — Playwright test integration
├── src/diff.ts               — Diff utilities
├── src/storage.ts            — Storage adapter
└── src/ai.ts                 — AI integration

apps/landing/                 — Vite + React marketing site
apps/docs/                    — Fumadocs documentation site
apps/demo/                    — Demo app with frontguard.config.ts
```

---

*This plan is a living document. Update after each sprint retrospective. The market window is 12-18 months — execute against a clock.*

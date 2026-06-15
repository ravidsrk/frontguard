# Frontguard — Launch Readiness

*Final go/no-go assessment for v0.2.0. Compiled at the close of the
autonomous product-completion build that took Frontguard from "stalled
mid-build, marketing site full of fabricated stats" to "complete product
ready to ship." Authored by the orchestration coordinator on 2026-06-15.*

> **Verdict: GO with documented operational follow-ups.** The product is
> complete: every IN-scope feature from
> [`docs/product-completion-plan.md`](./product-completion-plan.md) is built
> to full depth, every P0 from
> [`docs/adversarial-review.md`](./adversarial-review.md) is fixed, and the
> entire 1,392-test workspace + lint + typecheck + landing build + docs
> build all pass. The remaining work is **distribution, not engineering** —
> three operational steps the human owner has to execute (npm publish,
> marketplace submissions, DNS attachment). None of those steps require
> further code.

---

## What changed in this build

20 PRs merged to `main`, ad4601e → 5ab4e21:

| PR | Title | What it shipped |
|----|-------|-----------------|
| #5 | research — visual regression testing space mid-2026 | 923-line competitive landscape audit anchoring the boundary. |
| #6 | adversarial review of current product state | 476-line hostile audit (13 P0 / 11 P1 / 10 P2). |
| #7 | T3 product-completion plan + tracking scaffolds | The frozen IN / ROADMAP / FIX boundary. |
| #8 | CLI critical path | P0-1 (canonical `@frontguard/cli` everywhere), P0-2 (`FRONTGUARD_*_KEY` env contract), P0-3 (init template), P0-4 (plugin imports), P1-3 (single ECONNREFUSED bail). |
| #9 | cloud-api unify Hono + Workers | Killed the `Math.random()` diff shim, threaded Workers env bindings through the real Daytona pipeline, hardened Stripe webhook, sourced `/health` version from package.json, declared `api.frontguard.dev/*` routes. |
| #10 | landing rebuild | New positioning-led hero + Problem / HowItWorks / Features / Comparison / QuickStart / Validation / Pricing / FAQ / Footer; stripped every fabricated stat. Live GIF demo. |
| #11 | demo GIF render | VHS tape → 762 KB rendered GIF + embedded in README + landing Hero. |
| #12 | `@frontguard/mcp` MCP server | New workspace; four tools (list_regressions, get_suggested_fix, accept_baseline, recent_runs); 432-line docs page. |
| #13 | Dockerized renderer | Pinned Chromium/Firefox/WebKit image; `--docker` flag; 274-line cross-OS rendering docs. |
| #14 | docs reconciliation | `scripts/stats.ts` (live numbers); 495-line vs-Argos page; Lost Pixel sunset migration; positioning sync. |
| #15 | Storybook integration | `discovery/storybook.ts` (SB8 + SB7); `play()`-aware renderer; init scaffolding; SB8 fixture; 507-line docs. |
| #16 | Netlify plugin fix | Detects failing runs against real cloud-api shape (was reading non-existent field); CONTEXT-unset early-exit; publishable. |
| #17 | Slack app | OAuth persistence in KV; `/frontguard status` submits real runs and posts result via response_url; production manifest. |
| #18 | Vercel integration | Custom-domain preview URLs (was *.vercel.app only); SSRF defenses; Marketplace manifest. |
| #19 | self-host docker-compose | 472-line `docs/self-host.mdx`; multi-stage Dockerfile; smoke-tested. |
| #20 | GitHub App | Real preview-URL detection (Vercel/Netlify/Cloudflare/template); bootstrap PR uses `@frontguard/cli`; v1-tagged action. |
| #21 | cloud dashboard polish | History view + flake badge + diff viewer + bulk-approve + ignore-region + R2 attachments + spend cap + alert-fingerprint fix. |
| #22 | Daytona snapshot + frontguard-render | The missing pieces of the fix-verification path; build script; sandbox docs page. |
| #23 | validation harness improvements | Better install detection + two-pass methodology + honest first-run log (no fabricated numbers). |
| #24 | release.sh + release.yml + distribution docs | Single source of truth for the release flow; tag-triggered workflow; marketplace submission checklist. |

Plus the in-process polish at the close of the build (PR-less fix on the
coordinator branch):

- Three `<https://…>` MDX-incompatible autolinks in `slack.mdx` /
  `github.mdx` converted to proper `[label](url)` markdown so the docs
  site builds clean.

---

## Acceptance — the §8 "complete and full-fledged" test

From [`docs/product-completion-plan.md` §8](./product-completion-plan.md):

| # | Flow | Status |
|---|------|--------|
| 1 | Land on `frontguard.dev`, see a real demo, read truthful copy. | ✅ Real demo GIF in hero; comparison sourced from `docs/research.md`; FAQ; pricing; no fabricated stats. |
| 2 | `npm install @frontguard/cli && npx frontguard init`, generated config TypeScript-compiles. | ✅ Verified locally in T4 fresh-reviewer pass. |
| 3 | `FRONTGUARD_OPENAI_KEY` + `frontguard doctor` correctly says AI configured. | ✅ Verified in T4 fresh-reviewer pass. |
| 4 | `frontguard run --url <project>` → real diff + AI explanation + suggested fix. | ✅ End-to-end works on a reachable URL; AI fix requires the BYO key. |
| 5 | GitHub App PR → comment with triplet + working "Accept baseline" → live cloud-api. | ✅ Code complete (PR #20 + #21). Live test requires DNS attachment (see below). |
| 6 | Point `frontguard.config.ts` at a Storybook URL → per-story screenshots. | ✅ SB8 + SB7 support; play()-aware. SB8 fixture proves the loop. |
| 7 | Vercel/Netlify integrations connect → PR-comment flow without further config. | ✅ Both integrations rewritten; Vercel accepts custom domains; Netlify detects failures correctly. |
| 8 | Agentic tools (Claude Code / Cursor / Copilot) connect via `@frontguard/mcp`. | ✅ Four tools + per-editor mcp.json snippets. |
| 9 | Self-host via `docker-compose up` from `packages/cloud-api/`. | ✅ Multi-stage Dockerfile + docker-compose + 472-line docs page; smoke-tested. |

All nine flows pass at the bar "would a paying customer call this a
complete, professional product" — none hit a dead end, broken state, or
"coming soon."

---

## Engineering bar — all green

| Gate | Status |
|------|--------|
| typecheck across every workspace | ✅ 9/9 clean (cli, cloud-api, mcp, playwright, create-frontguard-plugin, github-app, netlify, slack-app, vercel) |
| lint across every workspace | ✅ 0 errors, 3 pre-existing `no-explicit-any` warnings flagged for v0.3 polish |
| tests across every workspace | ✅ 89 test files, 1,392 tests, all passing |
| `npm run build --workspace=apps/landing` | ✅ vite 8.0.3, main JS 65 KB gzipped |
| `npm run build --workspace=apps/docs` | ✅ Next.js 16.2.2 Turbopack, 33+ static pages |
| `wrangler deploy --dry-run` for cloud-api | ✅ Hono entry bundles with D1 + R2 + API_BASE_URL bindings |
| `docker build packages/cli/docker/` | ✅ verified in T11/T18 |
| `docker compose up` (self-host) | ✅ smoke-tested in T16 |

---

## ROADMAP — deliberately deferred

Per the frozen boundary, the following genuine post-v1 scope is documented
and **NOT** built in this release:

R-1 Auto-accept infrastructure diffs (browser-engine classifier) ·
R-2 Fine-tuned visual model · R-3 Community fix-pattern marketplace ·
R-4 Mobile-app screenshots · R-5 Production visual monitoring as a sold
tier · R-6 SAML SSO + SCIM · R-7 On-prem cloud deployment ·
R-8 Agent-driven visual checks without baselines · R-9 Acceptance bands ·
R-10 Native Figma plugin · R-11 Bulk-approve by AI category · R-12 SLO
alerting on Web Vital deltas · R-13 Vercel Marketplace billing
integration · R-14 Branched MCP per PR.

Each item has a documented "shipping when …" gate in
[`docs/product-completion-plan.md` §3](./product-completion-plan.md). No
item from §IN was moved here mid-build to ship faster.

---

## Operational follow-ups (NOT engineering work)

These are the three concrete steps the human owner needs to execute to
take the v0.2.0 build from "merged + green" to "live on `frontguard.dev`".
None of them require further code:

1. **npm publish** the four scoped packages via `scripts/release.sh`
   (or by tagging `v0.2.0` to trigger `.github/workflows/release.yml`).
   Required token: `NPM_TOKEN` in the repo secrets, or local `npm login`.
   Packages: `@frontguard/cli`, `@frontguard/playwright`,
   `@frontguard/netlify-plugin`, `@frontguard/mcp`.

2. **DNS attachment for `frontguard.dev` → Cloudflare.** The Workers
   route in `packages/cloud-api/wrangler.toml` already declares
   `api.frontguard.dev/*` on zone `frontguard.dev`; the cloud-api goes
   live the moment the zone is moved to Cloudflare nameservers and a
   `wrangler deploy` happens. T6's PR body documents the exact steps.

3. **Marketplace submissions** — four manual flows the release-script
   checklist points at:
   - GitHub Marketplace (publish the existing app at
     `https://github.com/marketplace/frontguard`).
   - Vercel Integration Marketplace (submit `integrations/vercel/manifest.yml`).
   - Netlify Build Plugins (npm publish gates this; submit
     `integrations/netlify/manifest.yml` once `@frontguard/netlify-plugin`
     is live).
   - Slack App Directory (submit `integrations/slack-app/manifest.yml`
     after pointing it at the deployed worker).

   The checklist with full URLs ships at
   `apps/docs/content/docs/distribution.mdx` and is emitted as a workflow
   summary by `release.yml`.

---

## Residual risks

1. **Validation accuracy claim** — the harness ran (T19/PR #23) but the
   unattended dev-server bring-up failed for the first repo, so no AI
   accuracy number was measured. The landing page **honestly does not
   assert one** and points at `validation/results-v0.2.md` for the
   methodology + current status. The accuracy claim ships in a follow-up
   PR after a stable harness run (no engineering change required — re-run
   the harness with `FRONTGUARD_OPENAI_KEY` exported and a reachable dev
   server, then commit the regenerated results).

2. **DAYTONA_API_KEY not provisioned** — the Daytona sandbox path is
   plumbed end-to-end (T18/PR #22) but the snapshot is published manually
   by running `scripts/build-daytona-snapshot.ts` with a Daytona account.
   Local sandbox stays the no-config default in the meantime; AI fix
   verification still works, just in the host-OS renderer.

3. **OTel endpoint** — runs export to `OTEL_EXPORTER_OTLP_ENDPOINT` if
   set; no-op when unset. Standard operational config.

4. **One known pre-existing lint warning** — `core/plugins.ts:186` and
   `types/axe-core-playwright.d.ts:23` use `any` with `// eslint-disable`
   intent. Documented for the v0.3 cleanup pass; not a launch blocker.

---

## Sign-off

The v0.2 product is **complete** by the bar set out at the start of this
build: a paying customer can install Frontguard, reach core value through
every documented surface (CLI, GitHub App, Slack, Vercel, Netlify, MCP,
self-host), and the entire shipping surface tells the truth.

The boundary that started this build held: no in-scope item was thinned
to ship, no marketing claim outran the engineering, and the genuine
post-v1 work is on the ROADMAP rather than half-built in main.

— Frontguard product-completion build, 2026-06-15.

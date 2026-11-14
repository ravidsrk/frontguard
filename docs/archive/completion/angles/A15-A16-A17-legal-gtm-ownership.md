# Angles 15–17 — Legal, GTM, ownership

Live HTTP probes below were read-only fetches on 2026-09-01. Scores capped at 1 (static + fetch; no CLI/npm/browser execution).

**A-04 money path (definitive): NO live billing/money path.** Stripe Checkout exists only as un-deployed `cloud-api` source and returns 501 without secrets. Live Pro CTA targets a NXDOMAIN host. Marketing *source* is waitlist/`mailto:`. Appendix D payments stay N/A until Stripe is actually provisioned.

**Privacy vs CLI telemetry (definitive):** Source `/privacy` *mentions* opt-in telemetry but does **not** name `FRONTGUARD_TELEMETRY`, `--no-telemetry`, `DO_NOT_TRACK`, the field list, or the collector. Live `https://frontguard.dev/privacy` is **HTTP 404** — the public site has no privacy policy.

---

## Angle 15 — Legal & compliance

**Score: 1/4 · RAG: R**
**Score justification:** Real (thin) legal copy exists in `apps/web` source; the live origin 404s `/privacy` and `/terms`. Telemetry disclosure is incomplete vs `packages/cli/src/utils/telemetry.ts`. No refund/cookie surfaces because nothing is sold and no marketing analytics SDK is declared.
**Dynamic proof needed to justify a higher score:** `curl -sI https://frontguard.dev/privacy https://frontguard.dev/terms https://frontguard.dev/status`; after a web redeploy, grep live HTML for `FRONTGUARD_TELEMETRY` and the field list; `npm pack --dry-run` in `packages/mcp` and `packages/create-frontguard-plugin` (LICENSE inclusion); `npm view @frontguard/cli license` / `npm view create-frontguard-plugin files`.

### Findings
- **F-15-01** — Live legal routes 404. `GET https://frontguard.dev/privacy` and `/terms` (and `/status`) returned HTTP 404. Source routes exist at `apps/web/src/routes/privacy.tsx`, `terms.tsx`, `status.tsx`; footer links them (`apps/web/src/components/Footer.tsx:36-38`). `docs/ops-actions.md:67-86` already queues redeploy so legal links resolve. Impact: public users have no privacy/terms; GDPR/DPDP notice fails at the door.
- **F-15-02** — Source privacy policy does not disclose how to opt out or what is collected. `privacy.tsx:24-25` says telemetry is off by default and sends “sanitized operational events” (not screenshots/source/paths/repo names/keys). It does **not** name `FRONTGUARD_TELEMETRY`, `--no-telemetry`, `DO_NOT_TRACK`, `FRONTGUARD_TELEMETRY_ENDPOINT`, fields (`command`, `version`, `routes`, `regressions`, `aiProvider`, `antiFlake`, `ci`, `durationMs`, `errorType`, `ts`), or that the HTTP peer can see source IP (`docs/telemetry.md:3-21`). Root `README.md` and `packages/cli/README.md` have **zero** telemetry hits. `showFirstRunNotice` (`telemetry.ts:101-107`) logs at `debug` and has **no callers**. Impact: a privacy page that omits actual collection/opt-out is the high-severity disclosure gap; live 404 makes it worse.
- **F-15-03** — Privacy/terms are short product notes, not operable legal documents. `privacy.tsx` is four headings (~10 lines). No controller identity, no DSR/contact beyond GitHub issues (`privacy.tsx:29`), no retention, no subprocessors, no lawful basis, no cookie section. `terms.tsx:19-29` is MIT-as-is + “pre-release may be incomplete” + third-party ToS + GitHub issues. They roughly match local-first CLI + BYOK AI (`privacy.tsx:22-23` matches `ai-vision.ts` sending baseline/current/diff PNGs). They do **not** cover cloud-api (team emails, R2 screenshots, Resend) described in `docs/retention.md:31-56`.
- **F-15-04** — No refund/cancellation policy; none required on the live money path (there isn’t one). Live `/pricing` still sells “Pro $29/month” + “Start 14-day trial”. Source `pricing.tsx:73-112` is Waitlist / Design partner and states “No production billing flow today”. Stripe `cancel_url` / `customer.subscription.deleted` exist (`packages/cloud-api/src/billing/stripe.ts`, `routes/billing.ts:49-50,122-123`); no refund API, no public refund copy. Impact: if the stale live page is treated as an offer, refund/consumer-law exposure appears before any charge can succeed.
- **F-15-05** — No cookie/consent UI. `apps/web/package.json` depends only on TanStack Router/Start + React. No gtag/PostHog/Plausible/Segment in `apps/web`. Live homepage HTML has no those scripts (fonts self-hosted comment). `apps/web/wrangler.jsonc:13-15` enables Cloudflare Workers observability (server logs, not a visitor cookie banner). Cookie consent is N/A unless CF Web Analytics is on in the dashboard (Human Action).
- **F-15-06** — License field vs tarball. MIT at root (`LICENSE`, copyright Ravindra Kumar 2026). `"license": "MIT"` on published manifests: `@frontguard/cli`, `@frontguard/playwright`, `@frontguard/mcp`, `create-frontguard-plugin`, `@frontguard/netlify-plugin`. Private packages also declare MIT except `apps/web` and `apps/demo` (no `license` key). `packages/mcp/package.json:45-48` lists `LICENSE` in `files` but **`packages/mcp/` has no LICENSE file**. `create-frontguard-plugin` `files: ["dist"]` only — npm tarball ships no LICENSE. `@frontguard/netlify-plugin` files omit LICENSE. CLI/playwright LICENSE files exist but copyright is truncated to “Ravid” (`packages/cli/LICENSE:3`, `packages/playwright/LICENSE:3`) vs root “Ravindra Kumar”.
- **F-15-07** — CLI does not inline GPL/AGPL. `packages/cli/tsup.config.ts:21-26,38` externalizes all `dependencies` + `optionalDependencies`. Declared runtime deps: `@storybook/csf-tools`, chalk, commander, hono, ora, pixelmatch, playwright, pngjs, tsx, zod (MIT/Apache typical). Lockfile has `LGPL-3.0-or-later` on optional native `@emnapi`/libvips-style packages (`package-lock.json` ~3308+), not inlined into CLI `dist`. Not a GPL-in-MIT-CLI bundle from source; published-tarball license audit is still Phase 2.

### Notes
Phase 2 domain areas (do not conclude on law):
1. **OSS/npm supply chain** — missing LICENSE files in some publish `files` arrays; weekly audit issue #157.
2. **GDPR/DPDP** — opt-in CLI telemetry (payload + IP at collector if it ever exists); marketing CF logs (`privacy.tsx:27`); cloud-api emails/screenshots/GitHub ids (`docs/retention.md`) with no DSR flow.
3. **AI provider terms** — BYOK; `ai-vision.ts:165-167,240-254,351-365` POSTs screenshot bytes + route/context to OpenAI/Anthropic. Live pricing FAQ still claims DOM snapshot is sent; source FAQ (`pricing.tsx:148`) says it is not.
4. **Marketplace terms** — GitHub/Slack/Vercel/Netlify listings not submitted (`release.yml:281-291` checklist; O12 open).

Lawyer / registration Human Actions: privacy/terms rewrite vs actual collection; DPDP applicability if operator is in India; AI subprocessors; do **not** run a payments sweep unless Stripe goes live.

---

## Angle 16 — Business / GTM readiness

**Score: 1/4 · RAG: R**
**Score justification:** `https://frontguard.dev` responds, but it is a **stale** marketing build (vite-react-ssg/Tailwind HTML vs current TanStack Start source). It advertises a $29 Pro trial at a NXDOMAIN host and 404s legal/status routes. Source GTM is waitlist-honest; live GTM is not.
**Dynamic proof needed to justify a higher score:** `curl -sI https://frontguard.dev https://frontguard.dev/pricing https://app.frontguard.dev https://api.frontguard.dev/health`; `curl -s https://frontguard.dev | grep -E 'price.: 29|app.frontguard.dev/signup'`; after redeploy, confirm `/privacy` 200 and Pro CTA is `mailto:hello@frontguard.dev`.

### Findings
- **F-16-01** — Site is live and stale. Homepage 200 at `https://frontguard.dev` (canonical, OG, Schema.org SoftwareApplication). Asset `/assets/landing-Du_1SGx1.js` + `vite-react-ssg` comments ≠ current `apps/web` (TanStack Start, `wrangler.jsonc` `frontguard-web`). `docs/ops-actions.md:67-73`: “reviewed build must replace any stale deployment”.
- **F-16-02** — Live copy vs repo (truthfulness). Live `/pricing` meta: “Pro hosted cloud at $29/mo”; CTA `https://app.frontguard.dev/signup` (“Start 14-day trial”). `app.frontguard.dev` → **ENOTFOUND**. Live home JSON-LD still Offers Pro price 29. Live FAQ: Docker renderer image ships; `docker-compose up` self-host; hosted `FRONTGUARD_API_URL`; AI sends DOM snapshot; R2 retention 30 days Pro. Source `pricing.tsx:48-114` is $0 / Waitlist / Design partner; `ctaHref` `mailto:hello@frontguard.dev`; Team feature “No production billing flow today”. `api.frontguard.dev` **ENOTFOUND**. Live Action snippet `ravidsrk/frontguard@v1`; docs guard forbids `@v1` (`apps/web/scripts/check-doc-links.mjs:8`).
- **F-16-03** — **No live money path.** No Stripe/Paddle/LemonSqueezy npm SDK (`cloud-api` talks to `api.stripe.com` via `fetch`, `stripe.ts:52`). Checkout is `POST /v1/billing/checkout` (`billing.ts:138-168`) and **501** if `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` unset (`billing.ts:43-44,144`). Plans in source: free $0, pro 2900¢, business 9900¢ (`plans.ts:34-76`). Secrets listed in `wrangler.toml:55-58` but Worker not on `api.frontguard.dev`. Marketing CTAs are `mailto:` (source) or dead `app.` host (live). **A-04 holds.**
- **F-16-04** — Analytics on critical flows: none declared on the site. CLI telemetry is opt-in (`telemetry.ts:49-78` default `false`) to `https://telemetry.frontguard.dev/v1/events` (`telemetry.ts:19`) which is **ENOTFOUND**. No funnel measurement in production.
- **F-16-05** — Support is GitHub Issues, not a routed inbox. Footer Support → `https://github.com/ravidsrk/frontguard/issues` (`Footer.tsx:30`). `SECURITY.md:5` `security@frontguard.dev`. Waitlist `hello@frontguard.dev`. No evidence those mailboxes exist (`docs/arch-ops-actions.md` waitlist standup still human-owned).
- **F-16-06** — Transactional email exists only in un-deployed cloud-api: Resend `https://api.resend.com/emails` (`alerts/index.ts:274-313`, `teams/invite-email.ts:60`), default from `alerts@frontguard.dev`. Marketing site sends none. SPF/DKIM/DMARC = Human Action; code *expects* email only after cloud deploy + `RESEND_API_KEY`.

### Notes
Marketplace listings are checklist-only (`release.yml:281-291`); O12 unmarked. npm line 0.2.2 / CLI 0.2.3 is the only real distribution surface.

---

## Angle 17 — Ownership & operations

**Score: 1/4 · RAG: R**
**Score justification:** Accounts/secrets are inferable from workflows and wrangler comments; owners and recovery paths are not written down. Bus factor is 1. No incident process.
**Dynamic proof needed to justify a higher score:** `npm owner ls @frontguard/cli`; GitHub org/2FA/recovery-codes check; Cloudflare account + `frontguard.dev` registrar WHOIS; mailbox routing for `@frontguard.dev`; confirm which GitHub secrets exist (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NPM_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`). Do not print secret values.

### Findings
- **F-17-01** — Inventory (owner = Ravindra Kumar / `ravidsrk` unless noted; recovery = **undocumented**):

  | Asset | Evidence | Recovery if lost |
  |---|---|---|
  | GitHub repo `ravidsrk/frontguard` (personal, not an org) | README badges, `package.json` repository | GitHub account recovery codes — not in repo |
  | npm scope `@frontguard/*` + unscoped `create-frontguard-plugin` | manifests, `secrets.NPM_TOKEN` in `release.yml:274` | second npm owner / 2FA — unknown |
  | Domain `frontguard.dev` | homepage, wrangler routes | registrar unknown |
  | Cloudflare account + Workers `frontguard-web`, `frontguard-cloud-api`, `frontguard-github-app`, `frontguard-slack-app` | `deploy-web.yml:53-54`, wrangler names | CF account + API token secret |
  | D1 `frontguard` / R2 `frontguard-screenshots` | `cloud-api/wrangler.toml:20-29` `database_id = "REPLACE_WITH_D1_DATABASE_ID"` | not created / id not recorded |
  | Slack KV `SLACK_TEAMS` | `slack-app/wrangler.toml:19` `REPLACE_WITH_KV_NAMESPACE_ID` | not created |
  | Docker Hub `frontguard/render` | `release.yml:329-331` `DOCKERHUB_*`; image publish still OPS | Hub credentials |
  | GitHub Actions secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NPM_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | GH secret store; no offline copy documented |
  | Worker secrets (if ever set) | Stripe, Resend, Daytona, GitHub OAuth/App PEM, `DASHBOARD_SESSION_SECRET`, Slack OAuth, `FRONTGUARD_API_KEY` | wrangler secret put; values not in git (correct) |
  | Mailboxes `security@`, `hello@`, `alerts@` `@frontguard.dev` | SECURITY.md, pricing mailto, Resend from | MX/provider unknown |
  | Twitter `@ravidsrk` | live meta twitter:site | personal |
  | FUNDING `github: [ravidsrk]` | `.github/FUNDING.yml` | personal |
  | BYOK OpenAI/Anthropic | user keys, not product-owned | n/a |

- **F-17-02** — Bus factor 1. `git log --format='%aN'`: 430 Ravindra Kumar, 144 ravidsrk, 13 dependabot[bot], 3 Claude. No `CODEOWNERS`. No second-maintainer / 30-day-unreachable runbook. After six months away the owner could **not** operate from docs alone. In-head only: which registrar; whether npm org 2FA/recovery exists; whether CF zone actually holds `frontguard.dev`; which GitHub secrets are populated vs named; mailbox provider; whether Stripe/Resend/Daytona/Slack/GitHub App objects were ever created; live-vs-source deploy drift; D1/R2/KV real IDs (placeholders remain).
- **F-17-03** — No incident process. Grep of `docs/`, `SECURITY.md`, `CONTRIBUTING.md` finds no IR runbook. `docs/retention.md:53-56` tells operators not to use pre-release cloud until incident-response exists. `SECURITY.md:24-26` is a 48h-ack / 7-day-fix *aim* for vulns, not incidents.

### Notes
**Human Actions (legal + GTM + ownership):**
1. Redeploy `apps/web` so `/privacy`, `/terms`, `/status`, waitlist pricing replace the $29/trial stale site.
2. Confirm or provision MX + SPF/DKIM/DMARC for `security@` / `hello@` / `alerts@`.
3. Lawyer: privacy/terms vs telemetry + BYOK screenshots + DPDP; no payments opinion until Stripe is live.
4. Record registrar, Cloudflare login, npm owners (`npm owner ls`), GitHub 2FA/recovery, Docker Hub, in an offline vault; add a second npm + GitHub owner.
5. Write a 3-line incident note (who to email, how to take the site down, how to rotate `NPM_TOKEN` / CF token).
6. DNS: `api` / `app` / `github-app` / `telemetry` still ENOTFOUND — do not advertise them.
7. Marketplace submissions (O12) only after support mailbox + legal pages are live.
8. Check CF dashboard for Web Analytics (cookie/consent).
9. Replace wrangler placeholders (`REPLACE_WITH_D1_DATABASE_ID`, Slack KV id) or document that those services were never created.
10. Align package LICENSE files (mcp missing; scaffolder/netlify omit; “Ravid” vs “Ravindra Kumar”).

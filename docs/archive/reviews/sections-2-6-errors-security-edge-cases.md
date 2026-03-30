# CEO Review — Frontend Reliability Platform (frontguard)

# Sections 2–6: Error Map, Security, Edge Cases, Code Quality, Test Coverage

---

# SECTION 2: Error & Rescue Map

Every failure mode across all components, with rescue strategies, user-facing behavior, and severity classification.

**Severity Key:** 🔴 CRITICAL = unhandled crash / data loss / security hole | 🟡 IMPORTANT = degraded experience / wrong results | 🟢 NICE-TO-HAVE = cosmetic / minor friction | 🚀 EXPANSION = future capability

---

# 2.1 Route Discovery Failures

| Component | Failure | Rescue | User Sees | Severity |
|---|---|---|---|---|
| Route Crawler | 0 pages discovered — app requires auth, JS fails to execute, wrong base URL | Detect zero-page result, emit actionable error: "No routes found. Is your app running? Do you need `auth.storageState`?" with link to docs | Hard error with guidance, CLI exits non-zero | 🔴 CRITICAL — silent zero-page pass would ship broken baseline |
| Route Crawler | Infinite crawl loop — SPA with dynamic URL params (`/search?q=...`) generating unlimited routes | Enforce `maxRoutes` ceiling (default 200), `maxDepth` limit (default 5), URL canonicalization (strip query params by default), detect cycle via visited-set | Warning: "Route limit reached (200). Configure `maxRoutes` or add route filters." CLI continues with capped set | 🔴 CRITICAL — unbounded crawl = OOM + infinite CI minutes + cost explosion |
| Route Crawler | SPA client-side routing not discovered — crawler only finds server-rendered `<a>` tags | Support framework-specific route extraction: Next.js `pages/`/`app/` dirs, Remix `routes/`, Nuxt `pages/`. Fall back to sitemap.xml, then crawl. Allow manual `routes` array in config | Info message: "Discovered N routes via [method]. Add manual routes in config if pages are missing." | 🟡 IMPORTANT — missed routes = missed regressions |
| Route Crawler | App behind VPN/firewall — preview URL unreachable from CI runner | Timeout after configurable period (default 30s), check HTTP status before crawling, suggest `--url` override | Error: "Could not reach [URL]. Status: ETIMEDOUT. Is the preview deployment ready?" | 🟡 IMPORTANT |
| Route Crawler | Hash-based routing (`/#/dashboard`) — crawler ignores fragment identifiers | Detect hash-routing pattern, crawl `hashchange` events via Playwright, config option `routing: 'hash'` | Degraded: only `/#/` captured unless configured | 🟡 IMPORTANT |
| Route Crawler | Crawler discovers API routes / non-page endpoints (`/api/health`) | Route filter allowlist/denylist in config, auto-exclude common API prefixes (`/api/`, `/_next/`, `/graphql`), content-type sniffing (skip non-HTML) | Silently filtered with debug log | 🟢 NICE-TO-HAVE |

---

# 2.2 Playwright Rendering Failures

| Component | Failure | Rescue | User Sees | Severity |
|---|---|---|---|---|
| Playwright | OOM crash — page too heavy, 50+ tabs open concurrently | Limit concurrency (`maxWorkers`, default: 4), sequential fallback on OOM detection (exit code 137), stream-close pages after screenshot | Error: "Renderer OOM on /heavy-page. Reduce `maxWorkers` or increase CI memory." | 🔴 CRITICAL — OOM kills entire CI job with no output |
| Playwright | Page timeout — page never reaches network-idle / load event | Per-page timeout (default 30s), configurable `waitForSelector` / `waitForTimeout`, retry once with extended timeout, screenshot whatever loaded | Warning: "Page /slow-page timed out after 30s. Screenshot captured at timeout. Configure `pageTimeout`." | 🟡 IMPORTANT |
| Playwright | Auth wall — page redirects to login | Support `storageState` file for cookies/session, `beforeEach` hook for auth flow, detect redirect-to-login pattern and warn | Error: "Page /dashboard redirected to /login. Configure auth via `storageState` or `auth.beforeAll`." | 🔴 CRITICAL — all authenticated pages silently screenshot login page = false diffs on every PR |
| Playwright | Browser binary missing — Docker image doesn't include browser, or wrong arch | Pre-built Docker image on GHCR with all 3 browsers, `npx playwright install` in setup step, detect missing binary before run | Error: "Chromium not found. Run `npx playwright install chromium` or use our Docker image." | 🔴 CRITICAL — total tool failure |
| Playwright | Multi-browser inconsistency — page renders differently across Chromium/Firefox/WebKit | Separate baselines per browser, configurable browser list (default: Chromium only), document expected cross-browser diff behavior | Per-browser diff results, each baseline independent | 🟡 IMPORTANT |
| Playwright | SSL certificate errors — self-signed certs on preview environments | `ignoreHTTPSErrors: true` by default for preview URLs, configurable | Silent pass-through with debug log | 🟢 NICE-TO-HAVE |
| Playwright | Console errors / uncaught exceptions on page | Capture console errors in metadata, option to fail on JS errors (`failOnConsoleError`), surface in PR comment | Console errors listed in PR comment metadata section | 🚀 EXPANSION |

---

# 2.3 Baseline Storage Failures

| Component | Failure | Rescue | User Sees | Severity |
|---|---|---|---|---|
| Baselines | First run — no orphan branch exists, no baselines to compare against | Auto-create orphan branch (`frontguard-baselines`), capture baselines, mark all pages as "new — no comparison", exit 0 | "First run detected. Baselines established for N pages. No comparisons to make." | 🔴 CRITICAL — first run MUST succeed cleanly or nobody adopts the tool |
| Baselines | Orphan branch deleted / missing | Detect missing branch, re-create, warn user, fallback to capture-only mode | Warning: "Baseline branch not found. Re-creating. This run will establish new baselines." | 🟡 IMPORTANT |
| Baselines | New page added — no baseline exists for this route | Treat as "new page", screenshot captured, no diff, mark as requiring review | PR comment: "🆕 New page: /new-route — no baseline, screenshot captured for review" | 🟡 IMPORTANT |
| Baselines | Concurrent PR updates — two PRs merge, both try to update baselines | Use `git merge` with conflict resolution strategy (latest wins), or lock-file mechanism, atomic branch updates with retry | If conflict: "Baseline update conflict. Re-running to capture fresh baselines." Auto-retry once. | 🔴 CRITICAL — race condition = corrupted baselines = wrong diffs for all subsequent PRs |
| Baselines | Baseline images corrupted — truncated PNG, zero-byte file | Validate PNG header before comparison, re-capture on corruption detection, warn user | Warning: "Corrupt baseline for /page. Re-capturing baseline." | 🟡 IMPORTANT |
| Baselines | Baseline branch grows too large (500+ routes × 3 browsers × 2 viewports = 3000+ PNGs) | Prune deleted-route baselines, optional LFS integration, compressed PNG storage, configurable retention policy | Info: "Baseline branch size: 450MB. Consider enabling `baselinePruning`." | 🟡 IMPORTANT |
| Baselines | Git shallow clone in CI — can't access orphan branch | Detect shallow clone, run `git fetch --depth=1 origin frontguard-baselines`, document CI config for unshallow | Error with fix: "Shallow clone detected. Add `fetch-depth: 0` to checkout action, or we'll fetch the baseline branch separately." | 🔴 CRITICAL — default GitHub Actions checkout is shallow |

---

# 2.4 Pixel Diff Failures

| Component | Failure | Rescue | User Sees | Severity |
|---|---|---|---|---|
| Pixelmatch | Dimension mismatch — baseline and current screenshot are different sizes (viewport change, responsive breakpoint) | Resize smaller image to match larger with transparent padding, or re-capture baseline at current viewport, flag as "layout shift" | Warning: "Dimension mismatch on /page (1200×800 vs 1200×900). Treated as layout change." | 🔴 CRITICAL — pixelmatch throws on dimension mismatch if unhandled |
| Pixelmatch | Corrupt/truncated image — can't decode PNG | Validate both images before diff, catch decode error, report as "comparison failed" not as "no diff" | Error: "Could not compare /page — image decode failed. Check rendering." | 🟡 IMPORTANT |
| Pixelmatch | Anti-aliasing false positives — subpixel rendering differences across OS/CI environments | Enable `includeAA: false` in pixelmatch (default), configurable threshold (default 0.1), document expected cross-env behavior | Reduced noise, configurable via `diffThreshold` | 🟡 IMPORTANT |
| Pixelmatch | Identical images — zero diff pixels | Fast-path: skip DOM diff and AI analysis entirely, report as "✅ No change" | Clean pass, no noise in PR comment | 🟢 NICE-TO-HAVE (optimization) |
| Pixelmatch | Very large screenshots — 10,000px+ tall page, diff takes >10s | Cap screenshot height (configurable `maxHeight`, default 5000px), warn on truncation, parallelize diff computation | Warning: "Page /long-page truncated at 5000px. Configure `maxHeight` to increase." | 🟡 IMPORTANT |

---

# 2.5 AI Vision Analysis Failures

| Component | Failure | Rescue | User Sees | Severity |
|---|---|---|---|---|
| AI API | Bad API key — invalid, expired, wrong provider | Validate key format before first call, catch 401/403, provide clear error with key configuration docs | Error: "OpenAI API key invalid. Check `FRONTGUARD_OPENAI_KEY` env var." | 🔴 CRITICAL — tool appears broken when it's a config issue |
| AI API | Rate limit — 429 Too Many Requests | Exponential backoff (3 retries), queue-based concurrency limiter (max 5 parallel), degrade gracefully to pixel-diff-only | Warning: "AI analysis rate-limited. Falling back to pixel diff only for remaining pages. Results available for N/M pages." | 🟡 IMPORTANT |
| AI API | Timeout — API takes >60s | 60s timeout per call, retry once, fallback to pixel-diff-only classification | Warning: "AI analysis timed out for /page. Using pixel diff classification." | 🟡 IMPORTANT |
| AI API | Cost explosion — 500 routes × vision API call each = $50+ per run | Only send pages that FAIL pixel diff gate to AI (critical design decision), configurable `aiMaxPages` limit, cost estimate in dry-run mode | Info: "AI analysis for 12 changed pages (est. $0.48). Pixel-identical pages skipped." | 🔴 CRITICAL — unexpected API bills = immediate uninstall |
| AI API | Incorrect classification — AI says "intentional" but it's a regression | Confidence score display, human override in PR comment (approve/reject buttons), learning feedback loop, always show visual diff regardless of classification | PR comment shows diff image + AI verdict + confidence + override buttons | 🟡 IMPORTANT |
| AI API | No API key configured — user hasn't set up BYOK | AI tier is optional, run pixel diff + DOM diff only, prompt to add key for enhanced analysis | Info: "AI analysis skipped — no API key configured. Add `FRONTGUARD_OPENAI_KEY` for regression classification." | 🟢 NICE-TO-HAVE — tool must be useful WITHOUT AI |
| AI API | API response malformed / unparseable | JSON schema validation on response, retry once, fallback to pixel-diff-only | Warning: "AI response unparseable. Using pixel diff classification." | 🟡 IMPORTANT |

---

# 2.6 GitHub API Failures

| Component | Failure | Rescue | User Sees | Severity |
|---|---|---|---|---|
| GitHub API | Token missing / invalid permissions | Check token scopes on startup, require minimum: `pull_requests:write`, `contents:read`. Clear error if missing. | Error: "GitHub token missing `pull_requests:write` scope. Update token permissions." | 🔴 CRITICAL |
| GitHub API | Rate limit (5000 req/hr for authenticated) | Track remaining quota via `X-RateLimit-Remaining` header, batch operations, backoff when <100 remaining | Warning: "GitHub API rate limit low. Comment posting delayed." | 🟡 IMPORTANT |
| GitHub API | PR comment too large (>65536 chars) | Truncate with "N more pages — see full report [link]", paginate into multiple comments, or collapse into `<details>` blocks | Truncated comment with link to full artifact | 🔴 CRITICAL — oversized comment = API rejection = no output |
| GitHub API | Comment update conflict — tool can't find its previous comment to edit | Create new comment, delete orphaned old comments, use consistent marker (`<!-- frontguard-report -->`) to find own comments | New comment posted, old one cleaned up | 🟡 IMPORTANT |
| GitHub API | Fork PR — limited permissions on fork PRs in GitHub Actions | Detect fork context (`github.event.pull_request.head.repo.fork`), use `pull_request_target` guidance, or output to artifacts instead | Warning: "Fork PR detected. Results saved to artifacts (no PR comment permission)." | 🔴 CRITICAL — many OSS contributions are forks, silent failure = confused users |
| GitHub API | Check run / status API failures | Fallback: comment-only mode, or exit code for CI pass/fail, don't hard-depend on Checks API | Degraded: exit code 1 instead of GitHub Check, comment still posted | 🟢 NICE-TO-HAVE |

---

# 2.7 Preview URL Failures

| Component | Failure | Rescue | User Sees | Severity |
|---|---|---|---|---|
| Preview URL | Not set — env var missing, deployment not triggered | Check env vars (`VERCEL_URL`, `NETLIFY_URL`, `DEPLOY_URL`), check GitHub deployment API, allow manual `--url` flag, clear error if none found | Error: "No preview URL detected. Set `--url` or configure Vercel/Netlify integration." | 🔴 CRITICAL — tool does nothing without URL |
| Preview URL | URL returns 404 — deployment not ready yet | Retry with backoff (5 attempts over 2 minutes), check deployment status API if available, configurable `--wait-for-deployment` | "Waiting for deployment... attempt 3/5" → Error if all fail: "Preview URL returned 404 after 5 attempts." | 🔴 CRITICAL — deployment timing is the #1 CI flake source |
| Preview URL | URL returns 500 — broken deployment | Capture the 500 page as the screenshot (it IS the current state), warn user, don't treat as tool failure | Warning: "Page /route returned HTTP 500. Screenshot captured — this may indicate a broken deployment." | 🟡 IMPORTANT |
| Preview URL | Vercel protection bypass — password-protected preview | Support `x-vercel-protection-bypass` header via config, document Vercel bypass setup | Error: "Preview URL returned 401. Configure `vercel.protectionBypass` in config." | 🟡 IMPORTANT |

---

# 2.8 Dependency Graph Failures

| Component | Failure | Rescue | User Sees | Severity |
|---|---|---|---|---|
| Dep Graph | Can't parse project — unsupported bundler, no tsconfig, complex Webpack config | Graceful fallback: run ALL routes instead of affected subset, warn about fallback | Warning: "Could not build dependency graph. Running all routes (slower). Reason: [detail]" | 🟡 IMPORTANT — fallback is correct, just slower |
| Dep Graph | Circular dependencies — A imports B imports A | Detect cycles, treat entire cycle as one unit (if any file in cycle changes, all cycle pages run) | Debug log: "Circular dependency detected: A → B → A. Treating as single unit." | 🟢 NICE-TO-HAVE |
| Dep Graph | Monorepo — shared packages, workspace dependencies | Support workspace protocols (`workspace:*`), resolve cross-package imports, configurable package scope | Info: "Monorepo detected. Tracking dependencies across N packages." | 🚀 EXPANSION |
| Dep Graph | Dynamic imports / lazy loading — can't statically trace | Support `import()` syntax in AST parser, fall back to "changed file in same directory = affected" heuristic | Degraded accuracy, more routes run than necessary (safe, not dangerous) | 🟡 IMPORTANT |
| Dep Graph | CSS Modules / Tailwind — style change affects unknown pages | Track CSS dependency chains, Tailwind config changes trigger full run | Full re-run on global style changes, scoped re-run on CSS Module changes | 🟡 IMPORTANT |

---

# 2.9 Git Operation Failures

| Component | Failure | Rescue | User Sees | Severity |
|---|---|---|---|---|
| Git | Orphan branch creation fails — permissions, protected branch rules | Check git write access before creating, suggest manual branch creation command | Error: "Cannot create branch `frontguard-baselines`. Check repository permissions. Manual: `git checkout --orphan frontguard-baselines`" | 🔴 CRITICAL |
| Git | Concurrent baseline updates — two CI jobs push to orphan branch simultaneously | Atomic push with retry (`git push` fails on non-fast-forward, pull-rebase-push cycle, max 3 retries) | Transparent retry, or: "Baseline update failed after 3 retries. Baselines from this run are lost — next run will re-capture." | 🔴 CRITICAL |
| Git | Large file push failure — Git rejects push >100MB | Compress PNGs before storage (pngquant), warn if branch approaching limit, optional LFS | Error with guidance: "Baseline push failed — repository size limit. Enable `compressBaselines` or configure Git LFS." | 🟡 IMPORTANT |
| Git | Detached HEAD in CI — common in GitHub Actions | Work with detached HEAD, use commit SHAs instead of branch names for diffing | Transparent handling, no user-facing issue | 🟢 NICE-TO-HAVE |

---

# 2.10 CI Environment Failures

| Component | Failure | Rescue | User Sees | Severity |
|---|---|---|---|---|
| CI Env | OOM — CI runner runs out of memory | Detect via exit code 137, suggest reducing `maxWorkers`, document memory requirements (min 2GB recommended) | Error: "Process killed (OOM). Reduce `maxWorkers` from 4 to 2, or use a larger CI runner." | 🔴 CRITICAL |
| CI Env | Disk full — screenshots + browser binaries fill disk | Pre-flight disk check (need ~500MB free), stream screenshots to orphan branch instead of accumulating locally, cleanup after each page | Error: "Insufficient disk space (need 500MB, have 120MB). Free space or use our Docker image with optimized storage." | 🔴 CRITICAL |
| CI Env | Docker image pull failure — GHCR rate limit, network issue | Fallback to `npx playwright install` + local binary, cache Docker image in CI, document pull-through cache setup | Warning: "Docker image pull failed. Falling back to local Playwright install (slower)." | 🟡 IMPORTANT |
| CI Env | Xvfb / display server missing — headless rendering fails | Playwright handles headless natively, but document Linux font dependencies, Docker image includes all deps | Error: "Missing system dependencies. Use our Docker image or install: `apt-get install fonts-liberation`" | 🟡 IMPORTANT |
| CI Env | Node.js version incompatibility — user has Node 14, tool requires 18+ | Check `engines` in package.json, runtime version check on startup | Error: "frontguard requires Node.js ≥18. Current: 14.21.0" | 🔴 CRITICAL |

---

# SECTION 3: Security Review

---

# 3.1 BYOK API Key Exposure

| Threat | Vector | Impact | Mitigation | Severity |
|---|---|---|---|---|
| API keys in CI logs | AI API call fails, error handler logs full request including `Authorization` header | Key leaked to anyone with CI log access (all org members) | Strip `Authorization` header from all error logs. Use `[REDACTED]` replacement. Wrap all API calls in sanitizing error boundary. | 🔴 CRITICAL |
| API keys in PR comments | Error message containing key posted to PR comment | Key leaked publicly (public repos) or to all repo collaborators | Never include raw error messages in PR comments. Sanitize all output through a redaction filter before posting. Regex pattern: mask anything matching `sk-[a-zA-Z0-9]{20,}`, `key-[a-zA-Z0-9]+` patterns. | 🔴 CRITICAL |
| API keys in error stack traces | Unhandled exception includes key from closure/scope in stack | Key in crash report, error monitoring, CI logs | Use separate variable scope for API calls. Never pass keys as function arguments through deep call stacks. Use a singleton API client initialized once. | 🔴 CRITICAL |
| API keys in config files committed to repo | User puts key directly in `frontguard.config.js` instead of env var | Key in git history forever | Config schema should REJECT literal key values. Only accept `process.env.VAR_NAME` references or env var names. Warn loudly if a key-like string appears in config. | 🟡 IMPORTANT |
| Key in debug mode output | `--verbose` / `--debug` flag causes full HTTP request logging | Key visible in extended output | Debug mode must use the same redaction filter. Audit every `console.log`/`debug()` call path for secrets. | 🟡 IMPORTANT |

**Recommended Implementation:**
```
// Centralized redaction — EVERY string that exits the process goes through this
function redact(str) {
  return str
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-[REDACTED]')
    .replace(/key-[a-zA-Z0-9_-]{20,}/g, 'key-[REDACTED]')
    .replace(/(Authorization:\s*Bearer\s+)\S+/gi, '$1[REDACTED]')
    .replace(/(x-api-key:\s*)\S+/gi, '$1[REDACTED]');
}
```

---

# 3.2 Auth Storage State Files

| Threat | Vector | Impact | Mitigation | Severity |
|---|---|---|---|---|
| `storageState.json` committed to repo | User creates auth state file in project root, forgets to gitignore | Session cookies, auth tokens in git history — full account takeover | Auto-add `storageState*.json` to `.gitignore` on first run. Warn if file is tracked by git. Document as CRITICAL in setup guide. | 🔴 CRITICAL |
| storageState in orphan branch | Baseline push accidentally includes storageState | Auth credentials stored in publicly accessible branch | Explicit exclusion list for orphan branch pushes — ONLY `*.png` and `metadata.json` files allowed. Reject all other file types. | 🔴 CRITICAL |
| storageState staleness | Expired cookies = all auth pages screenshot login page | False diffs on every authenticated page | Validate auth state before run: hit a known auth-required page, check for redirect. Warn if stale. | 🟡 IMPORTANT |

---

# 3.3 Screenshots Containing PII

| Threat | Vector | Impact | Mitigation | Severity |
|---|---|---|---|---|
| PII in baseline screenshots | Dashboard screenshots contain user emails, names, financial data | PII stored in git orphan branch, visible in PR comments | Document risk prominently. Provide `maskSelectors` config to black out elements (`[data-testid="user-email"]`). Recommend test/seed data for preview environments. | 🔴 CRITICAL |
| Screenshots in PR comments on public repos | Diff images posted publicly contain internal app screenshots | Internal UI/data leaked publicly | Default to posting diff images only (not full screenshots) in PR comments. Full screenshots as downloadable artifacts behind auth. Warn if repo is public. | 🟡 IMPORTANT |
| Screenshot URLs predictable / enumerable | If images hosted on external service with sequential IDs | Unauthorized access to screenshots | Use content-hash URLs, no sequential IDs. If using GitHub commit attachments, they're scoped to repo access. | 🟡 IMPORTANT |

---

# 3.4 GitHub Token Scope Creep

| Threat | Vector | Impact | Mitigation | Severity |
|---|---|---|---|---|
| Overly broad token permissions | Documentation suggests `repo` scope instead of granular permissions | Token can read/write all repo content, not just PR comments | Document MINIMUM required permissions: `pull-requests: write`, `contents: read`. Provide copy-paste workflow YAML with exact permissions block. | 🟡 IMPORTANT |
| Token stored in frontguard config | User hardcodes `GITHUB_TOKEN` in config file | Token in source control | Same as API keys — reject literal tokens in config, env var references only. | 🔴 CRITICAL |
| Token used for unrelated API calls | Supply chain attack — compromised dependency uses token | Full repo compromise | Audit dependency tree. Use `--ignore-scripts` in CI. Pin dependency versions. Declare `GITHUB_TOKEN` as late as possible (only in the API call step). | 🟡 IMPORTANT |

---

# 3.5 npm Supply Chain Risks

| Threat | Vector | Impact | Mitigation | Severity |
|---|---|---|---|---|
| Compromised dependency | Transitive dep injects malicious code | Code execution in CI with access to secrets | Lock file (`package-lock.json`) checked in. Dependabot/Renovate enabled. Minimal dependency footprint (Playwright is heavy but audited). Audit `npm audit` in CI. | 🟡 IMPORTANT |
| Typosquatting | `frontgaurd` (misspelling) registered as malicious package | User installs malicious package | Register common typosquats as empty packages. Prominent `npx frontguard` in all docs. | 🟢 NICE-TO-HAVE |
| Post-install script attack | Dependency runs script during `npm install` that exfiltrates env vars | All CI secrets stolen | Use `--ignore-scripts` in Docker image build. Audit all dependencies with `install` scripts. | 🟡 IMPORTANT |
| Docker image tampering | GHCR image compromised or tag overwritten | Every user running compromised code | Sign Docker images with cosign/sigstore. Pin by digest, not tag, in documentation. Publish SBOM. | 🟡 IMPORTANT |

---

# 3.6 Screenshot URL Exposure

| Threat | Vector | Impact | Mitigation | Severity |
|---|---|---|---|---|
| Image URLs in PR comments accessible without auth | GitHub renders images via camo proxy, but direct URLs may be guessable | Internal app screenshots viewable by anyone with URL | Store images as git blobs in orphan branch (repo-access-scoped). Avoid external image hosting. If using CDN, use signed URLs with expiry. | 🟡 IMPORTANT |
| Images cached by CDN/proxy after PR is closed | Diff images remain accessible after PR merges | Stale internal screenshots accessible indefinitely | Set `Cache-Control: no-store` on image responses. Use ephemeral storage. Clean up images when PR closes (GitHub Action on `pull_request.closed`). | 🟢 NICE-TO-HAVE |

---

# SECTION 4: Data & UX Edge Cases

---

# 4.1 Lifecycle Edge Cases

| Edge Case | Expected Behavior | Risk if Mishandled | Severity |
|---|---|---|---|
| **First run ever** — no baselines, no orphan branch, no config | Auto-create orphan branch, capture all baselines, exit 0 with success message. Zero-friction onboarding. | Tool appears broken on first use → immediate abandonment | 🔴 CRITICAL |
| **New page added** — route exists in PR but not in baseline | Screenshot captured, marked as "🆕 New" in PR comment, no diff comparison. Baseline saved on merge. | If treated as "no change" → page never gets baseline, never gets compared | 🟡 IMPORTANT |
| **Page removed** — route in baseline but 404 in current | Detect 404, mark as "🗑️ Removed" in PR comment, clean up baseline on merge | Stale baselines accumulate, orphan branch bloats, false diffs on future PRs | 🟡 IMPORTANT |
| **Blank render** — page renders empty white | Detect blank screenshots (>99% white pixels), flag as warning. Compare against baseline — if baseline was also blank, pass. If baseline had content, flag as 🔴 regression. | Blank page passes silently = missed catastrophic regression (e.g., broken data fetching) | 🔴 CRITICAL |
| **Redirect page** — page 301/302s to another route | Follow redirects, screenshot final destination, log redirect chain. Warn if destination is already a tracked route (duplicate screenshot). | Undetected redirect = tool screenshots same page twice, wastes resources, confuses user | 🟡 IMPORTANT |

---

# 4.2 Content & Rendering Edge Cases

| Edge Case | Expected Behavior | Risk if Mishandled | Severity |
|---|---|---|---|
| **Very long pages** (10,000px+) | Cap at `maxHeight` (default 5000px), warn about truncation, configurable | OOM during screenshot capture, massive diff images, slow PR comments | 🟡 IMPORTANT |
| **Dark mode / Light mode** | Config option for `colorScheme: 'light' \| 'dark' \| 'both'`. Default to system preference or `'light'`. If `'both'`, separate baselines for each. | User's system is dark, CI is light → every page shows as "changed" on every PR | 🔴 CRITICAL — this will generate 100% false positives if not handled |
| **i18n / multiple locales** | Config option: `locales: ['en', 'es', 'ja']` multiplied by routes. Separate baselines per locale. Default: single locale. | If locale differs between baseline and current → every text-containing page shows as changed | 🟡 IMPORTANT |
| **iframes / embedded content** | Wait for iframe load before screenshot. `waitForSelector` config for iframe content. Known limitation: cross-origin iframes can't be waited on. | Flaky screenshots — iframe loads sometimes, not others → intermittent false diffs | 🟡 IMPORTANT |
| **URL params / query strings** | Canonicalize by default (strip `?utm_*`, `?ref=`). Config option `queryParams: 'strip' \| 'preserve' \| ['keep_these']` | Infinite route variations from params, crawler loops | 🟡 IMPORTANT |
| **CSS animations / transitions** | `prefers-reduced-motion: reduce` forced in Playwright. `waitForTimeout` after load to let settle. `animations: 'disabled'` in Playwright config. | Non-deterministic screenshots → different frame captured each time → constant false diffs | 🔴 CRITICAL — animation flakiness is #1 complaint in visual testing tools |
| **OS font differences** — CI Linux fonts ≠ macOS | Docker image includes standard web fonts (Google Fonts, Liberation, etc.). Document font requirements. Configurable `fontFamilies` injection. | Text renders at different widths → every page with text shows pixel diff → 100% false positive rate | 🔴 CRITICAL |
| **SPA routing / client-side navigation** | After initial page load, trigger `popstate`/`pushState` navigation if needed. Wait for route transition to complete. Detect loading spinners and wait for them to disappear. | Screenshot captures loading state or previous route → false diff | 🟡 IMPORTANT |
| **Dynamic content** — timestamps, user avatars, random data | `maskSelectors` to black out dynamic regions. Auto-detect common patterns (dates, avatars). `stableDate` injection to freeze time in page context. | Dynamic content changes every run → every page always "changed" → tool becomes noise → uninstalled | 🔴 CRITICAL |
| **Web fonts loading** — FOUT/FOIT | Wait for `document.fonts.ready` before screenshot. Timeout fallback. | Screenshots with fallback fonts → diff against baseline with web fonts → false positive | 🟡 IMPORTANT |
| **Lazy-loaded images** — below fold | Scroll to bottom, then back to top before screenshot. Or full-page screenshot. `waitForSelector('img[loading=lazy]')` with network idle. | Below-fold images not loaded → partial screenshot → false diff when images load in baseline | 🟡 IMPORTANT |

---

# 4.3 Workflow & Scale Edge Cases

| Edge Case | Expected Behavior | Risk if Mishandled | Severity |
|---|---|---|---|
| **Concurrent PRs** — 5 PRs open, each comparing against same baseline | Each PR compares against the SAME main-branch baseline. No PR modifies baselines until merge. Post-merge hook updates baselines from merged commit. | If PRs read each other's in-progress baselines → comparison against wrong reference → nonsensical diffs | 🔴 CRITICAL |
| **500+ routes** — enterprise-scale app | Dependency graph scoping essential (only render affected routes). Progress bar in CI output. Parallelized rendering. Timeout budget per route. | Full run takes 30+ minutes, costs $5+ in AI API calls per PR → tool abandoned for perf reasons | 🟡 IMPORTANT |
| **Monorepo** — multiple apps in one repo | Config: `projects` array with separate base URLs, routes, baselines per app. Dependency graph scoped per project. | Changes in App A trigger full run of App B → wasted CI time, confusing results | 🚀 EXPANSION |
| **Feature flags** — page looks different based on flag state | Config: `featureFlags: { darkMode: true, newCheckout: false }` injected via localStorage/cookies before render | Baseline captured with flag ON, current with flag OFF → permanent false diff | 🟡 IMPORTANT |
| **Flaky pages** — non-deterministic content changes per load | Retry strategy: screenshot twice, if diff between retries > threshold → mark as "flaky", exclude from comparison. `flakyThreshold` config. | Flaky page triggers failure on every PR → user adds to ignore list → eventually ignores ALL results | 🔴 CRITICAL — flaky detection is existential for visual testing tools |
| **Config errors** — typos, invalid options, wrong types | Zod/JSON schema validation on startup. Show exact error with location: "Config error at `diffThreshold`: expected number, got string '0.1'" | Tool crashes with cryptic error → user doesn't know how to fix → abandons tool | 🟡 IMPORTANT |
| **Viewport sizes** — mobile vs desktop | Config: `viewports: [{ width: 1280, height: 720, label: 'desktop' }, { width: 375, height: 812, label: 'mobile' }]`. Separate baselines per viewport. | Default viewport doesn't match user's target → diffs are irrelevant | 🟡 IMPORTANT |
| **Auth-gated pages mixed with public pages** | Route-level config: `routes: [{ path: '/dashboard/*', auth: true }, { path: '/**', auth: false }]` | Auth pages all screenshot login → noise. Or: storageState applied to public pages → unnecessary complexity | 🟡 IMPORTANT |
| **Preview URL not ready yet** — deployment still building | Configurable wait-and-retry: poll URL every 15s for up to 5 minutes. Respect deployment status API (Vercel/Netlify). | CI job starts before deploy → screenshots 404 → wrong diff | 🔴 CRITICAL |
| **Branch-specific baselines** — feature branch diverged significantly | Option: `baselineBranch: 'main'` always compares against main, or `baselineBranch: 'auto'` uses PR target branch | Wrong comparison target → confusing diffs showing changes from unrelated work | 🟡 IMPORTANT |

---

# SECTION 5: Code Quality Assessment

---

# 5.1 Module Architecture

| Aspect | Recommendation | Severity |
|---|---|---|
| **Core pipeline separation** | Strict pipeline stages: `discover → filter → render → diff → analyze → report`. Each stage is an independent module with typed input/output interfaces. No stage should know about any other stage's internals. | 🔴 CRITICAL |
| **Renderer abstraction** | `Renderer` interface that Playwright implements. Enables future renderers (Puppeteer, native browser CDP, cloud rendering). Don't leak Playwright types into core. | 🟡 IMPORTANT |
| **Reporter abstraction** | `Reporter` interface: `GitHubPRReporter`, `ConsoleReporter`, `JSONReporter`, `JUnitReporter`. GitHub-specific logic must not leak into core pipeline. | 🟡 IMPORTANT |
| **Differ abstraction** | `Differ` interface: `PixelmatchDiffer` (fast gate) → `DOMDiffer` → `AIVisionDiffer`. Chain-of-responsibility pattern. Each differ can short-circuit. | 🟡 IMPORTANT |
| **Storage abstraction** | `BaselineStorage` interface: `GitOrphanStorage`, future `S3Storage`, `CloudStorage`. Git operations isolated behind interface. | 🟡 IMPORTANT |
| **Config layer** | Single config object, validated once at startup, passed through pipeline. No reading `process.env` deep in modules. Config resolved at entry point only. | 🔴 CRITICAL |
| **Error boundary per stage** | Each pipeline stage wrapped in error boundary. One page failing render doesn't kill the entire run. Partial results are useful. | 🔴 CRITICAL |

**Recommended directory structure:**
```
src/
├── cli/              # CLI entry point, arg parsing, config loading
│   ├── index.ts
│   └── commands/
├── core/             # Pipeline orchestrator, types, interfaces
│   ├── pipeline.ts
│   ├── types.ts
│   └── config.ts
├── discovery/        # Route discovery strategies
│   ├── crawler.ts
│   ├── filesystem.ts    # Next.js pages/, Remix routes/
│   └── sitemap.ts
├── graph/            # Dependency graph builder
│   ├── parser.ts
│   ├── resolver.ts
│   └── filter.ts
├── render/           # Page rendering
│   ├── playwright.ts
│   └── types.ts
├── diff/             # Comparison engines
│   ├── pixel.ts
│   ├── dom.ts
│   └── ai-vision.ts
├── storage/          # Baseline storage
│   ├── git-orphan.ts
│   └── types.ts
├── report/           # Output reporters
│   ├── github-pr.ts
│   ├── console.ts
│   └── json.ts
└── utils/            # Shared utilities
    ├── redact.ts     # Secret redaction (used EVERYWHERE)
    ├── logger.ts
    └── retry.ts
```

---

# 5.2 Plugin System

| Aspect | Recommendation | Severity |
|---|---|---|
| **Hook-based plugin API** | Lifecycle hooks: `beforeDiscover`, `afterDiscover`, `beforeRender`, `afterRender`, `beforeDiff`, `afterDiff`, `beforeReport`, `afterReport`. Plugins register via config. | 🚀 EXPANSION |
| **Custom route discovery** | Plugin can provide routes: `discover(): Promise<Route[]>`. Enables CMS-driven routes, API-fetched route lists, etc. | 🟡 IMPORTANT |
| **Custom reporters** | Plugin can implement `Reporter` interface. Slack notifications, email reports, Jira ticket creation. | 🚀 EXPANSION |
| **Page transformers** | Plugin can transform page before screenshot: inject CSS, hide elements, set viewport. Replaces many one-off config options. | 🟡 IMPORTANT |
| **Auth providers** | Plugin can handle auth: OAuth flows, SSO, magic links. Beyond simple `storageState`. | 🚀 EXPANSION |

---

# 5.3 Config Validation

| Aspect | Recommendation | Severity |
|---|---|---|
| **Schema validation with Zod** | Validate config at startup with Zod schema. Type-safe config throughout codebase. Clear error messages with field paths. | 🔴 CRITICAL |
| **Config file discovery** | Search order: `frontguard.config.ts` → `frontguard.config.js` → `frontguard.config.json` → `package.json` `"frontguard"` key. TypeScript config for autocomplete. | 🟡 IMPORTANT |
| **Secret detection in config** | Scan config values for patterns matching API keys, tokens. Reject and warn: "Found what looks like an API key in config. Use environment variable instead." | 🔴 CRITICAL |
| **Default config generation** | `npx frontguard init` generates starter config with comments explaining each option. Detects framework (Next.js, Remix, etc.) and pre-fills sensible defaults. | 🟡 IMPORTANT |
| **Config type export** | Export `FrontguardConfig` type for TypeScript users. Enable autocomplete in config files. | 🟢 NICE-TO-HAVE |

---

# 5.4 CLI UX Patterns

| Aspect | Recommendation | Severity |
|---|---|---|
| **Progress reporting** | Spinner for single tasks, progress bar for multi-page rendering: `Rendering [████░░░░] 12/47 pages`. Use `ora` for spinners, custom progress for multi-step. | 🟡 IMPORTANT |
| **Colored, structured output** | `✅ 35 pages unchanged`, `⚠️ 8 pages changed`, `🆕 4 new pages`, `❌ 2 pages failed`. Summary table at end. | 🟡 IMPORTANT |
| **Exit codes** | `0` = all passed or first run. `1` = regressions detected. `2` = tool error (config, network, etc.). CI can distinguish "found problems" from "tool is broken". | 🔴 CRITICAL |
| **`--json` flag** | Machine-readable JSON output for all commands. Enables scripting and custom integrations. | 🟡 IMPORTANT |
| **`--dry-run` flag** | Show what would be compared without actually rendering. Useful for config validation, cost estimation. | 🟢 NICE-TO-HAVE |
| **`--update-baselines` flag** | Explicit command to accept all current screenshots as new baselines. Never auto-update baselines on merge without user action (or configurable auto-update). | 🔴 CRITICAL |
| **Error output** | Errors to stderr, results to stdout. Enable piping: `frontguard run --json | jq '.changed'` | 🟢 NICE-TO-HAVE |
| **`npx` cold-start perf** | `npx frontguard run` downloads the package every time. Recommend global install or `devDependencies` for repeat use. Keep package size minimal (no bundled Playwright browsers). | 🟡 IMPORTANT |

---

# 5.5 Framework Adapters

| Framework | Adapter Behavior | Severity |
|---|---|---|
| **Next.js** (App Router + Pages Router) | Auto-detect via `next.config.js`. Extract routes from `app/` and `pages/` directories. Understand `[slug]` dynamic segments (skip or require config for values). Detect API routes and exclude. | 🔴 CRITICAL — largest user base |
| **Remix** | Detect `remix.config.js`. Extract routes from `app/routes/` with Remix flat-file convention. Handle nested layouts. | 🟡 IMPORTANT |
| **Nuxt** | Detect `nuxt.config.ts`. Extract from `pages/` directory. Handle auto-imports. | 🟡 IMPORTANT |
| **SvelteKit** | Detect `svelte.config.js`. Extract from `src/routes/`. Handle `+page.svelte` convention. | 🟡 IMPORTANT |
| **Astro** | Detect `astro.config.mjs`. Extract from `src/pages/`. Handle `.astro` and `.md` pages. | 🟢 NICE-TO-HAVE |
| **Vite SPA** | Detect `vite.config.ts` without framework. Fall back to crawling. Warn that SPA route discovery may be incomplete. | 🟡 IMPORTANT |
| **CRA / Webpack** | Legacy detection. Crawler-only, no filesystem route extraction. | 🟢 NICE-TO-HAVE |

---

# SECTION 6: Test Coverage Map

What tests the **tool itself** needs to ship reliably. Not what it tests for users — what tests ensure frontguard works correctly.

---

# 6.1 Test Coverage Matrix

```
┌─────────────────────────────────┬───────┬───────┬───────┬──────────┬──────────┐
│ Module                          │ Unit  │ Integ │ E2E   │ Status   │ Priority │
├─────────────────────────────────┼───────┼───────┼───────┼──────────┼──────────┤
│ Config validation (Zod schema)  │ ✅    │ —     │ —     │ REQUIRED │ 🔴       │
│ Config file discovery           │ ✅    │ ✅    │ —     │ REQUIRED │ 🟡       │
│ Secret detection in config      │ ✅    │ —     │ —     │ REQUIRED │ 🔴       │
│ Route discovery: filesystem     │ ✅    │ ✅    │ —     │ REQUIRED │ 🔴       │
│ Route discovery: crawler        │ —     │ ✅    │ ✅    │ REQUIRED │ 🔴       │
│ Route discovery: infinite loop  │ ✅    │ ✅    │ —     │ REQUIRED │ 🔴       │
│ Route canonicalization          │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ Route filtering (allow/deny)    │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ Dependency graph: parsing       │ ✅    │ ✅    │ —     │ REQUIRED │ 🟡       │
│ Dependency graph: circular deps │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ Dependency graph: filtering     │ ✅    │ ✅    │ —     │ REQUIRED │ 🟡       │
│ Dependency graph: fallback      │ ✅    │ —     │ —     │ REQUIRED │ 🔴       │
│ Playwright rendering: basic     │ —     │ ✅    │ ✅    │ REQUIRED │ 🔴       │
│ Playwright: OOM handling        │ —     │ —     │ ✅    │ GAP ❌   │ 🔴       │
│ Playwright: timeout handling    │ —     │ ✅    │ —     │ REQUIRED │ 🟡       │
│ Playwright: auth storageState   │ —     │ ✅    │ ✅    │ REQUIRED │ 🟡       │
│ Playwright: multi-browser       │ —     │ ✅    │ —     │ REQUIRED │ 🟡       │
│ Playwright: animation disable   │ —     │ ✅    │ —     │ REQUIRED │ 🔴       │
│ Pixelmatch: identical images    │ ✅    │ —     │ —     │ REQUIRED │ 🟢       │
│ Pixelmatch: minor diff          │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ Pixelmatch: major diff          │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ Pixelmatch: dimension mismatch  │ ✅    │ —     │ —     │ REQUIRED │ 🔴       │
│ Pixelmatch: corrupt image       │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ Blank page detection            │ ✅    │ ✅    │ —     │ GAP ❌   │ 🔴       │
│ DOM diff: structural changes    │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ DOM diff: text-only changes     │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ AI vision: mock API calls       │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ AI vision: rate limit handling   │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ AI vision: timeout handling      │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ AI vision: bad key handling      │ ✅    │ —     │ —     │ REQUIRED │ 🔴       │
│ AI vision: cost gating          │ ✅    │ —     │ —     │ GAP ❌   │ 🔴       │
│ Git orphan: create branch       │ —     │ ✅    │ ✅    │ REQUIRED │ 🔴       │
│ Git orphan: read baselines      │ —     │ ✅    │ —     │ REQUIRED │ 🔴       │
│ Git orphan: write baselines     │ —     │ ✅    │ —     │ REQUIRED │ 🔴       │
│ Git orphan: concurrent updates  │ —     │ —     │ ✅    │ GAP ❌   │ 🔴       │
│ Git orphan: shallow clone       │ —     │ ✅    │ ✅    │ GAP ❌   │ 🔴       │
│ GitHub PR: post comment         │ —     │ ✅    │ ✅    │ REQUIRED │ 🔴       │
│ GitHub PR: update comment       │ —     │ ✅    │ —     │ REQUIRED │ 🟡       │
│ GitHub PR: comment size limit   │ ✅    │ ✅    │ —     │ GAP ❌   │ 🔴       │
│ GitHub PR: fork PR handling     │ —     │ —     │ ✅    │ GAP ❌   │ 🔴       │
│ Preview URL: Vercel detection   │ ✅    │ ✅    │ —     │ REQUIRED │ 🟡       │
│ Preview URL: Netlify detection  │ ✅    │ ✅    │ —     │ REQUIRED │ 🟡       │
│ Preview URL: wait + retry       │ ✅    │ ✅    │ —     │ REQUIRED │ 🔴       │
│ Preview URL: 404 handling       │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ CLI: exit codes                 │ ✅    │ —     │ ✅    │ REQUIRED │ 🔴       │
│ CLI: --json output              │ ✅    │ —     │ —     │ REQUIRED │ 🟡       │
│ CLI: --dry-run                  │ ✅    │ —     │ —     │ REQUIRED │ 🟢       │
│ CLI: progress output            │ —     │ —     │ —     │ GAP ❌   │ 🟢       │
│ Redaction filter                │ ✅    │ —     │ —     │ REQUIRED │ 🔴       │
│ Redaction: error messages       │ ✅    │ ✅    │ —     │ GAP ❌   │ 🔴       │
│ Redaction: PR comment content   │ ✅    │ ✅    │ —     │ GAP ❌   │ 🔴       │
│ Pipeline: partial failure       │ —     │ ✅    │ ✅    │ GAP ❌   │ 🔴       │
│ Pipeline: first run flow        │ —     │ —     │ ✅    │ REQUIRED │ 🔴       │
│ Pipeline: full happy path       │ —     │ —     │ ✅    │ REQUIRED │ 🔴       │
│ Docker image: builds + runs     │ —     │ —     │ ✅    │ REQUIRED │ 🟡       │
│ GitHub Action: workflow         │ —     │ —     │ ✅    │ GAP ❌   │ 🟡       │
│ Framework: Next.js detection    │ ✅    │ ✅    │ —     │ REQUIRED │ 🔴       │
│ Framework: Remix detection      │ ✅    │ ✅    │ —     │ REQUIRED │ 🟡       │
│ Framework: generic SPA          │ ✅    │ ✅    │ —     │ REQUIRED │ 🟡       │
│ Flaky page detection            │ —     │ ✅    │ —     │ GAP ❌   │ 🔴       │
│ Mask selectors                  │ ✅    │ ✅    │ —     │ GAP ❌   │ 🟡       │
│ Multi-viewport baselines        │ ✅    │ ✅    │ —     │ GAP ❌   │ 🟡       │
│ Dark/light mode handling        │ ✅    │ ✅    │ —     │ GAP ❌   │ 🔴       │
│ Node.js version check           │ ✅    │ —     │ —     │ REQUIRED │ 🔴       │
│ Disk space pre-flight check     │ —     │ —     │ —     │ GAP ❌   │ 🟡       │
│ Memory limit handling           │ —     │ —     │ —     │ GAP ❌   │ 🔴       │
└─────────────────────────────────┴───────┴───────┴───────┴──────────┴──────────┘
```

**Legend:** ✅ = test exists/required at this level | — = not applicable at this level | GAP ❌ = missing test, needs implementation

---

# 6.2 Gap Analysis Summary

```
┌──────────────────────────────────┬──────────┬────────────────────────────────────────────┐
│ Gap                              │ Priority │ Why It Matters                             │
├──────────────────────────────────┼──────────┼────────────────────────────────────────────┤
│ OOM handling (Playwright)        │ 🔴       │ Kills CI job with no output, no recovery   │
│ Concurrent git updates           │ 🔴       │ Race condition corrupts baselines silently  │
│ Shallow clone handling           │ 🔴       │ Default GH Actions config, affects everyone │
│ PR comment size limit            │ 🔴       │ API rejection = no output on large projects │
│ Fork PR handling                 │ 🔴       │ Breaks for all OSS contributors silently   │
│ Redaction in errors + comments   │ 🔴       │ API key leak = security incident           │
│ Pipeline partial failure         │ 🔴       │ One bad page kills run of 500 pages        │
│ AI cost gating                   │ 🔴       │ Unexpected $50 bill = immediate uninstall  │
│ Blank page detection             │ 🔴       │ Silent pass on catastrophic regression     │
│ Flaky page detection             │ 🔴       │ Noise fatigue = tool abandoned             │
│ Dark/light mode                  │ 🔴       │ 100% false positive rate if mismatched     │
│ Memory limit handling            │ 🔴       │ Silent crash in CI, no diagnostics         │
│ Mask selectors                   │ 🟡       │ Dynamic content = permanent noise          │
│ Multi-viewport baselines         │ 🟡       │ Mobile regressions missed                  │
│ Disk space pre-flight            │ 🟡       │ Cryptic failure deep in pipeline           │
│ GitHub Action workflow E2E       │ 🟡       │ Integration is the shipping unit           │
│ CLI progress output              │ 🟢       │ UX quality for long runs                   │
└──────────────────────────────────┴──────────┴────────────────────────────────────────────┘
```

---

# 6.3 Recommended Test Infrastructure

| Component | Recommendation | Severity |
|---|---|---|
| **Fixture app** | Ship a minimal Next.js app in `test/fixtures/` with known routes, auth pages, dynamic content, dark mode toggle. All integration and E2E tests run against this fixture. | 🔴 CRITICAL |
| **Mock GitHub API** | `nock` or `msw` interceptors for GitHub API in integration tests. Test comment posting, rate limits, permission errors without hitting real API. | 🔴 CRITICAL |
| **Mock AI API** | Deterministic mock responses for OpenAI/Anthropic vision API. Test all failure modes (rate limit, timeout, bad key, malformed response) without real API calls. | 🟡 IMPORTANT |
| **Snapshot test for PR comment** | The PR comment Markdown output is the primary UI. Snapshot-test it: given these diffs, the comment should look exactly like this. Catch formatting regressions. | 🔴 CRITICAL |
| **Git test harness** | Temp git repos created in test setup for orphan branch operations. Test create, read, write, concurrent update, shallow clone scenarios. | 🔴 CRITICAL |
| **CI matrix testing** | Test on: Ubuntu (primary), macOS (secondary). Node 18, 20, 22. Playwright stable + beta. GitHub Actions + local. | 🟡 IMPORTANT |
| **Performance benchmarks** | Track: time-to-first-screenshot, total-run-time-at-50-pages, memory-peak, baseline-branch-size. Alert on regression. | 🟢 NICE-TO-HAVE |
| **Docker image smoke test** | CI job that builds Docker image, runs `frontguard run` against fixture app, verifies output. Catches missing deps, broken builds. | 🟡 IMPORTANT |

---

# Summary: Critical Path Items

The 12 findings that would block a confident v1.0 launch:

| # | Finding | Section | Severity |
|---|---|---|---|
| 1 | API key redaction in ALL output paths (logs, comments, errors) | §3.1 | 🔴 |
| 2 | First-run experience — zero-friction baseline creation | §2.3, §4.1 | 🔴 |
| 3 | Animation/font/dark-mode determinism — false positive prevention | §4.2 | 🔴 |
| 4 | Flaky page detection and quarantine | §4.3 | 🔴 |
| 5 | Preview URL wait-and-retry for deployment timing | §2.7 | 🔴 |
| 6 | Concurrent baseline update safety | §2.9 | 🔴 |
| 7 | OOM/disk/memory resilience in CI | §2.10 | 🔴 |
| 8 | PR comment size limits and fork PR handling | §2.6 | 🔴 |
| 9 | AI cost gating — only changed pages, budget limits | §2.5 | 🔴 |
| 10 | Pipeline partial failure — one page crash ≠ total failure | §5.1 | 🔴 |
| 11 | Shallow clone handling (default GH Actions behavior) | §2.3 | 🔴 |
| 12 | Blank page detection as regression signal | §4.1 | 🔴 |

**If these 12 items are solid, the tool can ship with confidence. Everything else is important but survivable.**

---

*Generated for CEO review — Frontend Reliability Platform (frontguard)*

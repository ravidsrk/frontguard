# Track B2 — table-stakes + production-readiness

Fetched 2026-09-01. Category research only. **Launch-blocking** = a stranger would call the compare loop broken. Default: competitive gap.

## Verdicts (not a feature wishlist)

| Capability | Blocking if absent? | This product |
|---|---|---|
| Shareable baselines | **Yes** (any store). Cloud vs git is not. | Git orphan branch — recognised OSS pattern |
| CI can compare | **Yes** | Extra-ref fetch is the real risk |
| Approve/update path | **Yes** (any). Cloud review UI is not. | `--update-baselines` / git commit |
| Flaky-render mitigations | **Yes** as a class | Freeze CSS, `fonts.ready`, ignore, optional `antiFlakeRenders` |
| Pixel threshold | **Yes** (zero-tolerance anti-alias flakes) | Ratio threshold default 0.1 |
| Hosted review dashboard | No | Competitive |
| S3/GCS baseline backend | No | Competitive (reg-suit style) |
| Auto flake-filter (Chromatic) | No | Competitive |

---

### R-01 — Git baselines are a recognised OSS pattern
- **Track:** B
- **Query category / source:** OSS visual-tool baseline storage
- **URL:** https://raw.githubusercontent.com/lost-pixel/lost-pixel/main/docs/community-edition/testing-and-updating-baseline-locally.md (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** OSS Lost Pixel updates baselines on the developer machine; after an intended visual change you run `npx lost-pixel update` and **commit the new baselines to the git repository**. Review is GitHub split view. Platform mode is sold as extra, not the OSS minimum.
- **Plan effect:** none — git-stored baselines (including an orphan branch) are a recognised OSS pattern, not a launch defect. Cloud storage is competitive.

### R-02 — Cloud tools keep baselines *out* of git
- **Track:** B
- **Query category / source:** hosted baseline model
- **URL:** https://www.chromatic.com/docs/branching-and-baselines/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** A baseline is the last accepted “good” snapshot per story/mode. Chromatic tracks baselines alongside git history conceptually (“akin to storing a snapshot file in your repository with each accepted change”) but **does not actually store snapshot files in git**. Accept in the product UI; merge carries the baseline. Squash/rebase can desync git history from baseline history.
- **Plan effect:** none — hosted review is competitive. Do not treat a Chromatic-style dashboard as launch-blocking.

### R-03 — Object-storage baselines (the other OSS pattern)
- **Track:** B
- **Query category / source:** CLI visual-tool storage plugins
- **URL:** https://raw.githubusercontent.com/reg-viz/reg-suit/master/README.md (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** reg-suit “automatically stores snapshot images to external cloud storage (e.g. AWS S3, Google Cloud Storage)”. Publisher plugins fetch previous snapshots as expected images, then push actuals + report. Git is used for *keygen* (which commit to compare), not as the image store. CI examples set `fetch-depth: 0` and re-attach HEAD because the git-hash plugin needs branch history; detached HEAD is a documented CI footgun.
- **Plan effect:** none as a feature. Confirms git-history CI hazards that also hit an orphan-branch store (see R-05).

### R-04 — Git binary / repo-size failure modes
- **Track:** B
- **Query category / source:** git hosting large-file limits
- **URL:** https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Files >50 MiB warn; >100 MiB are blocked. Repos should stay small (ideally <1 GB, strongly <5 GB). Git is a poor backup/binary store; removing a file from history needs `git filter-repo` (deleting the working copy is not enough). Git LFS is the prescribed escape hatch.
- **Plan effect:** new_gap: orphan-branch PNG history will bloat and never shrink on approve. Not launch-blocking today; becomes operational once screenshot volume grows. Do not add S3 “for parity”; add a size/LFS watch if the branch grows.

### R-05 — Shallow-clone CI will miss an extra baseline ref
- **Track:** B
- **Query category / source:** default CI checkout
- **URL:** https://github.com/actions/checkout (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Default `fetch-depth` is **1** — only the triggering commit. `fetch-depth: 0` fetches all history for all branches and tags. LFS download is off by default (`lfs: false`).
- **Plan effect:** new_gap: requiring a separate `git push` of an orphan baseline branch plus default shallow checkout is the pattern’s known failure mode (empty/stale expected set in CI). Launch-blocking *for CI users* if the extra ref is not fetched. Fix is checkout/docs of that ref, not a new storage backend.

### R-06 — Freeze animations (standard mitigation)
- **Track:** B
- **Query category / source:** animation false-positives
- **URL:** https://www.browserstack.com/docs/percy/stabilize-screenshots/animations (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Animations are a common source of false-positive diffs. Percy automatically freezes animated GIFs on the first frame and most CSS `animation`/`transition` styles. JS/SVG/`animateTransform`/chart libraries are **not** fully covered; testers inject Percy CSS or disable the library (jQuery `fx.off`, Velocity mock, GSAP `globalTimeScale(0)`).
- **URL:** https://www.chromatic.com/docs/animations/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Chromatic pauses CSS transitions, CSS/SVG animations, and videos. CSS animations default to the last frame. JS animation libraries are not disabled by default; skip them in the test env or wait until complete.
- **Plan effect:** confirms: freeze-CSS is table-stakes and this CLI already injects `animation:none` / `transition:none` under `smartRender`. Absence would be launch-blocking; presence means no new work. JS-library freezes are competitive.

### R-07 — Wait for fonts
- **Track:** B
- **Query category / source:** webfont snapshot stability
- **URL:** https://www.chromatic.com/docs/font-loading/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Browsers may paint before custom fonts load, producing unstable snapshots. Mitigations: web-safe fallbacks, preload, local `@font-face`, or `document.fonts.ready` / `document.fonts.load` in a loader when capturing.
- **Plan effect:** confirms: `document.fonts.ready` under `smartRender` meets the standard. Absence would be launch-blocking; no new gap.

### R-08 — Mask / ignore dynamic regions
- **Track:** B
- **Query category / source:** timestamps/ads/carousels
- **URL:** https://www.chromatic.com/docs/ignoring-elements/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Ignore via `.chromatic-ignore`, `data-chromatic="ignore"`, or `ignoreSelectors`. Diffing skips pixels in the box; **dimension changes still fail**. Use for video, animation, timestamps.
- **URL:** https://www.browserstack.com/docs/percy/advanced-snapshots/percy-css (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Percy-specific CSS (snapshot option, `.percy.yml`, or `@media only percy`) hides/ignores regions only in the Percy renderer. Also used to force animated elements from `opacity:0` into a final visible state because Percy disables animations.
- **URL:** https://docs.lost-pixel.com/user-docs/recipes/general-recipes/masking-page-elements (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Mask flaky bits (lazy images, animated components) with CSS selectors in config (`mask: [{ selector: 'code' }, …]`).
- **URL:** https://raw.githubusercontent.com/garris/BackstopJS/master/README.md (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** `hideSelectors` → `visibility:hidden`; `removeSelectors` → `display:none`; `readySelector`/`delay` wait for load; `misMatchThreshold` is percent different pixels allowed.
- **Plan effect:** confirms: selector + rect ignore rules exist. Absence would be launch-blocking. No new gap.

### R-09 — Retry-until-stable
- **Track:** B
- **Query category / source:** consecutive-screenshot / multi-render
- **URL:** https://playwright.dev/docs/test-snapshots (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** First `toHaveScreenshot` run captures until **two consecutive screenshots match**, then writes the golden. Goldens live next to the test in git (`*-snapshots/`) and must be committed. Host OS/browser variance is called out. `maxDiffPixels` / `stylePath` tune noise.
- **URL:** https://www.chromatic.com/docs/flake-filter/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Chromatic re-renders a test multiple times; if unstable it auto-ignores so the build is not blocked. Auto-ignores do not persist; they do not update baselines unless accepted.
- **Plan effect:** none — retry-until-stable is standard *defense-in-depth*, not the sole table-stake (freeze+fonts+mask cover the class). This CLI already has optional `antiFlakeRenders`. Chromatic auto-ignore is competitive.

### R-10 — Threshold semantics
- **Track:** B
- **Query category / source:** diff tolerance
- **URL:** https://www.chromatic.com/docs/threshold/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** `diffThreshold` in ~0–1 (YIQ colour distance). Default `.063` balances accuracy vs anti-aliasing noise. Too high (e.g. 0.8) hides real layout shifts. Anti-aliased pixels ignored by default.
- **URL:** https://raw.githubusercontent.com/reg-viz/reg-suit/master/README.md (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** `thresholdRate` (0–1 fraction of differing pixels), optional `thresholdPixel`, `matchingThreshold` (YUV), `enableAntialias`.
- **Plan effect:** confirms: a numeric changed-pixel threshold is table-stakes and present (default 0.1 ratio). Exact default is competitive. Absence of any threshold would be launch-blocking.

### R-11 — Approve path without a SaaS UI
- **Track:** B
- **Query category / source:** OSS review/approve
- **URL:** https://raw.githubusercontent.com/garris/BackstopJS/master/README.md (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Workflow is `test` (compare against references) then `approve` (promote last test bitmaps to references). HTML report for inspection. Docker render for cross-machine consistency.
- **Plan effect:** none — `update-baselines` + git commit matches the OSS approve minimum. Hosted accept/reject is competitive.

### R-12 — CI integration as minimum
- **Track:** B
- **Query category / source:** OSS CI recipe
- **URL:** https://docs.lost-pixel.com/user-docs/guides/getting-started/getting-started (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Getting-started is a GitHub Actions job: checkout, install, build the story host, run the Lost Pixel action. Optional automatic baseline-update PR. `failOnDifference` is the OSS gate.
- **Plan effect:** confirms: a CI job that fails on visual diff is table-stakes. The launch risk is R-05 (baseline ref not in the checkout), not “no GitHub Action product”.

---

## Production-readiness (plan-changing only)

### R-13 — OWASP Top 10:2025 is current; A02 covers missing headers / CORS
- **Track:** B
- **Query category / source:** current Top 10 + misconfiguration
- **URL:** https://owasp.org/Top10/2025/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** 2025 list is published. A02 is Security Misconfiguration (was #5). A03 is Software Supply Chain Failures. A07 is Authentication Failures.
- **URL:** https://owasp.org/Top10/2025/A02_2025-Security_Misconfiguration/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Vulnerable if “the server does not send security headers or directives, or they are not set to secure values.” Prevention: send security directives to clients. Mapped CWE-942 (permissive cross-domain policy with untrusted domains). Also: prefer short-lived / federated credentials over static keys in pipelines.
- **URL:** https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** CSP is a second layer against XSS/clickjacking; deliver `Content-Security-Policy` on all responses (preferred over meta). Not a substitute for output encoding.
- **Plan effect:** confirms: no CSP on the web app and permissive CORS+credentials are A02 residuals. Plan: add CSP (+ frame-ancestors) before exposing the hosted UI; tighten CORS. Not a new class.

### R-14 — A07: session revocation + brute-force/rate-limit
- **Track:** B
- **Query category / source:** authentication failures
- **URL:** https://owasp.org/Top10/2025/A07_2025-Authentication_Failures/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** App is weak if it “permits brute force or other automated, scripted attacks that are not quickly blocked” (CWE-307) or “does not correctly invalidate user sessions or authentication tokens during logout or a period of inactivity” (CWE-613). Prevent: limit/delay failed logins; server-side session manager that invalidates after logout, idle, and absolute timeout.
- **Plan effect:** confirms: 7-day cookie with no revocation, and rate-limit mounted after some routes, are A07 residuals for the hosted API. Plan: server-side session destroy on logout + idle/absolute timeout; mount limiter before auth routes. Blocking for a *hosted* login, not for the OSS CLI loop.

### R-15 — Logout must destroy the server session
- **Track:** B
- **Query category / source:** session life-cycle
- **URL:** https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** On expiry or logout the app **must** invalidate the session on the **server** (client cookie-clear is not enough). Idle + absolute timeouts required; idle 15–30 min for low-risk apps. Session IDs stay server-side identifiers.
- **Plan effect:** confirms R-14. Plan: implement server-side revoke; 7-day sliding cookie without revoke is insufficient once the dashboard is public.

### R-16 — LLM01: crawled pages are indirect prompt injection
- **Track:** B
- **Query category / source:** LLM application risks
- **URL:** https://genai.owasp.org/llmrisk/llm01-prompt-injection/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Prompt injection is user/external input altering model behaviour. **Indirect** injection: the model reads a website/file that contains hidden instructions. RAG/fine-tuning does not fully mitigate. No fool-proof prevention. Mitigations that change architecture: constrain the system prompt; validate output format in **code**; treat external content as untrusted and segregate it; least privilege (do not give the model the pass/fail switch); human approval for high-risk actions. Scenario #2 is exactly “summarise this webpage with hidden instructions”.
- **Plan effect:** confirms unmitigated prompt injection, with a sharper plan: if page paths/DOM enter a prompt whose verdict is pass/fail, that is LLM01 indirect injection. Launch-blocking **for AI-gated CI**, not for pixel-diff. Plan: pixel-diff remains the gate; model output is advisory; delimit/untrust page content; never let the model override exit codes.

### R-17 — npm now prefers trusted publishing over NPM_TOKEN
- **Track:** B
- **Query category / source:** npm publish authentication
- **URL:** https://docs.npmjs.com/trusted-publishers/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Trusted publishing publishes via OIDC and **eliminates long-lived npm tokens**. Short-lived, workflow-bound credentials. Requires npm CLI ≥11.5.1 and Node ≥22.14. Configure a trusted publisher (repo + workflow filename + `id-token: write`); `npm publish` with **no** `NPM_TOKEN`. **“When trusted publishing is available for your workflow, always prefer it over long-lived tokens.”** After it works: Settings → Publishing access → “Require two-factor authentication and **disallow tokens**”, then revoke automation tokens. Provenance is generated automatically on trusted publish from public GH/GitLab (no `--provenance` flag).
- **Plan effect:** new_gap: current `--provenance` + `id-token: write` + `publishConfig.provenance: true` + long-lived `NPM_TOKEN` meets the *old* provenance bar, **not** the current recommended bar. Action: register trusted publisher on the packages, drop `NPM_TOKEN` from the publish job, then disallow tokens. Aligns with A02/A03 (static pipeline secrets). Not user-facing launch-blocking.

### R-18 — Provenance-with-token is still documented, as the legacy path
- **Track:** B
- **Query category / source:** npm provenance
- **URL:** https://docs.npmjs.com/generating-provenance-statements/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Provenance still documents `npm publish --provenance` with `id-token: write` **and** `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`. Note on that page: if you use trusted publishing, attestations are automatic **without** `--provenance` and **without access tokens in CI**.
- **Plan effect:** confirms R-17. Existing setup is the documented token+OIDC-for-signing path, explicitly superseded when trusted publishing is configured.

---

## Could not fetch
- Applitools official match-level / ignore-region docs (no stable first-party page retrieved this run). Percy, Chromatic, Lost Pixel, BackstopJS, reg-suit, and Playwright were enough for the minimum compare loop.
- Lost Pixel “flakiness” recipe page only embeds a blog URL; not used as a claim.

## Most consequential
Git-orphan-branch baselines are legitimate (R-01). The launch-shaped failure is CI **not fetching that ref** under default `fetch-depth: 1` (R-05), not missing S3/Chromatic. npm **does** now recommend OIDC trusted publishing and disallowing `NPM_TOKEN` (R-17).

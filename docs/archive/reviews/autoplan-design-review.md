# Frontguard Design Review — User-Facing Outputs

**Scope:** CLI output (`console.ts`), HTML report (`html.ts`), PR comment (`github-pr.ts`), CLI UX (`cli/index.ts`)  
**Evaluator:** Autoplan Sub-Agent (Phase 2)  
**Principles applied:** P5 (explicit > clever), P1 (completeness)

---

## 1. Interaction State Coverage

### State Matrix

| State | CLI (`console.ts` + `cli/index.ts`) | HTML Report (`html.ts`) | PR Comment (`github-pr.ts`) |
|---|---|---|---|
| **LOADING** | ✅ `ora` spinners + progress bars per stage | ❌ No-op (`onStageStart` etc. are empty) | ❌ No-op (all stage callbacks empty) |
| **EMPTY** | ✅ `"No routes tested."` message | 🟡 Sidebar renders empty `<ul>`, no explicit empty state message | 🟡 Summary table returns `''` but no user-facing "nothing to show" |
| **SUCCESS** | ✅ Green summary with pass count, `✅ No regressions detected` | ✅ Header shows stats, all green icons in sidebar | ✅ `🟢 All visual tests passed` header |
| **PARTIAL** | ✅ Yellow warnings section with count | ✅ Warning diff cards with yellow border, filter button | ✅ `🟡` badge + warnings section with `<details>` |
| **ERROR** | ✅ Red regressions section, `❌ regression(s) detected` | ✅ Red diff cards, regression filter | ✅ `🔴` badge + regressions section |
| **FAILURE** | ✅ `handleFatalError` with boxed message + actionable hints | 🔴 `onError` is a silent no-op — no error captured in report | 🔴 `onError` logs but never posts a "run failed" comment |

### Findings

**F1 — 🔴 HTML Reporter silently swallows pipeline failures**  
`onError(_error: Error): void {}` is a complete no-op. If the pipeline crashes mid-run, the HTML report is never written AND no error evidence exists. A partial report with an error banner would be far better than silence.  
**Decision:** Must fix. Add error state rendering — write a minimal HTML file with the error message so users opening `report.html` don't see a stale report or a missing file.  
**Principle:** P5 (explicit) — failure must be visible, not swallowed.

**F2 — 🔴 PR Reporter never posts on pipeline failure**  
`onError` only logs. If Frontguard crashes in CI, the PR gets zero feedback. Developers will have to dig through CI logs. A "🔴 Frontguard failed to run" comment with the error message would save significant debugging time.  
**Decision:** Must fix. Post a failure comment on `onError` so the PR always gets feedback.  
**Principle:** P5 (explicit) — CI failure should be communicated on the PR, not buried in logs.

**F3 — 🟡 HTML report has no explicit empty state**  
When zero routes are found, the sidebar is empty and the main area shows "← Select a route from the sidebar" forever. No "No routes discovered" message.  
**Decision:** Should fix. Add a condition: if `routes.length === 0`, render a centered empty-state message in `<main>`.  
**Principle:** P1 (completeness) — every state needs representation.

**F4 — 🟡 PR comment empty state is a silent empty string**  
`generateSummaryTable` returns `''` when routes is empty. The comment would have a header + footer but a confusing gap in the middle.  
**Decision:** Should fix. Return `> No routes were discovered or tested.` instead of empty string.  
**Principle:** P5 (explicit).

**F5 — 🟢 LOADING states are N/A for HTML and PR reporters**  
These are non-interactive outputs generated after completion. The no-op implementations for stage callbacks are correct by design. No action needed.

---

## 2. Information Hierarchy

### CLI (`console.ts`)

| Aspect | Assessment |
|---|---|
| Route table first, regressions second | 🟡 Inverted — table shows ALL routes first, regressions detail is below |
| Glanceable pass/fail | ✅ Status icons (✓/⚠/✘/★) in table cells, color-coded |
| Detail level | ✅ Appropriate — table → regressions → warnings → summary |

**F6 — 🟡 Regressions should precede the full route table**  
`onComplete` calls `printRouteTable` → `printRegressions` → `printWarnings` → `printSummary`. In a CI context with 200 routes, the regressions (the action items) are buried below a large table. The most critical info should come first.  
**Decision:** Should fix. Reorder to: summary line → regressions → warnings → route table.  
**Principle:** P5 (explicit) — the thing you need to act on should be the first thing you see.

### HTML Report (`html.ts`)

| Aspect | Assessment |
|---|---|
| Header stats visible immediately | ✅ Regressions count in red, prominent position |
| Sidebar organized by status | ✅ Filter buttons: Regressions first in button order |
| Image comparison side-by-side | ✅ Baseline / Current / Diff in a 3-column grid |
| Detail level | ✅ Rich — AI analysis, diff percentage, per-viewport cards |

**F7 — 🟢 HTML hierarchy is well-designed**  
Header stats → sidebar filters (regressions button first) → route detail with image comparison. The auto-select of first route is a nice touch. No issues.

### PR Comment (`github-pr.ts`)

| Aspect | Assessment |
|---|---|
| Header with badge | ✅ `🔴`/`🟡`/`🟢` + summary table immediately visible |
| Regressions before warnings | ✅ Correct ordering: regressions → warnings → new pages → summary table |
| Scannable | ✅ `<details>` for individual diffs keeps it compact |

**F8 — 🟢 PR comment hierarchy is excellent**  
Badge → summary table → regressions (collapsed) → warnings → route summary. Perfect for scan-then-drill-down.

---

## 3. CLI UX

### Error Messages

**F9 — ✅ Error messages are highly actionable**  
`handleFatalError` includes contextual hints:
- `ECONNREFUSED` → "Is your dev server running? Try: npm run dev"
- `Config file not found` → "Run `frontguard init` to create a config"
- `browserType.launch` → "Try: npx playwright install"

This is exemplary error handling. The boxed formatting makes errors impossible to miss.

**F10 — ✅ Missing baseUrl error is actionable**  
Provides three alternatives: `--url`, config file, and `frontguard init`.

### Progress Feedback

**F11 — ✅ Progress feedback is excellent for long operations**  
7 named pipeline stages with emoji labels, `ora` spinners, and a visual progress bar `[████░░░░] 12/30` during render/compare stages. This is exactly right for operations that can take minutes.

### Exit Codes

**F12 — ✅ Exit codes are correct and well-differentiated**  
- `0` = no regressions (success)
- `1` = regressions found (test failure)
- `2` = tool errors without regressions (infra failure) + all `handleFatalError` paths

This is the correct convention for CI tools. One subtlety:

**F13 — 🟡 Ambiguous exit code when BOTH regressions AND errors exist**  
Lines 109-118: if `errors > 0 && regressions === 0` → exit 2. If `regressions > 0` → exit 1. But if BOTH exist, exit 1 is used. The errors are silently folded into the regression exit code. This is defensible (regressions are more actionable), but a log line noting the errors would help.  
**Decision:** Minor — add a log warning like `"⚠ ${summary.errors} route(s) also errored during capture"` before exit 1.  
**Principle:** P5 (explicit).

### Color Usage

**F14 — 🟡 No `NO_COLOR` / `FORCE_COLOR` environment variable support**  
The `chalk` library does auto-detect terminal capabilities, but the CLI doesn't document or explicitly handle `NO_COLOR` (the cross-tool standard). `chalk` v5 does respect `NO_COLOR` automatically, so this is likely fine in practice. But worth confirming the `chalk` version.  
**Decision:** Low priority — verify chalk version respects `NO_COLOR`. Add a `--no-color` flag for explicit control.  
**Principle:** Accessibility.

**F15 — 🟢 Color semantics are accessible**  
Green = pass, yellow = warning, red = regression/error, blue = new. These map to standard traffic-light conventions AND are supplemented with icons (✓/⚠/✘/★), so colorblind users can still distinguish states. Good.

---

## 4. HTML Report Design

### Responsive Design

**F16 — ✅ Responsive design is implemented**  
`@media (max-width: 768px)` breakpoint:
- Sidebar stacks on top (max-height 40vh)
- Header goes vertical
- Image grid collapses to single column
- Footer stacks vertically

This is correct for a report that might be opened on a phone/tablet.

### Dark Mode

**F17 — ✅ Dark mode is the default (and only) theme**  
`data-theme="dark"` on `<html>`, GitHub-style dark colors (`#0d1117` bg, `#e6edf3` text). Professional appearance matching developer tools.

**F18 — 🟡 No light mode toggle**  
Some users may prefer light mode or may need it for accessibility (e.g., sharing reports in documents, printing). There's no theme toggle.  
**Decision:** Low priority. Dark-only is fine for v0.1. Could add `prefers-color-scheme` media query later.  
**Principle:** P1 (completeness) — deferred, not blocking.

### Accessibility

**F19 — 🟡 Missing ARIA attributes and keyboard navigation**  
- Sidebar route items are `<li>` elements with click handlers but no `role="button"`, `tabindex`, or keyboard event handlers
- Filter buttons are `<button>` (good) but lack `aria-pressed` state
- No `aria-live` region for dynamic content changes
- Images have `alt` attributes (good: "baseline", "current", "diff") but they're generic

**Decision:** Should fix for v1, acceptable for v0.1 launch.  
**Principle:** Accessibility / P1 (completeness).

### Filtering & Navigation

**F20 — ✅ Filtering works well**  
Five filter buttons (All, Regressions, Warnings, New, Passed) with counts. Active state visually distinct (blue bg). Route selection shows detail panel. Auto-selects first route for ≤20 routes.

**F21 — 🟡 No image comparison mode (slider/toggle/onion-skin)**  
Images are displayed side-by-side (baseline, current, diff). There's no interactive comparison (slider overlay, toggle between images, or onion-skin). This is a competitive gap — tools like Percy/Chromatic offer these.  
**Decision:** Feature gap, not a bug. Track for v1.1.  
**Principle:** P1 (completeness) — enhances the core value proposition.

### Self-Contained

**F22 — ✅ Fully self-contained**  
- No external CSS/JS/font dependencies
- Images embedded as base64 data URIs (`bufferToDataUri`)
- System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI'...`)
- Single `.html` file with inline `<style>` and `<script>`

This is exactly right. The report works offline, can be attached to issues, emailed, etc.

---

## 5. PR Comment Design

### Scannability

**F23 — ✅ Highly scannable**  
- Color badge in title (`🔴`/`🟡`/`🟢`)
- Summary table with emoji counts immediately visible
- Individual regressions in `<details>` (collapsed by default)
- Route summary table with per-viewport status emojis

### GitHub Markdown Compatibility

**F24 — ✅ Uses GitHub-compatible markdown features**  
- Standard markdown tables
- `<details>/<summary>` for collapsible sections (GitHub-supported)
- HTML comment `<!-- frontguard-report -->` as marker (invisible in rendered view)
- Blockquotes for AI analysis callouts

**F25 — 🟡 Image placeholders are broken**  
Lines 157, 195: `![baseline](baseline)` — these are placeholder URLs that will render as broken images. In a real CI run, these need to be replaced with actual uploaded image URLs (e.g., to a storage bucket or GitHub Actions artifact). The code has a comment acknowledging this but it's left unimplemented.  
**Decision:** Must fix before launch. Options: upload to GitHub Actions artifacts and link, or embed small base64 images (GitHub supports `<img src="data:...">` in comments with size limits), or link to the HTML report.  
**Principle:** P5 (explicit) — broken images actively harm credibility.

### Size Management

**F26 — ✅ Size management is implemented**  
- `MAX_COMMENT_SIZE = 60_000` (conservative vs GitHub's ~65536 limit)
- `truncateComment()` falls back to header + summary table + truncation notice
- Links to full HTML report

**F27 — 🟡 Truncation could lose critical information**  
When truncated, ALL regression details are dropped — only the summary table remains. A user sees "5 regressions" but can't see which routes. Consider keeping at least the regression route names (without images/AI) in the truncated version.  
**Decision:** Should fix. Keep a minimal regression list (route paths only) in truncated mode.  
**Principle:** P5 (explicit) — the truncated version should still be actionable.

### Comment Updates

**F28 — ✅ Find-and-update existing comments is implemented**  
- `COMMENT_MARKER` (`<!-- frontguard-report -->`) to identify own comments
- `findExistingComment` searches up to 100 comments
- Updates via PATCH, creates via POST
- Handles 403 (permissions), 422 (validation), 429 (rate limit) with specific guidance

**F29 — 🟡 Pagination not handled for finding existing comments**  
`per_page=100` but if a PR has 100+ comments, the marker comment might be on page 2+. Unlikely for most PRs, but possible for long-running ones.  
**Decision:** Low priority. Add `Link` header pagination if needed.  
**Principle:** P1 (completeness).

**F30 — ✅ GitHub error messages are exceptionally helpful**  
403 → "Ensure GITHUB_TOKEN has `write` permission. For fork PRs, use `pull_request_target`."  
422 → "Comment body may be too large or contain invalid content."  
429 → "Wait a few minutes or use a PAT with higher limits."  
This is a gold standard for CI tool error messages.

---

## 6. Consistency Across Surfaces

### Terminology

| Concept | CLI | HTML | PR Comment |
|---|---|---|---|
| Visual regression | "regression" | "regression" | "regression" |
| Minor change | "warning" / "changed" | "warning" / "changed" | "warning" / "changed" |
| New page | "new" | "new" | "new" |
| Overall status | "regressions"/"warnings" | "Regressions"/"Warnings" | "Regressions"/"Warnings" |

**F31 — ✅ Terminology is consistent** across all three surfaces. "regression", "warning", "new", "passed" used uniformly.

### Status Icons

| Status | CLI | HTML | PR Summary Table |
|---|---|---|---|
| Pass | `✓` (green) | `✓` (green) | `✅` |
| Warning/Changed | `⚠` (yellow) | `⚠` (yellow) | `⚠️` |
| Regression | `✘` (red) | `✘` (red) | `❌` |
| New | `★` (blue) | `★` (blue) | `🆕` |
| Error | `⚠` (red) | `⚠` (red) | `💥` |
| Flaky | `~` (yellow) | `~` (yellow) | `🔄` |

**F32 — 🟡 Icon inconsistency between CLI/HTML and PR comment**  
CLI and HTML use text symbols (`✓`, `⚠`, `✘`, `★`). PR comment uses GitHub emoji (`✅`, `⚠️`, `❌`, `🆕`, `💥`). This is partially justified — GitHub renders emoji better than raw Unicode in markdown. But the error icon differs significantly: `⚠` (CLI/HTML) vs `💥` (PR). And the flaky icon `~` vs `🔄` is a conceptual mismatch.  
**Decision:** Acceptable divergence for CLI/HTML vs PR (different rendering contexts). BUT: error should use consistent metaphor — change PR `💥` to `⚠️` or change CLI/HTML `⚠` to a distinct error symbol.  
**Principle:** P5 (explicit) — `⚠` is used for BOTH "changed/warning" AND "error" in CLI/HTML, which is ambiguous.

**F33 — 🟡 CLI uses same icon `⚠` for both "changed" and "error" statuses**  
`STATUS_ICONS` in `console.ts`:
```
changed: chalk.yellow('⚠'),
error: chalk.red('⚠'),
```
Only color differentiates them. Colorblind users see the same symbol for warnings and errors. The HTML report has the same issue.  
**Decision:** Should fix. Use a distinct icon for errors: `✘` (which is already used for regressions — also a problem) or `⊘` or `!`.  
**Principle:** Accessibility + P5 (explicit).

### Color Coding

| Meaning | CLI (chalk) | HTML (CSS) | PR |
|---|---|---|---|
| Pass/Success | green | `#3fb950` (green) | N/A (emoji) |
| Warning | yellow | `#d29922` (yellow) | N/A (emoji) |
| Regression/Error | red | `#f85149` (red) | N/A (emoji) |
| New | blue | `#58a6ff` (blue) | N/A (emoji) |

**F34 — ✅ Color coding is consistent** between CLI and HTML. PR uses emoji which inherently carries color. No issues.

---

## Summary of Findings

### By Severity

| # | Severity | Finding | Surface |
|---|---|---|---|
| F1 | 🔴 | HTML reporter silently swallows pipeline failures — no error state | HTML |
| F2 | 🔴 | PR reporter never posts on pipeline failure — CI gets zero feedback | PR |
| F25 | 🔴 | PR comment image URLs are broken placeholders | PR |
| F6 | 🟡 | CLI shows full route table before regressions — buries action items | CLI |
| F3 | 🟡 | HTML report has no explicit empty state | HTML |
| F4 | 🟡 | PR comment empty state is a blank gap | PR |
| F13 | 🟡 | Ambiguous exit code when both regressions and errors co-exist | CLI |
| F14 | 🟡 | No explicit `--no-color` flag | CLI |
| F18 | 🟡 | No light mode toggle in HTML report | HTML |
| F19 | 🟡 | Missing ARIA attributes and keyboard navigation in HTML | HTML |
| F21 | 🟡 | No interactive image comparison mode (slider/overlay) | HTML |
| F27 | 🟡 | Truncation drops all regression details — not actionable | PR |
| F29 | 🟡 | Comment search doesn't paginate beyond 100 comments | PR |
| F32 | 🟡 | Icon sets diverge between CLI/HTML and PR (error: ⚠ vs 💥) | Cross |
| F33 | 🟡 | Same `⚠` icon for both "changed" and "error" — ambiguous | CLI/HTML |
| F5 | 🟢 | LOADING no-ops for HTML/PR are correct (non-interactive) | HTML/PR |
| F7 | 🟢 | HTML hierarchy is well-designed | HTML |
| F8 | 🟢 | PR comment hierarchy is excellent | PR |
| F9 | 🟢 | Error messages are highly actionable | CLI |
| F10 | 🟢 | Missing baseUrl error is actionable | CLI |
| F11 | 🟢 | Progress feedback is excellent | CLI |
| F12 | 🟢 | Exit codes are correct (0/1/2) | CLI |
| F15 | 🟢 | Color semantics use icons as supplement (colorblind-safe) | CLI |
| F16 | 🟢 | Responsive design is implemented | HTML |
| F17 | 🟢 | Dark mode default is appropriate | HTML |
| F20 | 🟢 | Filtering works well with counts | HTML |
| F22 | 🟢 | Fully self-contained (no external deps) | HTML |
| F23 | 🟢 | PR comment is highly scannable | PR |
| F24 | 🟢 | Uses GitHub-compatible markdown | PR |
| F26 | 🟢 | Comment size management is implemented | PR |
| F28 | 🟢 | Find-and-update existing comments works | PR |
| F30 | 🟢 | GitHub error messages are gold standard | PR |
| F31 | 🟢 | Terminology is consistent | Cross |
| F34 | 🟢 | Color coding is consistent | Cross |

### Pre-Launch Blockers (🔴)

1. **F1 + F2: Silent failure on both HTML and PR surfaces.** The tool can crash in CI and produce zero output. This violates the core contract of a CI tool.
2. **F25: Broken image placeholders in PR comments.** Images render as broken links, making the product look broken.

### Should-Fix for v0.1 (🟡 — high impact)

3. **F6:** Reorder CLI output: summary → regressions → warnings → table
4. **F33:** Differentiate error vs warning icons (accessibility)
5. **F27:** Keep regression route names in truncated PR comments
6. **F3 + F4:** Add empty-state messages to HTML and PR

### Track for v1.x (🟡 — lower urgency)

7. **F21:** Interactive image comparison (slider/overlay)
8. **F19:** ARIA/keyboard accessibility
9. **F18:** Light mode toggle
10. **F14:** `--no-color` flag
11. **F29:** Comment pagination
12. **F13:** Log errors alongside regressions exit code

---

## Overall Assessment

**Verdict: Strong foundation with 3 blockers.**

The design across all three surfaces is thoughtful and well-structured. The CLI UX is particularly excellent — actionable errors, rich progress feedback, and correct exit codes. The HTML report is professional and self-contained. The PR comment is scannable and handles edge cases (size, updates, permissions).

The 3 blockers (silent failure modes × 2, broken image URLs) must be resolved before any CI users encounter them. The remaining findings are polish that can ship with v0.1 if needed.

**Score: 7.5/10** → **9/10 with blockers fixed.**

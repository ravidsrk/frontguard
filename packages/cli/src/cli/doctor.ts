/**
 * `frontguard doctor` — environment diagnostic command.
 *
 * Runs a series of independent checks to verify that the local environment
 * is ready to run Frontguard, and prints an actionable report. Critical
 * checks failing cause a non-zero exit code; advisory checks (e.g. missing
 * AI keys) only warn.
 *
 * Checks performed:
 *   1. Node.js version >= 18
 *   2. Playwright installed (resolvable)
 *   3. At least one Playwright browser available (executable present)
 *   4. Config file found and parseable
 *   5. AI keys present (advisory — warn only)
 *   6. Git repository present
 *   7. Baseline branch exists (advisory — created on first run)
 *
 * @module cli/doctor
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig } from '../core/config.js';
import type { BrowserEngine } from '../core/types.js';

/** Status of a single diagnostic check. */
export type CheckStatus = 'pass' | 'fail' | 'warn';

/** Result of running a single diagnostic check. */
export interface CheckResult {
  /** Human-readable name of the check. */
  name: string;
  /** Outcome of the check. */
  status: CheckStatus;
  /** Short message describing what was found. */
  message: string;
  /** Actionable suggestion shown when the check did not pass. */
  fix?: string;
  /**
   * Whether this check is critical. A failing critical check causes a
   * non-zero exit code. Advisory checks only inform the user.
   */
  critical: boolean;
}

/** Minimum supported Node.js major version. */
const MIN_NODE_MAJOR = 18;

/** Default baseline branch name (matches git-orphan storage default). */
const DEFAULT_BASELINE_BRANCH = 'frontguard-baselines';

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/** Checks that the running Node.js version meets the minimum requirement. */
export function checkNodeVersion(version: string = process.version): CheckResult {
  const match = /^v?(\d+)\./.exec(version);
  const major = match ? parseInt(match[1], 10) : NaN;

  if (!Number.isNaN(major) && major >= MIN_NODE_MAJOR) {
    return {
      name: 'Node.js version',
      status: 'pass',
      message: `${version} (>= ${MIN_NODE_MAJOR} required)`,
      critical: true,
    };
  }

  return {
    name: 'Node.js version',
    status: 'fail',
    message: `${version} is below the minimum supported version`,
    fix: `Install Node.js ${MIN_NODE_MAJOR} or newer (https://nodejs.org).`,
    critical: true,
  };
}

/**
 * Checks that the `playwright` package is installed and resolvable.
 *
 * Uses a dynamic import so the check works regardless of build target.
 */
export async function checkPlaywrightInstalled(): Promise<CheckResult> {
  try {
    await import('playwright');
    return {
      name: 'Playwright installed',
      status: 'pass',
      message: 'playwright package is resolvable',
      critical: true,
    };
  } catch {
    return {
      name: 'Playwright installed',
      status: 'fail',
      message: 'playwright package could not be loaded',
      fix: 'Install Playwright: npm install playwright',
      critical: true,
    };
  }
}

/**
 * Checks that at least one Playwright browser is installed by resolving
 * each engine's executable path and verifying the file exists on disk.
 */
export async function checkBrowsersAvailable(): Promise<CheckResult> {
  const engines: BrowserEngine[] = ['chromium', 'firefox', 'webkit'];
  const available: string[] = [];

  let pw: typeof import('playwright');
  try {
    pw = await import('playwright');
  } catch {
    return {
      name: 'Browser binaries',
      status: 'fail',
      message: 'cannot check browsers — Playwright is not installed',
      fix: 'Install Playwright first: npm install playwright',
      critical: true,
    };
  }

  for (const engine of engines) {
    try {
      const browserType = pw[engine];
      const execPath = browserType.executablePath();
      if (execPath && existsSync(execPath)) {
        available.push(engine);
      }
    } catch {
      // executablePath() throws when the browser is not installed — skip.
    }
  }

  if (available.length > 0) {
    return {
      name: 'Browser binaries',
      status: 'pass',
      message: `available: ${available.join(', ')}`,
      critical: true,
    };
  }

  return {
    name: 'Browser binaries',
    status: 'fail',
    message: 'no Playwright browser binaries found',
    fix: 'Install browsers: npx playwright install',
    critical: true,
  };
}

/**
 * Checks that a config file is found and parseable. If no config is found
 * but the project is otherwise valid, this is advisory (not critical) since
 * `frontguard run --url` works without a config file.
 */
export async function checkConfig(cwd: string = process.cwd()): Promise<CheckResult> {
  // `loadConfig` discovers config relative to process.cwd(), so chdir into
  // the target directory for the duration of the check, then restore.
  const originalCwd = process.cwd();
  const needsChdir = cwd !== originalCwd;
  if (needsChdir) process.chdir(cwd);
  try {
    const config = await loadConfig();
    return {
      name: 'Configuration',
      status: 'pass',
      message: `loaded config (baseUrl: ${config.baseUrl})`,
      critical: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Distinguish "no config file" from "config file is broken".
    const isMissing =
      /not found/i.test(message) || /no .*config/i.test(message);

    if (isMissing) {
      return {
        name: 'Configuration',
        status: 'warn',
        message: 'no config file found',
        fix: 'Run `frontguard init` to create one, or pass --url at runtime.',
        critical: false,
      };
    }

    return {
      name: 'Configuration',
      status: 'fail',
      message: `config file is invalid: ${message}`,
      fix: 'Fix the config errors above, or regenerate with `frontguard init`.',
      critical: true,
    };
  } finally {
    if (needsChdir) process.chdir(originalCwd);
  }
}

/**
 * Checks whether AI provider keys are present in the environment.
 * Advisory only — Frontguard runs pixel/SSIM diffing without AI.
 *
 * Reads the same `FRONTGUARD_OPENAI_KEY` / `FRONTGUARD_ANTHROPIC_KEY` env vars
 * the runtime consumes in `diff/ai-vision.ts`, so doctor and the run pipeline
 * never disagree about whether AI is configured.
 */
export function checkAiKeys(env: NodeJS.ProcessEnv = process.env): CheckResult {
  const present: string[] = [];
  if (env.FRONTGUARD_OPENAI_KEY) present.push('OpenAI');
  if (env.FRONTGUARD_ANTHROPIC_KEY) present.push('Anthropic');

  if (present.length > 0) {
    return {
      name: 'AI provider keys',
      status: 'pass',
      message: `found: ${present.join(', ')}`,
      critical: false,
    };
  }

  return {
    name: 'AI provider keys',
    status: 'warn',
    message: 'no AI keys found (AI classification disabled)',
    fix: 'Set FRONTGUARD_OPENAI_KEY or FRONTGUARD_ANTHROPIC_KEY to enable AI analysis.',
    critical: false,
  };
}

/** Runs a git command, returning trimmed stdout or null on failure. */
function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** Checks that the current directory is inside a Git repository. */
export function checkGitRepo(cwd: string = process.cwd()): CheckResult {
  const inside = git(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside === 'true') {
    return {
      name: 'Git repository',
      status: 'pass',
      message: 'inside a git work tree',
      critical: true,
    };
  }

  return {
    name: 'Git repository',
    status: 'fail',
    message: 'not a git repository',
    fix: 'Frontguard stores baselines in git. Run `git init` first.',
    critical: true,
  };
}

/**
 * Checks whether the baseline branch exists (locally or on origin).
 * Advisory only — the branch is created automatically on first run.
 */
export function checkBaselineBranch(
  cwd: string = process.cwd(),
  branch: string = DEFAULT_BASELINE_BRANCH,
): CheckResult {
  // Skip cleanly if we're not in a git repo at all.
  if (git(cwd, ['rev-parse', '--is-inside-work-tree']) !== 'true') {
    return {
      name: 'Baseline branch',
      status: 'warn',
      message: 'skipped (not a git repository)',
      critical: false,
    };
  }

  const localRef = git(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  const remoteRef = git(cwd, [
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/remotes/origin/${branch}`,
  ]);

  if (localRef || remoteRef) {
    const where = localRef ? 'local' : 'origin';
    return {
      name: 'Baseline branch',
      status: 'pass',
      message: `'${branch}' exists (${where})`,
      critical: false,
    };
  }

  return {
    name: 'Baseline branch',
    status: 'warn',
    message: `'${branch}' not found`,
    fix: 'It will be created automatically on your first `frontguard run`.',
    critical: false,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Runs every diagnostic check and returns the collected results. */
export async function runChecks(cwd: string = process.cwd()): Promise<CheckResult[]> {
  return [
    checkNodeVersion(),
    await checkPlaywrightInstalled(),
    await checkBrowsersAvailable(),
    await checkConfig(cwd),
    checkAiKeys(),
    checkGitRepo(cwd),
    checkBaselineBranch(cwd),
  ];
}

/** Maps a check status to its display icon. */
function statusIcon(status: CheckStatus): string {
  switch (status) {
    case 'pass':
      return '✅';
    case 'warn':
      return '🟡';
    case 'fail':
      return '❌';
  }
}

/**
 * Formats the check results into a printable report string.
 *
 * @param results - The collected check results.
 * @returns A multi-line report suitable for stdout.
 */
export function formatReport(results: CheckResult[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('Frontguard Doctor');
  lines.push('─'.repeat(60));

  for (const r of results) {
    lines.push(`${statusIcon(r.status)} ${r.name}: ${r.message}`);
    if (r.status !== 'pass' && r.fix) {
      lines.push(`   → ${r.fix}`);
    }
  }

  lines.push('─'.repeat(60));

  const criticalFailures = results.filter((r) => r.critical && r.status === 'fail');
  const warnings = results.filter((r) => r.status === 'warn');

  if (criticalFailures.length === 0) {
    lines.push(
      warnings.length > 0
        ? `✅ All critical checks passed (${warnings.length} advisory warning(s)).`
        : '✅ All checks passed. You are ready to run Frontguard.',
    );
  } else {
    lines.push(
      `❌ ${criticalFailures.length} critical check(s) failed. Fix the issues above and re-run \`frontguard doctor\`.`,
    );
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Executes the doctor command: runs all checks, prints the report, and
 * returns the appropriate exit code.
 *
 * @param cwd - Working directory to inspect (defaults to `process.cwd()`).
 * @returns `0` if all critical checks pass, `1` otherwise.
 */
export async function runDoctor(cwd: string = process.cwd()): Promise<number> {
  const results = await runChecks(cwd);
  // Doctor output is the primary product of the command — write to stdout.
  process.stdout.write(formatReport(results) + '\n');

  const hasCriticalFailure = results.some((r) => r.critical && r.status === 'fail');
  return hasCriticalFailure ? 1 : 0;
}

/**
 * Shell-level checks for the Action baseline write guard.
 * Uses a fake `frontguard` and a `git` wrapper so nothing is pushed.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const runner = join(repoRoot, 'packages/cli/action-run.sh');
const realGit = execFileSync('/usr/bin/which', ['git'], { encoding: 'utf8' }).trim();

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
  args: string;
  pushed: boolean;
  diffBase: string;
  summary: string;
}

function runAction(
  env: Record<string, string>,
  stub: { exitCode?: number; regressions?: number } = {},
): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'frontguard-action-guard-'));
  const binDir = join(dir, 'bin');
  const argsPath = join(dir, 'args');
  const pushPath = join(dir, 'pushed');
  const outputPath = join(dir, 'output');
  const basePath = join(dir, 'diff-base');
  const summaryPath = join(dir, 'summary.md');
  mkdirSync(binDir);
  const regressions = stub.regressions ?? 0;
  const exitCode = stub.exitCode ?? 0;
  writeFileSync(
    join(binDir, 'frontguard'),
    `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$CAPTURE_ARGS"
printf '%s\\n' "\${FRONTGUARD_DIFF_BASE:-}" > "$CAPTURE_BASE"
mkdir -p custom-report
printf '<html></html>' > custom-report/report.html
printf '%s\\n' '{"summary":{"total":1,"regressions":${regressions},"newPages":0,"errors":0},"config":{"outputDir":"./custom-report"}}'
exit ${exitCode}
`,
  );
  writeFileSync(
    join(binDir, 'git'),
    `#!/usr/bin/env bash
if [ "$1" = "push" ]; then
  printf 'pushed\\n' > "$PUSH_LOG"
  exit 0
fi
exec "$REAL_GIT" "$@"
`,
  );
  chmodSync(join(binDir, 'frontguard'), 0o755);
  chmodSync(join(binDir, 'git'), 0o755);

  const baseEnv = {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    CAPTURE_ARGS: argsPath,
    CAPTURE_BASE: basePath,
    PUSH_LOG: pushPath,
    REAL_GIT: realGit,
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
    GITHUB_WORKSPACE: dir,
    IN_URL: '',
    IN_ROUTES: '',
    IN_VIEWPORTS: '',
    IN_BROWSERS: '',
    IN_THRESHOLD: '',
    IN_CONFIG: '',
    IN_UPDATE_BASELINES: 'false',
    IN_EVENT_NAME: '',
    IN_ALLOW_BASELINE_WRITES: 'false',
    ...env,
  };

  let status = 0;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync('bash', [runner], {
      cwd: dir,
      env: baseEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string; stderr?: string };
    status = error.status ?? 1;
    stdout = error.stdout ?? '';
    stderr = error.stderr ?? '';
  }

  const args = exists(argsPath) ? readFileSync(argsPath, 'utf8') : '';
  const pushed = exists(pushPath);
  const diffBase = exists(basePath) ? readFileSync(basePath, 'utf8').trim() : '';
  const summary = exists(summaryPath) ? readFileSync(summaryPath, 'utf8') : '';
  rmSync(dir, { recursive: true, force: true });
  return { status, stdout, stderr, args, pushed, diffBase, summary };
}

function exists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

describe('action baseline write guard', () => {
  it('refuses update-baselines on pull_request without the human override', () => {
    const result = runAction({
      IN_UPDATE_BASELINES: 'true',
      IN_EVENT_NAME: 'pull_request',
      IN_ALLOW_BASELINE_WRITES: 'false',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Refusing update-baselines on pull_request/);
    expect(result.stderr).toMatch(/human opt-in/);
    expect(result.args).toBe('');
    expect(result.pushed).toBe(false);
  });

  it('refuses update-baselines on pull_request_target unless allow-baseline-writes is true', () => {
    const refused = runAction({
      IN_UPDATE_BASELINES: 'true',
      IN_EVENT_NAME: 'pull_request_target',
      IN_ALLOW_BASELINE_WRITES: 'yes',
    });
    expect(refused.status).toBe(2);
    expect(refused.pushed).toBe(false);
    expect(refused.args).toBe('');
  });

  it('refuses update-baselines on merge_group even when allow-baseline-writes is true', () => {
    const refused = runAction({
      IN_UPDATE_BASELINES: 'true',
      IN_EVENT_NAME: 'merge_group',
      IN_ALLOW_BASELINE_WRITES: 'true',
      IN_MERGE_GROUP_BASE_SHA: 'abc123',
    });
    expect(refused.status).toBe(2);
    expect(refused.stderr).toMatch(/Queue runs never write/);
    expect(refused.pushed).toBe(false);
    expect(refused.args).toBe('');
    expect(refused.summary).toBe('');
  });

  it('passes --confirm-baselines and pushes when a pull_request opts in', () => {
    const result = runAction({
      IN_UPDATE_BASELINES: 'true',
      IN_EVENT_NAME: 'pull_request',
      IN_ALLOW_BASELINE_WRITES: 'true',
    });
    expect(result.status).toBe(0);
    expect(result.args).toContain('--update-baselines');
    expect(result.args).toContain('--confirm-baselines');
    expect(result.pushed).toBe(true);
  });

  it.each(['push', 'workflow_dispatch'])(
    'writes on %s when update-baselines is true and passes the confirm flag',
    (eventName) => {
      const result = runAction({
        IN_UPDATE_BASELINES: 'true',
        IN_EVENT_NAME: eventName,
        IN_ALLOW_BASELINE_WRITES: 'false',
      });
      expect(result.status).toBe(0);
      expect(result.args).toContain('--confirm-baselines');
      expect(result.pushed).toBe(true);
    },
  );

  it('does not pass --confirm-baselines when baselines are not updated', () => {
    const result = runAction({
      IN_UPDATE_BASELINES: 'false',
      IN_EVENT_NAME: 'pull_request',
    });
    expect(result.status).toBe(0);
    expect(result.args).not.toContain('--confirm-baselines');
    expect(result.args).not.toContain('--update-baselines');
    expect(result.pushed).toBe(false);
  });

  it('renders every route on merge_group and does not push', () => {
    const result = runAction({
      IN_UPDATE_BASELINES: 'false',
      IN_EVENT_NAME: 'merge_group',
      IN_ALLOW_BASELINE_WRITES: 'true',
      IN_MERGE_GROUP_BASE_SHA: 'deadbeef',
    });
    expect(result.status).toBe(0);
    expect(result.args).toContain('--all-routes');
    expect(result.args).not.toContain('--update-baselines');
    expect(result.args).not.toContain('--confirm-baselines');
    expect(result.diffBase).toBe('deadbeef');
    expect(result.pushed).toBe(false);
    expect(result.summary).toBe('');
  });

  it('writes a queued regression to the job summary and exits 1', () => {
    const result = runAction(
      {
        IN_UPDATE_BASELINES: 'false',
        IN_EVENT_NAME: 'merge_group',
        IN_MERGE_GROUP_BASE_SHA: 'deadbeef',
      },
      { regressions: 2, exitCode: 1 },
    );
    expect(result.status).toBe(1);
    expect(result.pushed).toBe(false);
    expect(result.summary).toMatch(/no pull request number/);
    expect(result.summary).toContain('regressions: 2');
  });

  it('exits 2 on a tool error without pushing', () => {
    const result = runAction(
      {
        IN_UPDATE_BASELINES: 'false',
        IN_EVENT_NAME: 'merge_group',
      },
      { exitCode: 2 },
    );
    expect(result.status).toBe(2);
    expect(result.pushed).toBe(false);
    expect(result.summary).toBe('');
  });
});

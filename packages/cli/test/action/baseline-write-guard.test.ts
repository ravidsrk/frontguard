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
}

function runAction(env: Record<string, string>): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'frontguard-action-guard-'));
  const binDir = join(dir, 'bin');
  const argsPath = join(dir, 'args');
  const pushPath = join(dir, 'pushed');
  const outputPath = join(dir, 'output');
  mkdirSync(binDir);
  writeFileSync(
    join(binDir, 'frontguard'),
    `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$CAPTURE_ARGS"
mkdir -p custom-report
printf '<html></html>' > custom-report/report.html
printf '%s\\n' '{"summary":{"total":1,"regressions":0,"newPages":0,"errors":0},"config":{"outputDir":"./custom-report"}}'
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
    PUSH_LOG: pushPath,
    REAL_GIT: realGit,
    GITHUB_OUTPUT: outputPath,
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
  rmSync(dir, { recursive: true, force: true });
  return { status, stdout, stderr, args, pushed };
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

  it.each(['pull_request_target', 'merge_group'])(
    'refuses update-baselines on %s unless allow-baseline-writes is true',
    (eventName) => {
      const refused = runAction({
        IN_UPDATE_BASELINES: 'true',
        IN_EVENT_NAME: eventName,
        IN_ALLOW_BASELINE_WRITES: 'yes',
      });
      expect(refused.status).toBe(2);
      expect(refused.pushed).toBe(false);
      expect(refused.args).toBe('');
    },
  );

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
});

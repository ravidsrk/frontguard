import { describe, it, expect } from 'vitest';
import {
  checkNodeVersion,
  checkAiKeys,
  checkGitRepo,
  checkBaselineBranch,
  checkConfig,
  formatReport,
  type CheckResult,
} from '../../src/cli/doctor.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'fg-doctor-'));
}

describe('doctor: checkNodeVersion', () => {
  it('passes for a supported version', () => {
    const r = checkNodeVersion('v20.10.0');
    expect(r.status).toBe('pass');
    expect(r.critical).toBe(true);
  });

  it('passes for exactly the minimum version', () => {
    expect(checkNodeVersion('v18.0.0').status).toBe('pass');
  });

  it('fails for a version below the minimum', () => {
    const r = checkNodeVersion('v16.20.0');
    expect(r.status).toBe('fail');
    expect(r.fix).toBeTruthy();
  });

  it('handles versions without a leading v', () => {
    expect(checkNodeVersion('22.1.0').status).toBe('pass');
  });
});

describe('doctor: checkAiKeys', () => {
  it('passes when FRONTGUARD_OPENAI_KEY is present', () => {
    const r = checkAiKeys({ FRONTGUARD_OPENAI_KEY: 'sk-test' } as NodeJS.ProcessEnv);
    expect(r.status).toBe('pass');
    expect(r.message).toContain('OpenAI');
  });

  it('passes when FRONTGUARD_ANTHROPIC_KEY is present', () => {
    const r = checkAiKeys({ FRONTGUARD_ANTHROPIC_KEY: 'x' } as NodeJS.ProcessEnv);
    expect(r.status).toBe('pass');
    expect(r.message).toContain('Anthropic');
  });

  it('reports both providers when both keys are set', () => {
    const r = checkAiKeys({
      FRONTGUARD_OPENAI_KEY: 'sk-test',
      FRONTGUARD_ANTHROPIC_KEY: 'x',
    } as NodeJS.ProcessEnv);
    expect(r.status).toBe('pass');
    expect(r.message).toContain('OpenAI');
    expect(r.message).toContain('Anthropic');
  });

  it('warns (not fails) when no keys present and is advisory', () => {
    const r = checkAiKeys({} as NodeJS.ProcessEnv);
    expect(r.status).toBe('warn');
    expect(r.critical).toBe(false);
  });

  it('does NOT detect the unscoped OPENAI_API_KEY / ANTHROPIC_API_KEY vars', () => {
    // The runtime (diff/ai-vision.ts) reads only FRONTGUARD_*_KEY — doctor must
    // agree, otherwise it would falsely report "AI configured" for a run that
    // will then start without AI.
    const r = checkAiKeys({
      OPENAI_API_KEY: 'sk-test',
      ANTHROPIC_API_KEY: 'sk-test',
    } as NodeJS.ProcessEnv);
    expect(r.status).toBe('warn');
    expect(r.fix).toContain('FRONTGUARD_OPENAI_KEY');
    expect(r.fix).toContain('FRONTGUARD_ANTHROPIC_KEY');
  });
});

describe('doctor: checkGitRepo', () => {
  it('fails outside a git repo', () => {
    const dir = makeTempDir();
    try {
      const r = checkGitRepo(dir);
      expect(r.status).toBe('fail');
      expect(r.critical).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes inside a git repo', () => {
    const dir = makeTempDir();
    try {
      execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
      const r = checkGitRepo(dir);
      expect(r.status).toBe('pass');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('doctor: checkBaselineBranch', () => {
  it('warns when not a git repo (skipped, advisory)', () => {
    const dir = makeTempDir();
    try {
      const r = checkBaselineBranch(dir);
      expect(r.status).toBe('warn');
      expect(r.critical).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when the baseline branch does not exist', () => {
    const dir = makeTempDir();
    try {
      execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
      const r = checkBaselineBranch(dir);
      expect(r.status).toBe('warn');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when the baseline branch exists locally', () => {
    const dir = makeTempDir();
    try {
      execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
      execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
      execFileSync('git', ['branch', 'frontguard-baselines'], { cwd: dir, stdio: 'ignore' });
      const r = checkBaselineBranch(dir);
      expect(r.status).toBe('pass');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('doctor: checkConfig', () => {
  it('warns when no config file is found', async () => {
    const dir = makeTempDir();
    try {
      const r = await checkConfig(dir);
      expect(r.status).toBe('warn');
      expect(r.critical).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when a valid .ts config is present', async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, 'frontguard.config.ts'),
        `export default {
  baseUrl: 'http://localhost:3000',
};`,
      );
      const r = await checkConfig(dir);
      expect(r.status).toBe('pass');
      expect(r.message).toContain('loaded config');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails critically when a config file exists but cannot be loaded', async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'frontguard.config.ts'), 'export default { baseUrl: invalid };');
      const r = await checkConfig(dir);
      expect(r.status).toBe('fail');
      expect(r.critical).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('doctor: formatReport', () => {
  const passing: CheckResult[] = [
    { name: 'A', status: 'pass', message: 'ok', critical: true },
    { name: 'B', status: 'pass', message: 'ok', critical: false },
  ];

  it('reports success when all critical checks pass', () => {
    const out = formatReport(passing);
    expect(out).toContain('✅');
    expect(out).toContain('All checks passed');
  });

  it('mentions advisory warnings count', () => {
    const out = formatReport([
      ...passing,
      { name: 'C', status: 'warn', message: 'meh', fix: 'do x', critical: false },
    ]);
    expect(out).toContain('advisory warning');
  });

  it('reports failure when a critical check fails', () => {
    const out = formatReport([
      { name: 'X', status: 'fail', message: 'broken', fix: 'fix it', critical: true },
    ]);
    expect(out).toContain('❌');
    expect(out).toContain('critical check(s) failed');
    expect(out).toContain('fix it');
  });

  it('shows fix hints for non-passing checks only', () => {
    const out = formatReport([
      { name: 'P', status: 'pass', message: 'good', fix: 'should-not-show', critical: true },
      { name: 'W', status: 'warn', message: 'warned', fix: 'should-show', critical: false },
    ]);
    expect(out).not.toContain('should-not-show');
    expect(out).toContain('should-show');
  });
});

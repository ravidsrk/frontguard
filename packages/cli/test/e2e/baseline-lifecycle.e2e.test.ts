/**
 * E2E: prove the built CLI's complete baseline lifecycle in a clean git repo.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { writeFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { RunResult } from '../../src/core/types.js';

const cliDir = resolve(new URL('.', import.meta.url).pathname, '..', '..');
const cliBin = join(cliDir, 'dist/cli/index.js');

interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], cwd: string): Promise<CliRun> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [cliBin, ...args], {
      cwd,
      env: { ...process.env, CI: 'false', NODE_ENV: 'test', FRONTGUARD_TELEMETRY: '0' },
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolveRun({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

function parseResult(run: CliRun): RunResult {
  try {
    return JSON.parse(run.stdout) as RunResult;
  } catch (error) {
    throw new Error(
      `CLI did not return JSON (exit ${run.exitCode}): ${run.stdout}\n${run.stderr}`,
      { cause: error },
    );
  }
}

function fixturePage(color: string, label: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #fff; font-family: Arial, sans-serif; }
      main { width: 100%; height: 640px; padding: 40px; background: ${color}; color: #fff; }
      h1 { margin: 0; font-size: 48px; }
    </style>
  </head>
  <body><main><h1>${label}</h1></main></body>
</html>`;
}

describe('built CLI baseline lifecycle', () => {
  let server: Server;
  let serverUrl = '';
  let repoDir = '';
  let changed = false;

  beforeAll(async () => {
    execFileSync('npm', ['run', 'build'], { cwd: cliDir, stdio: 'inherit' });
    server = createServer((_request, response) => {
      const html = changed
        ? fixturePage('#b42318', 'Changed page')
        : fixturePage('#175cd3', 'Baseline page');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const { port } = server.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  beforeEach(() => {
    changed = false;
    repoDir = mkdtempSync(join(tmpdir(), 'frontguard-lifecycle-e2e-'));
    writeFileSync(join(repoDir, 'README.md'), '# Frontguard lifecycle fixture\n');
    execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Frontguard Test'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@frontguard.dev'], { cwd: repoDir });
    execFileSync('git', ['add', 'README.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'Initial fixture'], { cwd: repoDir, stdio: 'ignore' });
  });

  afterEach(() => {
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  });

  it('seeds, passes unchanged, and reports a changed page with image evidence', async () => {
    const commonArgs = [
      'run',
      '--url', serverUrl,
      '--routes', '/',
      '--viewports', '375',
      '--browsers', 'chromium',
      '--threshold', '0.001',
      '--output', 'json',
    ];

    const firstComparison = await runCli(commonArgs, repoDir);
    expect(firstComparison.exitCode, firstComparison.stderr).toBe(1);
    expect(parseResult(firstComparison).summary).toMatchObject({
      total: 1,
      newPages: 1,
      regressions: 0,
      errors: 0,
    });
    expect(() =>
      execFileSync(
        'git',
        ['cat-file', '-e', 'frontguard-baselines:baselines/_root/375/chromium.png'],
        { cwd: repoDir, stdio: 'ignore' },
      ),
    ).toThrow();

    const seed = await runCli([...commonArgs, '--update-baselines'], repoDir);
    expect(seed.exitCode, seed.stderr).toBe(0);
    expect(parseResult(seed).summary).toMatchObject({
      total: 1,
      newPages: 1,
      regressions: 0,
      errors: 0,
    });

    const manifest = JSON.parse(
      execFileSync('git', ['show', 'frontguard-baselines:manifest.json'], {
        cwd: repoDir,
        encoding: 'utf8',
      }),
    ) as { routes: Record<string, { viewports: number[]; browsers: string[] }> };
    expect(manifest.routes['/']).toMatchObject({ viewports: [375], browsers: ['chromium'] });
    const baselineSize = Number(
      execFileSync(
        'git',
        ['cat-file', '-s', 'frontguard-baselines:baselines/_root/375/chromium.png'],
        { cwd: repoDir, encoding: 'utf8' },
      ).trim(),
    );
    expect(baselineSize).toBeGreaterThan(0);

    const unchanged = await runCli(commonArgs, repoDir);
    expect(unchanged.exitCode, unchanged.stderr).toBe(0);
    expect(parseResult(unchanged).summary).toMatchObject({
      total: 1,
      passed: 1,
      regressions: 0,
      errors: 0,
    });

    changed = true;
    const regression = await runCli(commonArgs, repoDir);
    expect(regression.exitCode, regression.stderr).toBe(1);
    expect(parseResult(regression).summary).toMatchObject({
      total: 1,
      passed: 0,
      regressions: 1,
      errors: 0,
    });

    const reportDir = join(repoDir, 'frontguard-report');
    const imageDir = join(reportDir, 'images');
    const images = readdirSync(imageDir).sort();
    // Report images are named by the HTML reporter's resolver
    // (src/report/html.ts:274), whose prefix is
    // `${routeIndex}_${routeFragment}_${viewport}_${browser}_${diffIndex}`.
    // The leading route index disambiguates routes within one report and has
    // been part of that naming since 5b9ff3e. This assertion previously used
    // the pipeline's *temp file* naming (`${key}_baseline`, pipeline.ts:619),
    // which is a different scheme and never matched what lands in the report.
    expect(images).toEqual([
      '0__root_375_chromium_0_baseline.png',
      '0__root_375_chromium_0_current.png',
      '0__root_375_chromium_0_diff.png',
    ]);
    for (const image of images) {
      expect(statSync(join(imageDir, image)).size).toBeGreaterThan(0);
    }
    const report = readFileSync(join(reportDir, 'report.html'), 'utf8');
    for (const image of images) {
      expect(report).toContain(`images/${image}`);
    }
  }, 120_000);
});

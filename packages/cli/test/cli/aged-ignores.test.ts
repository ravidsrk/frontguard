import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { collectAgedIgnores, formatAgedIgnores, utcAgeDays } from '../../src/cli/aged-ignores.js';
import { loadConfig } from '../../src/core/config.js';
import type { FrontguardConfig } from '../../src/core/types.js';

const NOW = new Date('2026-04-01T12:00:00.000Z');

function config(overrides: Partial<FrontguardConfig> = {}): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.1,
    ignore: [],
    smartRender: true,
    outputDir: './frontguard-report',
    routes: ['/', { path: '/pricing', viewport: [375] }],
    ...overrides,
  };
}

describe('aged ignore rules', () => {
  it('counts whole UTC days', () => {
    expect(utcAgeDays('2026-01-01', NOW)).toBe(90);
  });

  it('lists a global rule only when it is strictly older than the age, with every shot', () => {
    const listed = collectAgedIgnores(
      config({
        ignore: [
          { selector: '.ads', since: '2026-01-01' },
          { selector: '.fresh', since: '2026-03-01' },
        ],
      }),
      89,
      NOW,
    );
    expect(listed.aged).toEqual([
      {
        scope: 'global',
        label: '.ads',
        since: '2026-01-01',
        ageDays: 90,
        shots: ['/ @ 1440px [chromium]', '/pricing @ 375px [chromium]'],
      },
    ]);
    expect(listed.undated).toEqual([]);
  });

  it('keeps a rule that is exactly the threshold age off the list', () => {
    const listed = collectAgedIgnores(
      config({ ignore: [{ selector: '.ads', since: '2026-01-01' }] }),
      90,
      NOW,
    );
    expect(listed.aged).toEqual([]);
  });

  it('limits a route rule to that route and leaves an undated rule off the age list', () => {
    const listed = collectAgedIgnores(
      config({
        ignore: [{ selector: '.clock' }],
        routes: [
          '/',
          {
            path: '/pricing',
            viewport: [375],
            ignore: [{ selector: '.price', description: 'promo', since: '2025-01-01' }],
          },
        ],
      }),
      30,
      NOW,
    );
    expect(listed.aged).toEqual([
      {
        scope: '/pricing',
        label: '.price (promo)',
        since: '2025-01-01',
        ageDays: utcAgeDays('2025-01-01', NOW),
        shots: ['/pricing @ 375px [chromium]'],
      },
    ]);
    expect(listed.undated).toEqual([{ scope: 'global', label: '.clock' }]);
    expect(formatAgedIgnores(listed, 30)).toContain('does not remove a rule');
    expect(formatAgedIgnores(listed, 30)).toContain('/pricing @ 375px [chromium]');
    expect(formatAgedIgnores(listed, 30)).toContain('.clock');
  });

  it('accepts since on load and rejects a value that is not a date', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fg-ignores-'));
    try {
      const file = join(dir, 'frontguard.config.json');
      writeFileSync(
        file,
        JSON.stringify({
          baseUrl: 'http://localhost:3000',
          ignore: [{ selector: '.ads', since: '2020-01-01' }],
        }),
      );
      const loaded = await loadConfig(file);
      expect(loaded.ignore[0]?.since).toBe('2020-01-01');

      writeFileSync(
        file,
        JSON.stringify({
          baseUrl: 'http://localhost:3000',
          ignore: [{ selector: '.ads', since: 'yesterday' }],
        }),
      );
      await expect(loadConfig(file)).rejects.toThrow(/since|date/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints the list from the CLI and leaves the config file unchanged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fg-ignores-cli-'));
    const file = join(dir, 'frontguard.config.json');
    const body = JSON.stringify({
      baseUrl: 'http://localhost:3000',
      routes: ['/'],
      viewports: [1440],
      browsers: ['chromium'],
      ignore: [{ selector: '.ads', since: '2020-01-01' }],
    });
    writeFileSync(file, body);
    const cli = resolve(import.meta.dirname, '../../src/cli/index.ts');
    const tsx = createRequire(import.meta.url).resolve('tsx/cli');
    const run = (args: string[]) =>
      spawnSync(process.execPath, [tsx, cli, ...args], { encoding: 'utf-8', timeout: 20_000 });
    const listed = run(['ignores', '--older-than', '30', '-c', file]);
    const combined = `${listed.stdout}${listed.stderr}`;
    expect(listed.status).toBe(0);
    expect(combined).toContain('.ads');
    expect(combined).toContain('/ @ 1440px [chromium]');
    expect(combined).toContain('does not remove a rule');
    expect(readFileSync(file, 'utf-8')).toBe(body);

    const missing = run(['ignores', '-c', file]);
    expect(missing.status).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });
});

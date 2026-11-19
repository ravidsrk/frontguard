import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildAuditReport, normalizeCounts, toNonNegativeInt } from '../audit-weekly-report.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(
  path.join(repoRoot, '.github/workflows/audit-weekly.yml'),
  'utf8',
);

describe('weekly audit workflow (C11 / supply-6)', () => {
  it('runs on a weekly schedule and supports manual dispatch', () => {
    expect(workflow).toMatch(/^\s+schedule:/m);
    expect(workflow).toMatch(/cron:/);
    expect(workflow).toMatch(/workflow_dispatch:/);
  });

  it('captures npm audit output and posts a diff report to an issue', () => {
    expect(workflow).toMatch(/npm audit --omit=dev --json/);
    expect(workflow).toMatch(/audit-weekly-report\.mjs/);
    expect(workflow).toMatch(/actions\/github-script@[0-9a-f]{40}/);
    expect(workflow).toMatch(/issues\.createComment/);
  });

  it('paginates issue comments and filters to github-actions[bot] (no invalid direction: desc)', () => {
    expect(workflow).not.toMatch(/direction:\s*['"]desc['"]/);
    expect(workflow).toContain('github.paginate(github.rest.issues.listComments');
    expect(workflow).toContain("comment.user?.login === 'github-actions[bot]'");
    expect(workflow).toContain('botComments[botComments.length - 1]');
  });
});

describe('audit-weekly-report.mjs numeric coercion (#414)', () => {
  it('coerces only non-negative safe integers and falls back to 0 for malformed inputs', () => {
    expect(toNonNegativeInt(3)).toBe(3);
    expect(toNonNegativeInt('5')).toBe(5);
    expect(toNonNegativeInt(0)).toBe(0);
    expect(toNonNegativeInt(-2)).toBe(0);
    expect(toNonNegativeInt(Number.NaN)).toBe(0);
    expect(toNonNegativeInt('1 | <script>alert(1)</script>')).toBe(0);
    expect(toNonNegativeInt({ evil: true })).toBe(0);
  });

  it('prevents Markdown injection and NaN deltas from tampered previous metadata', () => {
    const audit = {
      metadata: {
        vulnerabilities: { critical: 0, high: 1, moderate: 2, low: 0, total: 3 },
      },
      vulnerabilities: {},
    };
    const tamperedPrevious = {
      critical: '0 | [pwn](https://evil.example)',
      high: 'NaN',
      moderate: -5,
      low: '1',
      total: null,
    };

    const report = buildAuditReport(audit, tamperedPrevious, '2026-11-19');
    expect(report).not.toContain('pwn');
    expect(report).not.toContain('NaN');
    expect(report).toContain('| critical | 0 | 0 | 0 |');
    expect(report).toContain('| high | 0 | 1 | +1 |');
    expect(report).toContain('| moderate | 0 | 2 | +2 |');
    expect(report).toContain('| low | 1 | 0 | -1 |');
    expect(report).toContain('| total | 0 | 3 | +3 |');
  });

  it('ignores non-object previous metadata (arrays/primitives)', () => {
    expect(normalizeCounts(['bad'])).toEqual({ critical: 0, high: 0, moderate: 0, low: 0, total: 0 });
    const report = buildAuditReport(
      { metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, total: 0 } } },
      ['not-an-object'],
      '2026-11-19',
    );
    expect(report).not.toContain('Diff vs last report');
  });
});

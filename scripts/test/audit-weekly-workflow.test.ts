import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
    expect(workflow).toMatch(/actions\/github-script@v7/);
    expect(workflow).toMatch(/issues\.createComment/);
  });
});
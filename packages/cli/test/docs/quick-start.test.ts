import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

function quickStart(pathFromRoot: string): string {
  const text = readFileSync(join(repoRoot, pathFromRoot), 'utf8');
  const start = text.indexOf('## Quick Start');
  expect(start, `${pathFromRoot} must have a Quick Start`).toBeGreaterThan(-1);
  const rest = text.slice(start);
  const next = rest.slice(1).search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('README Quick Start reaches a first comparison (G-14)', () => {
  const sections = ['README.md', 'packages/cli/README.md'].map((path) => ({
    path,
    body: quickStart(path),
  }));

  it.each(sections)('$path requires Node 22, not EOL Node 20', ({ body }) => {
    expect(body).toMatch(/Node\.js(?:\]\([^)]+\))? 22/);
    expect(body).not.toMatch(/Node\.js(?:\]\([^)]+\))? 20/);
  });

  it.each(sections)('$path installs Playwright browsers before doctor/run', ({ body }) => {
    expect(body).toMatch(/playwright install/);
    expect(body.indexOf('playwright install')).toBeLessThan(body.indexOf('frontguard doctor'));
  });

  it.each(sections)('$path states the git and origin prerequisites', ({ body }) => {
    expect(body).toMatch(/git repositor/i);
    expect(body).toContain('origin');
    expect(body).toContain('git push origin frontguard-baselines');
  });

  it.each(sections)('$path generates a config without requiring --ci', ({ body }) => {
    expect(body).toContain('frontguard init --yes');
    expect(body).toMatch(/--ci only if|--ci.*optional|Add --ci/i);
  });

  it.each(sections)('$path keeps the scoped npx form so a cold machine does not 404', ({ body }) => {
    expect(body).toContain('npx -p @frontguard/cli frontguard');
    expect(body).not.toMatch(/npx\s+frontguard\s/);
  });
});

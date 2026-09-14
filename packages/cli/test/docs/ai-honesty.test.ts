import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

describe('CF-04 honesty — public CLI claims stay within demonstrated behaviour (G-22)', () => {
  const surfaces = [
    'README.md',
    'packages/cli/README.md',
    'packages/cli/package.json',
    'package.json',
  ];

  it.each(surfaces)('%s does not lead with unmeasured AI-powered positioning', (relative) => {
    const text = readFileSync(join(repoRoot, relative), 'utf8');
    expect(text).not.toMatch(/AI-powered frontend visual regression testing/);
    expect(text).not.toMatch(/automatically downgrade/i);
  });

  it('states that pixel comparison is the pass/fail signal', () => {
    const root = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    const published = readFileSync(join(repoRoot, 'packages/cli/README.md'), 'utf8');
    expect(root).toMatch(/Pixel comparison is the pass\/fail signal/);
    expect(root).toMatch(/advisory and unmeasured/);
    expect(published).toMatch(/does not change pass\/fail/);
    expect(published).toMatch(/no published accuracy benchmark/);
  });
});

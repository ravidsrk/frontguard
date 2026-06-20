import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

const DEAD_MARKETPLACE_URLS = [
  'github.com/marketplace/frontguard',
  'github.com/apps/frontguard',
];

describe('GitHub App publish surface — honest marketplace + action ref', () => {
  it('README does not link to dead marketplace listing URLs', () => {
    for (const dead of DEAD_MARKETPLACE_URLS) {
      expect(readme, dead).not.toContain(dead);
    }
  });

  it('README states the marketplace listing is in review', () => {
    expect(readme).toMatch(/in review/i);
    expect(readme).toMatch(/self-host/i);
  });

  it('README pins bootstrap workflow to ravidsrk/frontguard@v0', () => {
    expect(readme).toContain('ravidsrk/frontguard@v0');
    expect(readme).not.toMatch(/ravidsrk\/frontguard@(v1|main)/);
  });
});
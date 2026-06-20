import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(resolve(here, '..', 'README.md'), 'utf8');

const DEAD_MARKETPLACE_URLS = [
  'github.com/marketplace/frontguard',
  'github.com/apps/frontguard',
  'vercel.com/integrations/frontguard',
];

describe('Vercel publish surface — honest marketplace framing', () => {
  it('README does not assert a live marketplace install URL', () => {
    for (const dead of DEAD_MARKETPLACE_URLS) {
      expect(readme, dead).not.toContain(dead);
    }
  });

  it('README states the marketplace listing is in review', () => {
    expect(readme).toMatch(/in review/i);
    expect(readme).toMatch(/self-host/i);
  });
});
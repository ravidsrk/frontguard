import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
const manifest = readFileSync(resolve(root, 'manifest.yml'), 'utf8');
const index = readFileSync(resolve(root, 'index.js'), 'utf8');

const HOSTED_DEFAULT = /default:\s*https:\/\/api\.frontguard\.dev/;
const EXAMPLE_DEFAULT = /apiUrl\s*=\s*["']https:\/\/api\.frontguard\.dev["']/;
const DEAD_MARKETPLACE_URLS = [
  'github.com/marketplace/frontguard',
  'github.com/apps/frontguard',
];

describe('Netlify publish surface — no false hosted API default', () => {
  it('manifest.yml does not default apiUrl to api.frontguard.dev', () => {
    expect(manifest).not.toMatch(HOSTED_DEFAULT);
    expect(manifest).toMatch(/required:\s*true/);
  });

  it('README.md does not advertise api.frontguard.dev as the default apiUrl', () => {
    expect(readme).not.toMatch(EXAMPLE_DEFAULT);
    expect(readme).not.toMatch(/\|\s*`apiUrl`\s*\|\s*`https:\/\/api\.frontguard\.dev`/);
  });

  it('index.js comment example does not use api.frontguard.dev', () => {
    expect(index).not.toMatch(EXAMPLE_DEFAULT);
  });
});

describe('Netlify publish surface — honest marketplace framing', () => {
  it('README does not link to dead marketplace listing URLs', () => {
    for (const dead of DEAD_MARKETPLACE_URLS) {
      expect(readme, dead).not.toContain(dead);
    }
  });

  it('README states the marketplace listing is in review', () => {
    expect(readme).toMatch(/in review/i);
  });
});

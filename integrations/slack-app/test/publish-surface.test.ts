import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
const wrangler = readFileSync(resolve(root, 'wrangler.toml'), 'utf8');

describe('Slack publish surface — no false hosted API default', () => {
  it('wrangler.toml does not set FRONTGUARD_API_URL to api.frontguard.dev', () => {
    expect(wrangler).not.toMatch(
      /FRONTGUARD_API_URL\s*=\s*["']https:\/\/api\.frontguard\.dev["']/,
    );
  });

  it('README does not advertise api.frontguard.dev as the default', () => {
    expect(readme).not.toMatch(/Defaults to `https:\/\/api\.frontguard\.dev`/);
    expect(readme).toMatch(/Required/i);
  });
});
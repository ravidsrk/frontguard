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
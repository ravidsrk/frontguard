import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(resolve(here, '../README.md'), 'utf8');
const authSrc = readFileSync(resolve(here, '../src/auth.ts'), 'utf8');

describe('MCP publish surface — no false hosted API default', () => {
  it('README does not list api.frontguard.dev as the FRONTGUARD_API_URL default', () => {
    expect(readme).not.toMatch(/\|\s*`FRONTGUARD_API_URL`\s*\|\s*`https:\/\/api\.frontguard\.dev`/);
    expect(readme).toMatch(/no hosted default|FRONTGUARD_API_URL.*required/i);
  });

  it('auth.ts does not define a DEFAULT_API_URL fallback', () => {
    expect(authSrc).not.toMatch(/DEFAULT_API_URL/);
    expect(authSrc).not.toMatch(/api\.frontguard\.dev/);
  });
});
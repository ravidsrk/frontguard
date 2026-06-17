/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const built = existsSync(join(dist, 'index.html'));

/** Each route's prerendered HTML must exist and contain rendered route markup. */
const ROUTES: { file: string; marker: string }[] = [
  { file: 'index.html', marker: 'Catch the regression, not the noise' },
  { file: 'pricing/index.html', marker: 'Pricing that respects open source' },
  { file: 'comparisons/index.html', marker: 'Frontguard vs. everyone else' },
  { file: 'changelog/index.html', marker: "What's new in Frontguard" },
  { file: 'brand/index.html', marker: 'The Frontguard brand system' },
  { file: 'docs/index.html', marker: 'Frontguard documentation' },
];

// Only assert after a build has produced dist/ (keeps standalone `npm test` green).
describe.runIf(built)('SSG output (post-build)', () => {
  it.each(ROUTES)('prerenders $file with real route markup', ({ file, marker }) => {
    const path = join(dist, file);
    expect(existsSync(path), `${file} should exist`).toBe(true);
    const html = readFileSync(path, 'utf8');
    expect(html).toContain(marker);
    // Not an empty SPA shell.
    expect(html).not.toMatch(/<div id="root">\s*<\/div>/);
  });

  it('emits the amber CSS shield in the brand route', () => {
    const html = readFileSync(join(dist, 'brand/index.html'), 'utf8');
    expect(html).toContain('polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)');
  });
});

/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');
const read = (f: string) => readFileSync(join(publicDir, f), 'utf8');

/** The six prerendered routes, by absolute URL, that must be discoverable. */
const ROUTE_URLS = [
  'https://frontguard.dev/',
  'https://frontguard.dev/pricing',
  'https://frontguard.dev/comparisons',
  'https://frontguard.dev/changelog',
  'https://frontguard.dev/brand',
  'https://frontguard.dev/docs',
];

describe('sitemap.xml', () => {
  const xml = read('sitemap.xml');

  it.each(ROUTE_URLS)('lists %s as a <loc>', (url) => {
    expect(xml).toContain(`<loc>${url}</loc>`);
  });

  it('gives every <url> a <lastmod>', () => {
    const urls = xml.match(/<url>/g)?.length ?? 0;
    const lastmods = xml.match(/<lastmod>/g)?.length ?? 0;
    expect(urls).toBeGreaterThanOrEqual(ROUTE_URLS.length);
    expect(lastmods).toBe(urls);
  });
});

describe('robots.txt', () => {
  it('points crawlers at the sitemap', () => {
    expect(read('robots.txt')).toContain('Sitemap: https://frontguard.dev/sitemap.xml');
  });
});

describe('_redirects (SPA deep-link fallback)', () => {
  it('serves index.html with a 200 for unknown deep paths', () => {
    expect(read('_redirects').replace(/\s+/g, ' ').trim()).toBe('/* /index.html 200');
  });
});

describe.each(['llms.txt', 'llms-full.txt'])('%s', (file) => {
  const txt = read(file);
  // The homepage is referenced without a trailing-slash path; the five new
  // routes carry an explicit path segment.
  it.each(['/pricing', '/comparisons', '/changelog', '/brand', '/docs'])(
    'references the %s route',
    (path) => {
      expect(txt).toContain(`https://frontguard.dev${path}`);
    },
  );
});

describe('404.html', () => {
  const html = read('404.html');

  it('has a heading and a home link', () => {
    expect(html).toMatch(/<h1[^>]*>[\s\S]*?<\/h1>/i);
    expect(html).toMatch(/href="\/"/);
  });

  it('uses the amber brand tokens and CSS shield mark', () => {
    expect(html).toContain('#e8862e'); // amber accent
    expect(html).toContain('#0d0c0b'); // warm near-black canvas
    expect(html).toContain('polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)');
  });

  it('keeps a visible focus style for keyboard users', () => {
    expect(html).toContain(':focus-visible');
  });
});

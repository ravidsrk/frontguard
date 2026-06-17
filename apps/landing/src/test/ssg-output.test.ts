/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const built = existsSync(join(dist, 'index.html'));

/**
 * Each route's prerendered HTML must exist, contain rendered route markup, and
 * — the carry-forward fix from PR#35 — emit a UNIQUE route-correct <title> and
 * <link rel="canonical"> INSIDE <head> (not stranded in the #root body, which
 * would self-canonicalize every route to the homepage).
 */
const ROUTES: { file: string; marker: string; title: string; canonical: string }[] = [
  {
    file: 'index.html',
    marker: 'Catch the regression, not the noise',
    title: 'Frontguard — Catch the regression, not the noise',
    canonical: 'https://frontguard.dev',
  },
  {
    file: 'pricing/index.html',
    marker: 'Pricing that respects open source',
    title: 'Pricing — Frontguard',
    canonical: 'https://frontguard.dev/pricing',
  },
  {
    file: 'comparisons/index.html',
    marker: 'Frontguard vs. everyone else',
    title: 'Comparisons — Frontguard vs. everyone else',
    canonical: 'https://frontguard.dev/comparisons',
  },
  {
    file: 'changelog/index.html',
    marker: "What's new in Frontguard",
    title: 'Changelog — Frontguard',
    canonical: 'https://frontguard.dev/changelog',
  },
  {
    file: 'brand/index.html',
    marker: 'The Frontguard brand system',
    title: 'Brand — The Frontguard brand system',
    canonical: 'https://frontguard.dev/brand',
  },
  {
    file: 'docs/index.html',
    marker: 'Frontguard documentation',
    title: 'Documentation — Frontguard',
    canonical: 'https://frontguard.dev/docs',
  },
];

/** Slice out the literal <head>…</head> so we can assert tags live in <head>, not <body>. */
function headOf(html: string): string {
  const m = html.match(/<head>([\s\S]*?)<\/head>/i);
  if (!m) throw new Error('no <head> found');
  return m[1];
}

function titlesIn(fragment: string): string[] {
  return [...fragment.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => m[1].trim());
}

function canonicalsIn(fragment: string): string[] {
  return [...fragment.matchAll(/<link[^>]*rel="canonical"[^>]*>/gi)].map((m) => {
    const href = m[0].match(/href="([^"]*)"/i);
    return href ? href[1] : '';
  });
}

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

  it.each(ROUTES)('$file has a route-correct <title> + canonical IN <head>', ({ file, title, canonical }) => {
    const html = readFileSync(join(dist, file), 'utf8');
    const head = headOf(html);

    // Exactly one <title>, in <head>, with the route's text.
    const headTitles = titlesIn(head);
    expect(headTitles, `${file}: one <title> in <head>`).toHaveLength(1);
    expect(headTitles[0]).toBe(title);
    expect(titlesIn(html), `${file}: no stray <title> outside <head>`).toHaveLength(1);

    // Exactly one canonical, in <head>, pointing at the route (not the homepage).
    const headCanon = canonicalsIn(head);
    expect(headCanon, `${file}: one canonical in <head>`).toHaveLength(1);
    expect(headCanon[0]).toBe(canonical);
    expect(canonicalsIn(html), `${file}: no stray canonical outside <head>`).toHaveLength(1);
  });

  it('every route ships a UNIQUE <title> and a UNIQUE canonical', () => {
    const titles = ROUTES.map((r) => titlesIn(headOf(readFileSync(join(dist, r.file), 'utf8')))[0]);
    const canon = ROUTES.map((r) => canonicalsIn(headOf(readFileSync(join(dist, r.file), 'utf8')))[0]);
    expect(new Set(titles).size, 'titles must be unique').toBe(ROUTES.length);
    expect(new Set(canon).size, 'canonicals must be unique').toBe(ROUTES.length);
    // No route may self-canonicalize to the homepage except the homepage itself.
    canon.slice(1).forEach((c) => expect(c).not.toBe('https://frontguard.dev'));
  });

  it('ships SoftwareApplication JSON-LD once in every route (global head)', () => {
    for (const { file } of ROUTES) {
      const html = readFileSync(join(dist, file), 'utf8');
      const count = (html.match(/"@type":\s*"SoftwareApplication"/g) ?? []).length;
      expect(count, `${file}: exactly one SoftwareApplication block`).toBe(1);
    }
  });

  it('ships FAQPage JSON-LD only on /pricing (once), not on non-FAQ routes', () => {
    const faqCount = (file: string) =>
      (readFileSync(join(dist, file), 'utf8').match(/"@type":\s*"FAQPage"/g) ?? []).length;
    expect(faqCount('pricing/index.html'), 'one FAQPage on /pricing').toBe(1);
    for (const { file } of ROUTES.filter((r) => r.file !== 'pricing/index.html')) {
      expect(faqCount(file), `${file}: no FAQPage (no on-page FAQ)`).toBe(0);
    }
  });

  it('emits the amber CSS shield in the brand route', () => {
    const html = readFileSync(join(dist, 'brand/index.html'), 'utf8');
    expect(html).toContain('polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)');
  });
});

/** Ordered docs page list mirroring the design's Docs sidebar (renderVals.nav).
 *  Drives the sidebar, the breadcrumb, the prev/next pager, and SSG getStaticPaths. */

export interface DocsPage {
  slug: string;
  title: string;
  section: string;
}

export interface DocsNavGroup {
  section: string;
  items: { slug: string; title: string }[];
}

export const DOCS_NAV: DocsNavGroup[] = [
  {
    section: 'Getting Started',
    items: [
      { slug: 'introduction', title: 'Introduction' },
      { slug: 'installation', title: 'Installation' },
      { slug: 'quick-start', title: 'Quick start' },
    ],
  },
  {
    section: 'Reference',
    items: [
      { slug: 'cli', title: 'CLI Commands' },
      { slug: 'configuration', title: 'Configuration' },
      { slug: 'playwright', title: 'Playwright plugin' },
    ],
  },
  {
    section: 'CI / CD',
    items: [{ slug: 'github-actions', title: 'GitHub Actions' }],
  },
  {
    section: 'Guides',
    items: [
      { slug: 'ai-analysis', title: 'AI Analysis' },
      { slug: 'ai-fixes', title: 'AI Fixes' },
      { slug: 'custom-plugins', title: 'Custom Plugins' },
    ],
  },
  {
    section: 'Deployment',
    items: [{ slug: 'self-hosting', title: 'Self-hosting' }],
  },
  {
    section: 'Trust',
    items: [{ slug: 'validation', title: 'Validation & results' }],
  },
];

/** Flat, ordered page list (introduction first). */
export const DOCS_PAGES: DocsPage[] = DOCS_NAV.flatMap((group) =>
  group.items.map((item) => ({ slug: item.slug, title: item.title, section: group.section })),
);

export const DOCS_SLUGS: string[] = DOCS_PAGES.map((p) => p.slug);

export function getDocsPage(slug: string): DocsPage | undefined {
  return DOCS_PAGES.find((p) => p.slug === slug);
}

export function getDocsNeighbors(slug: string): { prev?: DocsPage; next?: DocsPage } {
  const i = DOCS_PAGES.findIndex((p) => p.slug === slug);
  if (i === -1) return {};
  return { prev: DOCS_PAGES[i - 1], next: DOCS_PAGES[i + 1] };
}

/** Single source of truth for cross-route links. Internal links use router paths;
 *  external links carry `external: true` so the kit applies target/rel hygiene. */

export const REPO = 'ravidsrk/frontguard';
export const REPO_URL = `https://github.com/${REPO}`;
export const NPM_URL = 'https://www.npmjs.com/package/@frontguard/cli';
export const DOCS_EXTERNAL = 'https://docs.frontguard.dev';
export const X_URL = 'https://x.com/ravidsrk';

export interface NavLink {
  label: string;
  to: string;
  external?: boolean;
}

/** Primary marketing nav — re-pointed from the design's in-page anchors to routes. */
export const NAV_LINKS: NavLink[] = [
  { label: 'docs', to: '/docs' },
  { label: 'pricing', to: '/pricing' },
  { label: 'compare', to: '/comparisons' },
  { label: 'changelog', to: '/changelog' },
];

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Pricing', to: '/pricing' },
      { label: 'Comparisons', to: '/comparisons' },
      { label: 'Changelog', to: '/changelog' },
      { label: 'Brand', to: '/brand' },
    ],
  },
  {
    title: 'Docs',
    links: [
      { label: 'Documentation', to: '/docs' },
      { label: 'CLI reference', to: `${DOCS_EXTERNAL}/docs/cli`, external: true },
      { label: 'Playwright plugin', to: `${DOCS_EXTERNAL}/docs/playwright`, external: true },
      { label: 'GitHub Actions', to: `${DOCS_EXTERNAL}/docs/ci-cd/github-actions`, external: true },
      { label: 'Self-host', to: `${DOCS_EXTERNAL}/docs/self-host`, external: true },
      { label: 'MCP server', to: `${DOCS_EXTERNAL}/docs/integrations/mcp`, external: true },
    ],
  },
  {
    title: 'Compare',
    links: [
      { label: 'vs Percy', to: '/comparisons' },
      { label: 'vs Chromatic', to: '/comparisons' },
      { label: 'vs Argos', to: '/comparisons' },
      { label: 'Migrate from BackstopJS', to: `${DOCS_EXTERNAL}/docs/migrate/backstopjs`, external: true },
      { label: 'Migrate from Lost Pixel', to: `${DOCS_EXTERNAL}/docs/migrate/lost-pixel`, external: true },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'GitHub', to: REPO_URL, external: true },
      { label: 'npm: @frontguard/cli', to: NPM_URL, external: true },
      { label: 'Contributing', to: `${REPO_URL}/blob/main/CONTRIBUTING.md`, external: true },
      { label: 'MIT License', to: `${REPO_URL}/blob/main/LICENSE`, external: true },
      { label: 'Validation results', to: `${REPO_URL}/blob/main/validation/results-v0.2.md`, external: true },
    ],
  },
];

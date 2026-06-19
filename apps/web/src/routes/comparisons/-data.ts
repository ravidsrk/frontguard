/** Vendor columns, in matrix order (Frontguard is the highlighted column). */
export const VENDORS = [
  'Frontguard',
  'Percy',
  'Chromatic',
  'BackstopJS',
  'Lost Pixel',
  'Argos',
] as const

export type MatrixCells = readonly [string, string, string, string, string, string]

export interface MatrixRow {
  capability: string
  cells: MatrixCells
  emphasize?: boolean
}

/** 15-row × 6-vendor matrix — exact floor from product-probe A10. */
export const MATRIX: MatrixRow[] = [
  { capability: 'Open source', emphasize: true, cells: ['✓ MIT', '✕', '◐', '✓', '◐', '✓ MIT'] },
  { capability: 'CLI-first', cells: ['✓', '✕', '✕', '✓', '✓', '✓'] },
  { capability: 'AI change classification', emphasize: true, cells: ['✓', '◐', '✕', '✕', '✕', '✕'] },
  { capability: 'AI fix verification', emphasize: true, cells: ['✓', '✕', '✕', '✕', '✕', '✕'] },
  { capability: 'Anti-flake rendering', cells: ['✓', '◐', '◐', '✕', '✕', '◐'] },
  { capability: 'Cross-OS render normalisation', cells: ['✓', '✓', '✓', '✕', '✕', '✕'] },
  { capability: 'Self-hostable', cells: ['✓', '✕', '✕', '✓', '◐', '◐'] },
  { capability: 'Storybook integration', cells: ['✓', '✓', '✓', '✕', '✓', '✓'] },
  { capability: 'MCP server for in-IDE agents', cells: ['✓', '✕', '◐', '✕', '✕', '✕'] },
  { capability: 'PR comment with thumbnail triplet', cells: ['✓', '✓', '✓', '✕', '◐', '✓'] },
  { capability: 'Enterprise SSO/SAML', cells: ['◐', '✓', '✓', '✕', '✕', '✓'] },
  { capability: 'Free tier', cells: ['Forever', '5k/mo', '5k/mo', 'Free', '✕', '5k/mo'] },
  { capability: 'Pro entry', cells: ['$29/mo', '$199/mo', '$179/mo', 'n/a', 'n/a', '$100/mo'] },
  { capability: 'Snapshot overage', cells: ['Spend cap', 'Quote', '$0.008', 'n/a', 'n/a', '$0.004'] },
  { capability: 'Actively maintained', cells: ['✓', '✓', '✓', '✕ quiet', '✕', '✓'] },
]

export const ALTERNATIVES = [
  { name: 'Percy', status: '↗ pricing cliff', color: '#e8862e' },
  { name: 'Chromatic', status: '◐ Storybook-locked', color: '#e8862e' },
  { name: 'BackstopJS', status: '✕ low activity', color: '#e5484d' },
  { name: 'Lost Pixel', status: '✕ archived', color: '#e5484d' },
] as const

export const VERSUS = [
  {
    name: 'Percy',
    their:
      'Polished hosted dashboard, broad framework SDKs, and mature review workflows backed by BrowserStack.',
    ours:
      'CLI-first and free forever — no per-screenshot billing that punishes a growing suite. Plus AI explanations, not just a red diff to triage by hand.',
    cta: 'Read the comparison',
    href: 'comparisons/frontguard-vs-percy',
  },
  {
    name: 'Chromatic',
    their:
      'Best-in-class for Storybook component testing, with TurboSnap and a tight Storybook publish flow.',
    ours:
      'Tests the real app at real URLs, not just isolated stories — and classifies regression vs. intentional so review queues stay short. Storybook capture is supported too.',
    cta: 'Read the comparison',
    href: 'comparisons/frontguard-vs-chromatic',
  },
  {
    name: 'BackstopJS',
    their: 'A free, self-hosted classic — simple, scriptable, no vendor at all.',
    ours:
      'Same self-hosted freedom, but with zero-config route discovery, anti-flake rendering, AI analysis, and active maintenance (BackstopJS has been quiet for years).',
    cta: 'Migration guide',
    href: 'guides/migrate-from-backstopjs',
  },
  {
    name: 'Lost Pixel / Argos',
    their:
      'Modern, developer-friendly OSS-leaning tools with good CI ergonomics and Playwright trace support.',
    ours:
      'The only one with AI change classification and verified fixes — and a flat, screenshot-count-independent price with full self-hosting.',
    cta: 'Read the comparison',
    href: 'comparisons/frontguard-vs-argos',
  },
] as const

export const MIGRATIONS = [
  { name: 'BackstopJS', href: 'guides/migrate-from-backstopjs' },
  { name: 'Lost Pixel', href: 'guides/migrate-from-lost-pixel' },
  { name: 'Percy', href: 'comparisons/frontguard-vs-percy' },
  { name: 'Chromatic', href: 'comparisons/frontguard-vs-chromatic' },
] as const
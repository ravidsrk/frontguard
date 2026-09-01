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
  { capability: 'AI change classification', emphasize: true, cells: ['✓ optional', '◐', '✕', '✕', '✕', '✕'] },
  { capability: 'AI fix verification', emphasize: true, cells: ['◐ experimental', '✕', '✕', '✕', '✕', '✕'] },
  { capability: 'Multi-render consensus', cells: ['◐ configurable', '◐', '◐', '✕', '✕', '◐'] },
  { capability: 'Cross-OS render normalisation', cells: ['◐ unvalidated', '✓', '✓', '✕', '✕', '✕'] },
  { capability: 'Runs without a hosted service', cells: ['✓', '✕', '✕', '✓', '◐', '◐'] },
  { capability: 'Storybook integration', cells: ['✓', '✓', '✓', '✕', '✓', '✓'] },
  { capability: 'MCP server for in-IDE agents', cells: ['◐ pre-release', '✕', '◐', '✕', '✕', '✕'] },
  { capability: 'PR comment with thumbnail triplet', cells: ['◐ source only', '✓', '✓', '✕', '◐', '✓'] },
  { capability: 'Enterprise SSO/SAML', cells: ['✕', '✓', '✓', '✕', '✕', '✓'] },
  { capability: 'Free tier', cells: ['Forever', '5k/mo', '5k/mo', 'Free', '✕', '5k/mo'] },
  { capability: 'Hosted entry', cells: ['Waitlist', '$199/mo', '$179/mo', 'n/a', 'n/a', '$100/mo'] },
  { capability: 'Snapshot overage', cells: ['n/a (CLI)', 'Quote', '$0.008', 'n/a', 'n/a', '$0.004'] },
  { capability: 'Project status', cells: ['Active', 'Active', 'Active', 'Low activity', 'Sunset', 'Active'] },
]

export const ALTERNATIVES = [
  { name: 'Percy', status: 'hosted review workflow', color: '#8c847a' },
  { name: 'Chromatic', status: 'Storybook-centered', color: '#8c847a' },
  { name: 'BackstopJS', status: 'low recent activity', color: '#e8862e' },
  { name: 'Lost Pixel', status: 'sunset', color: '#e5484d' },
] as const

export const VERSUS = [
  {
    name: 'Percy',
    their:
      'Polished hosted dashboard, broad framework SDKs, and mature review workflows backed by BrowserStack.',
    ours:
      'A local MIT-licensed CLI with git-native baselines and optional BYOK explanations. It does not offer Percy’s mature hosted review surface.',
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
      'Adds route discovery, configurable multi-render consensus, and optional AI analysis while retaining a local workflow.',
    cta: 'Migration guide',
    href: 'guides/migrate-from-backstopjs',
  },
  {
    name: 'Lost Pixel / Argos',
    their:
      'Modern, developer-friendly OSS-leaning tools with good CI ergonomics and Playwright trace support.',
    ours:
      'A local CLI workflow with git-native baselines and optional model-assisted analysis; hosted Frontguard remains pre-release.',
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

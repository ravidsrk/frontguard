/*
  Data model for the /comparisons page (parity-spec §5 t-comparisons).

  The matrix is the reconciliation of two sources:
  - the design's `Comparisons.dc.html` matrix (9 rows × 6 vendors), and
  - the floor's `Comparison.tsx` (11 rows × 4 vendors), recovered from git.

  Per the frozen mapping: 5 floor rows map onto design rows (RENAME/KEEP),
  6 floor rows are added (GAP-FILL), and the 4 design-native rows are kept —
  giving a 15-row, 6-vendor matrix where NO floor capability is dropped.

  Cell vocabulary (matches the design's `cell()` colorizer):
    '✓'  full support      → green   (only the bare glyph is colored)
    '◐'  partial / limited → amber
    '✕'  not available     → grey
    any other string       → neutral ink (e.g. '✓ MIT', '$29/mo', '✕ quiet')

  Provenance for every GAP-FILL/honest cell:
  - Frontguard / Percy / Chromatic / Argos cells preserve the floor's content
    (the recovered `Comparison.tsx`).
  - BackstopJS / Lost Pixel cells are filled from docs/research.md (§1.5, §1.7,
    §2, §3, §6.3) — honest '✕'/'n/a' where genuinely unsupported.
  Pricing values are aligned to research.md where it corroborates the floor.
*/

/** Vendor columns, in matrix order (Frontguard is the highlighted column). */
export const VENDORS = [
  'Frontguard',
  'Percy',
  'Chromatic',
  'BackstopJS',
  'Lost Pixel',
  'Argos',
] as const;

/** Six cells, one per vendor column, in `VENDORS` order. */
export type MatrixCells = readonly [string, string, string, string, string, string];

/** How a built row relates to the floor: design-native, kept, renamed, or gap-filled. */
export type RowOrigin = 'design' | 'keep' | 'rename' | 'gap-fill';

export interface MatrixRow {
  capability: string;
  cells: MatrixCells;
  /** Bold the capability label (design `weight: 600` rows). */
  emphasize?: boolean;
  origin: RowOrigin;
}

/**
 * The 15-row matrix. Order keeps the design's grouping (foundation → AI →
 * integrations → pricing) and slots the GAP-FILL rows next to related rows.
 */
export const MATRIX: MatrixRow[] = [
  // ---- Design-native + renamed: foundation & AI ----
  { capability: 'Open source', emphasize: true, origin: 'design', cells: ['✓ MIT', '✕', '◐', '✓', '◐', '✓ MIT'] },
  { capability: 'CLI-first', origin: 'design', cells: ['✓', '✕', '✕', '✓', '✓', '✓'] },
  // floor "AI diff explanation" → design "AI change classification"
  // Percy ships the Visual Review Agent (NL summaries / auto-classified) → ◐, per
  // docs/research.md §3.1/§347; Chromatic ("no diff-classification AI") and Argos
  // ("no AI overhead") are honest ✕.
  { capability: 'AI change classification', emphasize: true, origin: 'rename', cells: ['✓', '◐', '✕', '✕', '✕', '✕'] },
  // floor "Sandbox-verified fixes" → design "AI fix verification"
  { capability: 'AI fix verification', emphasize: true, origin: 'rename', cells: ['✓', '✕', '✕', '✕', '✕', '✕'] },
  { capability: 'Anti-flake rendering', origin: 'design', cells: ['✓', '◐', '◐', '✕', '✕', '◐'] },
  // floor "Cross-OS render normalisation" (GAP-FILL; distinct from anti-flake)
  { capability: 'Cross-OS render normalisation', origin: 'gap-fill', cells: ['✓', '✓', '✓', '✕', '✕', '✕'] },
  // floor "Self-host" → design "Self-hostable"
  { capability: 'Self-hostable', origin: 'rename', cells: ['✓', '✕', '✕', '✓', '◐', '◐'] },

  // ---- GAP-FILL: integrations & workflow ----
  { capability: 'Storybook integration', origin: 'gap-fill', cells: ['✓', '✓', '✓', '✕', '✓', '✓'] },
  { capability: 'MCP server for in-IDE agents', origin: 'gap-fill', cells: ['✓', '✕', '◐', '✕', '✕', '✕'] },
  { capability: 'PR comment with thumbnail triplet', origin: 'gap-fill', cells: ['✓', '✓', '✓', '✕', '◐', '✓'] },
  { capability: 'Enterprise SSO/SAML', origin: 'gap-fill', cells: ['◐', '✓', '✓', '✕', '✕', '✓'] },

  // ---- Pricing (floor "Free tier" KEEP, "Paid entry tier"→"Pro entry", "Snapshot overage" GAP-FILL) ----
  { capability: 'Free tier', origin: 'keep', cells: ['Forever', '5k/mo', '5k/mo', 'Free', '✕', '5k/mo'] },
  { capability: 'Pro entry', origin: 'rename', cells: ['$29/mo', '$199/mo', '$179/mo', 'n/a', 'n/a', '$100/mo'] },
  { capability: 'Snapshot overage', origin: 'gap-fill', cells: ['Spend cap', 'Quote', '$0.008', 'n/a', 'n/a', '$0.004'] },

  // ---- Design-native: maintenance ----
  { capability: 'Actively maintained', origin: 'design', cells: ['✓', '✓', '✓', '✕ quiet', '✕', '✓'] },
];

/**
 * The 11 floor capabilities and the matrix row label that carries each
 * (parity-spec §5 mapping). The page-parity test asserts every `row` label is
 * rendered — proving no floor row was dropped (one assertion per row, not a
 * row-count check).
 */
export const FLOOR_CAPABILITIES: { floor: string; row: string; disposition: RowOrigin }[] = [
  { floor: 'Free tier', row: 'Free tier', disposition: 'keep' },
  { floor: 'Paid entry tier', row: 'Pro entry', disposition: 'rename' },
  { floor: 'Snapshot overage', row: 'Snapshot overage', disposition: 'gap-fill' },
  { floor: 'AI diff explanation', row: 'AI change classification', disposition: 'rename' },
  { floor: 'Sandbox-verified fixes', row: 'AI fix verification', disposition: 'rename' },
  { floor: 'Self-host', row: 'Self-hostable', disposition: 'rename' },
  { floor: 'Storybook integration', row: 'Storybook integration', disposition: 'gap-fill' },
  { floor: 'MCP server for in-IDE agents', row: 'MCP server for in-IDE agents', disposition: 'gap-fill' },
  { floor: 'PR comment with thumbnail triplet', row: 'PR comment with thumbnail triplet', disposition: 'gap-fill' },
  { floor: 'Cross-OS render normalisation', row: 'Cross-OS render normalisation', disposition: 'gap-fill' },
  { floor: 'Enterprise SSO/SAML', row: 'Enterprise SSO/SAML', disposition: 'gap-fill' },
];

export interface Alternative {
  name: string;
  status: string;
  /** Tailwind text-color class for the status line. */
  tone: 'amber' | 'regression';
}

/** Alternatives strip — the four incumbents teams arrive comparing against. */
export const ALTERNATIVES: Alternative[] = [
  { name: 'Percy', status: '↗ pricing cliff', tone: 'amber' },
  { name: 'Chromatic', status: '◐ Storybook-locked', tone: 'amber' },
  { name: 'BackstopJS', status: '✕ low activity', tone: 'regression' },
  { name: 'Lost Pixel', status: '✕ archived', tone: 'regression' },
];

export interface Versus {
  name: string;
  /** What the competitor is genuinely good at. */
  their: string;
  /** Where Frontguard pulls ahead. */
  ours: string;
  cta: string;
  href: string;
}

/** Head-to-head `.fg-vs` cards — the honest version (prose, traceable to research.md). */
export const VERSUS: Versus[] = [
  {
    name: 'Percy',
    their:
      'Polished hosted dashboard, broad framework SDKs, and mature review workflows backed by BrowserStack.',
    ours:
      'CLI-first and free forever — no per-screenshot billing that punishes a growing suite. Plus AI explanations, not just a red diff to triage by hand.',
    cta: 'Read the comparison',
    href: 'comparison/percy',
  },
  {
    name: 'Chromatic',
    their:
      'Best-in-class for Storybook component testing, with TurboSnap and a tight Storybook publish flow.',
    ours:
      'Tests the real app at real URLs, not just isolated stories — and classifies regression vs. intentional so review queues stay short. Storybook capture is supported too.',
    cta: 'Read the comparison',
    href: 'comparison/chromatic',
  },
  {
    name: 'BackstopJS',
    their: 'A free, self-hosted classic — simple, scriptable, no vendor at all.',
    ours:
      'Same self-hosted freedom, but with zero-config route discovery, anti-flake rendering, AI analysis, and active maintenance (BackstopJS has been quiet for years).',
    cta: 'Migration guide',
    href: 'migrate/backstopjs',
  },
  {
    name: 'Lost Pixel / Argos',
    their:
      'Modern, developer-friendly OSS-leaning tools with good CI ergonomics and Playwright trace support.',
    ours:
      'The only one with AI change classification and verified fixes — and a flat, screenshot-count-independent price with full self-hosting.',
    cta: 'Read the comparison',
    href: 'comparison/argos',
  },
];

export interface Migration {
  name: string;
  /** Path under docs.frontguard.dev. */
  href: string;
}

/** Migration cards — "switching is a config file, not a rewrite". */
export const MIGRATIONS: Migration[] = [
  { name: 'BackstopJS', href: 'migrate/backstopjs' },
  { name: 'Lost Pixel', href: 'migrate/lost-pixel' },
  { name: 'Percy', href: 'comparison/percy' },
  { name: 'Chromatic', href: 'comparison/chromatic' },
];

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MATRIX } from '../routes/comparisons/-data'
import { Route as HomeRoute } from '../routes/index'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../../..')
const README = path.join(REPO_ROOT, 'README.md')
const RESEARCH = path.join(REPO_ROOT, 'docs/research.md')
const LLMS_FULL = path.resolve(__dirname, '../../public/llms-full.txt')
const WEB_SRC = path.resolve(__dirname, '..')
const WEB_PUBLIC = path.resolve(__dirname, '../../public')
const WEB_DIST = path.resolve(__dirname, '../../dist')
const CONCRETE_SOURCE_LOCATION =
  /\b(?:[\w@.-]+\/)*[\w@.-]+\.(?:css|scss|sass|less|styl|js|jsx|ts|tsx|vue|svelte|html):\d+(?::\d+)?\b/i
const CLAIM_SURFACES = [
  README,
  path.join(REPO_ROOT, 'packages/cli/README.md'),
  path.join(REPO_ROOT, 'packages/cli/docker/Dockerfile'),
  path.join(REPO_ROOT, 'packages/cli/docker/docker-compose.yml'),
  path.join(REPO_ROOT, 'packages/cli/src/render/docker.ts'),
  path.join(REPO_ROOT, 'docs/ops-actions.md'),
  path.join(WEB_SRC, 'routes/index.tsx'),
  path.join(WEB_SRC, 'routes/pricing.tsx'),
  path.join(WEB_SRC, 'routes/comparisons.tsx'),
  path.join(WEB_SRC, 'lib/docs-content.ts'),
  LLMS_FULL,
  path.join(WEB_PUBLIC, 'llms.txt'),
  path.join(WEB_PUBLIC, 'agents.md'),
  path.join(REPO_ROOT, 'docs/design-extract/source/Landing.dc.html'),
  path.join(REPO_ROOT, 'docs/design-extract/source/Pricing.dc.html'),
  path.join(REPO_ROOT, 'docs/design-extract/source/Comparisons.dc.html'),
  path.join(REPO_ROOT, 'docs/design-extract/source/Docs.dc.html'),
  path.join(REPO_ROOT, 'docs/design-extract/tanstack/src/routes/index.tsx'),
  path.join(REPO_ROOT, 'docs/design-extract/tanstack/src/routes/pricing.tsx'),
  path.join(REPO_ROOT, 'docs/design-extract/tanstack/src/routes/comparisons.tsx'),
  path.join(REPO_ROOT, 'docs/design-extract/tanstack/src/lib/docs-content.ts'),
]

function readUtf8(filePath: string) {
  return fs.readFileSync(filePath, 'utf8')
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, acc)
    else acc.push(full)
  }
  return acc
}

function extractReadmeComparisonTable(readme: string): string[][] {
  const start = readme.indexOf('## How Frontguard Compares')
  expect(start).toBeGreaterThan(-1)
  const section = readme.slice(start)
  const lines = section.split('\n').filter((line) => line.startsWith('|'))
  // header + separator + data rows
  return lines.slice(2).map((line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()),
  )
}

describe('C14 marketing claims — README comparison table (claim-7, claim-9)', () => {
  const readme = readUtf8(README)
  const research = readUtf8(RESEARCH)
  const rows = extractReadmeComparisonTable(readme)

  it('maps BackstopJS project status to research.md (no fabricated "6yr")', () => {
    const status = rows.find((row) => row[0] === 'Project status')
    expect(status).toBeDefined()
    const backstopCell = status?.[4]
    expect(backstopCell).toMatch(/low activity/i)
    expect(backstopCell).not.toMatch(/6yr|6 yr|six year/i)
    expect(research).toMatch(/BackstopJS[\s\S]*Activity is low/i)
  })

  it('shows Chromatic hosted entry as $179/mo (not per-snapshot)', () => {
    const hostedEntry = rows.find((row) => row[0] === 'Hosted entry')
    expect(hostedEntry?.[3]).toBe('$179/mo')
    expect(readme).not.toMatch(/\|\s*Hosted entry\s*\|[^|]*\|\s*per-snapshot/i)
    expect(research).toMatch(/\$179\/mo/)
  })
})

describe('C14 marketing claims — cross-surface Chromatic pricing (claim-9)', () => {
  it('keeps Chromatic Starter at $179/mo across README, matrix, and llms-full.txt', () => {
    const readme = readUtf8(README)
    const llms = readUtf8(LLMS_FULL)
    const hostedEntry = MATRIX.find((row) => row.capability === 'Hosted entry')
    expect(hostedEntry?.cells[2]).toBe('$179/mo')
    expect(hostedEntry?.cells[0]).toBe('Waitlist')
    expect(readme).toContain('| Hosted entry | Waitlist | $199/mo | $179/mo |')
    expect(llms).toContain('Starter $179/mo')
    expect(llms).not.toMatch(/Frontguard[^\n]*\$29|Pro \$29\/mo/i)
  })

  it('uses only supported CLI configuration fields in llms-full.txt', () => {
    const llms = readUtf8(LLMS_FULL)
    expect(llms).not.toContain('baselineDir:')
    expect(llms).not.toContain("consensus: 'majority'")
    expect(llms).not.toContain("provider: 'auto'")
    expect(llms).toContain("ai: { provider: 'openai', model: 'gpt-4o' }")
    expect(llms).toContain("outputDir: '.frontguard/results'")
    expect(llms).not.toContain('GitHub App one-click baseline accept')
    expect(llms).toContain('thumbnails require a configured `imageUpload` backend')
  })
})

describe('C14 marketing claims — unsupported launch claims stay removed', () => {
  it('keeps public source and design mirrors within demonstrated behavior', () => {
    for (const file of CLAIM_SURFACES) {
      const surface = readUtf8(file)
      expect(surface, file).not.toMatch(
        /expectVisual|DOM \+ computed-style|DOM and computed-style|computed-style diff/i,
      )
      expect(surface, file).not.toMatch(/~40%|73%|<10%|\$100M|\$20B\+|~90%/)
      expect(surface, file).not.toMatch(/only fixes that provably|maps it to the exact code/i)
      expect(surface, file).not.toMatch(
        /kills? (?:the )?(?:#1 )?(?:pain|false positives)|tells? a (?:real )?regression (?:apart )?from|red run means something/i,
      )
      expect(surface, file).not.toMatch(/byte-equivalent|most popular/i)
      expect(surface, file).not.toMatch(/Start 14-day trial|Frontguard charges a flat fee/i)
      expect(surface, file).not.toMatch(/every Pro and Team feature|fully self-hostable/i)
      expect(surface, file).not.toMatch(/\b(?:6|six) lifecycle hooks\b/i)
      expect(surface, file).not.toMatch(/baselines in one run|(?:in|under) \d+ minutes/i)
      expect(surface, file).not.toMatch(
        /Frontguard[^\n]{0,100}\$29|price:\s*['"]\$29|Pro \$29/i,
      )
    }
  })

  it('does not label the AI-disabled validation run as an AI accuracy harness', () => {
    expect(readUtf8(path.join(WEB_PUBLIC, 'llms.txt'))).not.toMatch(/AI accuracy harness/i)
  })

  it('derives the canonical stats snapshot and avoids frozen README test counts', () => {
    const stats = JSON.parse(
      readUtf8(path.join(REPO_ROOT, 'scripts/stats.json')),
    ) as { version: string; testFiles: number }
    const version = readUtf8(path.join(REPO_ROOT, 'VERSION')).trim()
    const testRoot = path.join(REPO_ROOT, 'packages/cli/test')
    const testFiles = walkFiles(testRoot).filter((file) => {
      const relative = path.relative(testRoot, file)
      return (
        file.endsWith('.test.ts') &&
        !relative.split(path.sep).some((part) =>
          ['fixtures', 'fixture-app', 'node_modules'].includes(part),
        )
      )
    })

    expect(stats.version).toBe(version)
    expect(stats.testFiles).toBe(testFiles.length)
    for (const file of [README, path.join(REPO_ROOT, 'packages/cli/README.md')]) {
      expect(readUtf8(file), file).not.toMatch(/\b\d+ test files\b|tests-\d+_files/i)
    }
  })

  it('keeps examples screenshot-grounded instead of inventing source locations', () => {
    for (const file of CLAIM_SURFACES) {
      expect(readUtf8(file), file).not.toMatch(CONCRETE_SOURCE_LOCATION)
    }
  })
})

describe('C14 marketing claims — Schema.org aggregateRating guard (dist-11)', () => {
  it('omits aggregateRating from home SoftwareApplication JSON-LD', async () => {
    const head = await HomeRoute.options.head?.({} as never)
    const meta = (head?.meta ?? []) as Array<Record<string, unknown>>
    const jsonLd = meta.find((m) => 'script:ld+json' in m)?.['script:ld+json'] as Record<
      string,
      unknown
    >
    expect(jsonLd).toBeDefined()
    expect(jsonLd).not.toHaveProperty('aggregateRating')
    expect(JSON.stringify(jsonLd)).not.toMatch(/aggregateRating/i)
  })

  it('does not ship aggregateRating in web source or public assets', () => {
    const sourceFiles = walkFiles(WEB_SRC).filter(
      (f) => /\.(tsx?|css)$/.test(f) && !f.includes(`${path.sep}test${path.sep}`),
    )
    const publicFiles = walkFiles(WEB_PUBLIC)
    for (const file of [...sourceFiles, ...publicFiles]) {
      const text = readUtf8(file)
      expect(text, file).not.toMatch(/aggregateRating/i)
    }
  })
})

describe('C14 marketing claims — SSG build output (dist-11)', () => {
  it('does not embed aggregateRating in built client/server bundles when dist exists', () => {
    if (!fs.existsSync(WEB_DIST)) {
      // dist is produced by `npm run build` in apps/web; skip when not pre-built.
      return
    }
    const bundles = walkFiles(WEB_DIST).filter((f) => /\.(js|html|json)$/.test(f))
    expect(bundles.length).toBeGreaterThan(0)
    for (const file of bundles) {
      const text = readUtf8(file)
      expect(text, file).not.toMatch(/aggregateRating/i)
    }
  })
})

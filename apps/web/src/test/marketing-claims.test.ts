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

  it('maps BackstopJS maintenance to research.md (no fabricated "6yr")', () => {
    const maintained = rows.find((row) => row[0] === 'Actively maintained')
    expect(maintained).toBeDefined()
    const backstopCell = maintained?.[4]
    expect(backstopCell).toMatch(/low activity/i)
    expect(backstopCell).not.toMatch(/6yr|6 yr|six year/i)
    expect(research).toMatch(/BackstopJS[\s\S]*Activity is low/i)
  })

  it('shows Chromatic Pro entry as $179/mo (not per-snapshot)', () => {
    const proEntry = rows.find((row) => row[0] === 'Pro entry')
    expect(proEntry?.[3]).toBe('$179/mo')
    expect(readme).not.toMatch(/\|\s*Pro entry\s*\|[^|]*\|\s*per-snapshot/i)
    expect(research).toMatch(/\$179\/mo/)
  })
})

describe('C14 marketing claims — cross-surface Chromatic pricing (claim-9)', () => {
  it('keeps Chromatic Starter at $179/mo across README, matrix, and llms-full.txt', () => {
    const readme = readUtf8(README)
    const llms = readUtf8(LLMS_FULL)
    const proEntry = MATRIX.find((row) => row.capability === 'Pro entry')
    expect(proEntry?.cells[2]).toBe('$179/mo')
    expect(readme).toContain('| Pro entry | $29/mo (optional) | ~$399/mo | $179/mo |')
    expect(llms).toContain('Starter $179/mo')
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
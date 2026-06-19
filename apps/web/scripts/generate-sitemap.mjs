// Generates apps/web/public/sitemap.xml from marketing routes + docs-content slugs.
// Run: node scripts/generate-sitemap.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = path.resolve(__dirname, '..')
const DOCS_CONTENT = path.resolve(WEB_ROOT, 'src/lib/docs-content.ts')
const OUT_PATH = path.resolve(WEB_ROOT, 'public/sitemap.xml')

const SITE = 'https://frontguard.dev'
const LASTMOD = '2026-06-19'

const MARKETING = [
  { loc: `${SITE}/`, priority: '1.0', changefreq: 'weekly' },
  { loc: `${SITE}/pricing`, priority: '0.9', changefreq: 'weekly' },
  { loc: `${SITE}/comparisons`, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/docs`, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/changelog`, priority: '0.7', changefreq: 'weekly' },
  { loc: `${SITE}/brand`, priority: '0.6', changefreq: 'monthly' },
]

const src = fs.readFileSync(DOCS_CONTENT, 'utf8')
const slugs = [...src.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1])

if (slugs.length !== 37) {
  throw new Error(`Expected 37 doc slugs, found ${slugs.length}`)
}

function urlEntry({ loc, priority, changefreq }) {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
}

const docEntries = slugs.map((slug) =>
  urlEntry({
    loc: `${SITE}/docs/${slug}`,
    priority: '0.6',
    changefreq: 'monthly',
  }),
)

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...MARKETING.map(urlEntry), ...docEntries].join('\n')}
</urlset>
`

fs.writeFileSync(OUT_PATH, xml)
console.log(`Wrote ${OUT_PATH} (${MARKETING.length + slugs.length} URLs)`)
import { createFileRoute, Link, Outlet, useParams } from '@tanstack/react-router'
import { s } from '../lib/style'
import { Shield } from '../components/Shield'
import { articles, navGroups, type Article } from '../lib/docs-content'
import { buildSeoHead, canonicalUrl } from '../lib/seo'
import {
  FRONTGUARD_ORGANIZATION,
  FRONTGUARD_ORGANIZATION_REF,
  FRONTGUARD_WEBSITE_REF,
  breadcrumbListJsonLd,
  docsArticleDescription,
  jsonLdScript,
} from '../lib/schema-org'

const SEO_TITLE = 'Documentation — Frontguard'
const SEO_DESCRIPTION =
  'Frontguard docs: install the CLI, configure visual regression tests, run AI analysis, wire up CI/CD, and self-host the cloud.'
const DOCS_PATH = '/docs'
const DOCS_COLLECTION_ID = `${canonicalUrl(DOCS_PATH)}#collection`

const DOCS_COLLECTION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': DOCS_COLLECTION_ID,
  name: SEO_TITLE,
  description: SEO_DESCRIPTION,
  url: canonicalUrl(DOCS_PATH),
  isPartOf: FRONTGUARD_WEBSITE_REF,
  author: FRONTGUARD_ORGANIZATION_REF,
  publisher: FRONTGUARD_ORGANIZATION_REF,
  hasPart: articles.map((article) => {
    const path = `/docs/${article.id}`
    return {
      '@type': 'TechArticle',
      '@id': `${canonicalUrl(path)}#techarticle`,
      name: article.label,
      headline: article.label,
      description: docsArticleDescription(article),
      articleSection: article.section,
      url: canonicalUrl(path),
      isPartOf: {
        '@type': 'CollectionPage',
        '@id': DOCS_COLLECTION_ID,
      },
    }
  }),
}

const DOCS_BREADCRUMB_JSON_LD = breadcrumbListJsonLd([
  { name: 'Home', path: '/' },
  { name: 'Documentation', path: DOCS_PATH },
])

export const Route = createFileRoute('/docs')({
  head: () =>
    buildSeoHead({
      title: SEO_TITLE,
      description: SEO_DESCRIPTION,
      path: DOCS_PATH,
      scripts: [
        jsonLdScript(DOCS_COLLECTION_JSON_LD),
        jsonLdScript(FRONTGUARD_ORGANIZATION),
        jsonLdScript(DOCS_BREADCRUMB_JSON_LD),
      ],
    }),
  component: DocsLayout,
})

const MONO = "'JetBrains Mono', monospace"
const byId = (id: string): Article => articles.find((a) => a.id === id) ?? articles[0]

function DocsLayout() {
  const params = useParams({ strict: false }) as { _splat?: string }
  const slug = params._splat ?? ''
  const known = !!slug && articles.some((a) => a.id === slug)
  const active = known ? slug : articles[0]?.id ?? 'index'
  const cur = byId(active)

  return (
    <div style={s('background: #0d0c0b; color: #b8b0a6; min-height: 100vh;')}>
      <header style={s('position: sticky; top: 0; z-index: 50; background: rgba(13,12,11,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid #211e1b;')}>
        <div style={s('display: flex; align-items: center; justify-content: space-between; padding: 0 28px; height: 60px;')}>
          <div style={s('display: flex; align-items: center; gap: 26px;')}>
            <Link to="/" className="fg-navlink" style={s('display: flex; align-items: center; gap: 11px; text-decoration: none; color: #f5f1ea;')}>
              <Shield w={20} h={24} />
              <span style={s(`font-family: ${MONO}; font-weight: 700; font-size: 15px; letter-spacing: -0.02em; color: #f5f1ea;`)}>frontguard</span>
            </Link>
            <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; border: 1px solid #2a2622; padding: 3px 9px;`)}>DOCS</span>
          </div>
          <div style={s(`display: flex; align-items: center; gap: 22px; font-family: ${MONO}; font-size: 13px;`)}>
            <div style={s('display: flex; align-items: center; gap: 9px; border: 1px solid #2a2622; background: #131210; padding: 7px 12px; color: #564f48; font-size: 12px;')}>
              <span>Search docs</span>
              <span style={s('border: 1px solid #322d28; padding: 1px 6px; font-size: 10px; color: #6b645c;')}>⌘K</span>
            </div>
            <Link to="/" className="fg-navlink" style={s('color: #b8b0a6; text-decoration: none;')}>home</Link>
            <a href="https://github.com/ravidsrk/frontguard" className="fg-navlink" style={s('color: #b8b0a6; text-decoration: none;')}>github</a>
          </div>
        </div>
      </header>

      <div style={s('display: grid; grid-template-columns: 256px minmax(0, 1fr) 224px; max-width: 1400px; margin: 0 auto;')}>
        <aside style={s('border-right: 1px solid #211e1b; padding: 34px 0 80px;')}>
          <div style={s('position: sticky; top: 84px; max-height: calc(100vh - 100px); overflow-y: auto; padding-right: 4px;')}>
            {navGroups.map((group) => (
              <div key={group.label} style={s('margin-bottom: 24px; padding: 0 22px;')}>
                <div style={s(`font-family: ${MONO}; font-size: 10.5px; color: #564f48; letter-spacing: 0.1em; margin-bottom: 11px;`)}>{group.label}</div>
                {group.ids.map((id) => {
                  const it = byId(id)
                  const isActive = active === id
                  return (
                    <Link
                      key={id}
                      to="/docs/$"
                      params={{ _splat: id }}
                      className="fg-sb-item"
                      style={s(`display: block; font-size: 13.5px; color: ${isActive ? '#e8862e' : '#8c847a'}; text-decoration: none; padding: 6px 0 6px 12px; border-left: 2px solid ${isActive ? '#e8862e' : '#211e1b'}; margin-bottom: 1px;`)}
                    >
                      {it.label}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>

        <main style={s('padding: 44px 60px 120px; min-width: 0;')}>
          <Outlet />
        </main>

        <aside style={s('padding: 44px 24px; border-left: 1px solid #211e1b;')}>
          <div style={s('position: sticky; top: 84px;')}>
            <div style={s(`font-family: ${MONO}; font-size: 10.5px; color: #564f48; letter-spacing: 0.1em; margin-bottom: 14px;`)}>ON THIS PAGE</div>
            {cur.toc.map((t) => (
              <div key={t} className="fg-toc" style={s('font-size: 13px; color: #7c746b; padding: 5px 0; line-height: 1.4; cursor: default;')}>{t}</div>
            ))}
            <div style={s('margin-top: 26px; border-top: 1px solid #211e1b; padding-top: 20px;')}>
              <a href="https://github.com/ravidsrk/frontguard" className="fg-btn-primary" style={s(`display: block; text-align: center; background: #e8862e; color: #0d0c0b; font-family: ${MONO}; font-weight: 700; font-size: 12px; padding: 10px; text-decoration: none;`)}>★ Star on GitHub</a>
              <a href="https://github.com/ravidsrk/frontguard" className="fg-navlink" style={s(`display: block; text-align: center; font-family: ${MONO}; font-size: 11px; color: #6b645c; text-decoration: none; margin-top: 12px;`)}>Edit this page ↗</a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

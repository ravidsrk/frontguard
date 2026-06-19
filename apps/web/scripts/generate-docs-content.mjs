// Generates apps/web/src/lib/docs-content.ts from apps/docs MDX sources.
// Run: node scripts/generate-docs-content.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { marked } from 'marked'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = path.resolve(__dirname, '..')
const DOCS_ROOT = path.resolve(WEB_ROOT, '../../apps/docs/content/docs')
const STATS_PATH = path.resolve(WEB_ROOT, '../../apps/docs/content/stats.json')
const OUT_PATH = path.resolve(WEB_ROOT, 'src/lib/docs-content.ts')

const stats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'))

const MONO = "'JetBrains Mono', monospace"

const STYLES = {
  h1: 'font-size: 42px; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 18px; line-height: 1.05;',
  h2: 'font-size: 26px; letter-spacing: -0.02em; font-weight: 600; color: #f5f1ea; margin: 40px 0 16px;',
  h2first: 'font-size: 26px; letter-spacing: -0.02em; font-weight: 600; color: #f5f1ea; margin: 0 0 16px;',
  h3: 'font-size: 20px; letter-spacing: -0.015em; font-weight: 600; color: #f5f1ea; margin: 28px 0 12px;',
  h4: 'font-size: 17px; font-weight: 600; color: #f5f1ea; margin: 22px 0 10px;',
  p: 'font-size: 16px; line-height: 1.65; color: #c8c0b6; margin: 0 0 18px;',
  ul: 'font-size: 16px; line-height: 1.65; color: #c8c0b6; margin: 0 0 18px; padding-left: 24px;',
  ol: 'font-size: 16px; line-height: 1.65; color: #c8c0b6; margin: 0 0 18px; padding-left: 24px;',
  li: 'margin-bottom: 8px;',
  strong: 'color: #f5f1ea; font-weight: 600;',
  em: 'font-style: italic;',
  a: 'color: #e8862e; text-decoration: underline;',
  ic: "font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #e8862e; background: #1a130b; padding: 2px 6px;",
  hr: 'border: none; border-top: 1px solid #211e1b; margin: 36px 0;',
  blockquote:
    'border-left: 3px solid #e8862e; padding: 12px 18px; margin: 0 0 18px; color: #b8b0a6; background: #131210;',
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function callout(label, body, type = 'info') {
  const accent = type === 'warn' ? '#e5484d' : '#e8862e'
  const bg = type === 'warn' ? '#1a0f0f' : '#1a130b'
  const border = type === 'warn' ? '#3a1818' : '#3a2a18'
  return `<div style="border: 1px solid ${border}; background: ${bg}; padding: 18px 20px; margin-bottom: 28px; display: flex; gap: 14px;">
    <span style="font-family: ${MONO}; color: ${accent}; font-size: 15px;">▍</span>
    <div>
      ${label ? `<div style="font-family: ${MONO}; font-size: 12px; color: ${accent}; margin-bottom: 5px; letter-spacing: 0.03em;">${label}</div>` : ''}
      <div style="font-size: 14px; line-height: 1.55; color: #c8c0b6;">${body}</div>
    </div>
  </div>`
}

function codeBlock(label, body) {
  return `<div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 30px;">
    <div style="border-bottom: 1px solid #211e1b; background: #161412; padding: 9px 16px; font-family: ${MONO}; font-size: 11px; color: #564f48;">${escapeHtml(label)}</div>
    <pre style="margin: 0; padding: 18px 20px; font-family: ${MONO}; font-size: 13px; line-height: 1.85; color: #d8d0c5; overflow-x: auto;">${body}</pre>
  </div>`
}

function tabPanel(label, content) {
  return `<div style="margin-bottom: 20px;">
    <div style="font-family: ${MONO}; font-size: 11px; color: #e8862e; letter-spacing: 0.08em; margin-bottom: 10px;">${escapeHtml(label)}</div>
    ${content}
  </div>`
}

function stepBlock(n, content) {
  return `<div style="background: #0d0c0b; padding: 20px 22px; display: grid; grid-template-columns: 40px 1fr; gap: 18px; align-items: start; margin-bottom: 1px;">
    <span style="font-family: ${MONO}; font-size: 18px; color: #e8862e; font-weight: 700;">${n}</span>
    <div>${content}</div>
  </div>`
}

let firstH2 = true
let parseMarkdown
let currentArticleId = ''

function createRenderer() {
  return {
    heading(token) {
      const text = this.parser.parseInline(token.tokens)
      if (token.depth === 1) {
        firstH2 = true
        return `<h1 style="${STYLES.h1}">${text}</h1>`
      }
      if (token.depth === 2) {
        const style = firstH2 ? STYLES.h2first : STYLES.h2
        firstH2 = false
        return `<h2 style="${style}">${text}</h2>`
      }
      if (token.depth === 3) return `<h3 style="${STYLES.h3}">${text}</h3>`
      if (token.depth === 4) return `<h4 style="${STYLES.h4}">${text}</h4>`
      return `<h${token.depth}>${text}</h${token.depth}>`
    },
    paragraph(token) {
      const inner = this.parser.parseInline(token.tokens)
      if (inner.startsWith('%%') || inner.includes('%%CALLOUT:') || inner.includes('%%TAB:') || inner.includes('%%STEP:')) {
        return inner
      }
      return `<p style="${STYLES.p}">${inner}</p>`
    },
    strong(token) {
      return `<strong style="${STYLES.strong}">${this.parser.parseInline(token.tokens)}</strong>`
    },
    em(token) {
      return `<em style="${STYLES.em}">${this.parser.parseInline(token.tokens)}</em>`
    },
    codespan(token) {
      return `<code style="${STYLES.ic}">${escapeHtml(token.text)}</code>`
    },
    link(token) {
      const resolved = resolveLink(token.href, currentArticleId)
      const text = this.parser.parseInline(token.tokens)
      return `<a href="${resolved}" style="${STYLES.a}">${text}</a>`
    },
    list(token) {
      const tag = token.ordered ? 'ol' : 'ul'
      const style = token.ordered ? STYLES.ol : STYLES.ul
      const body = token.items
        .map((item) => `<li style="${STYLES.li}">${this.parser.parse(item.tokens)}</li>`)
        .join('')
      return `<${tag} style="${style}">${body}</${tag}>`
    },
    hr() {
      return `<hr style="${STYLES.hr}" />`
    },
    blockquote(token) {
      return `<blockquote style="${STYLES.blockquote}">${this.parser.parse(token.tokens)}</blockquote>`
    },
    code(token) {
      const label = token.lang || 'code'
      const meta = token.meta || ''
      const titleMatch = meta.match(/title="([^"]+)"/)
      const labelText = titleMatch ? titleMatch[1] : label
      return codeBlock(labelText, escapeHtml(token.text))
    },
    table(token) {
      const header = token.header
        .map(
          (cell, i) =>
            `<th style="font-family: ${MONO}; font-size: 12px; color: #e8862e; text-align: left; padding: 12px 16px; border-bottom: 1px solid #211e1b;${i === 0 ? ' width: 200px;' : ''}">${this.parser.parseInline(cell.tokens)}</th>`,
        )
        .join('')
      const rows = token.rows
        .map(
          (row) =>
            `<tr>${row
              .map(
                (cell, i) =>
                  `<td style="font-size: 13.5px; color: #b8b0a6; line-height: 1.5; padding: 12px 16px; border-bottom: 1px solid #211e1b; vertical-align: top;${i === 0 ? ' font-family: ' + MONO + '; color: #d8d0c5;' : ''}">${this.parser.parseInline(cell.tokens)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')
      return `<div style="border: 1px solid #2a2622; margin-bottom: 28px; overflow-x: auto;"><table style="width: 100%; border-collapse: collapse;"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`
    },
    html(token) {
      // Drop stray MDX/JSX tags that leaked through preprocessing.
      if (/^<\/?(script|Tab|Tabs|Steps|Step|Callout)\b/i.test(token.raw.trim())) return ''
      return ''
    },
  }
}

marked.use({ renderer: createRenderer(), gfm: true, breaks: false })

parseMarkdown = (md, articleId = currentArticleId) => {
  firstH2 = true
  const prev = currentArticleId
  currentArticleId = articleId
  const html = marked.parse(md)
  currentArticleId = prev
  return html
}

function preprocessMdx(raw) {
  let s = raw

  // Drop imports
  s = s.replace(/^import\s+.+$/gm, '')

  // Drop MDX JSON-LD / script blocks (comparison articles)
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<script[^>]*\/>/gi, '')

  // Drop any remaining self-closing or paired JSX components
  s = s.replace(/<\/?(?:Tab|Tabs|Steps|Step|Callout)\b[^>]*\/?>/gi, '')

  // Fumadocs code fences: ```lang title="Label"
  s = s.replace(/```(\w+)\s+title="([^"]+)"\s*\n/g, '```$1 title="$2"\n')

  // Stats placeholders
  s = s.replace(/\{stats\.display\.version\}/g, stats.display.version)
  s = s.replace(/\{stats\.display\.tests\}/g, stats.display.tests)
  s = s.replace(/\{stats\.display\.sourceFiles\}/g, stats.display.sourceFiles)
  s = s.replace(/\{stats\.display\.bundle\}/g, stats.display.bundle)
  s = s.replace(/\{stats\.display\.plugins\}/g, stats.display.plugins)

  // Fix broken netlify link (probe 5.3)
  s = s.replace(/\/docs\/integrations\/github-app/g, '/docs/integrations/github')

  // Unify frontguard action refs to @v0 in emitted workflow examples (probe 5.4)
  s = s.replace(/ravidsrk\/frontguard@(v1|main)/g, 'ravidsrk/frontguard@v0')

  // Callouts (multiline, non-greedy)
  s = s.replace(
    /<Callout(?:\s+type="([^"]*)")?(?:\s+title="([^"]*)")?\s*>([\s\S]*?)<\/Callout>/g,
    (_, type = 'info', title, body) => {
      const label = title ? escapeHtml(title).toUpperCase() : type === 'warn' ? 'WARNING' : 'NOTE'
      return `\n\n%%CALLOUT:${type}:${label}%%\n${body.trim()}\n%%/CALLOUT%%\n\n`
    },
  )

  // Tabs — extract Tab children
  s = s.replace(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, (_, inner) => {
    const tabs = []
    const tabRe = /<Tab\s+value="([^"]+)"[^>]*>([\s\S]*?)<\/Tab>/g
    let m
    while ((m = tabRe.exec(inner)) !== null) {
      tabs.push({ label: m[1], content: m[2].trim() })
    }
    if (!tabs.length) return inner
    return tabs.map((t) => `\n\n%%TAB:${t.label}%%\n${t.content}\n%%/TAB%%\n`).join('\n')
  })

  // Steps
  s = s.replace(/<Steps>\s*([\s\S]*?)\s*<\/Steps>/g, (_, inner) => {
    const steps = inner.split(/<Step>/).filter(Boolean)
    return steps
      .map((step, i) => `\n\n%%STEP:${i + 1}%%\n${step.replace(/<\/Step>/, '').trim()}\n%%/STEP%%\n`)
      .join('\n')
  })

  return s.trim()
}

const FOLDER_INDEX_SLUGS = new Set(['cli', 'playwright', 'ci-cd'])
const SHORT_ALIASES = {
  'cloud-api': 'guides/cloud-api',
  guides: 'guides/ai-analysis',
}

function resolveRelativePath(href, articleId) {
  const dirParts = articleId.includes('/') ? articleId.split('/').slice(0, -1) : []
  let rel = href
  const base = [...dirParts]
  while (rel.startsWith('../')) {
    rel = rel.slice(3)
    if (base.length) base.pop()
  }
  if (rel.startsWith('./')) rel = rel.slice(2)
  return [...base, rel].filter(Boolean).join('/')
}

function normalizeDocSlug(h) {
  let slug = h.replace(/\/$/, '')
  if (SHORT_ALIASES[slug]) slug = SHORT_ALIASES[slug]
  if (FOLDER_INDEX_SLUGS.has(slug)) slug = `${slug}/index`
  return slug
}

function resolveLink(href, articleId = '') {
  if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) return href

  let h = href
  if (h.startsWith('/docs/')) {
    return `/docs/${normalizeDocSlug(h.slice('/docs/'.length))}`
  }
  if (h.startsWith('/')) return h

  if (h.startsWith('./') || h.startsWith('../')) {
    h = resolveRelativePath(h, articleId)
  }

  return `/docs/${normalizeDocSlug(h)}`
}

function postprocessHtml(html, articleId) {
  let out = html

  out = out.replace(
    /%%CALLOUT:([^:]+):([^%]+)%%([\s\S]*?)%%\/CALLOUT%%/g,
    (_, type, label, body) => callout(label, parseMarkdown(body.trim(), articleId), type),
  )

  out = out.replace(/%%TAB:([^%]+)%%([\s\S]*?)%%\/TAB%%/g, (_, label, body) =>
    tabPanel(label, parseMarkdown(body.trim(), articleId)),
  )

  out = out.replace(/%%STEP:(\d+)%%([\s\S]*?)%%\/STEP%%/g, (_, n, body) =>
    stepBlock(n, parseMarkdown(body.trim(), articleId)),
  )

  // Unwrap block elements erroneously wrapped in <p> by the parser
  out = out.replace(/<p style="[^"]*">(\s*(?:%%|<div))/g, '$1')
  out = out.replace(/(<\/div>)\s*<\/p>/g, '$1')

  // Wrap consecutive step blocks
  out = out.replace(
    /(<div style="background: #0d0c0b; padding: 20px 22px; display: grid; grid-template-columns: 40px 1fr;[\s\S]*?<\/div>\s*){2,}/g,
    (match) =>
      `<div style="display: grid; gap: 1px; background: #211e1b; border: 1px solid #211e1b; margin-bottom: 30px;">${match}</div>`,
  )

  return cleanupArtifacts(out, articleId)
}

function cleanupArtifacts(html, articleId) {
  let out = html

  // Convert any leftover fenced code blocks
  out = out.replace(/```(\w*)(?:\s+title="([^"]+)")?\s*\n([\s\S]*?)```/g, (_, lang, title, body) =>
    codeBlock(title || lang || 'code', escapeHtml(body.trimEnd())),
  )

  // Convert leftover markdown links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    const resolved = resolveLink(href, articleId)
    return `<a href="${resolved}" style="${STYLES.a}">${text}</a>`
  })

  // Convert leftover **bold** and `code`
  out = out.replace(/\*\*([^*]+)\*\*/g, `<strong style="${STYLES.strong}">$1</strong>`)
  out = out.replace(/`([^`]+)`/g, `<code style="${STYLES.ic}">$1</code>`)

  // Strip any script tags that survived
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '')
  out = out.replace(/<script[^>]*\/?>/gi, '')

  return out
}

function extractToc(html) {
  const toc = []
  const re = /<h2[^>]*>(.*?)<\/h2>/g
  let m
  while ((m = re.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim()
    if (text) toc.push(text)
  }
  return toc
}

function slugFromFile(filePath) {
  const rel = path.relative(DOCS_ROOT, filePath).replace(/\.mdx$/, '')
  return rel === 'index' ? 'index' : rel
}

function collectMdxFiles(dir = DOCS_ROOT) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectMdxFiles(full))
    else if (entry.name.endsWith('.mdx')) files.push(full)
  }
  return files
}

function loadMeta(metaPath) {
  return JSON.parse(fs.readFileSync(metaPath, 'utf8'))
}

function expandGuidesFolder() {
  const sub = loadMeta(path.join(DOCS_ROOT, 'guides/meta.json'))
  const groups = []
  let subSection = 'Features'
  let ids = []

  const flushSub = () => {
    if (!ids.length) return
    groups.push({ label: `GUIDES — ${subSection.toUpperCase()}`, ids: [...ids] })
    ids = []
  }

  for (const subPage of sub.pages) {
    if (subPage.startsWith('---')) {
      flushSub()
      subSection = subPage.replace(/^---|---$/g, '').trim()
      continue
    }
    ids.push(`guides/${subPage}`)
  }
  flushSub()
  return groups
}

function expandSimpleFolder(folder) {
  const sub = loadMeta(path.join(DOCS_ROOT, folder, 'meta.json'))
  const ids = []
  for (const subPage of sub.pages) {
    if (subPage.startsWith('---')) continue
    ids.push(`${folder}/${subPage}`)
  }
  const title = sub.title || folder
  return [{ label: title.toUpperCase(), ids }]
}

function buildNav() {
  const rootMeta = loadMeta(path.join(DOCS_ROOT, 'meta.json'))
  const navGroups = []
  let currentSection = 'Docs'
  let sectionIds = []

  const flushFlat = () => {
    if (sectionIds.length) {
      navGroups.push({ label: currentSection.toUpperCase(), ids: [...sectionIds] })
      sectionIds = []
    }
  }

  for (const page of rootMeta.pages) {
    if (page.startsWith('---')) {
      flushFlat()
      currentSection = page.replace(/^---|---$/g, '').trim()
      continue
    }

    const folderMeta = path.join(DOCS_ROOT, page, 'meta.json')
    if (fs.existsSync(folderMeta)) {
      if (currentSection === 'Reference') {
        const sub = loadMeta(folderMeta)
        for (const subPage of sub.pages) {
          if (subPage.startsWith('---')) continue
          sectionIds.push(`${page}/${subPage}`)
        }
      } else if (page === 'guides') {
        navGroups.push(...expandGuidesFolder())
      } else if (page === 'ci-cd') {
        navGroups.push(...expandSimpleFolder('ci-cd'))
      } else if (page === 'integrations') {
        navGroups.push(...expandSimpleFolder('integrations'))
      } else if (page === 'comparisons') {
        navGroups.push(...expandSimpleFolder('comparisons'))
      } else {
        navGroups.push(...expandSimpleFolder(page))
      }
    } else {
      sectionIds.push(page)
    }
  }
  flushFlat()
  return navGroups
}

function sectionForId(id, navGroups) {
  for (const g of navGroups) {
    if (g.ids.includes(id)) {
      const label = g.label
      if (label.startsWith('GUIDES — ')) return 'Guides'
      if (label === 'CI/CD') return 'CI/CD'
      if (label === 'CLI' || label === 'PLAYWRIGHT PLUGIN') return 'Reference'
      const normalized =
        label.charAt(0) + label.slice(1).toLowerCase().replace(' & sandboxing', ' & Sandboxing')
      return normalized
    }
  }
  return 'Docs'
}

function convertArticle(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(raw)
  const id = slugFromFile(filePath)
  const preprocessed = preprocessMdx(content)
  const html = postprocessHtml(parseMarkdown(preprocessed, id), id)
  const toc = extractToc(html)
  return {
    id,
    label: data.title || id,
    section: '',
    toc,
    html,
  }
}

function validateArticles(articles) {
  const errors = []
  for (const a of articles) {
    if (a.html.includes('```')) errors.push(`${a.id}: contains triple-backtick`)
    if (a.html.includes('<script')) errors.push(`${a.id}: contains <script`)
    if (/\[[^\]]+\]\([^)]+\)/.test(a.html)) errors.push(`${a.id}: contains markdown link`)
  }
  if (errors.length) {
    console.error('Validation failed:')
    for (const e of errors) console.error('  -', e)
    process.exit(1)
  }
}

function tsString(s) {
  return JSON.stringify(s)
}

function main() {
  const mdxFiles = collectMdxFiles()
  const navGroups = buildNav()
  const navIds = navGroups.flatMap((g) => g.ids)
  const articlesById = new Map()

  for (const file of mdxFiles) {
    const article = convertArticle(file)
    articlesById.set(article.id, article)
  }

  const articles = []
  for (const id of navIds) {
    const a = articlesById.get(id)
    if (a) {
      a.section = sectionForId(id, navGroups)
      articles.push(a)
      articlesById.delete(id)
    }
  }
  for (const a of articlesById.values()) {
    a.section = 'Docs'
    articles.push(a)
  }

  if (articles.length !== 37) {
    console.warn(`Expected 37 articles, got ${articles.length}`)
    console.warn('IDs:', articles.map((a) => a.id).join(', '))
  }

  validateArticles(articles)

  const parts = [
    `// AUTO-GENERATED by scripts/generate-docs-content.mjs — do not edit by hand.`,
    `// Re-run: node scripts/generate-docs-content.mjs`,
    ``,
    `export type Article = {`,
    `  id: string`,
    `  label: string`,
    `  section: string`,
    `  toc: string[]`,
    `  html: string`,
    `}`,
    ``,
    `export const articles: Article[] = [`,
  ]

  for (const a of articles) {
    parts.push(
      `  { id: ${tsString(a.id)}, label: ${tsString(a.label)}, section: ${tsString(a.section)}, toc: ${JSON.stringify(a.toc)}, html: ${tsString(a.html)} },`,
    )
  }

  parts.push(`]`, ``)
  parts.push(`export const navGroups: { label: string; ids: string[] }[] = [`)
  for (const g of navGroups) {
    parts.push(`  { label: ${tsString(g.label)}, ids: ${JSON.stringify(g.ids)} },`)
  }
  parts.push(`]`, ``)
  parts.push(`export const DOC_SLUGS = articles.map((a) => a.id) as readonly string[]`, ``)
  parts.push(`export const FIRST_DOC_SLUG = ${tsString(articles[0]?.id ?? 'index')}`, ``)

  fs.writeFileSync(OUT_PATH, parts.join('\n'))
  console.log(`Wrote ${articles.length} articles to ${OUT_PATH}`)
  console.log('Nav groups:', navGroups.map((g) => g.label).join(', '))
}

main()
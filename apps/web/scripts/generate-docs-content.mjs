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
  lead: 'font-size: 17px; line-height: 1.65; color: #c8c0b6; margin: 0 0 30px;',
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

function preprocessMdx(raw) {
  let s = raw

  // Drop imports
  s = s.replace(/^import\s+.+$/gm, '')

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

function resolveLink(href) {
  if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) return href
  let h = href
  if (h.startsWith('./')) h = h.slice(2)
  if (h.startsWith('/docs/')) return h
  if (h.startsWith('/')) return h
  // relative doc link → /docs/<path>
  return `/docs/${h.replace(/\/$/, '')}`
}

let firstH2 = true

const renderer = {
  heading({ text, depth }) {
    const t = text
    if (depth === 1) {
      firstH2 = true
      return `<h1 style="${STYLES.h1}">${t}</h1>`
    }
    if (depth === 2) {
      const style = firstH2 ? STYLES.h2first : STYLES.h2
      firstH2 = false
      return `<h2 style="${style}">${t}</h2>`
    }
    if (depth === 3) return `<h3 style="${STYLES.h3}">${t}</h3>`
    if (depth === 4) return `<h4 style="${STYLES.h4}">${t}</h4>`
    return `<h${depth}>${t}</h${depth}>`
  },
  paragraph({ text }) {
    return `<p style="${STYLES.p}">${text}</p>`
  },
  strong({ text }) {
    return `<strong style="${STYLES.strong}">${text}</strong>`
  },
  em({ text }) {
    return `<em style="${STYLES.em}">${text}</em>`
  },
  codespan({ text }) {
    return `<code style="${STYLES.ic}">${text}</code>`
  },
  link({ href, text }) {
    const resolved = resolveLink(href)
    return `<a href="${resolved}" style="${STYLES.a}">${text}</a>`
  },
  list(token) {
    const tag = token.ordered ? 'ol' : 'ul'
    const style = token.ordered ? STYLES.ol : STYLES.ul
    const body = token.items.map((item) => `<li style="${STYLES.li}">${item.text}</li>`).join('')
    return `<${tag} style="${style}">${body}</${tag}>`
  },
  hr() {
    return `<hr style="${STYLES.hr}" />`
  },
  blockquote({ text }) {
    return `<blockquote style="${STYLES.blockquote}">${text}</blockquote>`
  },
  code({ text, lang }) {
    const label = lang || 'code'
    const escaped = escapeHtml(text)
    return codeBlock(label, escaped)
  },
  table(token) {
    const header = token.header
      .map(
        (cell, i) =>
          `<th style="font-family: ${MONO}; font-size: 12px; color: #e8862e; text-align: left; padding: 12px 16px; border-bottom: 1px solid #211e1b;${i === 0 ? ' width: 200px;' : ''}">${cell.text}</th>`,
      )
      .join('')
    const rows = token.rows
      .map(
        (row) =>
          `<tr>${row
            .map(
              (cell, i) =>
                `<td style="font-size: 13.5px; color: #b8b0a6; line-height: 1.5; padding: 12px 16px; border-bottom: 1px solid #211e1b; vertical-align: top;${i === 0 ? ' font-family: ' + MONO + '; color: #d8d0c5;' : ''}">${cell.text}</td>`,
            )
            .join('')}</tr>`,
      )
      .join('')
    return `<div style="border: 1px solid #2a2622; margin-bottom: 28px; overflow-x: auto;"><table style="width: 100%; border-collapse: collapse;"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`
  },
}

marked.use({ renderer, gfm: true, breaks: false })

function postprocessHtml(html) {
  let out = html

  // Callout markers
  out = out.replace(
    /%%CALLOUT:([^:]+):([^%]+)%%([\s\S]*?)%%\/CALLOUT%%/g,
    (_, type, label, body) => {
      const inner = marked.parse(body.trim())
      return callout(label, inner, type)
    },
  )

  // Tab markers
  out = out.replace(/%%TAB:([^%]+)%%([\s\S]*?)%%\/TAB%%/g, (_, label, body) => {
    const inner = marked.parse(body.trim())
    return tabPanel(label, inner)
  })

  // Step markers
  out = out.replace(/%%STEP:(\d+)%%([\s\S]*?)%%\/STEP%%/g, (_, n, body) => {
    const inner = marked.parse(body.trim())
    return stepBlock(n, inner)
  })

  // Wrap consecutive step blocks
  out = out.replace(
    /(<div style="background: #0d0c0b; padding: 20px 22px; display: grid; grid-template-columns: 40px 1fr;[\s\S]*?<\/div>\s*){2,}/g,
    (match) =>
      `<div style="display: grid; gap: 1px; background: #211e1b; border: 1px solid #211e1b; margin-bottom: 30px;">${match}</div>`,
  )

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

function expandPages(pages, prefix = '') {
  const ids = []
  for (const page of pages) {
    if (page.startsWith('---')) continue
    const full = prefix ? `${prefix}/${page}` : page
    const folderMeta = path.join(DOCS_ROOT, full, 'meta.json')
    if (fs.existsSync(folderMeta)) {
      const sub = loadMeta(folderMeta)
      for (const subPage of sub.pages) {
        if (subPage.startsWith('---')) continue
        ids.push(`${full}/${subPage}`)
      }
    } else {
      ids.push(full)
    }
  }
  return ids
}

function expandFolder(folder, parentSection) {
  const folderMetaPath = path.join(DOCS_ROOT, folder, 'meta.json')
  if (!fs.existsSync(folderMetaPath)) return null
  const sub = loadMeta(folderMetaPath)
  const groups = []
  let subSection = sub.title || parentSection
  let ids = []

  const flushSub = () => {
    if (!ids.length) return
    const label =
      sub.pages.some((p) => p.startsWith('---')) && subSection !== sub.title
        ? `${sub.title || parentSection} — ${subSection}`
        : sub.title || parentSection
    groups.push({ label: label.toUpperCase(), ids: [...ids] })
    ids = []
  }

  for (const subPage of sub.pages) {
    if (subPage.startsWith('---')) {
      flushSub()
      subSection = subPage.replace(/^---|---$/g, '').trim()
      continue
    }
    ids.push(`${folder}/${subPage}`)
  }
  flushSub()
  return groups
}

function buildNav() {
  const rootMeta = loadMeta(path.join(DOCS_ROOT, 'meta.json'))
  const navGroups = []
  let currentSection = 'Docs'
  let currentIds = []

  const flush = () => {
    if (currentIds.length) {
      navGroups.push({ label: currentSection.toUpperCase(), ids: [...currentIds] })
      currentIds = []
    }
  }

  for (const page of rootMeta.pages) {
    if (page.startsWith('---')) {
      flush()
      currentSection = page.replace(/^---|---$/g, '').trim()
      continue
    }
    const folderMeta = path.join(DOCS_ROOT, page, 'meta.json')
    if (fs.existsSync(folderMeta)) {
      flush()
      const expanded = expandFolder(page, currentSection)
      if (expanded) navGroups.push(...expanded)
    } else {
      currentIds.push(page)
    }
  }
  flush()
  return navGroups
}

function convertArticle(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(raw)
  firstH2 = true
  const preprocessed = preprocessMdx(content)
  const html = postprocessHtml(marked.parse(preprocessed))
  const toc = extractToc(html)
  const id = slugFromFile(filePath)
  return {
    id,
    label: data.title || id,
    section: '', // filled later from nav
    toc,
    html,
  }
}

function sectionForId(id, navGroups) {
  for (const g of navGroups) {
    if (g.ids.includes(id)) {
      const label = g.label
      const dash = label.indexOf(' — ')
      const base = dash === -1 ? label : label.slice(0, dash)
      return base.charAt(0) + base.slice(1).toLowerCase()
    }
  }
  return 'Docs'
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

  // Order articles by nav, append any orphans
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
}

main()
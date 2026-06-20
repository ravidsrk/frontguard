import fs from 'node:fs'
import path from 'node:path'
import { DOC_SLUGS } from '../lib/docs-content'

/** Vitest cwd is apps/web; README lives at monorepo root. */
const README = path.resolve(process.cwd(), '../../README.md')

const DOC_LINK_RE = /https:\/\/frontguard\.dev\/docs\/([a-z0-9/_-]+)/g

describe('README doc links (install-6 / claim-6)', () => {
  it('points every frontguard.dev/docs link at a real article slug', () => {
    const readme = fs.readFileSync(README, 'utf8')
    const slugs = new Set(DOC_SLUGS)
    const hits: string[] = []

    let m
    while ((m = DOC_LINK_RE.exec(readme)) !== null) {
      hits.push(m[1])
    }

    expect(hits.length).toBeGreaterThan(0)
    for (const slug of hits) {
      expect(slugs.has(slug)).toBe(true)
    }
  })

  it('uses comparisons/ paths for Percy and Chromatic (not guides/)', () => {
    const readme = fs.readFileSync(README, 'utf8')
    expect(readme).toContain(
      'https://frontguard.dev/docs/comparisons/frontguard-vs-percy',
    )
    expect(readme).toContain(
      'https://frontguard.dev/docs/comparisons/frontguard-vs-chromatic',
    )
    expect(readme).not.toMatch(/guides\/frontguard-vs-(percy|chromatic)/)
  })

  it('does not reference the deprecated docs.frontguard.dev host', () => {
    const readme = fs.readFileSync(README, 'utf8')
    expect(readme).not.toContain('docs.frontguard.dev')
  })
})
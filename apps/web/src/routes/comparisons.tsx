import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { docsUrl } from '../lib/site'
import { s } from '../lib/style'
import { buildSeoHead, canonicalUrl } from '../lib/seo'
import {
  FRONTGUARD_ORGANIZATION_REF,
  FRONTGUARD_WEBSITE_REF,
  breadcrumbListJsonLd,
  jsonLdScript,
} from '../lib/schema-org'
import { ALTERNATIVES, MATRIX, MIGRATIONS, VENDORS, VERSUS } from './comparisons/-data'

const SEO_TITLE = 'Comparisons — Frontguard vs. everyone else'
const SEO_DESCRIPTION =
  'How Frontguard compares to Percy, Chromatic, BackstopJS, Lost Pixel, and Argos — capability by capability, with sources you can check.'
const COMPARISONS_PATH = '/comparisons'
const COMPARISONS_CANONICAL = canonicalUrl(COMPARISONS_PATH)

const COMPARISONS_ARTICLE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  '@id': `${COMPARISONS_CANONICAL}#article`,
  name: SEO_TITLE,
  headline: SEO_TITLE,
  description: SEO_DESCRIPTION,
  url: COMPARISONS_CANONICAL,
  mainEntityOfPage: COMPARISONS_CANONICAL,
  articleSection: 'Comparisons',
  isPartOf: FRONTGUARD_WEBSITE_REF,
  author: FRONTGUARD_ORGANIZATION_REF,
  publisher: FRONTGUARD_ORGANIZATION_REF,
  about: 'Visual regression testing tools compared capability by capability.',
  mentions: VENDORS.map((name) => ({
    '@type': 'SoftwareApplication',
    name,
    applicationCategory: 'DeveloperApplication',
  })),
}

const COMPARISONS_BREADCRUMB_JSON_LD = breadcrumbListJsonLd([
  { name: 'Home', path: '/' },
  { name: 'Comparisons', path: COMPARISONS_PATH },
])

export const Route = createFileRoute('/comparisons')({
  head: () =>
    buildSeoHead({
      title: SEO_TITLE,
      description: SEO_DESCRIPTION,
      path: COMPARISONS_PATH,
      ogType: 'article',
      scripts: [
        jsonLdScript(COMPARISONS_ARTICLE_JSON_LD),
        jsonLdScript(COMPARISONS_BREADCRUMB_JSON_LD),
      ],
    }),
  component: Comparisons,
})

const MONO = "'JetBrains Mono', monospace"
const Y = '#4fb477'
const P = '#e8862e'
const N = '#6b645c'
const INKC = '#a89f94'

function cellColor(v: string, colIndex: number): string {
  if (colIndex === 0 && v.startsWith('✓')) return Y
  if (v === '✓') return Y
  if (v === '◐') return P
  if (v === '✕' || v.startsWith('✕')) return N
  return INKC
}

function Comparisons() {
  return (
    <div style={s('background: #0d0c0b; color: #b8b0a6; min-height: 100vh;')}>
      <Nav active="compare" />

      <header style={s('max-width: 1200px; margin: 0 auto; padding: 76px 28px 44px; text-align: center;')}>
        <div
          style={s(
            `font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.08em; margin-bottom: 16px;`,
          )}
        >
          // HOW IT COMPARES
        </div>
        <h1
          style={s(
            'font-size: 52px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 18px;',
          )}
        >
          Frontguard vs. everyone else.
        </h1>
        <p
          style={s(
            'font-size: 18px; line-height: 1.55; color: #b8b0a6; margin: 0 auto; max-width: 600px;',
          )}
        >
          Visual testing tools all take a screenshot and diff it. Only Frontguard explains{' '}
          <em style={s('color: #f5f1ea; font-style: normal;')}>why</em> something changed,
          verifies a fix, and stays open source and self-hostable.
        </p>
      </header>

      <section style={s('max-width: 1200px; margin: 0 auto; padding: 0 28px 12px;')}>
        <div style={s('display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;')}>
          {ALTERNATIVES.map((alt) => (
            <div
              key={alt.name}
              data-testid="alternative"
              style={s('border: 1px solid #2a2622; background: #131210; padding: 16px 18px;')}
            >
              <div style={s(`font-family: ${MONO}; font-size: 13px; color: #d8d0c5; margin-bottom: 6px;`)}>
                {alt.name}
              </div>
              <div style={s(`font-family: ${MONO}; font-size: 12px; color: ${alt.color};`)}>
                {alt.status}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={s('max-width: 1200px; margin: 0 auto; padding: 8px 28px 40px;')}>
        <div style={s('border: 1px solid #2a2622; overflow-x: auto;')} data-testid="vendor-matrix">
          <table style={s('width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 860px;')}>
            <caption style={s('position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0);')}>
              Comparison between Frontguard, Percy, Chromatic, BackstopJS, Lost Pixel, and Argos
            </caption>
            <thead>
              <tr style={s('background: #161412;')}>
                <th
                  scope="col"
                  style={s(
                    `text-align: left; padding: 18px; font-family: ${MONO}; font-size: 11px; color: #7c746b; font-weight: 500; letter-spacing: 0.04em;`,
                  )}
                >
                  CAPABILITY
                </th>
                {VENDORS.map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    style={s(
                      `padding: 18px 12px; font-family: ${MONO}; font-size: ${i === 0 ? '13px' : '12px'}; color: ${i === 0 ? '#e8862e' : '#8c847a'}; font-weight: ${i === 0 ? 700 : 500};`,
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.capability} className="fg-cmp-row" style={s('border-top: 1px solid #211e1b;')}>
                  <th
                    scope="row"
                    style={s(
                      `padding: 15px 18px; color: #d8d0c5; font-weight: ${row.emphasize ? 600 : 400}; text-align: left;`,
                    )}
                  >
                    {row.capability}
                  </th>
                  {row.cells.map((val, i) => (
                    <td
                      key={i}
                      data-glyph={val.length <= 2 ? val : undefined}
                      style={s(
                        `text-align: center; padding: 15px 12px; color: ${cellColor(val, i)}; font-family: ${MONO}; ${i === 0 ? 'font-weight: 700;' : 'font-size: 12.5px;'}`,
                      )}
                    >
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          style={s(
            `display: flex; gap: 22px; flex-wrap: wrap; margin-top: 16px; font-family: ${MONO}; font-size: 11.5px; color: #6b645c;`,
          )}
        >
          <span>
            <span style={s('color: #4fb477;')}>✓</span> full support
          </span>
          <span>
            <span style={s('color: #e8862e;')}>◐</span> partial / limited
          </span>
          <span>
            <span style={s('color: #6b645c;')}>✕</span> not available
          </span>
        </div>
        <p
          style={s(
            `margin-top: 16px; font-family: ${MONO}; font-size: 12px; color: #6b645c;`,
          )}
        >
          Every cell traces to documented vendor behaviour — see{' '}
          <a
            href="https://github.com/ravidsrk/frontguard/blob/main/docs/research.md"
            target="_blank"
            rel="noopener noreferrer"
            className="fg-link"
            style={s('color: #8c847a; text-decoration: none;')}
          >
            docs/research.md
          </a>
          .
        </p>
      </section>

      <section style={s('max-width: 1200px; margin: 0 auto; padding: 56px 28px;')}>
        <h2
          style={s(
            'font-size: 32px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 8px;',
          )}
        >
          Head to head
        </h2>
        <p style={s('font-size: 16px; color: #b8b0a6; margin: 0 0 36px;')}>
          The honest version — what each tool is genuinely good at, and where Frontguard pulls
          ahead.
        </p>
        <div style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 18px;')}>
          {VERSUS.map((v) => (
            <article
              key={v.name}
              className="fg-vs"
              style={s('border: 1px solid #2a2622; background: #131210; padding: 28px 26px;')}
            >
              <div style={s('display: flex; align-items: center; gap: 12px; margin-bottom: 18px;')}>
                <span style={s(`font-family: ${MONO}; font-size: 13px; color: #e8862e; font-weight: 700;`)}>
                  frontguard
                </span>
                <span style={s(`font-family: ${MONO}; font-size: 12px; color: #564f48;`)}>vs</span>
                <span style={s(`font-family: ${MONO}; font-size: 13px; color: #d8d0c5;`)}>{v.name}</span>
              </div>
              <div style={s('margin-bottom: 16px;')}>
                <div
                  style={s(
                    `font-family: ${MONO}; font-size: 11px; color: #8c847a; letter-spacing: 0.04em; margin-bottom: 7px;`,
                  )}
                >
                  {v.name.toUpperCase()} IS GOOD AT
                </div>
                <p style={s('margin: 0; font-size: 14px; line-height: 1.55; color: #b8b0a6;')}>
                  {v.their}
                </p>
              </div>
              <div style={s('margin-bottom: 20px;')}>
                <div
                  style={s(
                    `font-family: ${MONO}; font-size: 11px; color: #e8862e; letter-spacing: 0.04em; margin-bottom: 7px;`,
                  )}
                >
                  WHERE FRONTGUARD WINS
                </div>
                <p style={s('margin: 0; font-size: 14px; line-height: 1.55; color: #d8d0c5;')}>
                  {v.ours}
                </p>
              </div>
              <a
                href={docsUrl(v.href)}
                target="_blank"
                rel="noopener noreferrer"
                className="fg-link"
                style={s(`font-family: ${MONO}; font-size: 12.5px; color: #8c847a; text-decoration: none;`)}
              >
                {v.cta} →
              </a>
            </article>
          ))}
        </div>
      </section>

      <section style={s('border-top: 1px solid #211e1b; background: #100f0e;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 64px 28px;')}>
          <div
            style={s(
              'display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 48px; align-items: center;',
            )}
          >
            <div>
              <h2
                style={s(
                  'font-size: 30px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px;',
                )}
              >
                Switching is a config file, not a rewrite.
              </h2>
              <p style={s('font-size: 15.5px; line-height: 1.6; color: #b8b0a6; margin: 0;')}>
                Frontguard reads your app by URL — no test files to port, no proprietary snapshot
                format. Point it at your dev server and you have baselines in one run. Migration
                guides walk through the rest.
              </p>
            </div>
            <div style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 12px;')}>
              {MIGRATIONS.map((m) => (
                <a
                  key={m.name}
                  href={docsUrl(m.href)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="migration"
                  className="fg-vs"
                  style={s(
                    'border: 1px solid #2a2622; background: #131210; padding: 18px 20px; text-decoration: none;',
                  )}
                >
                  <div
                    style={s(
                      `font-family: ${MONO}; font-size: 11px; color: #564f48; margin-bottom: 6px;`,
                    )}
                  >
                    MIGRATE FROM
                  </div>
                  <div style={s('font-size: 16px; color: #f5f1ea; font-weight: 600;')}>{m.name}</div>
                  <div style={s(`font-family: ${MONO}; font-size: 12px; color: #e8862e; margin-top: 8px;`)}>
                    Read guide →
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={s('border-top: 1px solid #211e1b;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 80px 28px; text-align: center;')}>
          <h2
            style={s(
              'font-size: 40px; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px;',
            )}
          >
            See the difference yourself.
          </h2>
          <p
            style={s(
              'font-size: 17px; color: #b8b0a6; margin: 0 auto 30px; max-width: 440px; line-height: 1.55;',
            )}
          >
            Install the CLI and run your first AI-explained visual check in two minutes.
          </p>
          <div style={s('display: flex; gap: 14px; justify-content: center;')}>
            <a
              href="/docs"
              className="fg-btn-primary"
              style={s(
                `background: #e8862e; color: #0d0c0b; font-family: ${MONO}; font-weight: 700; font-size: 14px; padding: 14px 26px; text-decoration: none;`,
              )}
            >
              Get started →
            </a>
            <Link
              to="/pricing"
              className="fg-btn-ghost"
              style={s(
                `border: 1px solid #322d28; color: #f5f1ea; font-family: ${MONO}; font-weight: 500; font-size: 14px; padding: 14px 26px; text-decoration: none;`,
              )}
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

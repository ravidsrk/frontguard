import { createFileRoute } from '@tanstack/react-router'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { REPO_URL } from '../lib/site'
import { s } from '../lib/style'
import { GROUP_COLORS, GROUP_LABELS, RELEASES } from './changelog/-releases'

export const Route = createFileRoute('/changelog')({
  head: () => ({
    meta: [
      { title: 'Changelog — Frontguard' },
      {
        name: 'description',
        content:
          "What's new in Frontguard: every notable release, what it added, and what changed — newest first, following Keep a Changelog.",
      },
    ],
  }),
  component: Changelog,
})

const MONO = "'JetBrains Mono', monospace"
const KEEP_A_CHANGELOG = 'https://keepachangelog.com'
const CHANGELOG_SOURCE = `${REPO_URL}/blob/main/CHANGELOG.md`

function Changelog() {
  return (
    <div style={s('background: #0d0c0b; color: #b8b0a6; min-height: 100vh;')}>
      <Nav active="changelog" />

      <header style={s('max-width: 860px; margin: 0 auto; padding: 72px 28px 36px;')}>
        <div
          style={s(
            `font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.08em; margin-bottom: 16px;`,
          )}
        >
          // CHANGELOG
        </div>
        <h1
          style={s(
            'font-size: 48px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px;',
          )}
        >
          What's new in Frontguard
        </h1>
        <p style={s('font-size: 17px; line-height: 1.55; color: #b8b0a6; margin: 0; max-width: 560px;')}>
          Following{' '}
          <a
            href={KEEP_A_CHANGELOG}
            target="_blank"
            rel="noopener noreferrer"
            className="fg-link"
            style={s('color: #e8862e; text-decoration: none;')}
          >
            Keep a Changelog
          </a>{' '}
          and semantic versioning. Every notable change, newest first.
        </p>
      </header>

      <section style={s('max-width: 860px; margin: 0 auto; padding: 16px 28px 100px;')}>
        {RELEASES.map((r) => (
          <article
            key={r.version}
            data-testid="release"
            aria-label={r.title}
            style={s(
              'display: grid; grid-template-columns: 168px 1fr; gap: 0; border-top: 1px solid #211e1b;',
            )}
          >
            <div style={s('padding: 32px 24px 32px 0;')} data-testid="release-meta">
              <div style={s('position: sticky; top: 88px;')}>
                <div style={s('display: inline-flex; align-items: center; gap: 8px; margin-bottom: 10px;')}>
                  <span
                    style={s(
                      `font-family: ${MONO}; font-size: 18px; font-weight: 700; color: ${r.vColor};`,
                    )}
                  >
                    {r.version}
                  </span>
                </div>
                <span
                  style={s(
                    `display: inline-block; font-family: ${MONO}; font-size: 10.5px; color: ${r.tagColor}; border: 1px solid ${r.tagBorder}; background: ${r.tagBg}; padding: 3px 8px; margin-bottom: 12px;`,
                  )}
                >
                  {r.statusLabel}
                </span>
                <div style={s(`font-family: ${MONO}; font-size: 12px; color: #6b645c;`)}>
                  {r.isoDate ? <time dateTime={r.isoDate}>{r.date}</time> : r.date}
                </div>
              </div>
            </div>
            <div
              style={s(
                'padding: 32px 0 40px 32px; border-left: 1px solid #211e1b; position: relative;',
              )}
            >
              <span
                style={s(
                  `position: absolute; left: -5px; top: 40px; width: 9px; height: 9px; background: ${r.vColor}; border-radius: 50%;`,
                )}
              />
              <h2
                style={s(
                  'font-size: 24px; letter-spacing: -0.02em; font-weight: 600; color: #f5f1ea; margin: 0 0 10px;',
                )}
              >
                {r.title}
              </h2>
              <p style={s('font-size: 15px; line-height: 1.6; color: #b8b0a6; margin: 0 0 24px;')}>
                {r.summary}
              </p>
              {r.groups.map((g) => (
                <div key={g.kind} style={s('margin-bottom: 22px;')}>
                  <div
                    style={s(
                      `display: inline-flex; align-items: center; gap: 8px; font-family: ${MONO}; font-size: 11px; color: ${GROUP_COLORS[g.kind]}; letter-spacing: 0.06em; margin-bottom: 12px;`,
                    )}
                  >
                    <span style={s(`width: 6px; height: 6px; background: ${GROUP_COLORS[g.kind]};`)} />
                    {GROUP_LABELS[g.kind]}
                  </div>
                  <ul style={s('list-style: none; padding: 0; margin: 0; display: grid; gap: 10px;')}>
                    {g.items.map((it) => (
                      <li
                        key={it.term}
                        style={s(
                          'display: grid; grid-template-columns: 14px 1fr; gap: 10px; font-size: 14px; line-height: 1.55; color: #c8c0b6;',
                        )}
                      >
                        <span style={s(`color: #564f48; font-family: ${MONO};`)}>·</span>
                        <span>
                          <strong style={s('color: #f5f1ea; font-weight: 600;')}>{it.term}</strong>
                          {it.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        ))}

        <div style={s('border-top: 1px solid #211e1b; padding-top: 28px; text-align: center;')}>
          <a
            href={CHANGELOG_SOURCE}
            target="_blank"
            rel="noopener noreferrer"
            className="fg-link"
            style={s(`font-family: ${MONO}; font-size: 13px; color: #8c847a; text-decoration: none;`)}
          >
            View full changelog on GitHub ↗
          </a>
        </div>
      </section>

      <Footer />
    </div>
  )
}
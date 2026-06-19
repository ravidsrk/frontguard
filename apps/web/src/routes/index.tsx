import { createFileRoute } from '@tanstack/react-router'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { Shield } from '../components/Shield'
import { s } from '../lib/style'

export const Route = createFileRoute('/')({
  component: Home,
})

const MONO = "'JetBrains Mono', monospace"

function Home() {
  return (
    <div style={s('min-height: 100vh; background: #0d0c0b;')}>
      <Nav active="home" />
      <main
        style={s(
          'max-width: 1200px; margin: 0 auto; padding: 96px 28px 120px; text-align: center;',
        )}
      >
        <div
          style={s(
            `display: inline-flex; align-items: center; gap: 8px; font-family: ${MONO}; font-size: 12px; color: #e8862e; border: 1px solid #322d28; background: #131210; padding: 6px 14px; margin-bottom: 28px;`,
          )}
        >
          <Shield w={14} h={17} />
          AI-powered visual regression testing
        </div>
        <h1
          style={s(
            'font-size: clamp(36px, 5vw, 56px); font-weight: 700; color: #f5f1ea; letter-spacing: -0.03em; line-height: 1.08; margin: 0 0 20px;',
          )}
        >
          Catch the regression,
          <br />
          not the noise
        </h1>
        <p
          style={s(
            'font-size: 18px; color: #8c847a; max-width: 560px; margin: 0 auto 36px; line-height: 1.6;',
          )}
        >
          Frontguard renders every page, diffs it against your baselines, and uses
          AI vision to tell a real regression from noise.
        </p>
        <code
          style={s(
            `display: inline-block; font-family: ${MONO}; font-size: 14px; color: #d8d0c5; background: #131210; border: 1px solid #211e1b; padding: 14px 22px;`,
          )}
        >
          npx @frontguard/cli init
        </code>
      </main>
      <Footer />
    </div>
  )
}
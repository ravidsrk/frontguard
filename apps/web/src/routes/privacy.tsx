import { createFileRoute } from '@tanstack/react-router'
import { InfoPage } from '../components/InfoPage'
import { buildSeoHead } from '../lib/seo'

export const Route = createFileRoute('/privacy')({
  head: () =>
    buildSeoHead({
      title: 'Privacy — Frontguard',
      description: 'How the Frontguard CLI and website handle project data and optional telemetry.',
      path: '/privacy',
    }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="PRIVACY"
      title="Your project stays local by default."
      summary="Frontguard's open-source CLI performs screenshot capture and pixel comparison on the machine where you run it."
    >
      <h2>Optional providers</h2>
      <p>Model-assisted analysis is opt-in. When configured, screenshot evidence and route metadata are sent directly to the OpenAI or Anthropic account selected in your configuration.</p>
      <h2>Telemetry</h2>
      <p>
        CLI usage telemetry is disabled by default (<code>telemetry: false</code>). If you explicitly opt in (via{' '}
        <code>FRONTGUARD_TELEMETRY=1</code> or <code>telemetry: true</code> in <code>frontguard.config.ts</code>),
        Frontguard sends at most one bounded, anonymous event per command containing only sanitized operational
        fields: <code>event</code>, <code>command</code>, <code>version</code>, <code>os</code>,{' '}
        <code>nodeVersion</code>, <code>ci</code>, <code>durationMs</code>, <code>routes</code> (
        <code>routeCount</code>), <code>regressions</code> (<code>diffCount</code>), <code>passed</code>,{' '}
        <code>aiProvider</code> (<code>aiEnabled</code>), <code>antiFlake</code>, <code>errorType</code>, and{' '}
        <code>ts</code> (<code>timestamp</code>). It never includes screenshots, source code, URLs, file paths,
        repository names, config contents, or provider API keys.
      </p>
      <p>
        You can disable or override telemetry at any time via <code>--no-telemetry</code>,{' '}
        <code>FRONTGUARD_TELEMETRY=0</code>, <code>DO_NOT_TRACK=1</code>, <code>telemetry: false</code> in{' '}
        <code>frontguard.config.ts</code>, or <code>frontguard telemetry disable</code>.
      </p>
      <h2>Hosted services</h2>
      <p>There is no generally available hosted Frontguard cloud endpoint today. Ordinary infrastructure logs may be produced by the service that hosts this informational website.</p>
      <h2>Questions</h2>
      <p>Open a privacy question in the <a href="https://github.com/ravidsrk/frontguard/issues">public issue tracker</a>.</p>
    </InfoPage>
  )
}

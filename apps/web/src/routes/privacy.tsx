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
      <p>CLI usage telemetry is off by default. If you opt in, Frontguard sends sanitized operational events rather than screenshots, source code, paths, repository names, or provider keys.</p>
      <h2>Hosted services</h2>
      <p>There is no generally available hosted Frontguard cloud endpoint today. Ordinary infrastructure logs may be produced by the service that hosts this informational website.</p>
      <h2>Questions</h2>
      <p>Open a privacy question in the <a href="https://github.com/ravidsrk/frontguard/issues">public issue tracker</a>.</p>
    </InfoPage>
  )
}

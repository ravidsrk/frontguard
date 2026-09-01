import { createFileRoute } from '@tanstack/react-router'
import { InfoPage } from '../components/InfoPage'
import { buildSeoHead } from '../lib/seo'

export const Route = createFileRoute('/status')({
  head: () =>
    buildSeoHead({
      title: 'Release status — Frontguard',
      description: 'Current availability of the Frontguard CLI, Action, renderer, and hosted source.',
      path: '/status',
    }),
  component: StatusPage,
})

function StatusPage() {
  return (
    <InfoPage
      eyebrow="RELEASE STATUS"
      title="The CLI is public. Integrations remain pre-release."
      summary="This page reports release readiness, not infrastructure uptime for a hosted service."
    >
      <h2>Open-source CLI</h2>
      <p>Published npm packages are available for local use. Source version 0.2.3 is a release candidate and has not been published yet.</p>
      <h2>GitHub Action</h2>
      <p>External consumer smoke is pending. There is no public copy-ready Action workflow until the pinned CLI is published, the mutable tag advances, and both positive and negative controls pass.</p>
      <h2>Docker renderer</h2>
      <p>The image publication and measured cross-host validation remain operational follow-ups. The repository contains a local build path.</p>
      <h2>Hosted cloud</h2>
      <p>Cloud API source is included, but there is no live default hosted endpoint or generally available hosted onboarding.</p>
    </InfoPage>
  )
}

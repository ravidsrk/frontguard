import { createFileRoute } from '@tanstack/react-router'
import { InfoPage } from '../components/InfoPage'
import { buildSeoHead } from '../lib/seo'

export const Route = createFileRoute('/terms')({
  head: () =>
    buildSeoHead({
      title: 'Terms — Frontguard',
      description: 'Terms for using the open-source Frontguard software and website.',
      path: '/terms',
    }),
  component: TermsPage,
})

function TermsPage() {
  return (
    <InfoPage
      eyebrow="TERMS"
      title="Open-source software, provided as-is."
      summary="The Frontguard CLI is distributed under the MIT License. These terms describe the current public project, not a generally available hosted product."
    >
      <h2>Software license</h2>
      <p>Use, modification, and distribution of the open-source packages are governed by their MIT License. The software is provided without warranty, subject to the license text.</p>
      <h2>Pre-release surfaces</h2>
      <p>Cloud, GitHub Action, and Docker onboarding described as pre-release may be incomplete or unavailable. Do not rely on those surfaces as production services until their documented acceptance checks pass.</p>
      <h2>Third-party services</h2>
      <p>If you configure a model provider, source-control integration, or hosting platform, your use of that service remains subject to its own terms.</p>
      <h2>Support</h2>
      <p>Questions and defect reports can be filed in the <a href="https://github.com/ravidsrk/frontguard/issues">public issue tracker</a>.</p>
    </InfoPage>
  )
}

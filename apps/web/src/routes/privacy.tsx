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
      <h2>Optional AI providers</h2>
      <p>
        Model-assisted analysis is opt-in. When configured, screenshot evidence, route metadata, and optional
        accessibility findings are sent directly from your machine or CI runner to the provider account you select:
        OpenAI, Anthropic, Google Gemini, or a custom OpenAI-compatible <code>baseUrl</code> endpoint (such as
        OpenRouter, Ollama, or vLLM).
      </p>
      <p>
        Enable <code>redactSensitive: true</code> in <code>frontguard.config.ts</code> (or pass{' '}
        <code>--redact-sensitive</code> on the CLI) to mask password, credit-card (<code>autocomplete=&quot;cc-*&quot;</code>),
        one-time-code, and <code>[data-frontguard-redact]</code> / <code>[data-sensitive]</code> inputs and scrub{' '}
        <code>domSnapshot</code> input <code>value</code> attributes locally before screenshots are captured or sent
        to an AI provider.
      </p>
      <figure style={{ margin: '24px 0 32px', border: '1px solid #2a2622', background: '#131210', padding: '14px' }}>
        <img
          src="/images/docs/migration-and-trust-boundary.jpg"
          alt="Local-first privacy trust boundary and PII redaction architecture"
          loading="lazy"
          style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid #211e1b' }}
        />
        <figcaption
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11.5px',
            color: '#8c847a',
            padding: '10px 4px 2px',
            lineHeight: 1.5,
          }}
        >
          FIG 01 // Local-first trust boundary and --redact-sensitive DOM/input sanitization pipeline
        </figcaption>
      </figure>
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
      <h2>Website infrastructure and third-party resources</h2>
      <p>
        This website (<code>frontguard.dev</code>) is hosted on Cloudflare Workers, which processes standard HTTP
        request logs (such as IP address, requested path, and user agent) to serve and protect the site.
      </p>
      <p>
        Pages load the <code>IBM Plex Sans</code> and <code>JetBrains Mono</code> web fonts from Google Fonts (
        <code>fonts.googleapis.com</code> and <code>fonts.gstatic.com</code>). When your browser fetches those
        stylesheets and font files, Google receives standard HTTP request headers including your IP address and user
        agent under Google&apos;s privacy terms. This site does not load third-party analytics trackers or advertising
        scripts.
      </p>
      <h2>Data retention and erasure</h2>
      <p>
        For the local CLI, accepted baselines stay in your repository&apos;s <code>frontguard-baselines</code> git
        orphan branch, reports stay in <code>frontguard-report/</code>, and monitoring history stays in{' '}
        <code>.frontguard/</code>. You can delete local artifacts directly from disk and remove the baseline branch
        with <code>git branch -D frontguard-baselines</code> (and{' '}
        <code>git push origin --delete frontguard-baselines</code> if pushed).
      </p>
      <p>
        There is no generally available hosted Frontguard cloud endpoint today. In self-operated deployments of the
        pre-release <code>packages/cloud-api</code> service, authenticated accounts can erase their account record
        along with owned baselines, runs, and reports via <code>DELETE /v1/account</code> (and remove individual runs
        via <code>DELETE /v1/runs/:id</code> or teams via <code>DELETE /v1/teams/:id</code>). General run images do
        not yet enforce automated time-based retention windows, and object-store cleanup runs on a best-effort basis;
        see <a href="https://github.com/ravidsrk/frontguard/blob/main/docs/retention.md">docs/retention.md</a> for
        implemented retention details.
      </p>
      <h2>Contact</h2>
      <p>
        For privacy or data-handling questions, email{' '}
        <a href="mailto:hello@frontguard.dev?subject=Privacy%20inquiry">hello@frontguard.dev</a> or open an issue in
        the <a href="https://github.com/ravidsrk/frontguard/issues">public issue tracker</a>. Report security
        vulnerabilities privately to <a href="mailto:security@frontguard.dev">security@frontguard.dev</a>.
      </p>
    </InfoPage>
  )
}

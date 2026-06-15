import { useInView } from '../hooks/useInView';

interface Tier {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  cta: { label: string; href: string };
  features: string[];
  highlighted?: boolean;
}

const tiers: Tier[] = [
  {
    name: 'Free CLI',
    price: '$0',
    cadence: 'forever',
    tagline:
      'The full engine, MIT-licensed. Bring your own OpenAI or Anthropic key.',
    cta: { label: 'Install the CLI', href: '#install' },
    features: [
      'Unlimited screenshots, local runs',
      'AI classification on your own provider key',
      'Anti-flake consensus + SSIM fallback',
      'GitHub Action + PR comment',
      'Git-orphan baselines (no cloud required)',
      'docker-compose self-host of the cloud',
    ],
  },
  {
    name: 'Pro',
    price: '$29',
    cadence: 'per user / month',
    tagline:
      'Team baselines, run history, flake-score badges, and a hosted dashboard. The cloud takes the ops.',
    cta: { label: 'Start free trial', href: 'https://app.frontguard.dev/signup' },
    features: [
      'Everything in Free CLI',
      'Hosted team baselines + history',
      'Argos-style flake-score badges per test',
      'GitHub App with one-click baseline accept',
      'Spend-cap alerts at 80% / 95%',
      'Slack + GitHub status notifications',
    ],
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'annual',
    tagline:
      'SSO/SAML, SCIM, audit log, on-prem deployment, dedicated support.',
    cta: { label: 'Talk to us', href: 'mailto:hello@frontguard.dev?subject=Enterprise%20Frontguard' },
    features: [
      'Everything in Pro',
      'SAML SSO + SCIM provisioning',
      'Audit log + retention controls',
      'Single-tenant on-prem deployment option',
      'Dedicated support + SLA',
      'Custom Git / CI integrations',
    ],
  },
];

export default function Pricing() {
  const { ref, inView } = useInView();

  return (
    <section
      ref={ref}
      id="pricing"
      aria-labelledby="pricing-heading"
      className="border-t border-[var(--color-border)] py-24 lg:py-32"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className={`mx-auto max-w-3xl text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            Pricing
          </p>
          <h2
            id="pricing-heading"
            className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl"
          >
            Free CLI forever. Cloud when you need a team.
          </h2>
          <p className="mt-4 text-base text-[var(--color-text-secondary)]">
            The engine is open source under MIT and stays free. The hosted
            cloud — team baselines, history, flake-score badges — is the
            paid tier.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:gap-6 lg:grid-cols-3">
          {tiers.map((tier, i) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 sm:p-7 transition-colors hover:border-[var(--color-border-bright)] ${tier.highlighted ? 'pricing-popular' : ''} ${inView ? 'animate-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${150 + i * 100}ms` }}
            >
              {tier.highlighted ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-accent)] px-3 py-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-bg)]">
                  Most teams pick this
                </span>
              ) : null}
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-text)]">
                  {tier.name}
                </h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-[family-name:var(--font-display)] text-4xl font-extrabold text-[var(--color-text)]">
                    {tier.price}
                  </span>
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {tier.cadence}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {tier.tagline}
                </p>
              </div>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm text-[var(--color-text-secondary)]">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="3 8.5 6.5 12 13 4.5" />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <a
                href={tier.cta.href}
                {...(tier.cta.href.startsWith('http') || tier.cta.href.startsWith('mailto:')
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
                className={`mt-8 touch-manipulation inline-flex items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                  tier.highlighted
                    ? 'bg-[var(--color-cta)] text-[var(--color-bg)] hover:bg-[var(--color-cta-hover)]'
                    : 'border border-[var(--color-border-bright)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
                }`}
              >
                {tier.cta.label}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

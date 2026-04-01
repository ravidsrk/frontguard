import { useInView } from '../hooks/useInView';

interface PricingTier {
name: string;
price: string;
period: string;
description: string;
features: string[];
cta: string;
highlighted: boolean;
}

const tiers: PricingTier[] = [
{
name: 'Free',
price: '$0',
period: '/mo',
description: 'Everything you need to catch regressions locally. No signup required.',
features: [
'Unlimited local screenshots',
'500 cloud screenshots / mo',
'1 project',
'Community support',
'AI analysis included',
],
cta: 'Get Started Free',
highlighted: false,
},
{
name: 'Pro',
price: '$29',
period: '/mo',
description: 'Shared baselines across your team. Visual diffs in every PR. $29 / mo flat \u2014 not per screenshot.',
features: [
'Unlimited projects',
'10K cloud screenshots / mo',
'Shared baselines',
'PR review comments',
'Priority support',
'Team dashboard',
],
cta: 'Start Pro Trial',
highlighted: true,
},
{
name: 'Enterprise',
price: 'Custom',
period: '',
description: 'SSO, SLA, and everything unlimited. For teams where visual quality is non-negotiable.',
features: [
'SSO / SAML',
'Unlimited everything',
'Priority support & SLA',
'On-prem option',
'Custom integrations',
'Dedicated CSM',
],
cta: 'Contact Sales',
highlighted: false,
},
];

export default function Pricing() {
const { ref, inView } = useInView();

return (
<section ref={ref} id="pricing" aria-labelledby="pricing-heading" className="border-t border-[var(--color-border)] py-24 lg:py-32">
<div className="mx-auto max-w-7xl px-6 lg:px-8">
<div
className={`mb-16 text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}
>
<h2 id="pricing-heading" className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--color-text)] [text-wrap:balance] md:text-4xl">
Simple pricing.{' '}
<span className="text-[var(--color-text-muted)]">
No per-screenshot fees. Ever.
</span>
</h2>
<p className="mt-4 text-sm text-[var(--color-text-muted)] [font-variant-numeric:tabular-nums]">
Percy charges $0.036 per screenshot. Chromatic averages $44K / year. We charge $29 / mo flat.
</p>
</div>

<div className="grid gap-6 md:grid-cols-3">
{tiers.map((tier, i) => (
<div
key={tier.name}
className={`relative rounded-xl border p-8 ${
tier.highlighted
? 'pricing-popular bg-[var(--color-bg-card)]'
: 'border-[var(--color-border)] bg-[var(--color-bg-card)]'
} ${inView ? 'animate-fade-up' : 'opacity-0'}`}
style={{ animationDelay: `${100 + i * 100}ms` }}
>
{tier.highlighted && (
<div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-semibold text-[var(--color-bg)]">
Most Popular
</div>
)}

<div className="mb-6">
<h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-text)] [text-wrap:balance]">
{tier.name}
</h3>
<div className="mt-3 flex items-baseline gap-1">
<span className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[var(--color-text)] [font-variant-numeric:tabular-nums]">
{tier.price}
</span>
{tier.period && (
<span className="text-sm text-[var(--color-text-muted)]">
{tier.period}
</span>
)}
</div>
<p className="mt-2 text-sm text-[var(--color-text-muted)]">
{tier.description}
</p>
</div>

<ul className="mb-8 flex flex-col gap-3">
{tier.features.map((feature) => (
<li key={feature} className="flex items-start gap-3 text-sm text-[var(--color-text-muted)]">
<svg
width="16"
height="16"
viewBox="0 0 16 16"
fill="none"
stroke="currentColor"
strokeWidth="2"
strokeLinecap="round"
strokeLinejoin="round"
className="mt-0.5 shrink-0 text-[var(--color-accent)]"
aria-hidden="true"
>
<polyline points="3.5 8.5 6 11 12.5 4.5" />
</svg>
{feature}
</li>
))}
</ul>

<a
href="#getting-started"
className={`touch-manipulation block w-full rounded-lg px-4 py-3 text-center text-sm font-semibold transition-colors ${
tier.highlighted
? 'bg-[var(--color-cta)] text-[var(--color-bg)] hover:bg-[var(--color-cta-hover)]'
: 'border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-border-bright)] hover:bg-[var(--color-bg-card-hover)]'
}`}
>
{tier.cta}
</a>
</div>
))}
</div>
</div>
</section>
);
}

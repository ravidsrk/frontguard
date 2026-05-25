import { useInView } from '../hooks/useInView';

const painCards = [
{
title: 'CSS changes break layouts silently',
description:
'A padding change in your component breaks the checkout button on mobile. Functional tests pass. You find out from a customer screenshot in Slack.',
},
{
title: 'Screenshot diffs are 90% noise',
description:
'Your team approved 47 baseline updates last sprint without looking at them. Because when everything is flagged, nothing is.',
},
{
title: "Manual QA doesn\u2019t scale",
description:
'Every deploy needs eyes on 30 pages across 3 breakpoints. That\u2019s 90 manual checks. Every. Single. Time.',
},
];

export default function Problem() {
const { ref, inView } = useInView();

return (
<section ref={ref} id="problem" aria-labelledby="problem-heading" className="py-24 lg:py-32">
<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
<h2
id="problem-heading"
className={`mx-auto max-w-3xl text-center font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl ${inView ? 'animate-fade-up' : 'opacity-0'}`}
>
Your CI catches code bugs.{' '}
<span className="text-[var(--color-text-muted)]">
But who catches the visual ones?
</span>
</h2>

<div className="mt-10 grid gap-4 sm:mt-16 sm:gap-6 lg:grid-cols-[1.4fr_1fr]">
{/* Prominent first card */}
<div
className={`flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 sm:p-10 transition-colors hover:border-[var(--color-border-bright)] ${inView ? 'animate-fade-up' : 'opacity-0'}`}
style={{ animationDelay: '200ms' }}
>
<span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-danger)]/80">
01 — The silent break
</span>
<h3 className="mt-4 font-[family-name:var(--font-display)] text-xl sm:text-2xl font-semibold text-[var(--color-text)] [text-wrap:balance]">
{painCards[0].title}
</h3>
<p className="mt-3 text-base leading-relaxed text-[var(--color-text-muted)]">
{painCards[0].description}
</p>
{/* Tiny diff visual — concrete proof, not an icon */}
<div className="mt-auto pt-8">
<div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
<div className="grid grid-cols-2 divide-x divide-[var(--color-border)] font-[family-name:var(--font-mono)] text-xs">
<div className="flex flex-col gap-1 p-4">
<span className="text-[var(--color-text-dim)]">before</span>
<span className="text-[var(--color-success)]">.checkout-form &#123; padding: 16px &#125;</span>
<span className="text-[var(--color-text-muted)]">✔ submit visible at 375px</span>
</div>
<div className="flex flex-col gap-1 p-4">
<span className="text-[var(--color-text-dim)]">after</span>
<span className="text-[var(--color-cta)]">.checkout-form &#123; padding: 24px &#125;</span>
<span className="text-[var(--color-danger)]">✗ submit overflows at 375px</span>
</div>
</div>
</div>
</div>
</div>

{/* Two stacked smaller cards */}
<div className="flex flex-col gap-4 sm:gap-6">
{painCards.slice(1).map((card, i) => (
<div
key={card.title}
className={`flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 transition-colors hover:border-[var(--color-border-bright)] ${inView ? 'animate-fade-up' : 'opacity-0'}`}
style={{ animationDelay: `${320 + i * 120}ms` }}
>
<span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
{i === 0 ? '02 — Approval blindness' : '03 — Manual QA tax'}
</span>
<h3 className="mt-3 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-text)] [text-wrap:balance]">
{card.title}
</h3>
<p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
{card.description}
</p>
</div>
))}
</div>
</div>
</div>
</section>
);
}

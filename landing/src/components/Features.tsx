import { useInView } from '../hooks/useInView';

const features = [
{
title: 'AI-Powered Analysis',
description:
'Tells you “the submit button overflows on mobile because the new padding pushes it outside the flex container.” Not “pixels differ at coordinates 340,890.”',
icon: (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
</svg>
),
},
{
title: 'Anti-Flake Consensus',
description:
'Takes 3 screenshots, keeps the majority. Spinner mid-animation? Loading state flickering? Filtered out automatically.',
icon: (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
</svg>
),
},
{
title: 'Smart Route Discovery',
description:
'Point it at your URL. It finds every route, tests every page. No config files. No route lists. It just works.',
icon: (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<circle cx="12" cy="12" r="10" />
<polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
</svg>
),
},
{
title: 'PR-Native Review',
description:
'Visual diffs show up right in your PR. Approve or reject without leaving GitHub.',
icon: (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<circle cx="18" cy="18" r="3" />
<circle cx="6" cy="6" r="3" />
<path d="M13 6h3a2 2 0 012 2v7" />
<line x1="6" y1="9" x2="6" y2="21" />
</svg>
),
},
{
title: 'Multi-Browser',
description:
'One command tests Chromium, Firefox, and WebKit. That Safari flexbox bug your users found? You\u2019d have caught it.',
icon: (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<rect x="2" y="3" width="20" height="14" rx="2" />
<line x1="8" y1="21" x2="16" y2="21" />
<line x1="12" y1="17" x2="12" y2="21" />
</svg>
),
},
{
title: 'Plugin System',
description:
'Compare production against Figma designs. Set performance budgets. Monitor live pages. Build your own with 6 lifecycle hooks.',
icon: (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
</svg>
),
},
];

export default function Features() {
const { ref, inView } = useInView();

return (
<section ref={ref} id="features" aria-labelledby="features-heading" className="py-24 lg:py-32">
<div className="mx-auto max-w-7xl px-6 lg:px-8">
<div
className={`mb-16 text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}
>
<h2 id="features-heading" className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--color-text)] [text-wrap:balance] md:text-4xl">
Built for the problems{' '}
<span className="text-[var(--color-text-muted)]">pixel diffs can{'\u2019'}t solve.</span>
</h2>
</div>

<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
{features.map((feature, i) => (
<div
key={feature.title}
className={`group rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 transition-[border-color,background-color] hover:border-[var(--color-border-bright)] hover:bg-[var(--color-bg-card-hover)] ${inView ? 'animate-fade-up' : 'opacity-0'}`}
style={{ animationDelay: `${100 + i * 80}ms` }}
>
<div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent-glow)] text-[var(--color-accent)]">
{feature.icon}
</div>
<h3 className="mb-2 font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-text)] [text-wrap:balance]">
{feature.title}
</h3>
<p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
{feature.description}
</p>
</div>
))}
</div>
</div>
</section>
);
}

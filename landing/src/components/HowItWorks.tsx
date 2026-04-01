import { useInView } from '../hooks/useInView';

const codeSnippet = `import { test } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('checkout page', async ({ page }) => {
await page.goto('https://myapp.com/checkout');
const result = await visualTest(page, 'checkout');
expect(result.passed).toBe(true);
});`;

const steps = [
{
step: '01',
title: 'Install',
code: 'npm install @frontguard/playwright',
description: 'One package. No config files, no dashboard setup.',
},
{
step: '02',
title: 'Add to tests',
code: '3 lines of code',
description: 'Drop it into any existing Playwright test.',
},
{
step: '03',
title: 'Run in CI',
code: 'npx playwright test',
description: 'Get PR comments with visual diffs and AI analysis.',
},
];

export default function HowItWorks() {
const { ref, inView } = useInView();

return (
<section ref={ref} id="how-it-works" aria-labelledby="how-it-works-heading" className="border-t border-[var(--color-border)] py-24 lg:py-32">
<div className="mx-auto max-w-7xl px-6 lg:px-8">
<div
className={`mb-16 ${inView ? 'animate-fade-up' : 'opacity-0'}`}
>
<h2 id="how-it-works-heading" className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--color-text)] [text-wrap:balance] md:text-4xl">
Add visual testing to Playwright{' '}
<span className="text-[var(--color-accent)]">in 3 lines.</span>
</h2>
<p className="mt-4 max-w-2xl text-lg text-[var(--color-text-muted)]">
Add visual regression testing to your Playwright suite in under a minute.
</p>
</div>

<div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
{/* Code block */}
<div
className={`lg:col-span-7 ${inView ? 'animate-fade-in-left' : 'opacity-0'}`}
style={{ animationDelay: '200ms' }}
>
<div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
<div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
<span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-dim)]">
checkout.spec.ts
</span>
</div>
<div className="overflow-x-auto p-5">
<pre className="font-[family-name:var(--font-mono)] text-xs leading-relaxed sm:text-sm">
<code>
{codeSnippet.split('\n').map((line, i) => (
<div key={i} className="flex">
<span className="mr-4 inline-block w-6 text-right text-[var(--color-text-dim)]/40 select-none">
{i + 1}
</span>
<span
className={
line.includes('import')
? 'text-[var(--color-accent)]'
: line.includes("'") || line.includes('"')
? 'text-[var(--color-success)]'
: line.includes('await') || line.includes('async') || line.includes('test')
? 'text-[var(--color-cta)]'
: 'text-[var(--color-text)]'
}
>
{line || '\u00A0'}
</span>
</div>
))}
</code>
</pre>
</div>
</div>
</div>

{/* Steps */}
<div className="flex flex-col gap-8 lg:col-span-5">
{steps.map((step, i) => (
<div
key={step.step}
className={`flex gap-4 ${inView ? 'animate-fade-in-right' : 'opacity-0'}`}
style={{ animationDelay: `${300 + i * 120}ms` }}
>
<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 font-[family-name:var(--font-mono)] text-xs font-bold text-[var(--color-accent)]">
{step.step}
</div>
<div>
<h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-text)] [text-wrap:balance]">
{step.title}
</h3>
<p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-dim)]">
{step.code}
</p>
<p className="mt-2 text-sm text-[var(--color-text-muted)]">
{step.description}
</p>
</div>
</div>
))}
</div>
</div>
</div>
</section>
);
}

import { useInView } from '../hooks/useInView';

interface ComparisonRow {
feature: string;
frontguard: boolean;
percy: boolean | 'partial';
chromatic: boolean | 'partial';
playwright: boolean;
}

const rows: ComparisonRow[] = [
{ feature: 'AI analysis', frontguard: true, percy: false, chromatic: false, playwright: false },
{ feature: 'Open source', frontguard: true, percy: false, chromatic: 'partial', playwright: true },
{ feature: 'No per-screenshot fees', frontguard: true, percy: false, chromatic: false, playwright: true },
{ feature: 'Anti-flake consensus', frontguard: true, percy: false, chromatic: false, playwright: false },
{ feature: 'Playwright native', frontguard: true, percy: false, chromatic: false, playwright: true },
{ feature: 'Works without Storybook', frontguard: true, percy: true, chromatic: false, playwright: true },
{ feature: 'Auto-fix suggestions', frontguard: true, percy: false, chromatic: false, playwright: false },
];

function CellValue({ value }: { value: boolean | 'partial' }) {
if (value === true) {
return (
<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-success-dim)] text-[var(--color-success)]" role="img" aria-label="Yes">
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<polyline points="3 7.5 5.5 10 11 4" />
</svg>
</span>
);
}
if (value === 'partial') {
return (
<span className="text-xs font-medium text-[var(--color-text-dim)]">Partial</span>
);
}
return (
<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-bg-elevated)] text-[var(--color-text-dim)]" role="img" aria-label="No">
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
<line x1="4" y1="7" x2="10" y2="7" />
</svg>
</span>
);
}

const tools = ['frontguard', 'percy', 'chromatic', 'playwright'] as const;
const toolLabels: Record<string, string> = {
  frontguard: 'Frontguard',
  percy: 'Percy',
  chromatic: 'Chromatic',
  playwright: 'Playwright',
};

export default function Comparison() {
const { ref, inView } = useInView();

return (
<section ref={ref} id="comparison" aria-labelledby="comparison-heading" className="border-t border-[var(--color-border)] py-24 lg:py-32">
<div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
<div
className={`mb-12 md:mb-16 text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}
>
<h2 id="comparison-heading" className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)] [text-wrap:balance] md:text-3xl lg:text-4xl">
Why not Percy? Or Chromatic?{' '}
<span className="text-[var(--color-text-muted)]">
Or just Playwright screenshots?
</span>
</h2>
</div>

{/* Desktop table — hidden on mobile */}
<div
className={`hidden md:block overflow-x-auto ${inView ? 'animate-fade-up' : 'opacity-0'}`}
style={{ animationDelay: '200ms' }}
>
<table className="w-full">
<caption className="sr-only">Feature comparison between Frontguard, Percy, Chromatic, and Playwright screenshot testing</caption>
<thead>
<tr className="border-b border-[var(--color-border)]">
<th scope="col" className="pb-4 pr-4 text-left text-sm font-medium text-[var(--color-text-dim)]">
Feature
</th>
<th scope="col" className="pb-4 text-center text-sm font-bold text-[var(--color-accent)]">
Frontguard
</th>
<th scope="col" className="pb-4 text-center text-sm font-medium text-[var(--color-text-dim)]">
Percy
</th>
<th scope="col" className="pb-4 text-center text-sm font-medium text-[var(--color-text-dim)]">
Chromatic
</th>
<th scope="col" className="pb-4 text-center text-sm font-medium text-[var(--color-text-dim)]">
Playwright
</th>
</tr>
</thead>
<tbody>
{rows.map((row, i) => (
<tr
key={row.feature}
className={`comparison-row border-b border-[var(--color-border)]/50 ${inView ? 'animate-fade-in' : 'opacity-0'}`}
style={{ animationDelay: `${300 + i * 50}ms` }}
>
<td className="py-4 pr-4 text-sm text-[var(--color-text)]">
{row.feature}
</td>
<td className="py-4 text-center">
<div className="flex justify-center">
<CellValue value={row.frontguard} />
</div>
</td>
<td className="py-4 text-center">
<div className="flex justify-center">
<CellValue value={row.percy} />
</div>
</td>
<td className="py-4 text-center">
<div className="flex justify-center">
<CellValue value={row.chromatic} />
</div>
</td>
<td className="py-4 text-center">
<div className="flex justify-center">
<CellValue value={row.playwright} />
</div>
</td>
</tr>
))}
</tbody>
</table>
</div>

{/* Mobile cards — shown only on mobile */}
<div className="md:hidden flex flex-col gap-4">
{rows.map((row, i) => (
<div
key={row.feature}
className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 ${inView ? 'animate-fade-up' : 'opacity-0'}`}
style={{ animationDelay: `${200 + i * 60}ms` }}
>
<h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">{row.feature}</h3>
<div className="grid grid-cols-2 gap-2">
{tools.map((tool) => (
<div key={tool} className="flex items-center gap-2">
<CellValue value={row[tool]} />
<span className={`text-xs ${tool === 'frontguard' ? 'font-semibold text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}>
{toolLabels[tool]}
</span>
</div>
))}
</div>
</div>
))}
</div>
</div>
</section>
);
}

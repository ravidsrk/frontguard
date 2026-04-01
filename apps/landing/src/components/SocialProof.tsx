import { useInView } from '../hooks/useInView';

const stats = [
{ value: '395', label: 'tests' },
{ value: '< 3s', label: 'per page' },
{ value: 'Zero', label: 'config needed' },
{ value: '3', label: 'browsers' },
{ value: 'MIT', label: 'licensed' },
];

export default function SocialProof() {
const { ref, inView } = useInView();

return (
<section ref={ref} aria-label="Project statistics" className="border-y border-[var(--color-border)] py-16">
<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
<p
className={`mb-10 text-center text-sm font-medium tracking-wide text-[var(--color-text-dim)] uppercase ${inView ? 'animate-fade-in' : 'opacity-0'}`}
>
Built for developers who ship daily
</p>

{/* Stats */}
<div className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-5 md:gap-8">
{stats.map((stat, i) => (
<div
key={stat.label}
className={`text-center ${i === stats.length - 1 ? 'col-span-2 md:col-span-1' : ''} ${inView ? 'animate-fade-up' : 'opacity-0'}`}
style={{ animationDelay: `${i * 100}ms` }}
>
<div className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-text)] [font-variant-numeric:tabular-nums] sm:text-3xl md:text-4xl">
{stat.value}
</div>
<div className="mt-1 text-xs sm:text-sm text-[var(--color-text-muted)]">
{stat.label}
</div>
</div>
))}
</div>


</div>
</section>
);
}

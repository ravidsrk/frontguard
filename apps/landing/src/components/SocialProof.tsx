import { useInView } from '../hooks/useInView';

const stats = [
{
  value: 'Open Source',
  label: 'MIT Licensed',
  icon: (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--color-text-muted)]" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  ),
},
{ value: '< 2 min', label: 'Setup Time', icon: null },
{ value: '3 Browsers', label: 'Chromium, Firefox, WebKit', icon: null },
{ value: 'AI-Powered', label: 'GPT-4o Vision Analysis', icon: null },
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
<div className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-8">
{stats.map((stat, i) => (
<div
key={stat.label}
className={`text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}
style={{ animationDelay: `${i * 100}ms` }}
>
{stat.icon && <div className="mb-2 flex justify-center">{stat.icon}</div>}
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

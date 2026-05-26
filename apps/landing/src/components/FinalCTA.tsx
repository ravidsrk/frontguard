import { useInView } from '../hooks/useInView';

export default function FinalCTA() {
const { ref, inView } = useInView();

return (
<section ref={ref} aria-labelledby="final-cta-heading" className="border-t border-[var(--color-border)] py-24 lg:py-32">
<div className="mx-auto max-w-3xl px-4 sm:px-6 text-center lg:px-8">
<div
className={`flex flex-col items-center gap-6 ${inView ? 'animate-fade-up' : 'opacity-0'}`}
>
<h2 id="final-cta-heading" className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl lg:text-5xl">
Never find out about CSS bugs from your users again
</h2>
<p className="max-w-xl text-base sm:text-lg text-[var(--color-text-muted)]">
Install Frontguard in 30 seconds. Catch the bugs that pixel diffs miss.
</p>
<a
href="https://docs.frontguard.dev/docs/quick-start"
className="touch-manipulation mt-2 inline-flex items-center gap-2 rounded-xl bg-[var(--color-cta)] px-6 sm:px-8 py-3.5 sm:py-4 text-sm sm:text-base font-semibold text-[var(--color-bg)] shadow-lg shadow-orange-500/20 transition-[background-color,box-shadow] hover:bg-[var(--color-cta-hover)] hover:shadow-orange-500/30"
>
Install Frontguard in 30 Seconds
<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="M3.5 9h11M10 4.5l4.5 4.5-4.5 4.5" />
</svg>
</a>
<p className="text-sm text-[var(--color-text-dim)]">
No credit card required. Free forever for individual developers.
</p>
</div>
</div>
</section>
);
}

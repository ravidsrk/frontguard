const terminalLines = [
{ text: '$ npx frontguard run --url https://myapp.com', type: 'command' as const },
{ text: '', type: 'blank' as const },
{ text: '✔ Discovering routes — Found 8 route(s)', type: 'success' as const },
{ text: '✔ Rendering — Captured 24 screenshot(s) in 3.2s', type: 'success' as const },
{ text: '✔ Comparing — 1 regression detected', type: 'warning' as const },
{ text: '', type: 'blank' as const },
{ text: '  /checkout @ 375px — REGRESSION (4.2% diff)', type: 'danger' as const },
{ text: '  AI: “Submit button overflows container on mobile.', type: 'ai' as const },
{ text: '       The new padding pushes it outside the parent flex.”', type: 'ai' as const },
{ text: '', type: 'blank' as const },
{ text: '  Suggested fix: Add `overflow: hidden` to .checkout-form', type: 'fix' as const },
];

const lineColorMap: Record<string, string> = {
command: 'text-[var(--color-text)]',
blank: '',
success: 'text-[var(--color-success)]',
warning: 'text-[var(--color-cta)]',
danger: 'text-[var(--color-danger)]',
ai: 'text-[var(--color-accent)]',
fix: 'text-[var(--color-text-muted)]',
};

export default function Hero() {
return (
<section className="relative overflow-hidden pt-24 sm:pt-28 lg:pt-40 pb-16 sm:pb-20 lg:pb-32">
<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
<div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16 overflow-hidden">
{/* Left column — Copy */}
<div className="lg:col-span-5">
<div className="flex flex-col gap-6">
<div
className="animate-fade-up inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-1.5 text-xs font-medium text-[var(--color-text-muted)]"
>
<span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
Open source · MIT Licensed
</div>

<h1
className="animate-fade-up font-[family-name:var(--font-display)] text-3xl leading-[1.1] font-extrabold tracking-tight text-[var(--color-text)] [text-wrap:balance] sm:text-4xl md:text-5xl lg:text-6xl"
style={{ animationDelay: '100ms' }}
>
Your CSS broke the checkout page.{' '}
<span className="text-[var(--color-accent)]">Frontguard caught it.</span>
</h1>

<p
className="animate-fade-up max-w-lg text-lg leading-relaxed text-[var(--color-text-muted)]"
style={{ animationDelay: '200ms' }}
>
Visual regression testing that tells you what broke, why it
broke, and how to fix it. Plugs into Playwright. Runs in CI.
Free and open source.
</p>

<div
className="animate-fade-up flex flex-wrap gap-4 pt-2"
style={{ animationDelay: '300ms' }}
>
<a
href="#getting-started"
className="touch-manipulation inline-flex items-center gap-2 rounded-lg bg-[var(--color-cta)] px-6 py-3 text-sm font-semibold text-[var(--color-bg)] shadow-lg shadow-orange-500/20 transition-[background-color,box-shadow] hover:bg-[var(--color-cta-hover)] hover:shadow-orange-500/30"
>
Install in 30 Seconds
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d="M3 8h10M9 4l4 4-4 4" />
</svg>
</a>
<a
href="https://github.com/ravidsrk/frontguard"
target="_blank"
rel="noopener noreferrer"
className="touch-manipulation inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-3 text-sm font-medium text-[var(--color-text-muted)] transition-[border-color,color] hover:border-[var(--color-border-bright)] hover:text-[var(--color-text)]"
>
<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
</svg>
View on GitHub
</a>
</div>
</div>
</div>

{/* Right column — Terminal mockup */}
<div
className="animate-fade-in-from-right lg:col-span-7 min-w-0"
style={{ animationDelay: '300ms' }}
>
<div className="relative">
<div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]" role="img" aria-label="Terminal showing Frontguard detecting a visual regression">
{/* Title bar */}
<div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
<span className="h-3 w-3 rounded-full bg-[#ef4444]/60" />
<span className="h-3 w-3 rounded-full bg-[#eab308]/60" />
<span className="h-3 w-3 rounded-full bg-[#22c55e]/60" />
<span className="ml-4 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-dim)]">
terminal
</span>
</div>

{/* Terminal content */}
<div className="overflow-x-auto p-3 sm:p-5 lg:p-6">
<pre className="font-[family-name:var(--font-mono)] text-[11px] leading-relaxed sm:text-sm">
<code>
{terminalLines.map((line, i) => (
<div
key={i}
className={`animate-fade-in min-h-[1.5em] ${lineColorMap[line.type] ?? ''}`}
style={{ animationDelay: `${600 + i * 80}ms` }}
>
{line.text}
</div>
))}
</code>
</pre>
</div>
</div>
</div>
</div>
</div>
</div>
</section>
);
}

import GitHubStars from './GitHubStars';

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
Visual regression testing for Playwright that explains what broke,
why, and how to fix it — right in your pull request. Open source,
runs in your own CI.
</p>

<p
className="animate-fade-up max-w-lg text-sm leading-relaxed text-[var(--color-text-dim)]"
style={{ animationDelay: '250ms' }}
>
AI analysis runs on your own OpenAI or Anthropic key. Screenshots
go straight to your provider — never to a Frontguard server.
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
<GitHubStars className="px-6 py-3" />
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

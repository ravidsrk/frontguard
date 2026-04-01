import { useState } from 'react';
import { useInView } from '../hooks/useInView';

type Tab = 'cli' | 'playwright';

const cliCode = `npm install -g frontguard
frontguard init
frontguard run --url http://localhost:3000`;

const playwrightInstall = `npm install @frontguard/playwright`;

const playwrightCode = `import { test, expect } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('homepage visual', async ({ page }) => {
await page.goto('http://localhost:3000');
const result = await visualTest(page, 'homepage');
expect(result.passed).toBe(true);
});`;

function CodeBlock({ code, filename }: { code: string; filename: string }) {
const [copied, setCopied] = useState(false);

const handleCopy = async () => {
try {
await navigator.clipboard.writeText(code);
setCopied(true);
setTimeout(() => setCopied(false), 2000);
} catch {
// Fallback for older browsers / insecure contexts
const textarea = document.createElement('textarea');
textarea.value = code;
textarea.style.position = 'fixed';
textarea.style.opacity = '0';
document.body.appendChild(textarea);
textarea.select();
document.execCommand('copy');
document.body.removeChild(textarea);
setCopied(true);
setTimeout(() => setCopied(false), 2000);
}
};

return (
<div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
<div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
<span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-dim)]">
{filename}
</span>
<button
onClick={handleCopy}
className="touch-manipulation rounded px-2 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)]"
aria-label="Copy code to clipboard"
>
{copied ? 'Copied!' : 'Copy'}
</button>
</div>
<div className="overflow-x-auto p-4">
<pre className="font-[family-name:var(--font-mono)] text-xs leading-relaxed sm:text-sm">
<code className="text-[var(--color-text)]">{code}</code>
</pre>
</div>
</div>
);
}

export default function GettingStarted() {
const { ref, inView } = useInView();
const [tab, setTab] = useState<Tab>('cli');

return (
<section ref={ref} id="getting-started" className="py-24 lg:py-32">
<div className="mx-auto max-w-3xl px-6 lg:px-8">
<div
className={`mb-12 text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}
>
<h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--color-text)] [text-wrap:balance] md:text-4xl">
Start catching visual bugs{' '}
<span className="text-[var(--color-accent)]">in 30 seconds</span>
</h2>
</div>

<div
className={inView ? 'animate-fade-up' : 'opacity-0'}
style={{ animationDelay: '150ms' }}
>
{/* Tabs */}
<div className="mb-6 flex gap-1 rounded-lg bg-[var(--color-bg-elevated)] p-1">
{(['cli', 'playwright'] as const).map((t) => (
<button
key={t}
onClick={() => setTab(t)}
className={`touch-manipulation flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
tab === t
? 'bg-[var(--color-bg-card)] text-[var(--color-text)] shadow-sm'
: 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
}`}
>
{t === 'cli' ? 'CLI' : 'Playwright Plugin'}
</button>
))}
</div>

{/* Tab content */}
<div className="flex flex-col gap-4">
{tab === 'cli' ? (
<CodeBlock code={cliCode} filename="terminal" />
) : (
<>
<CodeBlock code={playwrightInstall} filename="terminal" />
<CodeBlock code={playwrightCode} filename="visual.spec.ts" />
</>
)}
</div>
</div>
</div>
</section>
);
}

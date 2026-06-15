import { useState } from 'react';
import GitHubStars from './GitHubStars';

const terminalLines = [
  { text: '$ npx frontguard run --url https://myapp.com', type: 'command' as const },
  { text: '', type: 'blank' as const },
  { text: '✔ Discovering routes — 8 route(s) found', type: 'success' as const },
  { text: '✔ Rendering — 24 screenshots · 3 viewports · 3 browsers', type: 'success' as const },
  { text: '✔ Anti-flake consensus — 2/3 captures match (drop 1 flake)', type: 'success' as const },
  { text: '✘ Comparing — 1 regression detected', type: 'warning' as const },
  { text: '', type: 'blank' as const },
  { text: '  /checkout @ 375px chromium — 4.2% diff', type: 'danger' as const },
  { text: '  AI: submit button overflows the flex container; padding', type: 'ai' as const },
  { text: '       jumped from 16px → 24px in Button.module.css:42.', type: 'ai' as const },
  { text: '', type: 'blank' as const },
  { text: '  Suggested fix (sandbox-verified):', type: 'fix' as const },
  { text: '  - padding: 24px;', type: 'patchRemove' as const },
  { text: '  + padding: 16px;', type: 'patchAdd' as const },
];

const lineColorMap: Record<string, string> = {
  command: 'text-[var(--color-text)]',
  blank: '',
  success: 'text-[var(--color-success)]',
  warning: 'text-[var(--color-cta)]',
  danger: 'text-[var(--color-danger)]',
  ai: 'text-[var(--color-accent)]',
  fix: 'text-[var(--color-text-muted)]',
  patchRemove: 'text-[var(--color-danger)]',
  patchAdd: 'text-[var(--color-success)]',
};

const DEMO_GIF = '/demo/frontguard-demo.gif';

export default function Hero() {
  // If the GIF fails to load (T17 hasn't rendered it yet), we silently fall
  // back to the inline terminal mock so the section is never empty.
  const [demoAvailable, setDemoAvailable] = useState(true);

  return (
    <section className="relative overflow-hidden pt-24 sm:pt-28 lg:pt-32 pb-16 sm:pb-20 lg:pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12 overflow-hidden">
          {/* Left column — copy + CTAs */}
          <div className="lg:col-span-5">
            <div className="flex flex-col gap-6">
              <div className="animate-fade-up inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-1.5 text-xs font-medium text-[var(--color-text-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
                Open source · MIT · BYO AI key
              </div>

              <h1
                className="animate-fade-up font-[family-name:var(--font-display)] text-3xl leading-[1.05] font-extrabold tracking-tight text-[var(--color-text)] [text-wrap:balance] sm:text-4xl md:text-5xl lg:text-[3.5rem]"
                style={{ animationDelay: '100ms' }}
              >
                Visual bugs ship past every other test.{' '}
                <span className="text-[var(--color-accent)]">Frontguard catches them.</span>
              </h1>

              <p
                className="animate-fade-up max-w-xl text-base sm:text-lg leading-relaxed text-[var(--color-text-secondary)]"
                style={{ animationDelay: '200ms' }}
              >
                AI-powered frontend visual regression testing for web teams —
                detect, understand, and fix visual bugs before they ship to
                production.
              </p>

              <p
                className="animate-fade-up max-w-lg text-sm leading-relaxed text-[var(--color-text-dim)]"
                style={{ animationDelay: '260ms' }}
              >
                Anti-flake consensus, AI classification, sandbox-verified
                fixes. Runs in your CI on your own OpenAI or Anthropic key —
                screenshots never touch a Frontguard server.
              </p>

              <div
                className="animate-fade-up flex flex-wrap gap-3 pt-2"
                style={{ animationDelay: '320ms' }}
              >
                <a
                  href="#install"
                  className="touch-manipulation inline-flex items-center gap-2 rounded-lg bg-[var(--color-cta)] px-6 py-3 text-sm font-semibold text-[var(--color-bg)] shadow-lg shadow-orange-500/20 transition-[background-color,box-shadow] hover:bg-[var(--color-cta-hover)] hover:shadow-orange-500/30"
                >
                  Install
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </a>
                <a
                  href="#demo"
                  className="touch-manipulation inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-bright)] bg-transparent px-6 py-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  See it work
                </a>
                <GitHubStars className="px-4 py-3" />
              </div>
            </div>
          </div>

          {/* Right column — inline demo (GIF when available, terminal mock otherwise) */}
          <div
            className="animate-fade-in-from-right lg:col-span-7 min-w-0"
            style={{ animationDelay: '300ms' }}
          >
            <div className="relative">
              <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl shadow-cyan-500/5">
                {/* Title bar */}
                <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
                  <span className="h-3 w-3 rounded-full bg-[#ef4444]/60" />
                  <span className="h-3 w-3 rounded-full bg-[#eab308]/60" />
                  <span className="h-3 w-3 rounded-full bg-[#22c55e]/60" />
                  <span className="ml-4 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-dim)]">
                    frontguard run
                  </span>
                </div>

                {demoAvailable ? (
                  <img
                    src={DEMO_GIF}
                    alt="Frontguard CLI run: detecting a regression on /checkout, AI explaining the cause, and proposing a sandbox-verified CSS fix."
                    width={1200}
                    height={700}
                    loading="eager"
                    decoding="async"
                    className="block h-auto w-full"
                    onError={() => setDemoAvailable(false)}
                  />
                ) : (
                  <div className="overflow-x-auto p-3 sm:p-5 lg:p-6">
                    <pre className="font-[family-name:var(--font-mono)] text-[11px] leading-relaxed sm:text-sm">
                      <code>
                        {terminalLines.map((line, i) => (
                          <div
                            key={i}
                            className={`animate-fade-in min-h-[1.5em] ${lineColorMap[line.type] ?? ''}`}
                            style={{ animationDelay: `${500 + i * 60}ms` }}
                          >
                            {line.text}
                          </div>
                        ))}
                      </code>
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

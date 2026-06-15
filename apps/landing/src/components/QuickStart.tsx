import { useRef, useState } from 'react';
import { useInView } from '../hooks/useInView';

type Tab = 'cli' | 'playwright' | 'action';

interface TabSpec {
  id: Tab;
  label: string;
  blocks: { filename: string; code: string }[];
  caption: string;
}

const tabs: TabSpec[] = [
  {
    id: 'cli',
    label: 'CLI',
    caption:
      'Standalone scan against any URL. No tests required. The generated config and the action.yml workflow both import from @frontguard/cli.',
    blocks: [
      {
        filename: 'terminal',
        code: `npm install @frontguard/cli
npx frontguard init
npx frontguard run --url http://localhost:3000`,
      },
    ],
  },
  {
    id: 'playwright',
    label: 'Playwright plugin',
    caption:
      'Drop visual assertions into existing Playwright tests. The plugin re-exports the same engine the CLI uses; FRONTGUARD_OPENAI_KEY / FRONTGUARD_ANTHROPIC_KEY enable AI analysis.',
    blocks: [
      {
        filename: 'terminal',
        code: 'npm install -D @frontguard/cli @frontguard/playwright',
      },
      {
        filename: 'tests/checkout.spec.ts',
        code: `import { test, expect } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('checkout @ 375px', async ({ page }) => {
  await page.goto('http://localhost:3000/checkout');
  const result = await visualTest(page, 'checkout');
  expect(result.passed).toBe(true);
});`,
      },
    ],
  },
  {
    id: 'action',
    label: 'GitHub Action',
    caption:
      'Composite action posts a PR comment with baseline / current / diff thumbnails and the AI explanation. Pin to a tagged release, not @main.',
    blocks: [
      {
        filename: '.github/workflows/visual.yml',
        code: `- name: Frontguard
  uses: ravidsrk/frontguard@v1
  with:
    url: \${{ steps.preview.outputs.url }}
  env:
    FRONTGUARD_OPENAI_KEY: \${{ secrets.OPENAI_KEY }}
    GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
      },
    ],
  },
];

function CodeBlock({ filename, code }: { filename: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
          className="touch-manipulation flex items-center gap-1.5 rounded px-2 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)]"
          aria-label={`Copy ${filename} code to clipboard`}
          aria-live="polite"
        >
          {copied ? (
            'Copied'
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Copy
            </>
          )}
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

export default function QuickStart() {
  const { ref, inView } = useInView();
  const [active, setActive] = useState<Tab>('cli');
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    cli: null,
    playwright: null,
    action: null,
  });
  const tabIds = tabs.map((t) => t.id);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentTab: Tab) => {
    const currentIndex = tabIds.indexOf(currentTab);
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabIds.length;
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = tabIds.length - 1;
    if (nextIndex !== null) {
      e.preventDefault();
      const nextTab = tabIds[nextIndex];
      setActive(nextTab);
      tabRefs.current[nextTab]?.focus();
    }
  };

  return (
    <section
      ref={ref}
      id="install"
      aria-labelledby="install-heading"
      className="border-t border-[var(--color-border)] py-24 lg:py-32"
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className={`mb-10 text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            Quick start
          </p>
          <h2
            id="install-heading"
            className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl"
          >
            Install in 30 seconds, three ways.
          </h2>
          <p className="mt-4 text-base text-[var(--color-text-secondary)]">
            One CLI package, three integration paths. Pick the one that
            matches your stack.
          </p>
        </div>

        <div
          className={inView ? 'animate-fade-up' : 'opacity-0'}
          style={{ animationDelay: '150ms' }}
        >
          <div
            className="mb-6 flex gap-1 rounded-lg bg-[var(--color-bg-elevated)] p-1"
            role="tablist"
            aria-label="Installation method"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={active === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={active === tab.id ? 0 : -1}
                onClick={() => setActive(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, tab.id)}
                className={`touch-manipulation flex-1 rounded-md px-4 py-2.5 min-h-[44px] text-sm font-medium transition-colors ${
                  active === tab.id
                    ? 'bg-[var(--color-bg-card)] text-[var(--color-text)] shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tabpanel"
              id={`tabpanel-${tab.id}`}
              aria-labelledby={`tab-${tab.id}`}
              hidden={active !== tab.id}
              tabIndex={0}
              className="flex flex-col gap-4"
            >
              {tab.blocks.map((block, i) => (
                <CodeBlock key={i} filename={block.filename} code={block.code} />
              ))}
              <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                {tab.caption}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-[var(--color-text-dim)]">
          Full reference in the{' '}
          <a
            href="https://docs.frontguard.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-2 hover:underline"
          >
            documentation
          </a>
          .
        </p>
      </div>
    </section>
  );
}

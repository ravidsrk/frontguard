import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CodeCopyBlock } from './CodeCopyBlock';

interface InstallTab {
  id: string;
  label: string;
  filename: string;
  /** Raw text copied to the clipboard. */
  code: string;
  /** Syntax-highlighted rendering of `code`. */
  render: ReactNode;
}

const Prompt = () => <span className="text-ink-muted">$ </span>;

/*
  The three install paths the floor's QuickStart carried — Standalone CLI,
  Playwright plugin, and the GitHub Action — preserved as a keyboard-accessible
  ARIA tablist (decision: fold the third path into the two-ways-in section). The
  GitHub Action YAML survives here verbatim; every panel is copyable.
*/
const INSTALL_TABS: InstallTab[] = [
  {
    id: 'cli',
    label: 'CLI',
    filename: 'Terminal',
    code: 'npm install @frontguard/cli\nnpx frontguard init\nnpx frontguard run --url http://localhost:3000',
    render: (
      <>
        <Prompt />
        npm install @frontguard/cli{'\n'}
        <Prompt />
        npx frontguard init{'\n'}
        <Prompt />
        npx frontguard run --url http://localhost:3000
      </>
    ),
  },
  {
    id: 'playwright',
    label: 'Playwright',
    filename: 'Terminal',
    code: 'npm install -D @frontguard/cli @frontguard/playwright',
    render: (
      <>
        <Prompt />
        npm install -D @frontguard/cli @frontguard/playwright
      </>
    ),
  },
  {
    id: 'github',
    label: 'GitHub Action',
    filename: '.github/workflows/visual.yml',
    code: [
      '- name: Frontguard',
      '  uses: ravidsrk/frontguard@v1',
      '  with:',
      '    url: ${{ steps.preview.outputs.url }}',
      '  env:',
      '    FRONTGUARD_OPENAI_KEY: ${{ secrets.OPENAI_KEY }}',
      '    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    ].join('\n'),
    render: (
      <>
        <span className="text-code-comment">- </span>name:{' '}
        <span className="text-code-string">Frontguard</span>
        {'\n  '}uses: <span className="text-code-string">ravidsrk/frontguard@v1</span>
        {'\n  '}with:
        {'\n    '}url: <span className="text-code-number">{'${{ steps.preview.outputs.url }}'}</span>
        {'\n  '}env:
        {'\n    '}FRONTGUARD_OPENAI_KEY:{' '}
        <span className="text-code-number">{'${{ secrets.OPENAI_KEY }}'}</span>
        {'\n    '}GITHUB_TOKEN: <span className="text-code-number">{'${{ secrets.GITHUB_TOKEN }}'}</span>
      </>
    ),
  },
];

export function InstallTabs() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = INSTALL_TABS.length - 1;
    let next = active;
    switch (e.key) {
      case 'ArrowRight':
        next = active === last ? 0 : active + 1;
        break;
      case 'ArrowLeft':
        next = active === 0 ? last : active - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div id="install" className="mt-5 scroll-mt-20">
      <div
        role="tablist"
        aria-label="Installation method"
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-1 border-b border-border-faint"
      >
        {INSTALL_TABS.map((t, i) => {
          const selected = i === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={[
                '-mb-px cursor-pointer border-b-2 px-4 py-2.5 font-mono text-[13px] transition-colors duration-[180ms]',
                selected
                  ? 'border-amber text-amber'
                  : 'border-transparent text-ink-soft hover:text-ink-hi',
              ].join(' ')}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {INSTALL_TABS.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={i !== active}
          tabIndex={0}
          className="mt-4 focus-visible:outline-none"
        >
          <CodeCopyBlock filename={t.filename} code={t.code}>
            {t.render}
          </CodeCopyBlock>
        </div>
      ))}
    </div>
  );
}

export default InstallTabs;

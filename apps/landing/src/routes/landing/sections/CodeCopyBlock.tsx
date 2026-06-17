import { useEffect, useRef, useState, type ReactNode } from 'react';

/** execCommand fallback for environments without the async clipboard API. */
function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

interface CodeCopyBlockProps {
  /** Filename shown beside the three terminal dots. */
  filename: string;
  /** Raw text placed on the clipboard. */
  code: string;
  /** Optional syntax-highlighted rendering; defaults to the raw `code`. */
  children?: ReactNode;
  className?: string;
}

/*
  A terminal card whose header carries a copy button (the kit's CopyCommand is
  single-line only). Copy prefers the async clipboard API and falls back to
  execCommand; an aria-live status announces "copied" to assistive tech. Used by
  the install tabs so every path — including the GitHub Action YAML — is copyable.
*/
export function CodeCopyBlock({ filename, code, children, className = '' }: CodeCopyBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function handleCopy() {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        ok = true;
      } else {
        ok = legacyCopy(code);
      }
    } catch {
      ok = legacyCopy(code);
    }
    if (ok) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div className={['border border-border-card bg-surface-term', className].join(' ')}>
      <div className="flex items-center justify-between gap-3 border-b border-border-faint bg-surface-strip px-4 py-2.5">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </span>
          <span className="ml-1 font-mono text-[12px] text-ink-muted">{filename}</span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${filename}`}
          className="cursor-pointer whitespace-nowrap font-mono text-[12px] text-ink-soft transition-colors duration-[180ms] hover:text-ink-hi"
        >
          {copied ? <span className="text-pass">copied ✓</span> : 'copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-[1.8] text-code-default">
        {children ?? code}
      </pre>
      <span aria-live="polite" className="sr-only">
        {copied ? `${filename} copied to clipboard` : ''}
      </span>
    </div>
  );
}

export default CodeCopyBlock;

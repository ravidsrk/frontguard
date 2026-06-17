import { useEffect, useRef, useState } from 'react';

interface CopyCommandProps {
  /** The command, without the leading prompt. */
  command: string;
  /** Prompt glyph; defaults to the shell "$". */
  prompt?: string;
  className?: string;
  'aria-label'?: string;
}

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

/**
 * A `$ command` row with a copy button that toggles to "copied ✓" for 1600ms.
 * Prefers the async clipboard API and falls back to execCommand.
 */
export function CopyCommand({
  command,
  prompt = '$',
  className = '',
  'aria-label': ariaLabel,
}: CopyCommandProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function handleCopy() {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
        ok = true;
      } else {
        ok = legacyCopy(command);
      }
    } catch {
      ok = legacyCopy(command);
    }
    if (ok) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div
      className={[
        'flex items-center justify-between gap-4 border border-border bg-surface-term px-4 py-3',
        className,
      ].join(' ')}
    >
      <code className="font-mono text-[13px] text-ink-term">
        <span className="text-ink-muted select-none">{prompt} </span>
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={ariaLabel ?? `Copy command: ${command}`}
        className="font-mono text-[12px] text-ink-soft transition-colors duration-[180ms] hover:text-ink-hi cursor-pointer whitespace-nowrap"
      >
        {copied ? <span className="text-pass">copied ✓</span> : 'copy'}
      </button>
    </div>
  );
}

export default CopyCommand;

import { useEffect, useState } from 'react';

const REPO = 'ravidsrk/frontguard';
const REPO_URL = `https://github.com/${REPO}`;

/**
 * Live GitHub star badge. Fetches the real star count from the public GitHub
 * API and renders it next to a star glyph. We never fabricate a number — if the
 * request fails or is still loading, the badge falls back to a plain "Star on
 * GitHub" label so the link is always useful and never shows a fake count.
 */
export default function GitHubStars({ className = '' }: { className?: string }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${REPO}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.stargazers_count === 'number') {
          setStars(data.stargazers_count);
        }
      })
      .catch(() => {
        /* network/offline — keep the fallback label */
      });
    return () => controller.abort();
  }, []);

  const formatted =
    stars === null
      ? null
      : stars >= 1000
        ? `${(stars / 1000).toFixed(1)}k`
        : stars.toLocaleString();

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={
        stars === null
          ? 'Star Frontguard on GitHub'
          : `Frontguard has ${stars} stars on GitHub`
      }
      className={`group inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-[border-color,color] hover:border-[var(--color-border-bright)] hover:text-[var(--color-text)] ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      <span>Star on GitHub</span>
      {formatted !== null && (
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-bg-card)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text)] [font-variant-numeric:tabular-nums]">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--color-cta)]" aria-hidden="true">
            <path d="M8 .25l2.06 4.78 5.19.42-3.95 3.4 1.2 5.06L8 11.7l-4.5 2.61 1.2-5.06L.75 5.45l5.19-.42L8 .25z" />
          </svg>
          {formatted}
        </span>
      )}
    </a>
  );
}

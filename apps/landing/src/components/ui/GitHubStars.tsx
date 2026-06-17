import { useEffect, useState } from 'react';
import { REPO, REPO_URL } from '../../lib/site';

type StarState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; count: number };

/**
 * Live GitHub star button. Fetches the real `stargazers_count` and never
 * fabricates a number — while loading or on error it renders a plain "★ Star"
 * so the link is always useful. Uses an AbortController to cancel in-flight
 * requests on unmount.
 */
export function GitHubStars({
  variant = 'primary',
  className = '',
}: {
  variant?: 'primary' | 'ghost';
  className?: string;
}) {
  const [state, setState] = useState<StarState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${REPO}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.stargazers_count === 'number') {
          setState({ status: 'ready', count: data.stargazers_count });
        } else {
          setState({ status: 'error' });
        }
      })
      .catch((err: unknown) => {
        // Ignore aborts (component unmounted); otherwise keep the fallback label.
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, []);

  const count = state.status === 'ready' ? state.count : null;
  const formatted =
    count === null ? null : count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count.toLocaleString();

  const palette =
    variant === 'primary'
      ? 'bg-amber text-canvas hover:bg-amber-hover'
      : 'border border-border text-ink-hi hover:border-border-hover hover:bg-raised';

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={
        count === null ? 'Star Frontguard on GitHub' : `Frontguard has ${count} stars on GitHub`
      }
      className={[
        'inline-flex items-center gap-2 px-3.5 py-2 font-mono text-[13px] font-medium',
        'transition-[background-color,border-color,color] duration-[180ms] ease-out',
        palette,
        className,
      ].join(' ')}
    >
      <span aria-hidden="true">★</span>
      <span>Star</span>
      {formatted !== null && (
        <span className="font-mono tabular-nums opacity-90" data-testid="star-count">
          {formatted}
        </span>
      )}
    </a>
  );
}

export default GitHubStars;

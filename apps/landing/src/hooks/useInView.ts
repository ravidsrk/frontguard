import { useEffect, useRef, useState } from 'react';

/**
 * IntersectionObserver scroll-reveal. Degrades gracefully: under reduced motion,
 * during SSG/SSR (no IntersectionObserver), or when observation is unavailable,
 * it reveals immediately so content is never gated behind an animation.
 */
export function useInView(options?: IntersectionObserverInit & { once?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Start `false` so the SSR-rendered markup and the first client render agree.
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (options?.once !== false) observer.disconnect();
        }
      },
      { rootMargin: options?.rootMargin ?? '-80px', threshold: options?.threshold ?? 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, inView };
}

export default useInView;

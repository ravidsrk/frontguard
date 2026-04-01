import { useEffect, useRef, useState } from 'react';

export function useInView(options?: IntersectionObserverInit & { once?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (options?.once !== false) observer.disconnect();
        }
      },
      { rootMargin: options?.rootMargin ?? '-80px', threshold: options?.threshold ?? 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}

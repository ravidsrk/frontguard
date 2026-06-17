import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useInView } from '../hooks/useInView';

function mockMatchMedia(matches: boolean) {
  const mql = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mql),
  });
}

/** A never-firing IntersectionObserver so animation reveal is gated on the hook logic. */
class InertObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

function InViewProbe() {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} data-testid="probe">
      {inView ? 'revealed' : 'hidden'}
    </div>
  );
}

describe('reduced motion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error allow clearing the test double
    delete window.IntersectionObserver;
  });

  it('usePrefersReducedMotion reports true when the user requests reduced motion', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('usePrefersReducedMotion reports false otherwise', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('useInView reveals immediately under reduced motion (animation neutralized)', async () => {
    mockMatchMedia(true);
    window.IntersectionObserver = InertObserver;

    render(<InViewProbe />);
    // Even though the observer never fires, reduced motion forces the reveal.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('revealed'));
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { GitHubStars } from '../components/ui/GitHubStars';

describe('GitHubStars', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the fallback label while loading (no fabricated count)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves
    render(<GitHubStars />);
    expect(screen.getByRole('link', { name: /star frontguard on github/i })).toBeInTheDocument();
    expect(screen.queryByTestId('star-count')).not.toBeInTheDocument();
  });

  it('renders the real star count on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stargazers_count: 1234 }) }),
    );
    render(<GitHubStars />);
    const count = await screen.findByTestId('star-count');
    expect(count).toHaveTextContent('1.2k');
    expect(screen.getByRole('link', { name: /1234 stars/i })).toBeInTheDocument();
  });

  it('keeps the fallback (no count) on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    render(<GitHubStars />);
    await waitFor(() => expect(screen.getByRole('link')).toBeInTheDocument());
    expect(screen.queryByTestId('star-count')).not.toBeInTheDocument();
  });

  it('keeps the fallback on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<GitHubStars />);
    await waitFor(() => expect(screen.getByRole('link')).toBeInTheDocument());
    expect(screen.queryByTestId('star-count')).not.toBeInTheDocument();
  });

  it('aborts the in-flight request on unmount', () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { unmount } = render(<GitHubStars />);
    unmount();
    expect(abortSpy).toHaveBeenCalled();
  });
});

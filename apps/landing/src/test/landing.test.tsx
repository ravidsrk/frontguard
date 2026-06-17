import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';

import { Component as Landing } from '../routes/landing';
import { Hero } from '../routes/landing/sections/Hero';
import { CodeCopyBlock } from '../routes/landing/sections/CodeCopyBlock';
import { InstallTabs } from '../routes/landing/sections/InstallTabs';
import { Validation } from '../routes/landing/sections/Validation';
import { useHashRedirect, LEGACY_HASH_MAP } from '../routes/landing/useHashRedirect';
import { formatPercent, partitionRepos, VALIDATION } from '../routes/landing/validation-data';

function renderRouted(ui: ReactElement, path = '/') {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

// navigator.clipboard is getter-only in jsdom; override explicitly per the kit's
// CopyCommand test convention.
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

describe('landing page — all 14 sections render', () => {
  beforeEach(() => {
    // Keep GitHubStars in its loading fallback (no real network in tests).
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const HEADINGS: RegExp[] = [
    /catch the regression, not the noise/i, // hero
    /Detect, understand, fix/i, // three pillars
    /One command, or three lines/i, // two ways in
    /Six stages, fully self-hostable/i, // pipeline
    /Kills the #1 pain of visual testing/i, // AI example
    /CLI-first\. Zero dashboards required/i, // features
    /One file\. Sensible defaults/i, // config
    /The only one with AI fix verification/i, // comparison summary
    /Extensible by design/i, // plugins
    /We'll tell you what it isn't/i, // honest
    /Numbers from a real harness/i, // validation
    /Ship with confidence/i, // CTA
  ];

  it('renders every section heading', () => {
    renderRouted(<Landing />);
    for (const name of HEADINGS) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('renders the problem strip statement and the comparison summary link', () => {
    renderRouted(<Landing />);
    expect(screen.getByText(/mutes the channel they post to/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /See all 11 capabilities across 6 tools/i }),
    ).toBeInTheDocument();
  });

  it('keeps the #demo anchor target and #features section id', () => {
    const { container } = renderRouted(<Landing />);
    expect(container.querySelector('#demo')).not.toBeNull();
    expect(container.querySelector('#features')).not.toBeNull();
    expect(container.querySelector('#compare')).not.toBeNull();
  });
});

describe('hero GitHubStars (live fetch)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the fallback label while loading (no fabricated count)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<Hero />);
    expect(screen.getByRole('link', { name: /star frontguard on github/i })).toBeInTheDocument();
    expect(screen.queryByTestId('star-count')).not.toBeInTheDocument();
  });

  it('renders the real star count on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stargazers_count: 2048 }) }),
    );
    render(<Hero />);
    expect(await screen.findByTestId('star-count')).toHaveTextContent('2.0k');
  });

  it('keeps the fallback on an error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<Hero />);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /star frontguard on github/i })).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('star-count')).not.toBeInTheDocument();
  });

  it('aborts the in-flight request on unmount', () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { unmount } = render(<Hero />);
    unmount();
    expect(abortSpy).toHaveBeenCalled();
  });
});

describe('CodeCopyBlock copy (clipboard + execCommand fallback)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    setClipboard(undefined);
  });

  it('copies via the async clipboard API and toggles to "copied ✓"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<CodeCopyBlock filename="Terminal" code="npm install @frontguard/cli" />);
    fireEvent.click(screen.getByRole('button', { name: /copy terminal/i }));
    expect(await screen.findByText('copied ✓')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('npm install @frontguard/cli');
  });

  it('falls back to execCommand when the clipboard API is unavailable', async () => {
    setClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
      writable: true,
    });
    render(<CodeCopyBlock filename="visual.yml" code="uses: ravidsrk/frontguard@v1" />);
    fireEvent.click(screen.getByRole('button', { name: /copy visual\.yml/i }));
    expect(await screen.findByText('copied ✓')).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});

describe('InstallTabs (keyboard-accessible, 3 paths incl. GitHub Action)', () => {
  it('exposes all three install paths as tabs', () => {
    render(<InstallTabs />);
    expect(screen.getByRole('tab', { name: 'CLI' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Playwright' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'GitHub Action' })).toBeInTheDocument();
    // The first tab is selected and its panel is the only accessible one.
    expect(screen.getByRole('tab', { name: 'CLI' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel').textContent).toContain('npm install @frontguard/cli');
  });

  it('moves selection with ArrowRight / End and reveals the matching panel', () => {
    render(<InstallTabs />);
    const tablist = screen.getByRole('tablist');

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Playwright' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'GitHub Action' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel').textContent).toContain('ravidsrk/frontguard@v1');

    // ArrowRight wraps from the last tab back to the first.
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'CLI' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Validation (real harness numbers, never fabricated)', () => {
  it('formats pixel false-positive rates and treats null as n/a', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('n/a');
    expect(formatPercent(0.153)).toBe('15%');
  });

  it('partitions booted vs skipped repos from the payload', () => {
    const { booted, skipped } = partitionRepos(VALIDATION);
    expect(booted).toHaveLength(2);
    expect(skipped).toHaveLength(3);
  });

  it('renders the measured aggregate and every skipped repo with its reason', () => {
    render(<Validation />);
    // The measured 0% pixel false-positive rate is shown (not invented accuracy).
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
    // All three un-booted repos surface as skipped rows with a documented reason.
    const skippedRows = screen.getAllByTestId('skipped-repo');
    expect(skippedRows).toHaveLength(3);
    expect(screen.getByText(/Medusa backend/i)).toBeInTheDocument();
    // No accuracy figure is published while AI classification is disabled.
    expect(screen.getByText(/no accuracy or AI false-positive number is published yet/i)).toBeInTheDocument();
  });
});

describe('legacy-hash redirect shim (decisions 2–3)', () => {
  function HashHarness() {
    useHashRedirect();
    const loc = useLocation();
    return <span data-testid="loc">{loc.pathname + loc.hash}</span>;
  }

  it('maps the dropped anchors to their new routes', () => {
    expect(LEGACY_HASH_MAP['#pricing']).toBe('/pricing');
    expect(LEGACY_HASH_MAP['#faq']).toBe('/pricing#faq');
    expect(LEGACY_HASH_MAP['#comparison']).toBe('/comparisons');
  });

  it('redirects /#pricing to /pricing', async () => {
    renderRouted(<HashHarness />, '/#pricing');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/pricing'));
  });

  it('redirects /#faq to /pricing#faq', async () => {
    renderRouted(<HashHarness />, '/#faq');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/pricing#faq'));
  });

  it('leaves a live in-page anchor like #features untouched', async () => {
    renderRouted(<HashHarness />, '/#features');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/#features'));
  });
});

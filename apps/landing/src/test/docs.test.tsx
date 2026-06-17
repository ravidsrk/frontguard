import { render, screen } from './test-utils';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DocsLayout } from '../layouts/DocsLayout';
import { Component as DocsHome } from '../routes/docs-home';
import { Component as DocsPage } from '../routes/docs-page';

/** Page-only router (no DocsLayout/TopBar) for breadcrumb/TOC/pager behavior. */
function renderPages(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/docs" element={<DocsHome />} />
        <Route path="/docs/:page" element={<DocsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Full shell router (includes the sidebar) for active-page styling. */
function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<DocsHome />} />
          <Route path=":page" element={<DocsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }),
  });
}

describe('docs Introduction parity', () => {
  it('renders the DETECT/UNDERSTAND callouts, PREREQUISITES note, and the pipeline', () => {
    renderPages('/docs/introduction');
    expect(screen.getByRole('heading', { level: 1, name: 'Introduction' })).toBeInTheDocument();
    expect(screen.getByText('DETECT')).toBeInTheDocument();
    expect(screen.getByText('UNDERSTAND')).toBeInTheDocument();
    expect(screen.getByText(/Node\.js 20\+ and npm 9\+/)).toBeInTheDocument();
    // six-stage pipeline
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Report')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The pipeline' })).toBeInTheDocument();
  });
});

describe('docs route change', () => {
  it('swaps the active page, breadcrumb, TOC, and pager when navigating', async () => {
    const user = userEvent.setup();
    renderPages('/docs/introduction');

    // Introduction state.
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The pipeline' })).toBeInTheDocument();
    const next = screen.getByRole('link', { name: /next.*installation/i });
    expect(next).toBeInTheDocument();

    await user.click(next);

    // Installation state — page, breadcrumb, TOC, and pager all swapped.
    expect(screen.getByRole('heading', { level: 1, name: 'Installation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Framework detection' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'The pipeline' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /previous.*introduction/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /next.*quick start/i })).toBeInTheDocument();
  });
});

describe('docs pager end states', () => {
  it('disables the prev box on the overview (0.4 opacity)', () => {
    renderPages('/docs');
    const overview = screen.getByText('Overview');
    const box = overview.closest('[aria-disabled="true"]');
    expect(box).not.toBeNull();
    expect(box).toHaveClass('opacity-40');
  });

  it('disables the next box on the last page (0.4 opacity)', () => {
    renderPages('/docs/validation');
    const end = screen.getByText("You're all caught up");
    const box = end.closest('[aria-disabled="true"]');
    expect(box).not.toBeNull();
    expect(box).toHaveClass('opacity-40');
  });

  it('renders interior pager links as real links (not disabled)', () => {
    renderPages('/docs/installation');
    const prev = screen.getByRole('link', { name: /previous.*introduction/i });
    expect(prev).toHaveAttribute('href', '/docs/introduction');
  });
});

describe('docs sidebar active styling', () => {
  beforeEach(() => {
    // The TopBar Star button fetches on mount; keep it pending (no network).
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks the current page active (aria-current + amber) and others idle', () => {
    renderShell('/docs/configuration');
    // Sidebar uses the `hidden` attribute when the drawer is closed → query hidden.
    const active = screen.getByRole('link', { name: 'Configuration', hidden: true });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active).toHaveClass('text-amber');

    const idle = screen.getByRole('link', { name: 'Installation', hidden: true });
    expect(idle).not.toHaveAttribute('aria-current', 'page');
    expect(idle).toHaveClass('text-ink-soft');
  });
});

describe('docs TOC smooth scroll', () => {
  let scrollSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy as unknown as typeof Element.prototype.scrollIntoView;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error remove the test double
    delete Element.prototype.scrollIntoView;
  });

  it('smooth-scrolls to the section by default', async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    renderPages('/docs/introduction');

    await user.click(screen.getByRole('link', { name: 'The pipeline' }));

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('jumps instantly (behavior auto) under reduced motion', async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    renderPages('/docs/introduction');

    await user.click(screen.getByRole('link', { name: 'The pipeline' }));

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });
});

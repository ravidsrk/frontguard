import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Component as Comparisons } from '../routes/comparisons';
import { ComparisonMatrix } from '../routes/comparisons/ComparisonMatrix';
import { ALTERNATIVES, FLOOR_CAPABILITIES, MATRIX, VENDORS } from '../routes/comparisons/data';

function renderPage() {
  return render(
    <MemoryRouter>
      <Comparisons />
    </MemoryRouter>,
  );
}

describe('/comparisons page shell', () => {
  it('renders the hero heading (and the SSG marker string)', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /frontguard vs\. everyone else/i }),
    ).toBeInTheDocument();
  });

  it('renders the four alternatives in the strip', () => {
    renderPage();
    const items = screen.getAllByTestId('alternative');
    expect(items).toHaveLength(4);
    // Vendor names recur across the page (matrix header, vs-cards), so scope to the strip.
    ALTERNATIVES.forEach((alt, i) => {
      expect(within(items[i]).getByText(alt.name)).toBeInTheDocument();
      expect(within(items[i]).getByText(alt.status)).toBeInTheDocument();
    });
  });
});

// The core parity guarantee: every one of the floor's 11 capabilities must
// survive on the matrix, asserted ONE-PER-ROW by its (possibly renamed) label —
// not via a row-count check (parity-spec §5 t-comparisons).
describe('floor parity — no comparison row dropped', () => {
  it.each(FLOOR_CAPABILITIES)('carries floor "$floor" as matrix row "$row"', ({ row }) => {
    renderPage();
    expect(screen.getByRole('rowheader', { name: row })).toBeInTheDocument();
  });

  it('keeps the four design-native rows too', () => {
    renderPage();
    for (const cap of ['Open source', 'CLI-first', 'Anti-flake rendering', 'Actively maintained']) {
      expect(screen.getByRole('rowheader', { name: cap })).toBeInTheDocument();
    }
  });

  it('renders a 7-column matrix (capability + 6 vendors) over 15 rows', () => {
    render(<ComparisonMatrix />);
    expect(VENDORS).toHaveLength(6);
    VENDORS.forEach((vendor) => {
      expect(screen.getByRole('columnheader', { name: vendor })).toBeInTheDocument();
    });
    // 15 capability rows, each a <th scope="row">.
    expect(screen.getAllByRole('rowheader')).toHaveLength(MATRIX.length);
    expect(MATRIX).toHaveLength(15);
  });
});

describe('gap-fill rows populate all six vendor columns', () => {
  const gapFill = MATRIX.filter((r) => r.origin === 'gap-fill');

  it('has six gap-filled floor rows', () => {
    expect(gapFill).toHaveLength(6);
  });

  it.each(gapFill)('row "$capability" renders 6 vendor cells', ({ capability }) => {
    render(<ComparisonMatrix />);
    const rowHeader = screen.getByRole('rowheader', { name: capability });
    const row = rowHeader.closest('tr');
    expect(row).not.toBeNull();
    // <th scope="row"> is a rowheader; the six vendor cells are <td> (role cell).
    expect(within(row as HTMLElement).getAllByRole('cell')).toHaveLength(6);
  });
});

describe('per-cell color mapping', () => {
  it('colors ✓ green, ◐ amber, ✕ grey (bare glyphs only)', () => {
    const { container } = render(<ComparisonMatrix />);
    expect(container.querySelector('[data-glyph="✓"]')).toHaveClass('text-pass');
    expect(container.querySelector('[data-glyph="◐"]')).toHaveClass('text-amber');
    expect(container.querySelector('[data-glyph="✕"]')).toHaveClass('text-ink-dim');
  });

  it('leaves a mixed "✓ MIT" cell as neutral ink, not status-green', () => {
    render(<ComparisonMatrix />);
    const mixed = screen.getAllByText('✓ MIT');
    expect(mixed.length).toBeGreaterThanOrEqual(1);
    mixed.forEach((cell) => {
      expect(cell).toHaveClass('text-ink-bright');
      expect(cell).not.toHaveClass('text-pass');
    });
  });
});

describe('legend and sources', () => {
  it('renders the ✓ / ◐ / ✕ legend', () => {
    render(<ComparisonMatrix />);
    expect(screen.getByText('full support')).toBeInTheDocument();
    expect(screen.getByText('partial / limited')).toBeInTheDocument();
    expect(screen.getByText('not available')).toBeInTheDocument();
  });

  it('links the matrix sources to docs/research.md', () => {
    render(<ComparisonMatrix />);
    const link = screen.getByRole('link', { name: /docs\/research\.md/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/blob/main/docs/research.md'));
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('gives the matrix an accessible caption', () => {
    const { container } = render(<ComparisonMatrix />);
    const caption = container.querySelector('caption');
    expect(caption).toHaveClass('sr-only');
    expect(caption?.textContent).toMatch(/comparison between Frontguard/i);
  });
});

describe('head-to-head cards', () => {
  it('renders four vs-cards with a hover-border affordance', () => {
    renderPage();
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(4);
    cards.forEach((card) => expect(card).toHaveClass('hover:border-border-hover'));
  });

  it('points each vs-card CTA at an external docs page with rel hygiene', () => {
    renderPage();
    const ctas = screen.getAllByRole('link', { name: /(read the comparison|migration guide) →/i });
    expect(ctas).toHaveLength(4);
    ctas.forEach((cta) => {
      expect(cta).toHaveAttribute('target', '_blank');
      expect(cta).toHaveAttribute('rel', 'noopener noreferrer');
      expect(cta.getAttribute('href')).toContain('docs.frontguard.dev');
    });
  });
});

describe('migration + CTA', () => {
  it('renders four migration cards with external rel hygiene', () => {
    renderPage();
    const cards = screen.getAllByTestId('migration');
    expect(cards).toHaveLength(4);
    cards.forEach((card) => {
      expect(card).toHaveAttribute('target', '_blank');
      expect(card).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('routes the CTA buttons to /docs and /pricing', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/docs');
    expect(screen.getByRole('link', { name: /view pricing/i })).toHaveAttribute('href', '/pricing');
  });
});

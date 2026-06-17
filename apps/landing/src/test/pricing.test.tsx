import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Component as Pricing } from '../routes/pricing';

function renderPricing() {
  return render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  );
}

// navigator.clipboard is a getter-only property in jsdom; override it explicitly.
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

describe('/pricing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setClipboard(undefined);
  });

  it('renders the hero with the free-forever pill and the 54px h1', () => {
    renderPricing();
    expect(screen.getByText(/the CLI is free forever · MIT/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /pricing that respects open source/i }),
    ).toBeInTheDocument();
  });

  it('renders three tiers with floor-correct CTAs and external-link hygiene', () => {
    renderPricing();

    // Open Source -> install anchor: internal, no new tab, no rel.
    const install = screen.getByRole('link', { name: /npm install @frontguard\/cli/i });
    expect(install).toHaveAttribute('href', '/#install');
    expect(install).not.toHaveAttribute('target');
    expect(install).not.toHaveAttribute('rel');

    // Pro -> external signup: new tab + rel hygiene.
    const trial = screen.getByRole('link', { name: /start 14-day trial/i });
    expect(trial).toHaveAttribute('href', 'https://app.frontguard.dev/signup');
    expect(trial).toHaveAttribute('target', '_blank');
    expect(trial).toHaveAttribute('rel', 'noopener noreferrer');

    // Team -> mailto enterprise: new tab + rel hygiene.
    const contact = screen.getByRole('link', { name: /contact us/i });
    expect(contact).toHaveAttribute('href', 'mailto:hello@frontguard.dev?subject=Enterprise%20Frontguard');
    expect(contact).toHaveAttribute('target', '_blank');
    expect(contact).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('flags the featured Pro tier with a "most popular" badge', () => {
    renderPricing();
    expect(screen.getByText(/most popular/i)).toBeInTheDocument();
  });

  it('renders all eight FAQ questions as native <details> accordions', () => {
    renderPricing();
    const questions = [
      'How do I install Frontguard?',
      'How does Frontguard handle cross-OS rendering differences?',
      'Can I self-host the cloud?',
      'What environment variables does Frontguard read?',
      'OpenAI or Anthropic — which should I use?',
      'Does Frontguard work with Storybook?',
      'Is there an MCP server for in-IDE agents?',
      "What's the data retention policy for screenshots?",
    ];
    for (const q of questions) {
      expect(screen.getByText(q)).toBeInTheDocument();
    }
    expect(document.querySelectorAll('details')).toHaveLength(8);
  });

  it('emits a FAQPage JSON-LD block covering the same eight questions', () => {
    const { container } = renderPricing();
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script!.innerHTML);
    expect(data['@type']).toBe('FAQPage');
    expect(data.mainEntity).toHaveLength(8);
    expect(data.mainEntity[0].name).toBe('How do I install Frontguard?');
    expect(data.mainEntity[0].acceptedAnswer.text).toMatch(/npm install @frontguard\/cli/);
    // The escaped angle bracket round-trips back to a real "<" after parsing.
    expect(data.mainEntity[0].acceptedAnswer.text).toContain('<your URL>');
  });

  it('maps the compare-plans matrix cells to the correct status colors', () => {
    renderPricing();
    const table = screen.getByRole('table');

    // ✓ glyphs are pass-green (color lives on the wrapping span).
    const checks = within(table).getAllByText('✓');
    expect(checks.length).toBeGreaterThan(0);
    checks.forEach((c) => expect(c.parentElement).toHaveClass('text-pass'));

    // Managed-storage R2 cells are amber; both Pro and Team carry it.
    const r2 = within(table).getAllByText('R2');
    expect(r2).toHaveLength(2);
    r2.forEach((c) => expect(c).toHaveClass('text-amber'));

    // Unavailable cells render an em dash in the muted ink tone, not ✕.
    const dashes = within(table).getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
    dashes.forEach((c) => expect(c).toHaveClass('text-ink-soft'));

    // The Pro column header is the emphasized (amber) column.
    expect(within(table).getByText('Pro')).toHaveClass('text-amber');
  });

  it('renders an accessible compare-plans table with a caption and column scopes', () => {
    renderPricing();
    const table = screen.getByRole('table');
    expect(within(table).getByText(/frontguard plan comparison/i)).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    // Nine capability rows render as row headers.
    expect(within(table).getAllByRole('rowheader')).toHaveLength(9);
  });

  it('copies the install command from the CTA band', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    renderPricing();
    const copyBtn = screen.getByRole('button', {
      name: /copy command: npm install @frontguard\/cli/i,
    });
    fireEvent.click(copyBtn);

    expect(await screen.findByText('copied ✓')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('npm install @frontguard/cli');
  });
});

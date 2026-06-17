import { render, screen, within } from '@testing-library/react';
import { Component as Brand } from '../routes/brand';
import { NEUTRALS, STATUSES, VOICE, SAY, DONT } from '../routes/brand/content';
import { STATUS_GLYPH, STATUS_COLOR_CLASS } from '../components/ui/status';

/*
  The /brand page is the living token reference, so these tests assert behavior
  and contracts, not markup: the five numbered sections exist as semantic
  headings, swatches print their hex as text AND are painted by the matching
  foundation token, lockup variants render, and the `.fg-swatch` hover-lift is
  wired. The documented neutral hexes are checked against the foundation token
  values so the page and index.css cannot silently drift.
*/

// Mirror of the @theme `--color-*` tokens in src/index.css (the floor the page documents).
const FOUNDATION_HEX: Record<string, string> = {
  canvas: '#0d0c0b',
  panel: '#131210',
  raised: '#1f1c19',
  border: '#322d28',
  'ink-mid': '#b8b0a6',
  'ink-hi': '#f5f1ea',
};

describe('/brand styleguide', () => {
  it('renders the page title with a stable accessible name (SSG marker)', () => {
    const { container } = render(<Brand />);
    expect(
      screen.getByRole('heading', { level: 1, name: /the frontguard brand system/i }),
    ).toBeInTheDocument();
    // The literal string the prerender/SSG test greps for must survive the <br>.
    expect(container.innerHTML).toContain('The Frontguard brand system');
  });

  it('renders all five numbered sections as semantic <h2> headings', () => {
    render(<Brand />);
    for (const label of [
      '01 / THE MARK',
      '02 / COLOR',
      '03 / TYPOGRAPHY',
      '04 / VOICE',
      '05 / MESSAGING',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: label })).toBeInTheDocument();
    }
  });

  it('renders the three lockup variants plus the header mark', () => {
    render(<Brand />);
    // Header logo + big mark + 3 lockups → at least 5 shield marks (routes.test floor is 3).
    expect(screen.getAllByTestId('brand-mark').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('PRIMARY LOCKUP')).toBeInTheDocument();
    expect(screen.getByText('MARK · APP ICON')).toBeInTheDocument();
    // The mono-light lockup renders its wordmark on the light card.
    const monoCard = screen.getByText('MONO · ON LIGHT').closest('div');
    expect(monoCard).not.toBeNull();
    expect(within(monoCard!).getByText('frontguard')).toBeInTheDocument();
    // Header + primary + mono-light all carry the wordmark (mark-only has none).
    expect(screen.getAllByText('frontguard').length).toBeGreaterThanOrEqual(3);
  });

  it('exposes six neutral swatches that reflect the foundation tokens (hex as text)', () => {
    render(<Brand />);
    const swatches = screen.getAllByTestId('neutral-swatch');
    expect(swatches).toHaveLength(NEUTRALS.length);
    expect(swatches).toHaveLength(6);

    for (const swatch of swatches) {
      const token = within(swatch).getByText(
        (text) => text in FOUNDATION_HEX,
      ).textContent as string;
      // Hex is rendered as readable text (a11y: never color-only).
      within(swatch).getByText(FOUNDATION_HEX[token]);
      // The fill is painted by the token's own Tailwind utility, not a hardcoded color.
      expect(swatch.querySelector(`.bg-${token}`)).not.toBeNull();
    }
  });

  it('wires the .fg-swatch hover-lift on neutral and amber swatches', () => {
    render(<Brand />);
    const lifted = [...screen.getAllByTestId('neutral-swatch'), screen.getByTestId('amber-swatch')];
    for (const el of lifted) {
      expect(el).toHaveClass('fg-swatch');
      // translateY(-3px) on hover (extract §Motion).
      expect(el.className).toContain('hover:-translate-y-[3px]');
    }
  });

  it('renders the amber accent block with its hex and oklch as text', () => {
    render(<Brand />);
    const amber = screen.getByTestId('amber-swatch');
    expect(within(amber).getByText('Frontguard Amber')).toBeInTheDocument();
    expect(within(amber).getByText(/#E8862E/)).toBeInTheDocument();
    expect(within(amber).getByText(/oklch\(0\.72 0\.18 50\)/)).toBeInTheDocument();
  });

  it('renders the four status swatches with glyph, label and hex', () => {
    render(<Brand />);
    const swatches = screen.getAllByTestId('status-swatch');
    expect(swatches).toHaveLength(STATUSES.length);

    for (const s of STATUSES) {
      const swatch = swatches.find((el) => within(el).queryByText(s.label));
      expect(swatch, `status ${s.status}`).toBeDefined();
      const glyph = within(swatch!).getByText(STATUS_GLYPH[s.status]);
      expect(glyph).toHaveClass(STATUS_COLOR_CLASS[s.status]);
      expect(within(swatch!).getByText(s.hex)).toBeInTheDocument();
    }
  });

  it('renders the three voice principles', () => {
    render(<Brand />);
    for (const v of VOICE) {
      expect(screen.getByText(v.key)).toBeInTheDocument();
    }
    expect(screen.getByText(/skeptical engineers smell hype/i)).toBeInTheDocument();
  });

  it('renders the messaging tagline, one-liner and SAY/DON\'T lists', () => {
    render(<Brand />);
    expect(
      screen.getByText('Catch the regression, not the noise.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/a red run means\s+something again/i)).toBeInTheDocument();
    expect(screen.getByText('SAY')).toBeInTheDocument();
    expect(screen.getByText("DON'T")).toBeInTheDocument();
    for (const line of [...SAY, ...DONT]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
  });
});

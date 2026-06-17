import { render, screen } from '@testing-library/react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusGlyph } from '../components/ui/StatusGlyph';
import { STATUS_GLYPH } from '../components/ui/status';
import { Kicker } from '../components/ui/Kicker';

describe('Button', () => {
  it('renders a <button> by default', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('renders an <a> when given href', () => {
    render(
      <Button href="/docs" size="lg">
        Docs
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('href', '/docs');
  });

  it('adds rel/target for external links', () => {
    render(
      <Button href="https://example.com" external>
        Ext
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Ext' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a disabled, non-link button even with href', () => {
    render(
      <Button href="/x" disabled>
        Off
      </Button>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Off' });
    expect(btn).toBeDisabled();
  });

  it('applies the primary variant by default and ghost when asked', () => {
    const { rerender } = render(<Button>P</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-amber');
    rerender(<Button variant="ghost">G</Button>);
    expect(screen.getByRole('button')).toHaveClass('border');
  });
});

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge tone="amber">open source</Badge>);
    expect(screen.getByText('open source')).toBeInTheDocument();
  });

  it('renders a pulsing dot when requested', () => {
    const { container } = render(
      <Badge tone="amber" dot pulse>
        mit
      </Badge>,
    );
    expect(container.querySelector('.animate-pulse-dot')).toBeTruthy();
  });

  it('maps tone to the status color class', () => {
    render(<Badge tone="pass">latest</Badge>);
    expect(screen.getByText('latest')).toHaveClass('text-pass');
  });
});

describe('StatusGlyph', () => {
  it('renders the correct glyph per status', () => {
    const { rerender } = render(<StatusGlyph status="pass" />);
    expect(screen.getByText(STATUS_GLYPH.pass)).toBeInTheDocument();
    rerender(<StatusGlyph status="regression" />);
    expect(screen.getByText(STATUS_GLYPH.regression)).toBeInTheDocument();
  });

  it('colors the glyph by status and exposes an accessible name', () => {
    render(<StatusGlyph status="new" label="NEW" />);
    expect(screen.getByText(STATUS_GLYPH.new)).toHaveClass('text-new');
    expect(screen.getByText('new')).toBeInTheDocument();
  });
});

describe('Kicker', () => {
  it('renders an uppercase mono label', () => {
    render(<Kicker tone="amber">01 / DETECT</Kicker>);
    const el = screen.getByText('01 / DETECT');
    expect(el).toHaveClass('font-mono');
    expect(el).toHaveClass('text-amber');
  });
});

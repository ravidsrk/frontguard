import { render, screen } from '@testing-library/react';
import { Logo, Mark } from '../components/ui/Logo';

describe('brand mark', () => {
  it('renders the shield mark', () => {
    render(<Mark height={40} />);
    expect(screen.getByTestId('brand-mark')).toBeInTheDocument();
  });

  it('renders the primary lockup with the wordmark', () => {
    render(<Logo variant="primary" height={30} />);
    expect(screen.getByText('frontguard')).toBeInTheDocument();
    expect(screen.getByTestId('brand-mark')).toBeInTheDocument();
  });

  it('renders the mark-only lockup without a wordmark', () => {
    render(<Logo variant="mark" height={46} />);
    expect(screen.getByTestId('brand-mark')).toBeInTheDocument();
    expect(screen.queryByText('frontguard')).not.toBeInTheDocument();
  });

  it('uses the five-point shield clip-path', () => {
    const { container } = render(<Mark height={40} />);
    const html = container.innerHTML;
    expect(html).toContain('polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)');
  });

  it('renders the mono-light variant with an ink wordmark', () => {
    render(<Logo variant="mono-light" height={36} />);
    const word = screen.getByText('frontguard');
    expect(word).toHaveStyle({ color: '#14110d' });
  });
});

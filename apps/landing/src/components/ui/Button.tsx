import type { ReactNode, MouseEventHandler } from 'react';

export type ButtonVariant = 'primary' | 'ghost';
export type ButtonSize = 'nav' | 'md' | 'lg';

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
  /** Render as an anchor when set; falls back to <button> otherwise. */
  href?: string;
  external?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  'aria-label'?: string;
}

const SIZES: Record<ButtonSize, string> = {
  nav: 'text-[13px] px-3.5 py-2',
  md: 'text-sm px-5 py-2.5',
  lg: 'text-[15px] px-6 py-3',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-amber text-canvas hover:bg-amber-hover',
  ghost:
    'border border-border bg-transparent text-ink-hi hover:border-border-hover hover:bg-raised',
};

/**
 * Shared CTA. Amber `primary` and bordered `ghost`, three sizes, optional `href`
 * (nav Star, hero CTAs, tier CTAs, pager). Honors `disabled` for both elements.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  href,
  external,
  disabled = false,
  type = 'button',
  onClick,
  'aria-label': ariaLabel,
}: BaseProps) {
  const classes = [
    'inline-flex items-center justify-center gap-2 font-mono font-medium',
    'transition-[background-color,border-color,color] duration-[180ms] ease-out',
    'whitespace-nowrap select-none',
    SIZES[size],
    VARIANTS[variant],
    disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
    className,
  ].join(' ');

  if (href && !disabled) {
    const rel = external ? 'noopener noreferrer' : undefined;
    const target = external ? '_blank' : undefined;
    return (
      <a
        href={href}
        rel={rel}
        target={target}
        onClick={onClick}
        aria-label={ariaLabel}
        className={classes}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={classes}
    >
      {children}
    </button>
  );
}

export default Button;

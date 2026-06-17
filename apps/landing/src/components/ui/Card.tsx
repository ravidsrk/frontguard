import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  /** Lift + brighten border on hover (pillars, features, honest, vs-cards). */
  hoverLift?: boolean;
  /** 2px amber top accent (plugin cards). */
  accentTop?: boolean;
  /** Use the strong #322d28 border instead of the default card border. */
  strongBorder?: boolean;
  as?: 'div' | 'article' | 'li';
  className?: string;
}

/**
 * Base panel: #131210 fill, 1px hairline border, sharp corners. Optional
 * hover-lift and amber top-accent variants. No shadow (those are reserved for
 * floating terminal/config panels).
 */
export function Card({
  children,
  hoverLift = false,
  accentTop = false,
  strongBorder = false,
  as: Tag = 'div',
  className = '',
}: CardProps) {
  return (
    <Tag
      className={[
        'bg-panel border',
        strongBorder ? 'border-border' : 'border-border-card',
        accentTop ? 'border-t-2 border-t-amber' : '',
        hoverLift
          ? 'transition-[border-color,transform,background-color] duration-[180ms] ease-out hover:-translate-y-0.5 hover:border-border-hover'
          : '',
        className,
      ].join(' ')}
    >
      {children}
    </Tag>
  );
}

export default Card;

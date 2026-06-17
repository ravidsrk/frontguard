import { Button } from './Button';
import { Badge } from './Badge';

export type PricingAccent = 'neutral' | 'amber' | 'new';

interface PricingCardProps {
  label: string;
  price: string;
  per?: string;
  tagline: string;
  cta: { label: string; href: string; external?: boolean };
  features: string[];
  accent?: PricingAccent;
  /** Featured tier renders an amber border + "MOST POPULAR" badge. */
  featured?: boolean;
  className?: string;
}

const ACCENT_TEXT: Record<PricingAccent, string> = {
  neutral: 'text-ink-soft',
  amber: 'text-amber',
  new: 'text-new',
};

/** A pricing tier card with accent, price, CTA, and a check-list of features. */
export function PricingCard({
  label,
  price,
  per,
  tagline,
  cta,
  features,
  accent = 'neutral',
  featured = false,
  className = '',
}: PricingCardProps) {
  return (
    <div
      className={[
        'relative flex flex-col bg-panel p-7',
        featured ? 'border border-amber-brd bg-amber-tint2' : 'border border-border-card',
        className,
      ].join(' ')}
    >
      {featured && (
        <div className="absolute right-0 top-0">
          <Badge tone="amber">most popular</Badge>
        </div>
      )}
      <span className={['font-mono text-[11px] uppercase tracking-[0.08em]', ACCENT_TEXT[accent]].join(' ')}>
        {label}
      </span>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-sans text-[44px] font-bold tracking-[-0.03em] text-ink-hi">{price}</span>
        {per && <span className="text-[14px] text-ink-soft">{per}</span>}
      </div>
      <p className="mt-2 text-[14px] text-ink-mid">{tagline}</p>
      <div className="mt-6">
        <Button
          href={cta.href}
          external={cta.external}
          variant={featured ? 'primary' : 'ghost'}
          size="md"
          className="w-full"
        >
          {cta.label}
        </Button>
      </div>
      <ul className="mt-6 flex flex-col gap-2.5 border-t border-border-faint pt-6">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5 text-[14px] text-ink-mid">
            <span aria-hidden="true" className="font-mono text-pass">
              ✓
            </span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PricingCard;

import type { ReactNode } from 'react';
import { Kicker } from './Kicker';

interface SectionHeaderProps {
  /** Mono kicker, e.g. "// WHY TEAMS MUTE VISUAL TESTS". */
  kicker?: ReactNode;
  kickerTone?: 'amber' | 'faint' | 'ink';
  title: ReactNode;
  lead?: ReactNode;
  /** Center the block (CTA bands, pricing/comparisons heroes). */
  center?: boolean;
  className?: string;
  /** Heading size class; defaults to the 38px section h2. */
  titleClassName?: string;
  as?: 'h1' | 'h2';
}

/** Mono kicker + heading + optional lead paragraph, used by every marketing section. */
export function SectionHeader({
  kicker,
  kickerTone = 'faint',
  title,
  lead,
  center = false,
  className = '',
  titleClassName = 'text-[clamp(1.9rem,5vw,2.375rem)] tracking-[-0.03em]',
  as: Heading = 'h2',
}: SectionHeaderProps) {
  return (
    <div className={[center ? 'text-center mx-auto max-w-2xl' : '', className].join(' ')}>
      {kicker && (
        <div className="mb-4">
          <Kicker tone={kickerTone}>{kicker}</Kicker>
        </div>
      )}
      <Heading className={['font-sans font-bold text-ink-hi', titleClassName].join(' ')}>{title}</Heading>
      {lead && <p className="mt-4 text-[17px] leading-relaxed text-ink-mid">{lead}</p>}
    </div>
  );
}

export default SectionHeader;

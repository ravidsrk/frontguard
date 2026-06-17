import { Card, SectionHeader } from '../../../components/ui';
import type { Status } from '../../../components/ui/status';
import { GRID_3 } from '../../../lib/responsive';
import { PILLARS } from '../data';

const TONE_TEXT: Record<Status, string> = {
  pass: 'text-pass',
  warning: 'text-warning',
  regression: 'text-regression',
  new: 'text-new',
};

/* Three pillars: Detect / Understand / Fix — the floor's HowItWorks, restyled. */
export function Pillars() {
  return (
    <section className="mx-auto max-w-[1200px] px-7 pt-[84px] pb-5">
      <SectionHeader
        kicker="// HOW FRONTGUARD THINKS"
        kickerTone="amber"
        title="Not just “pixels differ.” Detect, understand, fix."
        className="max-w-[620px]"
        as="h2"
      />
      <div className={`mt-12 ${GRID_3}`}>
        {PILLARS.map((p) => (
          <Card key={p.num} hoverLift className="px-6 py-7">
            <div className={`mb-[18px] font-mono text-[12px] ${TONE_TEXT[p.tone]}`}>
              {p.num} / {p.label}
            </div>
            <h3 className="mb-2.5 text-[21px] font-semibold tracking-[-0.01em] text-ink-hi">
              {p.title}
            </h3>
            <p className="text-[14.5px] leading-relaxed text-ink-mid">{p.desc}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default Pillars;

import { Card, SectionHeader } from '../../../components/ui';
import type { Status } from '../../../components/ui/status';
import { GRID_3 } from '../../../lib/responsive';
import { HONEST_CARDS } from '../data';

const TONE_TEXT: Record<Status, string> = {
  pass: 'text-pass',
  warning: 'text-warning',
  regression: 'text-regression',
  new: 'text-new',
};

/* "We'll tell you what it isn't" — the honest-edges section (skeptic-friendly). */
export function Honest() {
  return (
    <section className="mx-auto max-w-[1200px] px-7 pt-5 pb-[84px]">
      <SectionHeader
        kicker="// NO MAGIC, JUST HONEST"
        kickerTone="amber"
        title="We'll tell you what it isn't."
        lead="Skeptical engineers built this for skeptical engineers. No silver bullets — here's exactly where the edges are."
        as="h2"
      />
      <div className={`mt-11 ${GRID_3}`}>
        {HONEST_CARDS.map((c) => (
          <Card key={c.label} hoverLift className="px-6 py-7">
            <div className={`mb-4 font-mono text-[12px] ${TONE_TEXT[c.tone]}`}>{c.label}</div>
            <p className="text-[14.5px] leading-relaxed text-ink-mid">{c.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default Honest;

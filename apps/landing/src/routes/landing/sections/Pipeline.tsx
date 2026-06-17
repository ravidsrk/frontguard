import { SectionHeader } from '../../../components/ui';
import { GRID_6 } from '../../../lib/responsive';
import { STAGES } from '../data';

/*
  Six-stage pipeline. `repeat(6,1fr)` on desktop, wrapping 6 → 3 → 2 on narrower
  screens (the 1px gaps form the hairline grid via the faint backing). `id="how"`
  preserves the design's in-page anchor.
*/
export function Pipeline() {
  return (
    <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-7 py-[84px]">
      <SectionHeader
        kicker="// THE PIPELINE"
        kickerTone="amber"
        title="Six stages, fully self-hostable."
        lead="Each stage is independent with error boundaries — one page failing doesn't kill the run. A fast pixel gate means ~90% of pages never hit the AI."
        as="h2"
      />
      <ol className={`mt-11 list-none border border-border-card bg-border-card ${GRID_6}`}>
        {STAGES.map((s) => (
          <li key={s.num} className="bg-panel px-[18px] py-[22px]">
            <div className="mb-3.5 font-mono text-[11px] text-ink-faint">{s.num}</div>
            <div className="mb-2 font-mono text-[13px] font-medium text-amber">{s.title}</div>
            <div className="text-[12.5px] leading-snug text-ink-soft">{s.desc}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default Pipeline;

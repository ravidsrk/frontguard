import { SectionHeader } from '../../../components/ui';
import type { Status } from '../../../components/ui/status';
import { STATUS_GLYPH } from '../../../components/ui/status';
import { HERO_SPLIT } from '../../../lib/responsive';
import { AI_EXAMPLE_POINTS, AI_EXAMPLE_VERDICTS, type ExampleVerdict } from '../data';

const SURFACE: Record<Status, string> = {
  regression: 'border-regression-brd bg-regression-bg',
  pass: 'border-pass-brd bg-pass-bg',
  warning: 'border-amber-brd bg-amber-tint',
  new: 'border-amber-brd bg-amber-tint',
};
const CHIP: Record<Status, string> = {
  regression: 'border-regression-brd text-regression',
  pass: 'border-pass-brd text-pass',
  warning: 'border-amber-brd text-warning',
  new: 'border-amber-brd text-new',
};

function ExampleCard({ v }: { v: ExampleVerdict }) {
  return (
    <div className={['border p-[22px]', SURFACE[v.status]].join(' ')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-mono text-[13px] text-ink-hi">
          <span aria-hidden="true">{STATUS_GLYPH[v.status]}</span> {v.route}{' '}
          <span className="text-ink-muted">{v.viewport}</span>
        </span>
        <span className={['border px-2.5 py-[3px] font-mono text-[11px]', CHIP[v.status]].join(' ')}>
          {v.verdict} · {v.confidence}%
        </span>
      </div>
      <p className="m-0 text-[13.5px] leading-[1.55] text-ink-bright">“{v.body}”</p>
      {v.fix && (
        <div className="mt-3 border-t border-border-faint pt-3 font-mono text-[12px] text-ink-soft">
          {v.fix}
        </div>
      )}
    </div>
  );
}

/* AI classification example: the value prop + two real verdict cards. */
export function AiExample() {
  return (
    <section className="border-t border-border-faint bg-surface-alt">
      <div className="mx-auto max-w-[1200px] px-7 py-[84px]">
        <div className={HERO_SPLIT}>
          <div>
            <SectionHeader
              kicker="// AI CLASSIFICATION"
              kickerTone="amber"
              title="Kills the #1 pain of visual testing: false positives."
              titleClassName="text-[clamp(1.85rem,4.5vw,2.25rem)] tracking-[-0.03em]"
              as="h2"
            />
            <p className="mt-[18px] text-[15.5px] leading-relaxed text-ink-mid">
              A diff isn't a bug. Frontguard tells a regression apart from an intentional redesign,
              so your suite stops crying wolf — and teams stop disabling it.
            </p>
            <ul className="mt-6 grid list-none gap-3 p-0">
              {AI_EXAMPLE_POINTS.map((point) => (
                <li key={point} className="flex gap-3 text-[14.5px] text-ink-bright2">
                  <span aria-hidden="true" className="font-mono text-pass">
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4">
            {AI_EXAMPLE_VERDICTS.map((v) => (
              <ExampleCard key={v.route} v={v} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AiExample;

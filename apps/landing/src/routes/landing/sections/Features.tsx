import { SectionHeader } from '../../../components/ui';
import { FEATURES } from '../data';

/*
  Nine-cell features grid (carries all six floor features + the design's extras).
  The 1px grid gap reveals the hairline backing; each cell brightens on hover.
  `id="features"` preserves the in-page anchor used by the nav/footer.
*/
export function Features() {
  return (
    <section id="features" className="mx-auto max-w-[1200px] scroll-mt-20 px-7 py-[84px]">
      <SectionHeader
        kicker="// EVERYTHING IN THE BOX"
        kickerTone="amber"
        title="CLI-first. Zero dashboards required."
        as="h2"
      />
      <ul className="mt-12 grid list-none grid-cols-1 gap-px border border-border-faint bg-border-faint sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <li
            key={f.title}
            className="bg-canvas px-[22px] py-[26px] transition-colors duration-[180ms] hover:bg-surface-strip"
          >
            <div className="mb-3 font-mono text-[11px] text-amber">{f.tag}</div>
            <h3 className="mb-2 text-[16.5px] font-semibold text-ink-hi">{f.title}</h3>
            <p className="text-[13.5px] leading-[1.55] text-ink-soft">{f.desc}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default Features;

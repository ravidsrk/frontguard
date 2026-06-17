import { GRID_5 } from '../../../lib/responsive';
import { LIFECYCLE_HOOKS, PLUGINS } from '../data';

/* Plugins panel: 5 built-in plugins (2px amber top-border cards) + 6 lifecycle hooks. */
export function Plugins() {
  return (
    <section className="mx-auto max-w-[1200px] px-7 pt-5 pb-[84px]">
      <div className="border border-border-card bg-panel px-8 py-9">
        <div className="mb-7 flex flex-wrap items-baseline justify-between gap-4">
          <h3 className="text-[22px] font-semibold tracking-[-0.01em] text-ink-hi">
            Extensible by design — 5 built-in plugins, 6 lifecycle hooks
          </h3>
          <code className="font-mono text-[12px] text-ink-soft">{LIFECYCLE_HOOKS.join(' · ')}</code>
        </div>
        <ul className={`list-none ${GRID_5}`}>
          {PLUGINS.map((p) => (
            <li key={p.name} className="border-t-2 border-amber pt-3.5">
              <div className="mb-1.5 font-mono text-[13px] font-medium text-ink-hi">{p.name}</div>
              <div className="text-[12.5px] leading-snug text-ink-soft">{p.desc}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default Plugins;

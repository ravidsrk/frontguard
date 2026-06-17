import { StatGrid } from '../../../components/ui';
import type { Stat } from '../../../components/ui';
import { PROBLEM_STATS } from '../data';

/*
  Problem strip: a statement + a 2×2 stat grid whose 1px gap reveals the hairline
  gridlines. Folds the floor's three failure-mode substance into the design's
  stat-led framing; the numbers are the design's own (no fabrication).
*/
export function ProblemStrip() {
  const stats: Stat[] = PROBLEM_STATS.map((s) => ({
    value: (
      <span className={['font-mono', s.accent ? 'text-amber' : 'text-ink-hi'].join(' ')}>
        {s.value}
      </span>
    ),
    label: s.label,
  }));

  return (
    <section
      id="problem"
      aria-labelledby="problem-heading"
      className="scroll-mt-20 border-y border-border-faint bg-surface-alt"
    >
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-7 py-14 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-mono text-[12px] tracking-[0.08em] text-ink-muted">
            // WHY TEAMS MUTE VISUAL TESTS
          </p>
          <p
            id="problem-heading"
            className="mt-4 text-[24px] font-medium leading-[1.45] tracking-[-0.01em] text-ink-hi"
          >
            Everyone adds visual regression tests. Then everyone{' '}
            <span className="text-amber">mutes the channel they post to.</span>
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-mid">
            Around 40% of pixel-diff runs go red for things that aren't real bugs — a 2px font
            shift, a changed date, a lazy image. Once a red run usually means nothing, the tool is
            dead — worse than no tests. That's the problem Frontguard exists to solve.
          </p>
        </div>
        <StatGrid stats={stats} columns={2} />
      </div>
    </section>
  );
}

export default ProblemStrip;

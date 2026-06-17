import { SectionHeader, StatGrid } from '../../../components/ui';
import type { Stat } from '../../../components/ui';
import {
  VALIDATION,
  VALIDATION_GATE,
  VALIDATION_RESULTS_URL,
  VALIDATION_METHODOLOGY_URL,
  formatPercent,
  partitionRepos,
} from '../validation-data';

/*
  Validation (GAP-FILL, decision 10 — the design is silent here). Every figure is
  the real harness output from validation/results/landing-payload.json; nothing is
  invented. AI classification was disabled in this run, so no accuracy number is
  shipped — only the measured pixel false-positive rate and the launch gate. Repos
  the harness couldn't boot are shown as skipped rows with their documented reason,
  not hidden.
*/
export function Validation() {
  const { aggregate, runDate, cliVersion, aiEnabled } = VALIDATION;
  const { booted, skipped } = partitionRepos(VALIDATION);

  const mono = (v: string) => <span className="font-mono">{v}</span>;
  const stats: Stat[] = [
    { value: mono(`${aggregate.reposBooted} / ${aggregate.reposAttempted}`), label: 'repositories booted end-to-end this run' },
    { value: mono(String(aggregate.recheckRouteCount)), label: 'routes re-rendered and re-checked' },
    { value: mono(String(aggregate.recheckPositiveCount)), label: 'false positives flagged on unchanged pages' },
    { value: mono(formatPercent(aggregate.pixelFalsePositiveRate)), label: 'pixel-diff false-positive rate' },
  ];

  return (
    <section id="validation" className="mx-auto max-w-[1200px] scroll-mt-20 px-7 pt-5 pb-[84px]">
      <SectionHeader
        kicker="// VALIDATION"
        kickerTone="amber"
        title="Numbers from a real harness, not a slide."
        lead="We run Frontguard against live open-source apps and publish what the harness measured — including the repos it couldn't boot. No accuracy figure ships until the AI classification pass clears the gate."
        as="h2"
      />

      <StatGrid className="mt-11" stats={stats} columns={2} />

      <div className="mt-8 overflow-x-auto border border-border-card">
        <table className="w-full border-collapse text-left text-[13.5px]">
          <caption className="sr-only">
            Per-repository validation results from the {runDate} harness run on Frontguard CLI{' '}
            {cliVersion}.
          </caption>
          <thead>
            <tr className="bg-surface-strip">
              <th scope="col" className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-ink-soft">
                Repository
              </th>
              <th scope="col" className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-ink-soft">
                Category
              </th>
              <th scope="col" className="px-4 py-3 text-center font-mono text-[11px] uppercase tracking-[0.04em] text-ink-soft">
                Re-check pass
              </th>
              <th scope="col" className="px-4 py-3 text-center font-mono text-[11px] uppercase tracking-[0.04em] text-ink-soft">
                False positives
              </th>
              <th scope="col" className="px-4 py-3 text-center font-mono text-[11px] uppercase tracking-[0.04em] text-ink-soft">
                Pixel FP rate
              </th>
            </tr>
          </thead>
          <tbody>
            {booted.map((r) => (
              <tr key={r.name} className="border-t border-border-faint">
                <th scope="row" className="px-4 py-3 text-left font-normal text-ink-bright2">
                  {r.name}
                </th>
                <td className="px-4 py-3 text-ink-soft">{r.category}</td>
                <td className="px-4 py-3 text-center font-mono text-pass">{r.recheckPass}</td>
                <td className="px-4 py-3 text-center font-mono text-ink-bright2">
                  {r.recheckFalsePositive}
                </td>
                <td className="px-4 py-3 text-center font-mono text-ink-bright2">
                  {formatPercent(r.pixelFalsePositiveRate)}
                </td>
              </tr>
            ))}
            {skipped.map((r) => (
              <tr key={r.name} className="border-t border-border-faint" data-testid="skipped-repo">
                <th scope="row" className="px-4 py-3 text-left font-normal text-ink-bright2">
                  {r.name}
                </th>
                <td className="px-4 py-3 text-ink-soft">{r.category}</td>
                <td colSpan={3} className="px-4 py-3 text-[12.5px] text-ink-muted">
                  <span className="font-mono text-warning">skipped</span> — {r.skipReason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 max-w-[760px] text-[14px] leading-relaxed text-ink-soft">
        {aiEnabled ? null : 'AI classification was disabled in this run, so no accuracy or AI false-positive number is published yet. '}
        We gate the launch on accuracy ≥ {Math.round(VALIDATION_GATE.minAccuracy * 100)}% and a
        false-positive rate below {Math.round(VALIDATION_GATE.maxFalsePositiveRate * 100)}%. Read the{' '}
        <a
          href={VALIDATION_RESULTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber underline-offset-2 hover:underline"
        >
          full results
        </a>{' '}
        or the{' '}
        <a
          href={VALIDATION_METHODOLOGY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber underline-offset-2 hover:underline"
        >
          methodology
        </a>
        . Run {runDate} · CLI {cliVersion}.
      </p>
    </section>
  );
}

export default Validation;

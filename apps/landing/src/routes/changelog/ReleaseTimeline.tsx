import { Badge, type BadgeTone } from '../../components/ui';
import type { GroupKind, ReleaseStatusKind, Release } from './releases';

/* status → version-number/rail accent + status-chip tone (exact design hex via tokens) */
const STATUS_ACCENT: Record<ReleaseStatusKind, { text: string; dot: string; tone: BadgeTone }> = {
  'in-progress': { text: 'text-amber', dot: 'bg-amber', tone: 'amber' },
  latest: { text: 'text-pass', dot: 'bg-pass', tone: 'pass' },
  initial: { text: 'text-ink-soft', dot: 'bg-ink-soft', tone: 'neutral' },
};

/* change-group → mono label + color (text + the leading square), per the spec's
   ADDED green / CHANGED blue / SECURITY amber / TESTING purple. */
const GROUP_META: Record<GroupKind, { label: string; text: string; square: string }> = {
  added: { label: 'ADDED', text: 'text-pass', square: 'bg-pass' },
  changed: { label: 'CHANGED', text: 'text-new', square: 'bg-new' },
  security: { label: 'SECURITY', text: 'text-amber', square: 'bg-amber' },
  testing: { label: 'TESTING', text: 'text-code-keyword', square: 'bg-code-keyword' },
  fixed: { label: 'FIXED', text: 'text-amber', square: 'bg-amber' },
};

/** Convert a version label to a DOM-safe id fragment ("0.2.0" → "0-2-0"). */
const slug = (version: string) => version.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

/**
 * Changelog release timeline. Each release is a `168px 1fr` grid: a sticky
 * version-meta column (colored version number, status chip, dated `<time>`)
 * beside the content column (title, summary, color-coded change groups) with a
 * hairline rail and a colored node dot. Collapses to a single stacked column
 * below `md` (meta above content), where the rail/dot and sticky behavior drop.
 */
export function ReleaseTimeline({ releases }: { releases: Release[] }) {
  return (
    <div className="flex flex-col">
      {releases.map((release) => {
        const accent = STATUS_ACCENT[release.status];
        const headingId = `release-${slug(release.version)}`;
        return (
          <article
            key={release.version}
            aria-labelledby={headingId}
            data-testid="release"
            className="grid grid-cols-1 gap-0 border-t border-border-faint md:grid-cols-[168px_1fr]"
          >
            {/* left: version meta */}
            <div className="pt-8 md:py-8 md:pr-6">
              <div data-testid="release-meta" className="md:sticky md:top-[88px]">
                <div className={['font-mono text-[18px] font-bold leading-none', accent.text].join(' ')}>
                  {release.version}
                </div>
                <div className="mt-2.5">
                  <Badge tone={accent.tone}>{release.statusLabel}</Badge>
                </div>
                <div className="mt-3 font-mono text-[12px] text-ink-dim">
                  {release.isoDate ? (
                    <time dateTime={release.isoDate}>{release.date}</time>
                  ) : (
                    <span>{release.date}</span>
                  )}
                </div>
              </div>
            </div>

            {/* right: content */}
            <div className="relative pb-10 md:border-l md:border-border-faint md:py-8 md:pl-8">
              <span
                aria-hidden="true"
                className={[
                  'absolute left-[-5px] top-10 hidden h-[9px] w-[9px] rounded-full md:block',
                  accent.dot,
                ].join(' ')}
              />
              <h2
                id={headingId}
                className="font-sans text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink-hi"
              >
                {release.title}
              </h2>
              <p className="mt-2.5 max-w-[640px] text-[15px] leading-relaxed text-ink-mid">{release.summary}</p>

              <div className="mt-6 flex flex-col gap-[22px]">
                {release.groups.map((group) => {
                  const meta = GROUP_META[group.kind];
                  return (
                    <div key={group.kind}>
                      <div
                        className={[
                          'flex items-center gap-2 font-mono text-[11px] tracking-[0.06em]',
                          meta.text,
                        ].join(' ')}
                      >
                        <span aria-hidden="true" className={['inline-block h-1.5 w-1.5', meta.square].join(' ')} />
                        {meta.label}
                      </div>
                      <ul className="mt-3 grid gap-2.5">
                        {group.items.map((item) => (
                          <li
                            key={item.term}
                            className="grid grid-cols-[14px_1fr] gap-2.5 text-[14px] leading-relaxed text-ink-bright"
                          >
                            <span aria-hidden="true" className="font-mono text-ink-faint">
                              ·
                            </span>
                            <span>
                              <strong className="font-semibold text-ink-hi">{item.term}</strong>
                              {item.detail}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default ReleaseTimeline;

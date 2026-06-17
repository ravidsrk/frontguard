import { Badge, type BadgeTone } from './Badge';

export type ChangeGroupKind = 'added' | 'changed' | 'security' | 'testing' | 'fixed';

export interface ChangeItem {
  term: string;
  desc?: string;
}

export interface ChangeGroup {
  kind: ChangeGroupKind;
  items: ChangeItem[];
}

export interface Release {
  version: string;
  date?: string;
  status: { label: string; tone: BadgeTone };
  title: string;
  summary?: string;
  groups: ChangeGroup[];
}

const GROUP_LABEL: Record<ChangeGroupKind, { text: string; cls: string }> = {
  added: { text: 'ADDED', cls: 'text-pass' },
  changed: { text: 'CHANGED', cls: 'text-new' },
  security: { text: 'SECURITY', cls: 'text-amber' },
  testing: { text: 'TESTING', cls: 'text-code-keyword' },
  fixed: { text: 'FIXED', cls: 'text-amber' },
};

/** Changelog timeline: a sticky version-meta column beside grouped, color-coded changes. */
export function Timeline({ releases }: { releases: Release[] }) {
  return (
    <div className="flex flex-col">
      {releases.map((release) => (
        <article
          key={release.version}
          className="grid grid-cols-1 gap-6 border-t border-border-faint py-10 md:grid-cols-[168px_1fr] md:gap-0"
        >
          <div className="md:sticky md:top-[88px] md:self-start md:pr-6">
            <div className="font-mono text-[18px] font-bold text-ink-hi">{release.version}</div>
            <div className="mt-2">
              <Badge tone={release.status.tone}>{release.status.label}</Badge>
            </div>
            {release.date && <div className="mt-2 font-mono text-[12px] text-ink-dim">{release.date}</div>}
          </div>
          <div>
            <h2 className="font-sans text-[24px] font-semibold tracking-[-0.02em] text-ink-hi">
              {release.title}
            </h2>
            {release.summary && <p className="mt-2 text-[14.5px] leading-relaxed text-ink-mid">{release.summary}</p>}
            <div className="mt-5 flex flex-col gap-5">
              {release.groups.map((group, gi) => (
                <div key={gi}>
                  <div className={['font-mono text-[12px] tracking-[0.04em]', GROUP_LABEL[group.kind].cls].join(' ')}>
                    {GROUP_LABEL[group.kind].text}
                  </div>
                  <ul className="mt-2 flex flex-col gap-2">
                    {group.items.map((item, ii) => (
                      <li key={ii} className="grid grid-cols-[14px_1fr] gap-2 text-[14px] leading-relaxed">
                        <span aria-hidden="true" className="text-ink-faint">
                          ·
                        </span>
                        <span className="text-ink-mid">
                          <span className="font-medium text-ink-hi">{item.term}</span>
                          {item.desc ? ` — ${item.desc}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default Timeline;

import { Container } from '../components/ui';
import { Seo } from '../components/Seo';
import { REPO_URL } from '../lib/site';
import { RELEASES } from './changelog/releases';
import { ReleaseTimeline } from './changelog/ReleaseTimeline';

const KEEP_A_CHANGELOG = 'https://keepachangelog.com';
const CHANGELOG_SOURCE = `${REPO_URL}/blob/main/CHANGELOG.md`;

/** `/changelog` — the release timeline, sourced from the root CHANGELOG.md. */
export function Component() {
  return (
    <>
      <Seo
        title="Changelog — Frontguard"
        description="What's new in Frontguard: every notable release, what it added, and what changed — newest first, following Keep a Changelog."
        path="/changelog"
      />

      <Container as="header" width="changelog" className="pt-[72px] pb-9">
        <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-amber">// CHANGELOG</span>
        <h1 className="mt-4 text-[clamp(2rem,6vw,3rem)] font-bold leading-[1.04] tracking-[-0.035em] text-ink-hi">
          What's new in Frontguard
        </h1>
        <p className="mt-4 max-w-[560px] text-[17px] leading-relaxed text-ink-mid">
          Following{' '}
          <a
            href={KEEP_A_CHANGELOG}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber transition-colors hover:text-amber-hover"
          >
            Keep a Changelog
          </a>{' '}
          and semantic versioning. Every notable change, newest first.
        </p>
      </Container>

      <Container as="section" width="changelog" className="pt-4 pb-[100px]">
        <ReleaseTimeline releases={RELEASES} />

        <div className="mt-7 border-t border-border-faint pt-7 text-center">
          <a
            href={CHANGELOG_SOURCE}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[13px] text-ink-soft transition-colors hover:text-ink-hi"
          >
            View full changelog on GitHub ↗
          </a>
        </div>
      </Container>
    </>
  );
}

export default Component;

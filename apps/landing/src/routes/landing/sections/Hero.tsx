import { Badge, Button, CopyCommand, GitHubStars } from '../../../components/ui';
import { HERO_SPLIT, HERO_H1 } from '../../../lib/responsive';

/** ink-hi inline emphasis used inside the hero lead. */
function Em({ children }: { children: string }) {
  return <em className="not-italic text-ink-hi">{children}</em>;
}

/*
  Hero: copy + install + CTAs on the left, a CSS terminal mock with an overlapping
  AI-analysis card on the right (decision 7 — the design's CSS mock is the default
  demo; the `#demo` anchor is preserved on the visual). The terminal output is the
  product's status language: pass/warn/regression/new in the four CLI colors.
*/
export function Hero() {
  return (
    <header
      id="top"
      className="relative mx-auto w-full max-w-[1200px] px-7 pt-[88px] pb-16 sm:pb-[72px]"
    >
      <div className={HERO_SPLIT}>
        <div>
          <Badge tone="amber" dot pulse>
            open source · MIT · self-hostable
          </Badge>
          <h1 className={`mt-[26px] max-w-[12em] text-balance text-ink-hi ${HERO_H1}`}>
            Catch the regression, not the noise.
          </h1>
          <p className="mt-[22px] max-w-[490px] text-[18px] leading-[1.55] text-ink-mid">
            Teams add visual regression tests — then mute the channel they post to, because ~40% of
            failures aren't real bugs. Frontguard uses AI vision to label every diff a{' '}
            <Em>regression</Em>, an <Em>intentional change</Em>, or <Em>content</Em> — so a red run
            means something again.
          </p>

          <CopyCommand
            command="npm install @frontguard/cli"
            className="mt-8 max-w-[440px]"
            aria-label="Copy install command: npm install @frontguard/cli"
          />

          <div className="mt-[22px] flex flex-wrap items-center gap-3.5">
            <Button href="/docs" size="lg">
              Get started →
            </Button>
            <GitHubStars variant="ghost" className="!px-6 !py-3 !text-[14px]" />
          </div>
        </div>

        {/* Terminal demo + overlapping AI card */}
        <div id="demo" className="relative scroll-mt-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-6 -inset-y-10"
            style={{
              background:
                'radial-gradient(60% 50% at 60% 40%, rgba(232,134,46,0.10), transparent 70%)',
            }}
          />
          <div
            className="relative overflow-hidden border border-border-card bg-surface-term"
            style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}
          >
            <div className="flex items-center gap-2 border-b border-border-faint bg-surface-strip px-4 py-3">
              <span aria-hidden="true" className="flex gap-1.5">
                <span className="h-[11px] w-[11px] rounded-full bg-border" />
                <span className="h-[11px] w-[11px] rounded-full bg-border" />
                <span className="h-[11px] w-[11px] rounded-full bg-border" />
              </span>
              <span className="ml-2.5 font-mono text-[12px] text-ink-faint">frontguard run</span>
            </div>
            <pre className="overflow-x-auto px-5 py-[18px] font-mono text-[12.5px] leading-[1.85] text-ink-mid">
              <span className="text-amber">🔍 Discovering routes...</span> found{' '}
              <span className="text-ink-hi">47</span> routes{'\n'}
              <span className="text-new">📊</span> 12/47 routes affected by changed files{'\n'}
              <span className="text-ink-mid">🖥 Rendering 12 routes × 3 viewports</span>
              {'\n'}
              <span className="text-[#3b3531]">───────────────────────────────────</span>
              {'\n'}
              <span className="text-pass">{'  ✓ /'}</span>
              {'           375 768 1440  '}
              <span className="text-pass">PASS</span>
              {'\n'}
              <span className="text-pass">{'  ✓ /pricing'}</span>
              {'    375 768 1440  '}
              <span className="text-pass">PASS</span>
              {'\n'}
              <span className="text-warning">{'  ⚠ /checkout'}</span>
              {'   375 768 1440  '}
              <span className="text-warning">WARN</span>
              {'\n'}
              <span className="text-regression">{'  ✘ /dashboard'}</span>
              {'  375 768 1440  '}
              <span className="text-regression">REGRESSION</span>
              {'\n'}
              <span className="text-new">{'  ★ /settings'}</span>
              {'   375 768 1440  '}
              <span className="text-new">NEW</span>
              {'\n'}
              <span className="text-[#3b3531]">───────────────────────────────────</span>
              {'\n'}
              <span className="text-regression">1 regression</span> ·{' '}
              <span className="text-warning">1 warning</span> ·{' '}
              <span className="text-pass">9 passed</span> ·{' '}
              <span className="text-new">1 new</span>
              <span
                aria-hidden="true"
                className="ml-1 inline-block h-[15px] w-2 translate-y-0.5 bg-amber align-text-bottom animate-blink"
              />
            </pre>
          </div>

          {/* AI classification card, overlapping the terminal's bottom-right */}
          <div
            className="relative ml-auto -mt-[22px] w-[86%] border border-amber-brd bg-amber-tint px-[18px] py-4"
            style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.45)' }}
          >
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.04em] text-regression">
              <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-regression" />
              AI ANALYSIS — REGRESSION · 94% CONFIDENCE
            </div>
            <p className="m-0 text-[13.5px] leading-[1.55] text-ink-bright2">
              “The sidebar overlaps main content on mobile. A{' '}
              <span className="font-mono text-[12.5px] text-amber">flex-direction</span> change in{' '}
              <span className="font-mono text-[12.5px] text-ink-hi">Dashboard.module.css:28</span>{' '}
              removed column stacking.”
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Hero;

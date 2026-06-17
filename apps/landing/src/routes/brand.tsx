import type { ReactNode } from 'react';
import {
  Card,
  Container,
  Logo,
  Mark,
  STATUS_COLOR_CLASS,
  STATUS_GLYPH,
} from '../components/ui';
import { Seo } from '../components/Seo';
import { NEUTRALS, STATUSES, VOICE, SAY, DONT, TYPE_SCALE } from './brand/content';

/*
  `/brand` — the Frontguard brand system, rebuilt to parity with
  docs/design-extract/source/Brand.dc.html. It doubles as the living token
  reference: every swatch is painted by a foundation `--color-*` token (via its
  Tailwind `bg-*` utility) and prints its hex as text, so a token edit in
  index.css moves the page and a drift becomes a failing test.
*/

/** Numbered section heading ("01 / THE MARK") — the five semantic <h2>s. */
function SectionLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mb-5 font-mono text-[12px] uppercase tracking-[0.08em] text-amber">
      {children}
    </h2>
  );
}

/** Faint mono field label above a swatch / messaging block. */
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint">
      {children}
    </div>
  );
}

/** `.fg-swatch` hover-lift: translateY(-3px) over .15s (extract §Motion). */
const SWATCH = 'fg-swatch transition-transform duration-150 ease-out hover:-translate-y-[3px]';

export function Component() {
  return (
    <>
      <Seo
        title="Brand — The Frontguard brand system"
        description="The Frontguard brand system: the amber shield mark, three lockups, color tokens, typography, voice, and messaging."
        path="/brand"
      />
      <div data-route="brand" className="pt-12 pb-20 sm:pt-14">
        <Container width="brand">
          {/* ---- header band ---- */}
          <header className="mb-12 flex flex-wrap items-center justify-between gap-4 border-b border-border-faint pb-8 sm:mb-14">
            <Logo variant="primary" height={33} />
            <span className="font-mono text-[12px] tracking-[0.06em] text-ink-faint">
              BRAND SYSTEM · v1.0
            </span>
          </header>

          {/* ---- title ---- */}
          <h1
            aria-label="The Frontguard brand system."
            className="mb-4 font-sans text-[clamp(2rem,6vw,3.25rem)] font-bold leading-[1.0] tracking-[-0.04em] text-ink-hi"
          >
            The Frontguard
            <br />
            brand system.
          </h1>
          <p className="mb-12 max-w-[540px] text-[17px] leading-[1.55] text-ink-mid sm:mb-16">
            A terminal-native identity for an open-source developer tool. Sharp, precise,
            mono-forward — built to look at home in a CLI and a PR comment alike.
          </p>

          {/* ===== 01 / THE MARK ===== */}
          <section aria-labelledby="brand-mark" className="mb-16">
            <SectionLabel id="brand-mark">01 / THE MARK</SectionLabel>
            <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-[1.1fr_1fr]">
              <Card className="flex min-h-[280px] items-center justify-center p-12">
                <Mark height={142} seamColor="var(--color-panel)" title="Frontguard mark" />
              </Card>
              <Card className="flex flex-col justify-center gap-5 p-8">
                <div>
                  <div className="mb-1.5 font-mono text-[12px] text-ink-hi">The shield</div>
                  <p className="m-0 text-[13.5px] leading-[1.55] text-ink-soft">
                    A geometric shield = protection, the guard at the gate. Built from a single
                    5-point polygon — no decorative SVG.
                  </p>
                </div>
                <div>
                  <div className="mb-1.5 font-mono text-[12px] text-ink-hi">The seam</div>
                  <p className="m-0 text-[13.5px] leading-[1.55] text-ink-soft">
                    A center split divides the shield into two halves —{' '}
                    <span className="text-amber">baseline</span> vs{' '}
                    <span className="text-amber">current</span>. The visual diff, built into the
                    mark.
                  </p>
                </div>
                <div>
                  <div className="mb-1.5 font-mono text-[12px] text-ink-hi">The cursor</div>
                  <p className="m-0 text-[13.5px] leading-[1.55] text-ink-soft">
                    The wordmark ends in a blinking block cursor{' '}
                    <span
                      aria-hidden="true"
                      className="inline-block h-[13px] w-[7px] animate-blink bg-amber align-[-1px]"
                    />{' '}
                    — the terminal, always.
                  </p>
                </div>
              </Card>
            </div>

            {/* lockups */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Card className="flex flex-col items-center gap-[22px] px-7 py-9">
                <Logo variant="primary" height={36} cursor seamColor="var(--color-panel)" />
                <span className="font-mono text-[11px] text-ink-faint">PRIMARY LOCKUP</span>
              </Card>
              <Card className="flex flex-col items-center gap-[22px] bg-ink-hi px-7 py-9">
                <Logo variant="mono-light" height={36} />
                <span className="font-mono text-[11px] text-ink-soft2">MONO · ON LIGHT</span>
              </Card>
              <Card className="flex flex-col items-center gap-[22px] px-7 py-9">
                <Logo variant="mark" height={55} seamColor="var(--color-panel)" />
                <span className="font-mono text-[11px] text-ink-faint">MARK · APP ICON</span>
              </Card>
            </div>
          </section>

          {/* ===== 02 / COLOR ===== */}
          <section aria-labelledby="brand-color" className="mb-16">
            <SectionLabel id="brand-color">02 / COLOR</SectionLabel>

            <FieldLabel>CANVAS &amp; INK — warm neutrals</FieldLabel>
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {NEUTRALS.map((c) => (
                <div key={c.token} className={SWATCH} data-testid="neutral-swatch">
                  <div className={[c.bgClass, 'h-[84px] border border-border-card'].join(' ')} />
                  <div className="mt-2 font-mono text-[11px] text-ink-bright2">{c.token}</div>
                  <div className="font-mono text-[10.5px] text-ink-dim">{c.hex}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <FieldLabel>BRAND ACCENT — amber</FieldLabel>
                <div
                  className={[
                    SWATCH,
                    'flex min-h-[160px] flex-col justify-between bg-amber p-6',
                  ].join(' ')}
                  data-testid="amber-swatch"
                >
                  <span className="font-mono text-[13px] font-bold text-[#4a2a0e]">
                    Frontguard Amber
                  </span>
                  <div className="font-mono text-[12px] leading-[1.7] text-[#4a2a0e]">
                    #E8862E
                    <br />
                    oklch(0.72 0.18 50)
                  </div>
                </div>
              </div>
              <div>
                <FieldLabel>STATUS PALETTE — the terminal language</FieldLabel>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {STATUSES.map((s) => (
                    <div
                      key={s.status}
                      data-testid="status-swatch"
                      className="flex items-center gap-[14px] border border-border-card bg-panel px-[18px] py-4"
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          STATUS_COLOR_CLASS[s.status],
                          'w-[22px] text-center font-mono text-[22px]',
                        ].join(' ')}
                      >
                        {STATUS_GLYPH[s.status]}
                      </span>
                      <div>
                        <div className="font-mono text-[13px] text-ink-hi">{s.label}</div>
                        <div className="font-mono text-[10.5px] text-ink-dim">{s.hex}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ===== 03 / TYPOGRAPHY ===== */}
          <section aria-labelledby="brand-type" className="mb-16">
            <SectionLabel id="brand-type">03 / TYPOGRAPHY</SectionLabel>
            <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Card className="p-8">
                <div className="mb-5 flex items-baseline justify-between">
                  <span className="font-mono text-[11px] text-ink-faint">DISPLAY &amp; BODY</span>
                  <span className="font-mono text-[11px] text-amber">Space Grotesk</span>
                </div>
                <div className="mb-1 font-sans text-[46px] font-bold leading-none tracking-[-0.03em] text-ink-hi">
                  Aa
                </div>
                <div className="mb-[18px] font-sans text-[15px] tracking-[0.04em] text-ink-soft">
                  ABCDEFGHIJKLM abcdefghijklm 0123456789
                </div>
                <div className="flex gap-[18px] font-sans text-[13px] text-ink-mid">
                  <span>Regular</span>
                  <span className="font-medium">Medium</span>
                  <span className="font-semibold">SemiBold</span>
                  <span className="font-bold">Bold</span>
                </div>
              </Card>
              <Card className="p-8">
                <div className="mb-5 flex items-baseline justify-between">
                  <span className="font-mono text-[11px] text-ink-faint">CODE · LABELS · UI</span>
                  <span className="font-mono text-[11px] text-amber">JetBrains Mono</span>
                </div>
                <div className="mb-1 font-mono text-[46px] font-bold leading-none text-ink-hi">
                  Aa
                </div>
                <div className="mb-[18px] font-mono text-[14px] text-ink-soft">
                  ABCDEFGHIJKLM abcdefghijklm 0123456789
                </div>
                <div className="flex gap-[18px] font-mono text-[13px] text-ink-mid">
                  <span>Regular</span>
                  <span className="font-medium">Medium</span>
                  <span className="font-bold">Bold</span>
                </div>
              </Card>
            </div>

            {/* named scale */}
            <Card className="px-8 py-5 sm:px-9">
              {TYPE_SCALE.map((row, i) => (
                <div
                  key={row.label}
                  className={[
                    'flex flex-wrap items-baseline gap-x-5 gap-y-1 py-3',
                    i < TYPE_SCALE.length - 1 ? 'border-b border-border-faint' : '',
                  ].join(' ')}
                >
                  <span className="w-24 shrink-0 font-mono text-[11px] text-ink-faint">
                    {row.label}
                  </span>
                  <span className={row.sampleClass}>{row.sample}</span>
                </div>
              ))}
            </Card>
          </section>

          {/* ===== 04 / VOICE ===== */}
          <section aria-labelledby="brand-voice" className="mb-16">
            <SectionLabel id="brand-voice">04 / VOICE</SectionLabel>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {VOICE.map((v) => (
                <Card key={v.key} className="px-6 py-[26px]">
                  <div className={['mb-2.5 font-mono text-[12px]', v.colorClass].join(' ')}>
                    {v.key}
                  </div>
                  <p className="m-0 text-[14px] leading-[1.55] text-ink-mid">{v.body}</p>
                </Card>
              ))}
            </div>
          </section>

          {/* ===== 05 / MESSAGING ===== */}
          <section aria-labelledby="brand-messaging">
            <SectionLabel id="brand-messaging">05 / MESSAGING</SectionLabel>
            <Card className="mb-5 px-8 py-9 sm:px-[34px]">
              <FieldLabel>PRIMARY TAGLINE</FieldLabel>
              <div className="font-sans text-[clamp(1.625rem,4.5vw,2.125rem)] font-bold leading-[1.1] tracking-[-0.03em] text-ink-hi">
                Catch the regression, not the noise.
              </div>
              <div className="my-7 h-px bg-border-faint" />
              <FieldLabel>THE ONE-LINER</FieldLabel>
              <p className="m-0 max-w-[620px] text-[16px] leading-[1.6] text-ink-bright">
                Everyone adds visual regression tests. Then everyone mutes the channel they post to.
                Frontguard uses AI vision to tell a real regression from noise — so a red run means
                something again.
              </p>
            </Card>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="border border-[#1f3a28] bg-pass-bg px-6 py-[26px]">
                <div className="mb-4 font-mono text-[12px] text-pass">SAY</div>
                <ul className="m-0 grid list-none gap-[11px] p-0">
                  {SAY.map((s) => (
                    <li
                      key={s}
                      className="grid grid-cols-[16px_1fr] gap-2.5 text-[14px] leading-[1.5] text-ink-bright"
                    >
                      <span aria-hidden="true" className="font-mono text-pass">
                        +
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-[#3a1f1f] bg-regression-bg px-6 py-[26px]">
                <div className="mb-4 font-mono text-[12px] text-regression">DON'T</div>
                <ul className="m-0 grid list-none gap-[11px] p-0">
                  {DONT.map((d) => (
                    <li
                      key={d}
                      className="grid grid-cols-[16px_1fr] gap-2.5 text-[14px] leading-[1.5] text-ink-mid"
                    >
                      <span aria-hidden="true" className="font-mono text-regression">
                        −
                      </span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </Container>
      </div>
    </>
  );
}

export default Component;

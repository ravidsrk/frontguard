import type { CSSProperties } from 'react';

/*
  The Frontguard brand mark — a five-point shield drawn purely in CSS (no SVG),
  per docs/design-extract.md "Iconography and the mark" and Brand.dc.html.
  A second clipped span forms the center seam that splits the shield into
  baseline-vs-current halves (the visual diff, built into the mark).
*/

const SHIELD_CLIP = 'polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)';

export type MarkVariant = 'amber' | 'mono-light';

interface MarkProps {
  /** Shield height in px; width is derived from the design's 0.846 aspect ratio. */
  height?: number;
  variant?: MarkVariant;
  /** Background color the seam should match (the surface the mark sits on). */
  seamColor?: string;
  className?: string;
  'aria-hidden'?: boolean;
  title?: string;
}

export function Mark({
  height = 30,
  variant = 'amber',
  seamColor,
  className,
  title = 'Frontguard',
  'aria-hidden': ariaHidden,
}: MarkProps) {
  const width = Math.round(height * 0.846);
  const seam = Math.max(2, Math.round(height * 0.05));
  const fill = variant === 'mono-light' ? '#14110d' : 'var(--color-amber)';
  const resolvedSeam = seamColor ?? (variant === 'mono-light' ? '#f5f1ea' : 'var(--color-canvas)');

  const wrap: CSSProperties = { position: 'relative', display: 'inline-block', width, height };
  const base: CSSProperties = { position: 'absolute', inset: 0, background: fill, clipPath: SHIELD_CLIP };
  const seamStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: seam,
    transform: 'translateX(-50%)',
    background: resolvedSeam,
    clipPath: SHIELD_CLIP,
  };

  return (
    <span
      className={className}
      style={wrap}
      role={ariaHidden ? undefined : 'img'}
      aria-hidden={ariaHidden || undefined}
      aria-label={ariaHidden ? undefined : `${title} shield mark`}
      data-testid="brand-mark"
    >
      <span style={base} aria-hidden="true" />
      <span style={seamStyle} aria-hidden="true" />
    </span>
  );
}

export type LogoVariant = 'primary' | 'mono-light' | 'mark';

interface LogoProps {
  variant?: LogoVariant;
  /** Mark height in px; the wordmark and cursor scale from it. */
  height?: number;
  /** Show the blinking amber block cursor after the wordmark. */
  cursor?: boolean;
  seamColor?: string;
  className?: string;
}

/**
 * The three Brand-page lockups: `primary` (amber mark + wordmark on dark),
 * `mono-light` (ink mark + wordmark on a light surface), and `mark` (icon only).
 */
export function Logo({
  variant = 'primary',
  height = 30,
  cursor = false,
  seamColor,
  className,
}: LogoProps) {
  const markVariant: MarkVariant = variant === 'mono-light' ? 'mono-light' : 'amber';
  const wordColor = variant === 'mono-light' ? '#14110d' : 'var(--color-ink-hi)';
  const fontSize = Math.round(height * 0.58);
  const cursorW = Math.max(6, Math.round(fontSize * 0.38));
  const cursorH = Math.round(fontSize * 0.76);

  if (variant === 'mark') {
    return <Mark height={height} variant="amber" seamColor={seamColor} className={className} />;
  }

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.43) }}
    >
      <Mark height={height} variant={markVariant} seamColor={seamColor} aria-hidden />
      <span
        className="font-mono font-bold lowercase"
        style={{ fontSize, letterSpacing: '-0.02em', color: wordColor, lineHeight: 1 }}
      >
        frontguard
        {cursor && (
          <span
            aria-hidden="true"
            className="animate-blink"
            style={{
              display: 'inline-block',
              width: cursorW,
              height: cursorH,
              marginLeft: 2,
              background: 'var(--color-amber)',
              verticalAlign: '-1px',
            }}
          />
        )}
      </span>
    </span>
  );
}

export default Logo;

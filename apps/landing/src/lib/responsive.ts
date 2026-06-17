/*
  Canonical responsive collapse rules. The design is authored at a fixed desktop
  canvas with zero @media queries, so the build owns responsive behavior. These
  className constants centralize the collapse rules (extract §"Breakpoints") so
  every page applies them identically. They are plain strings and therefore
  unit-coverable.
*/

/** Hero `1fr 1fr` → stacks below ~900px (terminal under the copy). */
export const HERO_SPLIT = 'grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center';

/** `repeat(3,1fr)` grids: 3 → 2 → 1 columns. */
export const GRID_3 = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

/** `repeat(6,1fr)` pipeline: wraps 2 → 3 → 6. */
export const GRID_6 = 'grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-6';

/** `repeat(5,1fr)` plugins row: wraps 2 → 3 → 5. */
export const GRID_5 = 'grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5';

/** Two-up `1fr 1fr` card pairs collapse below the small breakpoint. */
export const GRID_2 = 'grid grid-cols-1 gap-5 md:grid-cols-2';

/** Tables get horizontal scroll on narrow widths. */
export const TABLE_SCROLL = 'overflow-x-auto';

/** Section vertical rhythm (~84px) and hero/CTA band padding. */
export const SECTION_Y = 'py-16 sm:py-20 lg:py-[84px]';
export const HERO_Y = 'pt-[88px] pb-16 sm:pb-20';
export const BAND_Y = 'py-16 sm:py-20 lg:py-[90px]';

/** Fluid hero h1: 58px desktop → ~34px mobile. */
export const HERO_H1 = 'text-[clamp(2.125rem,7vw,3.625rem)] font-bold leading-[1.02] tracking-[-0.035em]';

/** The nav collapses to a hamburger below this width (Tailwind `lg`, ~768–1024px band). */
export const NAV_COLLAPSE_BREAKPOINT = 'lg';

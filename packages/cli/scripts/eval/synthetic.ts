/**
 * Synthetic eval cases: deterministic flat-colour page mock-ups drawn with pngjs.
 *
 * Each case has one expected class unless the change is genuinely ambiguous,
 * in which case it is marked `ambiguous` and scored separately. Pixel-identical
 * pairs are `gated`: Frontguard never sends them to a model.
 */

import { PNG } from 'pngjs';
import type { EvalCase } from './types.js';

type RGBA = readonly [number, number, number, number];

const C = {
  white: [255, 255, 255, 255],
  darkGray: [51, 51, 51, 255],
  lightGray: [240, 240, 240, 255],
  medGray: [200, 200, 200, 255],
  blue: [59, 130, 246, 255],
  red: [239, 68, 68, 255],
  green: [34, 197, 94, 255],
  navy: [30, 41, 59, 255],
  slate: [100, 116, 139, 255],
  orange: [249, 115, 22, 255],
  purple: [139, 92, 246, 255],
  darkBg: [15, 23, 42, 255],
  darkCard: [30, 41, 59, 255],
  darkText: [226, 232, 240, 255],
} as const satisfies Record<string, RGBA>;

const W = 800;
const H = 600;

function canvas(width = W, height = H): PNG {
  const png = new PNG({ width, height });
  png.data.fill(255);
  return png;
}

function rect(png: PNG, x: number, y: number, w: number, h: number, color: RGBA): void {
  for (let row = Math.max(0, y); row < Math.min(y + h, png.height); row++) {
    for (let col = Math.max(0, x); col < Math.min(x + w, png.width); col++) {
      const i = (row * png.width + col) * 4;
      png.data[i] = color[0];
      png.data[i + 1] = color[1];
      png.data[i + 2] = color[2];
      png.data[i + 3] = color[3];
    }
  }
}

function text(png: PNG, x: number, y: number, width: number, lines: number, color: RGBA, seed = 42): void {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s;
  };
  for (let i = 0; i < lines; i++) rect(png, x, y + i * 14, Math.max(width - (next() % 40), 20), 4, color);
}

function navbar(png: PNG, bg: RGBA, fg: RGBA, height = 56): void {
  rect(png, 0, 0, png.width, height, bg);
  rect(png, 20, 16, 80, 24, fg);
  for (const x of [200, 280, 360, 440]) if (x + 60 < png.width) rect(png, x, 22, 50, 12, fg);
}

function card(png: PNG, x: number, y: number, w: number, h: number, bg: RGBA, fg: RGBA, button: RGBA, buttonText: RGBA): void {
  rect(png, x, y, w, h, bg);
  rect(png, x, y, w, 2, C.medGray);
  rect(png, x, y + h - 2, w, 2, C.medGray);
  rect(png, x, y, 2, h, C.medGray);
  rect(png, x + w - 2, y, 2, h, C.medGray);
  rect(png, x + 20, y + 20, w - 40, 8, fg);
  text(png, x + 20, y + 44, w - 40, 4, fg);
  rect(png, x + 20, y + h - 56, 120, 36, button);
  rect(png, x + 35, y + h - 44, 90, 12, buttonText);
}

function sidebar(png: PNG, x: number, y: number, w: number, h: number, bg: RGBA, fg: RGBA): void {
  rect(png, x, y, w, h, bg);
  for (let i = 0; i < 6; i++) {
    rect(png, x + 16, y + 20 + i * 44, 16, 16, fg);
    rect(png, x + 44, y + 24 + i * 44, w - 64, 8, fg);
  }
}

interface PageStyle {
  navBg?: RGBA;
  navText?: RGBA;
  pageBg?: RGBA;
  sidebarBg?: RGBA;
  sidebarText?: RGBA;
  cardBg?: RGBA;
  cardText?: RGBA;
  button?: RGBA;
  buttonText?: RGBA;
  offset?: { x: number; y: number };
}

function page(png: PNG, s: PageStyle = {}): void {
  const offset = s.offset ?? { x: 0, y: 0 };
  rect(png, 0, 0, png.width, png.height, s.pageBg ?? C.lightGray);
  navbar(png, s.navBg ?? C.navy, s.navText ?? C.white);
  sidebar(png, 0, 56, 200, png.height - 56, s.sidebarBg ?? C.white, s.sidebarText ?? C.slate);
  const x = 224 + offset.x;
  const y = 80 + offset.y;
  const w = png.width - 248;
  const args = [s.cardBg ?? C.white, s.cardText ?? C.darkGray, s.button ?? C.blue, s.buttonText ?? C.white] as const;
  card(png, x, y, w, 200, ...args);
  card(png, x, y + 220, w, 180, ...args);
  rect(png, 0, png.height - 48, png.width, 48, s.navBg ?? C.navy);
  rect(png, 20, png.height - 30, 200, 10, s.navText ?? C.white);
}

const buf = (png: PNG): Buffer => PNG.sync.write(png);

function pair(draw: (before: PNG, after: PNG) => void, width = W, height = H): { before: Buffer; after: Buffer } {
  const before = canvas(width, height);
  const after = canvas(width, height);
  draw(before, after);
  return { before: buf(before), after: buf(after) };
}

/** Builds the synthetic cases. Deterministic: same bytes every run. */
export function syntheticCases(): EvalCase[] {
  return [
    {
      id: 'syn-identical',
      set: 'synthetic',
      description: 'Pixel-identical pages',
      expected: ['pass'],
      gated: true,
      viewport: W,
      ...pair((b, a) => {
        rect(b, 200, 150, 400, 300, C.red);
        rect(a, 200, 150, 400, 300, C.red);
      }),
    },
    {
      id: 'syn-price-change',
      set: 'synthetic',
      description: 'Price block widens inside the same card',
      expected: ['content_update'],
      viewport: W,
      ...pair((b, a) => {
        for (const [png, wide] of [[b, false], [a, true]] as const) {
          page(png);
          rect(png, 250, 160, 120, 50, C.white);
          rect(png, 260, 170, 12, 24, C.darkGray);
          rect(png, 276, 170, wide ? 40 : 32, 24, C.darkGray);
        }
      }),
    },
    {
      id: 'syn-layout-break',
      set: 'synthetic',
      description: 'Cards shift 50px into the gutter and an element overflows the right edge',
      expected: ['regression'],
      viewport: W,
      ...pair((b, a) => {
        page(b);
        page(a, { offset: { x: 50, y: 0 } });
        rect(a, W - 10, 100, 60, 300, C.red);
      }),
    },
    {
      id: 'syn-missing-nav',
      set: 'synthetic',
      description: 'Top navigation bar removed; content moves up',
      expected: ['regression'],
      viewport: W,
      ...pair((b, a) => {
        page(b);
        rect(a, 0, 0, W, H, C.lightGray);
        sidebar(a, 0, 0, 200, H, C.white, C.slate);
        card(a, 224, 24, W - 248, 200, C.white, C.darkGray, C.blue, C.white);
        card(a, 224, 244, W - 248, 180, C.white, C.darkGray, C.blue, C.white);
        rect(a, 0, H - 48, W, 48, C.navy);
        rect(a, 20, H - 30, 200, 10, C.white);
      }),
    },
    {
      id: 'syn-dark-theme',
      set: 'synthetic',
      description: 'Whole page switches to a dark theme; layout unchanged',
      expected: ['intentional'],
      viewport: W,
      ...pair((b, a) => {
        page(b);
        page(a, {
          navBg: C.darkBg,
          navText: C.darkText,
          pageBg: C.darkBg,
          sidebarBg: C.darkCard,
          sidebarText: C.darkText,
          cardBg: C.darkCard,
          cardText: C.darkText,
        });
      }),
    },
    {
      id: 'syn-mobile-overflow',
      set: 'synthetic',
      description: 'Mobile cards overflow the viewport and overlap each other',
      expected: ['regression'],
      viewport: 375,
      ...pair(
        (b, a) => {
          for (const png of [b, a]) {
            rect(png, 0, 0, 375, H, C.lightGray);
            navbar(png, C.navy, C.white, 48);
          }
          card(b, 12, 60, 351, 200, C.white, C.darkGray, C.blue, C.white);
          card(b, 12, 280, 351, 180, C.white, C.darkGray, C.blue, C.white);
          card(a, 12, 60, 475, 200, C.white, C.darkGray, C.blue, C.white);
          card(a, 12, 200, 351, 180, C.white, C.darkGray, C.blue, C.white);
          rect(a, 370, 60, 5, 300, C.red);
        },
        375,
        H,
      ),
    },
    {
      id: 'syn-image-swap',
      set: 'synthetic',
      description: 'Hero image region shows a different picture; layout unchanged',
      expected: ['content_update'],
      viewport: W,
      ...pair((b, a) => {
        for (const [png, color] of [[b, C.green], [a, C.purple]] as const) {
          page(png);
          rect(png, 224, 64, W - 248, 160, color);
          text(png, 244, 234, 200, 2, C.slate, 50);
        }
      }),
    },
    {
      id: 'syn-button-color',
      set: 'synthetic',
      description: 'Only the button colour changes (could be a restyle or a bug)',
      expected: ['regression', 'intentional'],
      ambiguous: true,
      viewport: W,
      ...pair((b, a) => {
        page(b, { button: C.blue });
        page(a, { button: C.red });
      }),
    },
    {
      id: 'syn-added-banner',
      set: 'synthetic',
      description: 'A banner and badge appear; the banner touches the first card',
      expected: ['intentional', 'regression'],
      ambiguous: true,
      viewport: W,
      ...pair((b, a) => {
        page(b);
        page(a);
        rect(a, 224, 64, W - 248, 32, C.green);
        rect(a, 244, 72, 200, 12, C.white);
        rect(a, W - 100, 90, 60, 24, C.orange);
      }),
    },
    {
      id: 'syn-spacing-5px',
      set: 'synthetic',
      description: 'Content moves down 5px',
      expected: ['intentional', 'regression'],
      ambiguous: true,
      viewport: W,
      ...pair((b, a) => {
        page(b);
        page(a, { offset: { x: 0, y: 5 } });
      }),
    },
  ];
}

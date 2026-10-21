/**
 * Deterministic HTML/CSS mutation operators for the #285 pixel arm.
 *
 * The seed picks replacement values. It does not pick which operators run,
 * and it does not change the viewport bucket of an operator. Nuisance
 * operators (animation, font swap, caret, scrollbar) are not recall items.
 *
 * No network, no clock, no filesystem reads. Same seed → same bytes.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Fixed seed for the recorded #285 run. Not a secret. */
export const PIXEL_VALIDATION_SEED = 285;

export const PIXEL_VIEWPORTS = [375, 768, 1440];

export const SELECTION_ROUTES = ['/', '/about', '/gallery', '/brand'];

export const SELECTION_SCENARIOS = ['about-only', 'svg-and-about', 'css-background', 'font-file'];

const BASELINE = {
  textChar: '.',
  color: '#0044cc',
  layoutDesktop: '#147a14',
  layoutMobile: '#c4a000',
  layoutTwo: '#6b2d8b',
  neighbourMargin: 0,
  logo: '#112233',
  animationEnd: '#654321',
  animationMs: 1200,
  fontFamily: 'Arial, sans-serif',
  scrollbar: '#888888',
  about: '#885500',
  bg: [0x22, 0x55, 0xaa],
};

/** mulberry32. Integer seed → deterministic unit-interval stream. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertSeed(seed) {
  if (!Number.isInteger(seed)) {
    throw new Error(`mutation seed must be an integer, got ${seed}`);
  }
}

function hexColor(rng) {
  const n = Math.floor(rng() * 0x1000000);
  return `#${n.toString(16).padStart(6, '0')}`;
}

/**
 * Operator plan for a seed. Viewport buckets are fixed by construction:
 * a media query hides the mutated paint outside the expected widths.
 */
export function planMutations(seed) {
  assertSeed(seed);
  const rng = mulberry32(seed);
  const textChar = ['#', 'X', '@', 'M'][Math.floor(rng() * 4)];
  const marginPx = 160 + Math.floor(rng() * 80);
  const fontFamily = ['"Courier New", monospace', 'Georgia, serif', '"Times New Roman", serif'][
    Math.floor(rng() * 3)
  ];
  const operators = [
    {
      id: 'text',
      kind: 'html-text',
      class: 'observable',
      route: '/text',
      file: 'site/text.html',
      expectedViewports: [375, 768, 1440],
      bucket: 3,
      textChar,
    },
    {
      id: 'color',
      kind: 'css-color',
      class: 'observable',
      route: '/color',
      file: 'site/color.html',
      expectedViewports: [375, 768, 1440],
      bucket: 3,
      color: hexColor(rng),
    },
    {
      id: 'layout-desktop',
      kind: 'css-media',
      class: 'observable',
      route: '/layout-desktop',
      file: 'site/layout-desktop.html',
      expectedViewports: [1440],
      bucket: 1,
      color: hexColor(rng),
    },
    {
      id: 'layout-mobile',
      kind: 'css-media',
      class: 'observable',
      route: '/layout-mobile',
      file: 'site/layout-mobile.html',
      expectedViewports: [375],
      bucket: 1,
      color: hexColor(rng),
    },
    {
      id: 'layout-two',
      kind: 'css-media',
      class: 'observable',
      route: '/layout-two',
      file: 'site/layout-two.html',
      expectedViewports: [375, 768],
      bucket: 2,
      color: hexColor(rng),
    },
    {
      id: 'neighbour',
      kind: 'css-neighbour-shift',
      class: 'neighbour-moving',
      route: '/neighbour',
      file: 'site/neighbour.html',
      expectedViewports: [375, 768, 1440],
      bucket: 3,
      marginPx,
    },
    {
      id: 'logo',
      kind: 'svg-fill',
      class: 'observable',
      route: '/logo',
      file: 'site/logo.html',
      expectedViewports: [375, 768, 1440],
      bucket: 3,
      color: hexColor(rng),
    },
    {
      id: 'animation',
      kind: 'css-animation',
      class: 'nuisance',
      route: '/nuisance/animation',
      file: 'site/nuisance/animation.html',
      expectedViewports: [],
      bucket: null,
      color: hexColor(rng),
      durationMs: 800 + Math.floor(rng() * 800),
    },
    {
      id: 'font-swap',
      kind: 'css-font-swap',
      class: 'nuisance',
      route: '/nuisance/font',
      file: 'site/nuisance/font.html',
      expectedViewports: [],
      bucket: null,
      fontFamily,
    },
    {
      id: 'caret',
      kind: 'html-caret',
      class: 'nuisance',
      route: '/nuisance/caret',
      file: 'site/nuisance/caret.html',
      expectedViewports: [],
      bucket: null,
    },
    {
      id: 'scrollbar',
      kind: 'css-scrollbar',
      class: 'nuisance',
      route: '/nuisance/scrollbar',
      file: 'site/nuisance/scrollbar.html',
      expectedViewports: [],
      bucket: null,
      color: hexColor(rng),
    },
  ];
  return { seed, viewports: [...PIXEL_VIEWPORTS], operators };
}

function page({ title, style, body, seed }) {
  const comment = seed == null ? '' : `<!-- mutation-seed:${seed} -->\n`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${comment}<style>
html, body { margin: 0; padding: 0; }
${style}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function denseText(ch) {
  const line = String(ch).repeat(90);
  return Array.from({ length: 30 }, () => line).join('\n');
}

function textPage(ch, seed) {
  return page({
    title: 'text',
    seed,
    style: `pre { margin: 0; width: 100%; font: 700 28px/1 monospace; white-space: pre-wrap; word-break: break-all; color: #111; background: #fff; }`,
    body: `<pre data-mutate="text">${denseText(ch)}</pre>`,
  });
}

function colorPage(color, seed) {
  return page({
    title: 'color',
    seed,
    style: `html, body { height: 100%; background: ${color}; }`,
    body: `<div data-mutate="color" style="height:100vh"></div>`,
  });
}

function mediaPage({ title, seed, query, color, hiddenNote }) {
  return page({
    title,
    seed,
    style: `.panel { display: none; height: 100vh; }
${query} { .panel { display: block; background: ${color}; } }
.note { font: 16px/1.4 sans-serif; padding: 12px; }`,
    body: `<div class="panel" data-mutate="${title}"></div>\n<p class="note">${hiddenNote}</p>`,
  });
}

function neighbourPage(marginPx, seed) {
  return page({
    title: 'neighbour',
    seed,
    style: `.mover { height: 40vh; background: #222; margin-bottom: ${marginPx}px; }
.neighbour { height: 50vh; background: #f2c14e; }`,
    body: `<div class="mover" data-mutate="neighbour"></div>\n<div class="neighbour">neighbour</div>`,
  });
}

function logoPage(fill, seed) {
  return page({
    title: 'logo',
    seed,
    style: `svg { display: block; width: 100%; height: 100vh; }`,
    body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="logo">
  <rect data-mutate="logo" width="100" height="100" fill="${fill}"/>
  <text x="8" y="58" fill="#ffffff" font-size="18" font-family="sans-serif">LOGO</text>
</svg>`,
  });
}

function animationPage(endColor, durationMs, seed) {
  return page({
    title: 'animation',
    seed,
    style: `@keyframes pulse { from { background: #123456; } to { background: ${endColor}; } }
.box { height: 100vh; animation: pulse ${durationMs}ms linear infinite; }`,
    body: `<div class="box" data-mutate="animation"></div>`,
  });
}

function fontPage(family, seed) {
  return page({
    title: 'font-swap',
    seed,
    style: `.sample { margin: 0; height: 100vh; font: 700 64px/1 ${family}; background: #fff; color: #111; }`,
    body: `<p class="sample" data-mutate="font">Font swap sample 000111</p>`,
  });
}

function caretPage(focused, seed) {
  const focus = focused ? ' autofocus' : '';
  return page({
    title: 'caret',
    seed,
    style: `input { display: block; box-sizing: border-box; width: 100%; height: 100vh; margin: 0; border: 0; padding: 24px; font: 64px/1 sans-serif; caret-color: #ff0000; background: #fff; color: #111; }`,
    body: `<input data-mutate="caret" value="caret"${focus}>`,
  });
}

function scrollbarPage(thumb, forceScroll, seed) {
  const overflow = forceScroll ? 'scroll' : 'hidden';
  return page({
    title: 'scrollbar',
    seed,
    style: `html { overflow: ${overflow}; scrollbar-color: ${thumb} #111; }
body { height: 220vh; background: #eee; }
::-webkit-scrollbar { width: 24px; }
::-webkit-scrollbar-thumb { background: ${thumb}; }`,
    body: `<div data-mutate="scrollbar" style="height:200vh"></div>`,
  });
}

function pixelRoutes() {
  return {
    '/text': 'site/text.html',
    '/color': 'site/color.html',
    '/layout-desktop': 'site/layout-desktop.html',
    '/layout-mobile': 'site/layout-mobile.html',
    '/layout-two': 'site/layout-two.html',
    '/neighbour': 'site/neighbour.html',
    '/logo': 'site/logo.html',
    '/nuisance/animation': 'site/nuisance/animation.html',
    '/nuisance/font': 'site/nuisance/font.html',
    '/nuisance/caret': 'site/nuisance/caret.html',
    '/nuisance/scrollbar': 'site/nuisance/scrollbar.html',
  };
}

/** Clean app when seed is null. Mutated app when seed is an integer. */
export function renderPixelApp(seed) {
  const plan = seed == null ? null : planMutations(seed);
  const byId = new Map((plan?.operators ?? []).map((op) => [op.id, op]));
  const pick = (id, key, fallback) => (byId.has(id) ? byId.get(id)[key] : fallback);
  const files = {
    'site/text.html': textPage(pick('text', 'textChar', BASELINE.textChar), seed),
    'site/color.html': colorPage(pick('color', 'color', BASELINE.color), seed),
    'site/layout-desktop.html': mediaPage({
      title: 'layout-desktop',
      seed,
      query: '@media (min-width: 1200px)',
      color: pick('layout-desktop', 'color', BASELINE.layoutDesktop),
      hiddenNote: 'Desktop panel is display:none below 1200px.',
    }),
    'site/layout-mobile.html': mediaPage({
      title: 'layout-mobile',
      seed,
      query: '@media (max-width: 500px)',
      color: pick('layout-mobile', 'color', BASELINE.layoutMobile),
      hiddenNote: 'Mobile panel is display:none above 500px.',
    }),
    'site/layout-two.html': mediaPage({
      title: 'layout-two',
      seed,
      query: '@media (max-width: 1000px)',
      color: pick('layout-two', 'color', BASELINE.layoutTwo),
      hiddenNote: 'This panel is display:none above 1000px.',
    }),
    'site/neighbour.html': neighbourPage(pick('neighbour', 'marginPx', BASELINE.neighbourMargin), seed),
    'site/logo.html': logoPage(pick('logo', 'color', BASELINE.logo), seed),
    'site/nuisance/animation.html': animationPage(
      pick('animation', 'color', BASELINE.animationEnd),
      pick('animation', 'durationMs', BASELINE.animationMs),
      seed,
    ),
    'site/nuisance/font.html': fontPage(pick('font-swap', 'fontFamily', BASELINE.fontFamily), seed),
    'site/nuisance/caret.html': caretPage(byId.has('caret'), seed),
    'site/nuisance/scrollbar.html': scrollbarPage(
      pick('scrollbar', 'color', BASELINE.scrollbar),
      byId.has('scrollbar'),
      seed,
    ),
    'routes.json': `${JSON.stringify(pixelRoutes(), null, 2)}\n`,
  };
  return { plan, files, routes: pixelRoutes() };
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** Uncompressed 1×1 RGB PNG. CSS stretches it; the byte change is the color. */
export function png1x1(r, g, b) {
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const raw = deflateSync(Buffer.from([0, r, g, b]));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', raw),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function logoSvg(fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="logo">
  <rect width="800" height="600" fill="${fill}"/>
  <circle cx="160" cy="160" r="70" fill="#ffffff"/>
</svg>
`;
}

function selectionRoutes() {
  return {
    '/': 'site/index.html',
    '/about': 'site/about.html',
    '/gallery': 'site/gallery.html',
    '/brand': 'site/brand.html',
    '/logo.svg': 'public/logo.svg',
    '/bg.png': 'public/bg.png',
    '/fonts/brand.woff': 'public/fonts/brand.woff',
  };
}

/**
 * Selection fixture. `scenario` null is the clean tree.
 * `{ seed, name }` applies one seeded edit set on top of that tree.
 * Public SVG, CSS background image, and font-file edits are separate names
 * so omitted routes can be counted per edit, not pooled into one diff.
 */
export function renderSelection(scenario) {
  const name = scenario?.name ?? null;
  const seed = scenario?.seed ?? null;
  if (name != null && !SELECTION_SCENARIOS.includes(name)) {
    throw new Error(`unknown selection scenario ${name}`);
  }
  if (name != null) assertSeed(seed);
  const rng = name == null ? null : mulberry32((seed + 17) >>> 0);
  const nextColor = () => hexColor(rng);
  const aboutColor = name === 'about-only' || name === 'svg-and-about' ? nextColor() : BASELINE.about;
  const logoFill = name === 'svg-and-about' ? nextColor() : BASELINE.logo;
  let bg = BASELINE.bg;
  if (name === 'css-background') {
    const hex = nextColor();
    bg = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  const fontPayload = name === 'font-file' ? `FRONTGUARD-FONT-${seed}` : 'FRONTGUARD-FONT-BASELINE-v1';
  const aboutSource =
    name === 'about-only' || name === 'svg-and-about'
      ? `export default function About() {\n  return "about-mutated-${seed}";\n}\n`
      : `export default function About() {\n  return "about-baseline";\n}\n`;
  const files = {
    'next.config.mjs': '/** Fixture marker so route mapping sees the pages router. Do not edit in scenarios. */\nexport default {};\n',
    'pages/index.js': 'export default function Home() {\n  return "home-baseline";\n}\n',
    'pages/about.js': aboutSource,
    'pages/gallery.js': 'export default function Gallery() {\n  return "gallery-baseline";\n}\n',
    'pages/brand.js': 'export default function Brand() {\n  return "brand-baseline";\n}\n',
    'public/logo.svg': logoSvg(logoFill),
    'public/bg.png': png1x1(bg[0], bg[1], bg[2]),
    'public/fonts/brand.woff': Buffer.from(fontPayload),
    'site/index.html': page({
      title: 'home',
      seed: null,
      style: 'img { display: block; width: 100%; height: 100vh; object-fit: fill; }',
      body: '<img alt="logo" src="/logo.svg">',
    }),
    'site/about.html': page({
      title: 'about',
      seed: name === 'about-only' || name === 'svg-and-about' ? seed : null,
      style: `html, body { height: 100%; background: ${aboutColor}; }`,
      body: '<div style="height:100vh"></div>',
    }),
    'site/gallery.html': page({
      title: 'gallery',
      seed: null,
      style: '.bg { height: 100vh; background: url(/bg.png) center / 100% 100% no-repeat; }',
      body: '<div class="bg"></div>',
    }),
    'site/brand.html': page({
      title: 'brand',
      seed: null,
      style: `@font-face { font-family: Brand; src: url(/fonts/brand.woff); }
.brand { margin: 0; height: 100vh; font: 64px/1 Brand, sans-serif; background: #fafafa; color: #222; }`,
      body: '<p class="brand">Brand font sample</p>',
    }),
    'routes.json': `${JSON.stringify(selectionRoutes(), null, 2)}\n`,
  };
  return {
    scenario: name,
    seed,
    routes: selectionRoutes(),
    files,
  };
}

export function writeTree(dir, files) {
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  }
}

function isMain() {
  return process.argv[1] && process.argv[1].endsWith('mutate.mjs');
}

if (isMain() && process.argv.includes('--write-fixtures')) {
  const root = process.argv[process.argv.indexOf('--write-fixtures') + 1];
  if (!root) throw new Error('--write-fixtures needs a directory');
  writeTree(join(root, 'app'), renderPixelApp(null).files);
  writeTree(join(root, 'selection'), renderSelection(null).files);
}

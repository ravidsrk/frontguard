/*
  Regenerate the raster brand assets (favicons, apple-touch, logo PNGs/WebP, and
  the OG card) from the amber CSS shield. The old committed rasters were the
  retired cyan "FG" mark; these match the new brand (docs/design-extract.md §"the
  mark", Brand.dc.html).

  This is a one-off generator. sharp + png-to-ico are not project dependencies;
  run it with a throwaway install, e.g.:

    cd /tmp && mkdir -p iconsgen && cd iconsgen && npm i sharp png-to-ico
    NODE_PATH=/tmp/iconsgen/node_modules node \
      apps/landing/scripts/generate-brand-assets.mjs
*/
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default ?? pngToIcoModule;

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const AMBER = '#e8862e';
const CANVAS = '#0d0c0b';
const INK = '#f5f1ea';
const INK_MID = '#b8b0a6';

/** A square dark tile with the centered amber shield + canvas seam. */
function shieldSquare(size) {
  const H = Math.round(size * 0.64);
  const W = Math.round(H * 0.846);
  const x0 = Math.round((size - W) / 2);
  const y0 = Math.round((size - H) / 2);
  const yb = y0 + Math.round(H * 0.62);
  const ytip = y0 + H;
  const xc = x0 + W / 2;
  const sw = Math.max(1.5, Math.round(H * 0.05));
  const path = `M${x0} ${y0} H${x0 + W} V${yb} L${xc} ${ytip} L${x0} ${yb} Z`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
       <rect width="${size}" height="${size}" fill="${CANVAS}"/>
       <defs><clipPath id="s"><path d="${path}"/></clipPath></defs>
       <path d="${path}" fill="${AMBER}"/>
       <rect x="${xc - sw / 2}" y="${y0}" width="${sw}" height="${H}" fill="${CANVAS}" clip-path="url(#s)"/>
     </svg>`,
  );
}

/** 1200x630 social card: shield + wordmark + tagline. */
function ogCard() {
  const w = 1200;
  const h = 630;
  const H = 150;
  const W = Math.round(H * 0.846);
  const x0 = 110;
  const y0 = Math.round((h - H) / 2) - 40;
  const yb = y0 + Math.round(H * 0.62);
  const ytip = y0 + H;
  const xc = x0 + W / 2;
  const sw = 8;
  const path = `M${x0} ${y0} H${x0 + W} V${yb} L${xc} ${ytip} L${x0} ${yb} Z`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
       <rect width="${w}" height="${h}" fill="${CANVAS}"/>
       <defs><clipPath id="s"><path d="${path}"/></clipPath></defs>
       <path d="${path}" fill="${AMBER}"/>
       <rect x="${xc - sw / 2}" y="${y0}" width="${sw}" height="${H}" fill="${CANVAS}" clip-path="url(#s)"/>
       <text x="${x0 + W + 36}" y="${y0 + 96}" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="76" fill="${INK}">frontguard</text>
       <text x="110" y="${h - 150}" font-family="sans-serif" font-weight="700" font-size="52" fill="${INK}">Catch the regression, not the noise.</text>
       <text x="110" y="${h - 96}" font-family="sans-serif" font-size="30" fill="${INK_MID}">AI-powered visual regression testing · open source · MIT</text>
     </svg>`,
  );
}

const PNG_SIZES = [16, 32, 48, 64, 128, 180, 192];

async function main() {
  // PNG + WebP at every size.
  for (const size of PNG_SIZES) {
    const svg = shieldSquare(size);
    await sharp(svg).png().toFile(join(PUBLIC, `logo-${size}.png`));
    await sharp(svg).webp().toFile(join(PUBLIC, `logo-${size}.webp`));
  }

  // Master 512 logo.
  await sharp(shieldSquare(512)).png().toFile(join(PUBLIC, 'logo.png'));
  await sharp(shieldSquare(512)).webp().toFile(join(PUBLIC, 'logo.webp'));

  // Multi-resolution favicon.ico from 16/32/48.
  const icoPngs = await Promise.all(
    [16, 32, 48].map((s) => sharp(shieldSquare(s)).png().toBuffer()),
  );
  const ico = await pngToIco(icoPngs);
  writeFileSync(join(PUBLIC, 'favicon.ico'), ico);

  // OG card.
  await sharp(ogCard()).png().toFile(join(PUBLIC, 'og-image.png'));

  console.log('brand assets regenerated in', PUBLIC);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

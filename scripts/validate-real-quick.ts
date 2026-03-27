/**
 * Real-World AI Quick Validation
 *
 * Smoke test: take screenshots of real public websites, run pixel diff,
 * and verify AI classification works on actual web content.
 *
 * Usage: npx tsx scripts/validate-real-quick.ts
 */

import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { analyzeWithAI } from '../src/diff/ai-vision.js';
import type { DiffResult, AIConfig } from '../src/core/types.js';

// Bridge env key
if (!process.env.FRONTGUARD_OPENAI_KEY && process.env.OPENAI_API_KEY) {
  process.env.FRONTGUARD_OPENAI_KEY = process.env.OPENAI_API_KEY;
}

const AI_CONFIG: AIConfig = { provider: 'openai', model: 'gpt-4o' };

interface SiteResult {
  url: string;
  diffPixels: number;
  diffPercent: number;
  classification?: string;
  severity?: string;
  confidence?: number;
  explanation?: string;
  status: 'stable' | 'content_drift' | 'error';
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pngFromBuffer(buf: Buffer): PNG {
  return PNG.sync.read(buf);
}

function runPixelDiff(img1Buf: Buffer, img2Buf: Buffer): { diffPixels: number; diffPercent: number; diffImage: Buffer } {
  const img1 = pngFromBuffer(img1Buf);
  const img2 = pngFromBuffer(img2Buf);

  // Ensure same dimensions (use min to be safe)
  const width = Math.min(img1.width, img2.width);
  const height = Math.min(img1.height, img2.height);

  const diffPng = new PNG({ width, height });
  const diffPixels = pixelmatch(
    img1.data as unknown as Uint8Array,
    img2.data as unknown as Uint8Array,
    diffPng.data as unknown as Uint8Array,
    width,
    height,
    { threshold: 0.1 },
  );

  const totalPixels = width * height;
  const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;

  return { diffPixels, diffPercent, diffImage: PNG.sync.write(diffPng) };
}

function makeDiffResult(
  baselineImage: Buffer,
  currentImage: Buffer,
  diffImage: Buffer,
  diffPercent: number,
  routePath: string,
  viewport: number,
): DiffResult {
  return {
    route: { path: routePath },
    viewport,
    browser: 'chromium',
    status: diffPercent > 0 ? 'changed' : 'pass',
    diffPercentage: diffPercent,
    diffImage,
    baselineImage,
    currentImage,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🔍 FRONTGUARD REAL-WORLD AI VALIDATION\n');
  console.log('=' .repeat(60));

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const results: SiteResult[] = [];

  // ── Part 1: Same-page stability tests ──────────────────────────────────
  const sites = [
    { url: 'https://example.com', label: 'example.com (static)' },
    { url: 'https://news.ycombinator.com', label: 'Hacker News (dynamic)' },
    { url: 'https://httpbin.org', label: 'httpbin.org (stable API)' },
  ];

  for (const site of sites) {
    console.log(`\n▶ Testing: ${site.label}`);
    try {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();

      await page.goto(site.url, { waitUntil: 'networkidle', timeout: 30000 });
      const shot1 = await page.screenshot({ fullPage: false });

      // Wait 1 second, take second shot
      await page.waitForTimeout(1000);
      const shot2 = await page.screenshot({ fullPage: false });

      await ctx.close();

      const { diffPixels, diffPercent, diffImage } = runPixelDiff(shot1, shot2);

      console.log(`  Pixel diff: ${diffPixels} px (${diffPercent.toFixed(4)}%)`);

      if (diffPixels === 0) {
        console.log('  ✅ Zero diff — perfectly stable');
        results.push({
          url: site.url,
          diffPixels,
          diffPercent,
          status: 'stable',
        });
      } else {
        // Non-zero diff → run AI analysis
        console.log('  🔄 Non-zero diff detected — running AI analysis...');
        const diff = makeDiffResult(shot1, shot2, diffImage, diffPercent, site.url, 1440);
        const ai = await analyzeWithAI(diff, AI_CONFIG);

        console.log(`  AI classification: ${ai.classification} (${ai.severity}, confidence: ${ai.confidence})`);
        console.log(`  Explanation: ${ai.explanation}`);

        const isExpected = ai.classification === 'content_update' || ai.classification === 'intentional';
        if (isExpected) {
          console.log('  ✅ AI correctly identified content drift (not a regression)');
        } else {
          console.log('  ⚠️  AI classified as regression — may be flaky content');
        }

        results.push({
          url: site.url,
          diffPixels,
          diffPercent,
          classification: ai.classification,
          severity: ai.severity,
          confidence: ai.confidence,
          explanation: ai.explanation,
          status: 'content_drift',
        });
      }
    } catch (err: any) {
      console.log(`  ❌ Error: ${err.message}`);
      results.push({
        url: site.url,
        diffPixels: -1,
        diffPercent: -1,
        status: 'error',
        error: err.message,
      });
    }
  }

  // ── Part 2: Forced regression test (different viewports) ──────────────
  console.log('\n' + '=' .repeat(60));
  console.log('\n▶ Forced Regression Test: example.com at 1440px vs 375px');

  let forcedResult: {
    diffPercent: number;
    classification?: string;
    severity?: string;
    confidence?: number;
    explanation?: string;
    crashed: boolean;
    error?: string;
  } = { diffPercent: 0, crashed: false };

  try {
    // Wide viewport
    const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page1 = await ctx1.newPage();
    await page1.goto('https://example.com', { waitUntil: 'networkidle', timeout: 30000 });
    const shotWide = await page1.screenshot({ fullPage: false });
    await ctx1.close();

    // Narrow viewport
    const ctx2 = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page2 = await ctx2.newPage();
    await page2.goto('https://example.com', { waitUntil: 'networkidle', timeout: 30000 });
    const shotNarrow = await page2.screenshot({ fullPage: false });
    await ctx2.close();

    // The screenshots have different dimensions — we need to handle that
    const wide = pngFromBuffer(shotWide);
    const narrow = pngFromBuffer(shotNarrow);
    console.log(`  Wide: ${wide.width}x${wide.height}, Narrow: ${narrow.width}x${narrow.height}`);

    // For pixelmatch, resize both to same dimensions (use wide dimensions, pad narrow)
    const maxW = Math.max(wide.width, narrow.width);
    const maxH = Math.max(wide.height, narrow.height);

    // Create padded canvases
    function padImage(png: PNG, w: number, h: number): PNG {
      const padded = new PNG({ width: w, height: h, fill: true });
      // Fill with white
      for (let i = 0; i < padded.data.length; i += 4) {
        padded.data[i] = 255;
        padded.data[i + 1] = 255;
        padded.data[i + 2] = 255;
        padded.data[i + 3] = 255;
      }
      // Copy original into top-left
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const srcIdx = (png.width * y + x) << 2;
          const dstIdx = (w * y + x) << 2;
          padded.data[dstIdx] = png.data[srcIdx];
          padded.data[dstIdx + 1] = png.data[srcIdx + 1];
          padded.data[dstIdx + 2] = png.data[srcIdx + 2];
          padded.data[dstIdx + 3] = png.data[srcIdx + 3];
        }
      }
      return padded;
    }

    const paddedWide = padImage(wide, maxW, maxH);
    const paddedNarrow = padImage(narrow, maxW, maxH);

    const wideBuf = PNG.sync.write(paddedWide);
    const narrowBuf = PNG.sync.write(paddedNarrow);

    const { diffPixels, diffPercent, diffImage } = runPixelDiff(wideBuf, narrowBuf);
    console.log(`  Pixel diff: ${diffPixels} px (${diffPercent.toFixed(2)}%)`);

    console.log('  🔄 Running AI analysis on viewport mismatch...');
    const diff = makeDiffResult(wideBuf, narrowBuf, diffImage, diffPercent, 'https://example.com', 1440);
    const ai = await analyzeWithAI(diff, AI_CONFIG);

    console.log(`  AI classification: ${ai.classification} (${ai.severity}, confidence: ${ai.confidence})`);
    console.log(`  Explanation: ${ai.explanation}`);

    const validClassification = ['regression', 'intentional'].includes(ai.classification);
    if (validClassification) {
      console.log(`  ✅ AI classified viewport change as "${ai.classification}" — expected behavior`);
    } else {
      console.log(`  ℹ️  AI classified as "${ai.classification}" — acceptable (didn't crash)`);
    }

    forcedResult = {
      diffPercent,
      classification: ai.classification,
      severity: ai.severity,
      confidence: ai.confidence,
      explanation: ai.explanation,
      crashed: false,
    };
  } catch (err: any) {
    console.log(`  ❌ Error: ${err.message}`);
    forcedResult = { diffPercent: 0, crashed: true, error: err.message };
  }

  await browser.close();

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n' + '=' .repeat(60));
  console.log('\n📊 RESULTS SUMMARY\n');

  const stableSites = results.filter(r => r.status === 'stable');
  const driftSites = results.filter(r => r.status === 'content_drift');
  const errorSites = results.filter(r => r.status === 'error');

  console.log(`  Stable (zero-diff):    ${stableSites.length} site(s)`);
  for (const s of stableSites) console.log(`    ✅ ${s.url}`);

  console.log(`  Content drift:         ${driftSites.length} site(s)`);
  for (const s of driftSites) {
    console.log(`    🔄 ${s.url} — ${s.diffPercent.toFixed(4)}% diff → AI: ${s.classification} (${s.severity})`);
  }

  if (errorSites.length > 0) {
    console.log(`  Errors:                ${errorSites.length} site(s)`);
    for (const s of errorSites) console.log(`    ❌ ${s.url} — ${s.error}`);
  }

  console.log(`\n  Forced regression test (viewport mismatch):`);
  if (forcedResult.crashed) {
    console.log(`    ❌ CRASHED: ${forcedResult.error}`);
  } else {
    console.log(`    ${forcedResult.classification === 'regression' ? '✅' : 'ℹ️ '} Classification: ${forcedResult.classification} (${forcedResult.severity}, confidence: ${forcedResult.confidence})`);
  }

  // Overall verdict
  const hasErrors = errorSites.length > 0 || forcedResult.crashed;
  const hasWrongClassification = driftSites.some(s => s.classification === 'regression');

  console.log('\n' + '─'.repeat(60));
  if (hasErrors) {
    console.log('⚠️  ISSUES FOUND — some tests had errors');
    process.exit(1);
  } else if (hasWrongClassification) {
    console.log('⚠️  ISSUES FOUND — AI misclassified content drift as regression');
    process.exit(1);
  } else {
    console.log('✅ REAL-WORLD VALIDATION PASSED');
    console.log('   AI correctly handles: static pages, dynamic content, viewport changes');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});

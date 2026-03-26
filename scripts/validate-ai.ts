#!/usr/bin/env npx tsx
/**
 * AI Vision Validation Framework
 *
 * Tests Frontguard's AI classification accuracy against ground-truth visual diffs.
 * Generates synthetic before/after screenshot pairs using pngjs, runs them through
 * the AI analysis pipeline, and compares classifications against expected ground truth.
 *
 * Run: npx tsx scripts/validate-ai.ts
 *
 * Environment:
 *   FRONTGUARD_OPENAI_KEY    — OpenAI API key (for provider: 'openai')
 *   FRONTGUARD_ANTHROPIC_KEY — Anthropic API key (for provider: 'anthropic')
 *   VALIDATION_PROVIDER      — 'openai' | 'anthropic' (default: 'openai')
 *   VALIDATION_MODEL         — model name (default: 'gpt-4o')
 *   VALIDATION_DELAY_MS      — delay between API calls to avoid rate limits (default: 1000)
 */

import * as fs from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { analyzeWithAI } from '../src/diff/ai-vision.js';
import type {
  DiffResult,
  AIAnalysis,
  AIConfig,
  ChangeClassification,
  Severity,
} from '../src/core/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationCase {
  name: string;
  description: string;
  /** Expected classification(s) — any match counts as correct */
  expectedClassification: ChangeClassification[] | 'pass';
  /** Expected severity(ies) — any match counts as correct */
  expectedSeverity: Severity[];
  beforeImage: Buffer;
  afterImage: Buffer;
}

interface ValidationResult {
  case: ValidationCase;
  gotClassification: ChangeClassification | 'pass' | 'error';
  gotSeverity: Severity | 'none';
  classificationMatch: boolean;
  severityMatch: boolean;
  explanation: string;
  confidence: number;
  duration: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROVIDER = (process.env.VALIDATION_PROVIDER ?? 'openai') as 'openai' | 'anthropic';
const MODEL = process.env.VALIDATION_MODEL ?? (PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514');
const DELAY_MS = parseInt(process.env.VALIDATION_DELAY_MS ?? '1500', 10);

const AI_CONFIG: AIConfig = { provider: PROVIDER, model: MODEL };

// ---------------------------------------------------------------------------
// Color palette for synthetic images
// ---------------------------------------------------------------------------

const COLORS = {
  white:      [255, 255, 255, 255] as const,
  black:      [0, 0, 0, 255] as const,
  darkGray:   [51, 51, 51, 255] as const,
  lightGray:  [240, 240, 240, 255] as const,
  medGray:    [200, 200, 200, 255] as const,
  blue:       [59, 130, 246, 255] as const,
  red:        [239, 68, 68, 255] as const,
  green:      [34, 197, 94, 255] as const,
  navy:       [30, 41, 59, 255] as const,
  slate:      [100, 116, 139, 255] as const,
  orange:     [249, 115, 22, 255] as const,
  purple:     [139, 92, 246, 255] as const,
  darkBg:     [15, 23, 42, 255] as const,
  darkCard:   [30, 41, 59, 255] as const,
  darkText:   [226, 232, 240, 255] as const,
  transparent:[0, 0, 0, 0] as const,
};

type RGBA = readonly [number, number, number, number];

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

function createPNG(width: number, height: number): PNG {
  const png = new PNG({ width, height });
  // Fill with white
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 255;
    png.data[i + 2] = 255;
    png.data[i + 3] = 255;
  }
  return png;
}

function fillRect(
  png: PNG,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGBA,
): void {
  for (let row = y; row < Math.min(y + h, png.height); row++) {
    for (let col = x; col < Math.min(x + w, png.width); col++) {
      const idx = (row * png.width + col) * 4;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }
}

/**
 * Draw a "text block" — a series of small horizontal bars simulating text lines.
 */
function drawTextBlock(
  png: PNG,
  x: number,
  y: number,
  lineWidth: number,
  numLines: number,
  lineHeight: number,
  color: RGBA,
): void {
  for (let i = 0; i < numLines; i++) {
    const w = lineWidth - Math.floor(Math.random() * 30); // vary line lengths
    fillRect(png, x, y + i * lineHeight, Math.max(w, 20), 4, color);
  }
}

/**
 * Draw a fixed "text block" with deterministic line widths.
 */
function drawTextBlockFixed(
  png: PNG,
  x: number,
  y: number,
  lineWidth: number,
  numLines: number,
  lineHeight: number,
  color: RGBA,
  seed: number = 42,
): void {
  // Simple deterministic pseudo-random
  let s = seed;
  const next = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s; };
  for (let i = 0; i < numLines; i++) {
    const w = lineWidth - (next() % 40);
    fillRect(png, x, y + i * lineHeight, Math.max(w, 20), 4, color);
  }
}

/**
 * Draw a navigation bar with "logo" and "menu items"
 */
function drawNavbar(
  png: PNG,
  bgColor: RGBA,
  textColor: RGBA,
  height: number = 56,
): void {
  fillRect(png, 0, 0, png.width, height, bgColor);
  // Logo placeholder
  fillRect(png, 20, 16, 80, 24, textColor);
  // Menu items
  const menuItems = [200, 280, 360, 440];
  for (const mx of menuItems) {
    if (mx + 60 < png.width) {
      fillRect(png, mx, 22, 50, 12, textColor);
    }
  }
}

/**
 * Draw a content card with heading, text, and a button
 */
function drawCard(
  png: PNG,
  x: number,
  y: number,
  w: number,
  h: number,
  bgColor: RGBA,
  textColor: RGBA,
  buttonColor: RGBA,
  buttonTextColor: RGBA,
): void {
  fillRect(png, x, y, w, h, bgColor);
  // Border
  fillRect(png, x, y, w, 2, COLORS.medGray);
  fillRect(png, x, y + h - 2, w, 2, COLORS.medGray);
  fillRect(png, x, y, 2, h, COLORS.medGray);
  fillRect(png, x + w - 2, y, 2, h, COLORS.medGray);
  // Heading
  fillRect(png, x + 20, y + 20, w - 40, 8, textColor);
  // Text lines
  drawTextBlockFixed(png, x + 20, y + 44, w - 40, 4, 14, textColor);
  // Button
  const btnW = 120;
  const btnH = 36;
  const btnX = x + 20;
  const btnY = y + h - btnH - 20;
  fillRect(png, btnX, btnY, btnW, btnH, buttonColor);
  fillRect(png, btnX + 15, btnY + 12, btnW - 30, 12, buttonTextColor);
}

/**
 * Draw a pricing label — "$XX" style block
 */
function drawPriceTag(
  png: PNG,
  x: number,
  y: number,
  large: boolean,
  color: RGBA,
): void {
  // Dollar sign
  fillRect(png, x, y, 12, 24, color);
  // Number
  const numW = large ? 40 : 32;
  fillRect(png, x + 16, y, numW, 24, color);
}

/**
 * Draw a simple sidebar
 */
function drawSidebar(
  png: PNG,
  x: number,
  y: number,
  w: number,
  h: number,
  bgColor: RGBA,
  itemColor: RGBA,
): void {
  fillRect(png, x, y, w, h, bgColor);
  for (let i = 0; i < 6; i++) {
    // Icon placeholder
    fillRect(png, x + 16, y + 20 + i * 44, 16, 16, itemColor);
    // Label
    fillRect(png, x + 44, y + 24 + i * 44, w - 64, 8, itemColor);
  }
}

/**
 * Draw a full page layout — nav, sidebar, main content, footer
 */
function drawFullPage(
  png: PNG,
  opts: {
    navBg?: RGBA;
    navText?: RGBA;
    pageBg?: RGBA;
    sidebarBg?: RGBA;
    sidebarText?: RGBA;
    cardBg?: RGBA;
    cardText?: RGBA;
    buttonColor?: RGBA;
    buttonText?: RGBA;
    showSidebar?: boolean;
    showFooter?: boolean;
    contentOffset?: { x: number; y: number };
  } = {},
): void {
  const {
    navBg = COLORS.navy,
    navText = COLORS.white,
    pageBg = COLORS.lightGray,
    sidebarBg = COLORS.white,
    sidebarText = COLORS.slate,
    cardBg = COLORS.white,
    cardText = COLORS.darkGray,
    buttonColor = COLORS.blue,
    buttonText = COLORS.white,
    showSidebar = true,
    showFooter = true,
    contentOffset = { x: 0, y: 0 },
  } = opts;

  // Page background
  fillRect(png, 0, 0, png.width, png.height, pageBg);

  // Navbar
  drawNavbar(png, navBg, navText);

  // Sidebar
  const sidebarW = showSidebar ? 200 : 0;
  if (showSidebar) {
    drawSidebar(png, 0, 56, sidebarW, png.height - 56, sidebarBg, sidebarText);
  }

  // Main content area
  const contentX = sidebarW + 24 + contentOffset.x;
  const contentY = 80 + contentOffset.y;
  const contentW = png.width - sidebarW - 48;

  // Card 1
  drawCard(
    png,
    contentX, contentY,
    contentW, 200,
    cardBg, cardText, buttonColor, buttonText,
  );

  // Card 2
  drawCard(
    png,
    contentX, contentY + 220,
    contentW, 180,
    cardBg, cardText, buttonColor, buttonText,
  );

  // Footer
  if (showFooter) {
    fillRect(png, 0, png.height - 48, png.width, 48, navBg);
    fillRect(png, 20, png.height - 30, 200, 10, navText);
  }
}

function pngToBuffer(png: PNG): Buffer {
  return PNG.sync.write(png);
}

function computeDiff(beforeBuf: Buffer, afterBuf: Buffer): Buffer {
  const before = PNG.sync.read(beforeBuf);
  const after = PNG.sync.read(afterBuf);
  const w = Math.max(before.width, after.width);
  const h = Math.max(before.height, after.height);

  // Pad if needed
  const padPng = (src: PNG, tw: number, th: number): PNG => {
    if (src.width === tw && src.height === th) return src;
    const padded = new PNG({ width: tw, height: th, fill: true });
    for (let y = 0; y < src.height; y++) {
      src.data.copy(padded.data, y * tw * 4, y * src.width * 4, y * src.width * 4 + src.width * 4);
    }
    return padded;
  };

  const b = padPng(before, w, h);
  const a = padPng(after, w, h);
  const diff = new PNG({ width: w, height: h });
  pixelmatch(b.data, a.data, diff.data, w, h, { threshold: 0.1 });
  return PNG.sync.write(diff);
}

// ---------------------------------------------------------------------------
// Test Case Generators
// ---------------------------------------------------------------------------

const W = 800;
const H = 600;

function genIdenticalPages(): Pick<ValidationCase, 'beforeImage' | 'afterImage'> {
  // Simple red square on white background — identical pair
  const png = createPNG(W, H);
  fillRect(png, 0, 0, W, H, COLORS.white);
  fillRect(png, 200, 150, 400, 300, COLORS.red);
  const buf = pngToBuffer(png);
  return { beforeImage: buf, afterImage: Buffer.from(buf) };
}

function genColorChange(): Pick<ValidationCase, 'beforeImage' | 'afterImage'> {
  const before = createPNG(W, H);
  drawFullPage(before, { buttonColor: COLORS.blue, buttonText: COLORS.white });

  const after = createPNG(W, H);
  drawFullPage(after, { buttonColor: COLORS.red, buttonText: COLORS.white });

  return { beforeImage: pngToBuffer(before), afterImage: pngToBuffer(after) };
}

function genTextContentUpdate(): Pick<ValidationCase, 'beforeImage' | 'afterImage'> {
  // Simulate a pricing page with "$49" → "$59" change
  const before = createPNG(W, H);
  drawFullPage(before);
  // Price area
  fillRect(before, 250, 160, 120, 50, COLORS.white); // Clear area
  drawPriceTag(before, 260, 170, false, COLORS.darkGray); // $49 (smaller block)

  const after = createPNG(W, H);
  drawFullPage(after);
  fillRect(after, 250, 160, 120, 50, COLORS.white); // Clear area
  drawPriceTag(after, 260, 170, true, COLORS.darkGray); // $59 (larger block)

  return { beforeImage: pngToBuffer(before), afterImage: pngToBuffer(after) };
}

function genLayoutBreak(): Pick<ValidationCase, 'beforeImage' | 'afterImage'> {
  const before = createPNG(W, H);
  drawFullPage(before);

  const after = createPNG(W, H);
  // Content shifted 50px right, breaking layout — cards overlap sidebar
  drawFullPage(after, { contentOffset: { x: 50, y: 0 } });
  // Also add an overlap — draw something that clips outside bounds
  fillRect(after, W - 10, 100, 60, 300, COLORS.red); // Overflow indicator

  return { beforeImage: pngToBuffer(before), afterImage: pngToBuffer(after) };
}

function genImageSwap(): Pick<ValidationCase, 'beforeImage' | 'afterImage'> {
  // "Image region" changes color — simulates swapping a hero image or product photo
  const before = createPNG(W, H);
  drawFullPage(before);
  // Hero "image" placeholder — a green region
  fillRect(before, 224, 64, W - 224 - 24, 160, COLORS.green);
  // Small caption text under the image
  drawTextBlockFixed(before, 244, 234, 200, 2, 12, COLORS.slate, 50);

  const after = createPNG(W, H);
  drawFullPage(after);
  // Same region but different color — a purple region (different "image")
  fillRect(after, 224, 64, W - 224 - 24, 160, COLORS.purple);
  // Same caption text
  drawTextBlockFixed(after, 244, 234, 200, 2, 12, COLORS.slate, 50);

  return { beforeImage: pngToBuffer(before), afterImage: pngToBuffer(after) };
}

function genMissingElement(): Pick<ValidationCase, 'beforeImage' | 'afterImage'> {
  // Nav bar present in before, completely removed in after
  const before = createPNG(W, H);
  drawFullPage(before);

  const after = createPNG(W, H);
  // Rebuild page without navbar — just fill background and draw content directly
  fillRect(after, 0, 0, W, H, COLORS.lightGray);
  // Skip navbar entirely — it's missing
  // Sidebar starts at y=0 instead of y=56
  drawSidebar(after, 0, 0, 200, H, COLORS.white, COLORS.slate);
  // Content cards shifted up (no nav)
  drawCard(after, 224, 24, W - 248, 200, COLORS.white, COLORS.darkGray, COLORS.blue, COLORS.white);
  drawCard(after, 224, 244, W - 248, 180, COLORS.white, COLORS.darkGray, COLORS.blue, COLORS.white);
  // Footer still present
  fillRect(after, 0, H - 48, W, 48, COLORS.navy);
  fillRect(after, 20, H - 30, 200, 10, COLORS.white);

  return { beforeImage: pngToBuffer(before), afterImage: pngToBuffer(after) };
}

function genAddedElement(): Pick<ValidationCase, 'beforeImage' | 'afterImage'> {
  const before = createPNG(W, H);
  drawFullPage(before);

  const after = createPNG(W, H);
  drawFullPage(after);
  // New banner at top of content area
  fillRect(after, 224, 64, W - 224 - 24, 32, COLORS.green);
  // Banner "text"
  fillRect(after, 244, 72, 200, 12, COLORS.white);
  // Badge on card
  fillRect(after, W - 100, 90, 60, 24, COLORS.orange);
  fillRect(after, W - 94, 96, 48, 12, COLORS.white);

  return { beforeImage: pngToBuffer(before), afterImage: pngToBuffer(after) };
}

function genResponsiveBreakage(): Pick<ValidationCase, 'beforeImage' | 'afterImage'> {
  // Simulate mobile-width viewport with content overflow
  const mobileW = 375;
  const before = createPNG(mobileW, H);
  fillRect(before, 0, 0, mobileW, H, COLORS.lightGray);
  drawNavbar(before, COLORS.navy, COLORS.white, 48);
  // Properly sized content
  drawCard(before, 12, 60, mobileW - 24, 200, COLORS.white, COLORS.darkGray, COLORS.blue, COLORS.white);
  drawCard(before, 12, 280, mobileW - 24, 180, COLORS.white, COLORS.darkGray, COLORS.blue, COLORS.white);

  const after = createPNG(mobileW, H);
  fillRect(after, 0, 0, mobileW, H, COLORS.lightGray);
  drawNavbar(after, COLORS.navy, COLORS.white, 48);
  // Cards are too wide — overflow past viewport edge
  drawCard(after, 12, 60, mobileW + 100, 200, COLORS.white, COLORS.darkGray, COLORS.blue, COLORS.white);
  // Second card overlaps first
  drawCard(after, 12, 200, mobileW - 24, 180, COLORS.white, COLORS.darkGray, COLORS.blue, COLORS.white);
  // Visible overflow indicator
  fillRect(after, mobileW - 5, 60, 5, 300, COLORS.red);

  return { beforeImage: pngToBuffer(before), afterImage: pngToBuffer(after) };
}

function genDarkModeToggle(): Pick<ValidationCase, 'beforeImage' | 'afterImage'> {
  const before = createPNG(W, H);
  drawFullPage(before, {
    navBg: COLORS.navy,
    navText: COLORS.white,
    pageBg: COLORS.lightGray,
    sidebarBg: COLORS.white,
    sidebarText: COLORS.slate,
    cardBg: COLORS.white,
    cardText: COLORS.darkGray,
    buttonColor: COLORS.blue,
    buttonText: COLORS.white,
  });

  const after = createPNG(W, H);
  drawFullPage(after, {
    navBg: COLORS.darkBg,
    navText: COLORS.darkText,
    pageBg: COLORS.darkBg,
    sidebarBg: COLORS.darkCard,
    sidebarText: COLORS.darkText,
    cardBg: COLORS.darkCard,
    cardText: COLORS.darkText,
    buttonColor: COLORS.blue,
    buttonText: COLORS.white,
  });

  return { beforeImage: pngToBuffer(before), afterImage: pngToBuffer(after) };
}

function genSubtleSpacing(): Pick<ValidationCase, 'beforeImage' | 'afterImage'> {
  const before = createPNG(W, H);
  drawFullPage(before);

  const after = createPNG(W, H);
  // 5px shift in content — subtle spacing change
  drawFullPage(after, { contentOffset: { x: 0, y: 5 } });

  return { beforeImage: pngToBuffer(before), afterImage: pngToBuffer(after) };
}

// ---------------------------------------------------------------------------
// Build all test cases
// ---------------------------------------------------------------------------

function buildTestCases(): ValidationCase[] {
  return [
    // 1. Identical images (red square) → expect no regression
    {
      name: 'Identical images (red square)',
      description: 'Two pixel-identical red squares on white — should pass gate, no AI needed',
      expectedClassification: 'pass',
      expectedSeverity: ['info'],
      ...genIdenticalPages(),
    },
    // 2. Color change (blue→red button area) → expect regression/critical
    {
      name: 'Color change (blue→red button)',
      description: 'All CTA buttons changed from blue to red — likely a regression or unintended change',
      expectedClassification: ['regression'],
      expectedSeverity: ['critical', 'warning'],
      ...genColorChange(),
    },
    // 3. Content change (different text-block positions) → expect content_update
    {
      name: 'Content change ($49→$59)',
      description: 'Price value changed — content update, not a visual bug',
      expectedClassification: ['content_update'],
      expectedSeverity: ['info', 'warning'],
      ...genTextContentUpdate(),
    },
    // 4. Layout break (shifted element) → expect regression/critical
    {
      name: 'Layout break (shifted 50px)',
      description: 'Main content shifted right with overflow — layout regression',
      expectedClassification: ['regression'],
      expectedSeverity: ['critical'],
      ...genLayoutBreak(),
    },
    // 5. Missing element (nav bar removed) → expect regression/critical
    {
      name: 'Missing element (nav bar removed)',
      description: 'Top navigation bar completely removed — critical regression',
      expectedClassification: ['regression'],
      expectedSeverity: ['critical'],
      ...genMissingElement(),
    },
    // 6. Added element (new banner) → expect intentional
    {
      name: 'Added element (banner + badge)',
      description: 'New promotional banner and badge added — intentional change',
      expectedClassification: ['intentional', 'content_update'],
      expectedSeverity: ['info', 'warning'],
      ...genAddedElement(),
    },
    // 7. Spacing change (subtle 5px shift) → expect intentional/info
    {
      name: 'Spacing change (5px shift)',
      description: 'Subtle 5px margin change in content area — intentional refinement',
      expectedClassification: ['intentional'],
      expectedSeverity: ['info'],
      ...genSubtleSpacing(),
    },
    // 8. Full theme change (light→dark) → expect intentional
    {
      name: 'Theme change (light→dark)',
      description: 'Full light→dark color scheme change — intentional theme switch',
      expectedClassification: ['intentional'],
      expectedSeverity: ['info'],
      ...genDarkModeToggle(),
    },
    // 9. Overflow (wider element) → expect regression/warning
    {
      name: 'Overflow (wider element)',
      description: 'Mobile layout broken — cards overflow viewport and overlap each other',
      expectedClassification: ['regression'],
      expectedSeverity: ['critical', 'warning'],
      ...genResponsiveBreakage(),
    },
    // 10. Image swap (different colored region) → expect content_update
    {
      name: 'Image swap (color region)',
      description: 'Hero image region changed from green to purple — content update',
      expectedClassification: ['content_update'],
      expectedSeverity: ['info', 'warning'],
      ...genImageSwap(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function makeDiffResult(
  beforeBuf: Buffer,
  afterBuf: Buffer,
  diffBuf: Buffer,
  diffPercentage: number,
): DiffResult {
  return {
    route: { path: '/validation-test' },
    viewport: W,
    browser: 'chromium',
    status: diffPercentage === 0 ? 'pass' : 'changed',
    diffPercentage,
    diffImage: diffBuf,
    baselineImage: beforeBuf,
    currentImage: afterBuf,
  };
}

function computeDiffPercentage(beforeBuf: Buffer, afterBuf: Buffer): number {
  const before = PNG.sync.read(beforeBuf);
  const after = PNG.sync.read(afterBuf);

  if (before.width !== after.width || before.height !== after.height) {
    return 100; // dimension mismatch → definitely different
  }

  const total = before.width * before.height;
  const diff = new PNG({ width: before.width, height: before.height });
  const numDiff = pixelmatch(before.data, after.data, diff.data, before.width, before.height, { threshold: 0.1 });
  return total > 0 ? (numDiff / total) * 100 : 0;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runValidation(): Promise<void> {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════════════════╗');
  console.log('  ║          FRONTGUARD — AI VALIDATION FRAMEWORK                ║');
  console.log('  ╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── Preflight checks ────────────────────────────────────────────────
  const envVar = PROVIDER === 'openai' ? 'FRONTGUARD_OPENAI_KEY' : 'FRONTGUARD_ANTHROPIC_KEY';
  if (!process.env[envVar] || process.env[envVar]!.trim() === '') {
    console.error(`  ❌ Missing API key: ${envVar}`);
    console.error('');
    console.error('  To run AI validation, set one of:');
    console.error('    export FRONTGUARD_OPENAI_KEY=sk-...');
    console.error('    export FRONTGUARD_ANTHROPIC_KEY=sk-ant-...');
    console.error('');
    console.error('  Then optionally configure:');
    console.error('    export VALIDATION_PROVIDER=openai|anthropic');
    console.error('    export VALIDATION_MODEL=gpt-4o');
    console.error('    export VALIDATION_DELAY_MS=1500');
    console.error('');
    process.exit(1);
  }

  console.log(`  Provider: ${PROVIDER} / ${MODEL}`);
  console.log(`  Delay between calls: ${DELAY_MS}ms`);
  console.log('');

  // ── Build cases ─────────────────────────────────────────────────────
  console.log('  Generating synthetic test images...');
  const cases = buildTestCases();
  console.log(`  Generated ${cases.length} validation cases.`);
  console.log('');

  // ── Run each case ───────────────────────────────────────────────────
  const results: ValidationResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const caseNum = `[${i + 1}/${cases.length}]`;
    process.stdout.write(`  ${caseNum} ${tc.name}...`);

    const start = Date.now();

    // Check for identical images (pass gate)
    const diffPct = computeDiffPercentage(tc.beforeImage, tc.afterImage);

    if (diffPct === 0) {
      // Identical — should be 'pass' gate
      const duration = Date.now() - start;
      const isCorrect = tc.expectedClassification === 'pass';
      results.push({
        case: tc,
        gotClassification: 'pass',
        gotSeverity: 'none',
        classificationMatch: isCorrect,
        severityMatch: true, // N/A for pass
        explanation: 'Images are pixel-identical — passed diff gate',
        confidence: 1.0,
        duration,
      });
      console.log(` PASS (${duration}ms) ${isCorrect ? '✓' : '✗'}`);
      continue;
    }

    // Generate diff image
    const diffImageBuf = computeDiff(tc.beforeImage, tc.afterImage);
    const diffResult = makeDiffResult(tc.beforeImage, tc.afterImage, diffImageBuf, diffPct);

    try {
      const analysis: AIAnalysis = await analyzeWithAI(diffResult, AI_CONFIG);
      const duration = Date.now() - start;

      const classMatch =
        tc.expectedClassification === 'pass'
          ? false // should have been caught above
          : tc.expectedClassification.includes(analysis.classification);

      const sevMatch = tc.expectedSeverity.includes(analysis.severity);

      results.push({
        case: tc,
        gotClassification: analysis.classification,
        gotSeverity: analysis.severity,
        classificationMatch: classMatch,
        severityMatch: sevMatch,
        explanation: analysis.explanation,
        confidence: analysis.confidence,
        duration,
      });

      const mark = classMatch && sevMatch ? '✓' : classMatch ? '~' : '✗';
      console.log(` ${analysis.classification}/${analysis.severity} (${duration}ms) ${mark}`);
    } catch (err) {
      const duration = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);

      results.push({
        case: tc,
        gotClassification: 'error',
        gotSeverity: 'none',
        classificationMatch: false,
        severityMatch: false,
        explanation: '',
        confidence: 0,
        duration,
        error: msg,
      });

      console.log(` ERROR (${duration}ms)`);
      console.log(`         ${msg.substring(0, 120)}`);
    }

    // Rate limit delay between API calls
    if (i < cases.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // ── Results table ──────────────────────────────────────────────────
  printResults(results);
}

// ---------------------------------------------------------------------------
// Results formatting
// ---------------------------------------------------------------------------

function printResults(results: ValidationResult[]): void {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('  ║                         AI VALIDATION RESULTS                                ║');
  console.log('  ╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  #   Case                          Expected             Got                Match');
  console.log('  ─── ───────────────────────────── ──────────────────── ────────────────── ─────');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const num = String(i + 1).padStart(2);
    const name = r.case.name.padEnd(30).substring(0, 30);

    let expected: string;
    if (r.case.expectedClassification === 'pass') {
      expected = 'pass';
    } else {
      expected = r.case.expectedClassification.join('|');
    }
    expected = (expected + '/' + r.case.expectedSeverity.join('|')).padEnd(20).substring(0, 20);

    const got = r.error
      ? 'ERROR'.padEnd(18)
      : (`${r.gotClassification}/${r.gotSeverity}`).padEnd(18).substring(0, 18);

    let mark: string;
    if (r.error) {
      mark = '⚠';
    } else if (r.classificationMatch && r.severityMatch) {
      mark = '✓';
    } else if (r.classificationMatch) {
      mark = '~';
    } else {
      mark = '✗';
    }

    console.log(`  ${num}  ${name} ${expected} ${got} ${mark}`);
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const total = results.length;
  const errors = results.filter((r) => r.error).length;
  const classCorrect = results.filter((r) => r.classificationMatch).length;
  const sevCorrect = results.filter((r) => r.severityMatch).length;
  const bothCorrect = results.filter((r) => r.classificationMatch && r.severityMatch).length;

  console.log('  ─── ───────────────────────────── ──────────────────── ────────────────── ─────');
  console.log('');
  console.log(`  Classification accuracy: ${classCorrect}/${total} (${pct(classCorrect, total)}%)`);
  console.log(`  Severity accuracy:       ${sevCorrect}/${total} (${pct(sevCorrect, total)}%)`);
  console.log(`  Full match (both):       ${bothCorrect}/${total} (${pct(bothCorrect, total)}%)`);
  if (errors > 0) {
    console.log(`  Errors:                  ${errors}/${total}`);
  }
  console.log('');

  // ── Detailed mismatches ─────────────────────────────────────────────
  const mismatches = results.filter((r) => !r.classificationMatch || !r.severityMatch);
  if (mismatches.length > 0) {
    console.log('  MISMATCHES:');
    console.log('  ──────────');
    for (const r of mismatches) {
      console.log(`    ${r.case.name}:`);
      if (r.error) {
        console.log(`      Error: ${r.error.substring(0, 200)}`);
      } else {
        const exp = r.case.expectedClassification === 'pass'
          ? 'pass'
          : r.case.expectedClassification.join('|');
        console.log(`      Expected: ${exp}/${r.case.expectedSeverity.join('|')}`);
        console.log(`      Got:      ${r.gotClassification}/${r.gotSeverity} (confidence: ${(r.confidence * 100).toFixed(0)}%)`);
        console.log(`      Reason:   ${r.explanation.substring(0, 150)}`);
      }
      console.log('');
    }
  }

  // ── JSON output for CI ──────────────────────────────────────────────
  const jsonResults = {
    timestamp: new Date().toISOString(),
    provider: PROVIDER,
    model: MODEL,
    summary: {
      total,
      classificationAccuracy: pct(classCorrect, total),
      severityAccuracy: pct(sevCorrect, total),
      fullMatchAccuracy: pct(bothCorrect, total),
      errors,
    },
    cases: results.map((r) => ({
      name: r.case.name,
      expectedClassification: r.case.expectedClassification,
      expectedSeverity: r.case.expectedSeverity,
      gotClassification: r.gotClassification,
      gotSeverity: r.gotSeverity,
      classificationMatch: r.classificationMatch,
      severityMatch: r.severityMatch,
      confidence: r.confidence,
      explanation: r.explanation,
      duration: r.duration,
      error: r.error,
    })),
  };

  const outPath = `validation-results/synthetic-${PROVIDER}-${Date.now()}.json`;
  try {
    fs.mkdirSync('validation-results', { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(jsonResults, null, 2));
    console.log(`  Results saved: ${outPath}`);
  } catch {
    // Non-fatal — just print to stdout
    console.log('  (Could not save results file — printing JSON to stdout)');
    console.log(JSON.stringify(jsonResults, null, 2));
  }

  console.log('');

  // Exit code: fail if classification accuracy < 60%
  const classAccuracy = classCorrect / total;
  if (classAccuracy < 0.6) {
    console.log(`  ❌ FAIL: Classification accuracy ${(classAccuracy * 100).toFixed(0)}% is below 60% threshold`);
    process.exit(1);
  } else {
    console.log(`  ✅ PASS: Classification accuracy ${(classAccuracy * 100).toFixed(0)}% meets threshold`);
  }
}

function pct(n: number, total: number): string {
  if (total === 0) return '0';
  return ((n / total) * 100).toFixed(0);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

runValidation().catch((err) => {
  console.error('');
  console.error('  ❌ Validation framework crashed:');
  console.error(`     ${err instanceof Error ? err.message : String(err)}`);
  console.error('');
  process.exit(2);
});

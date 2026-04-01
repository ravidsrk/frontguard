#!/usr/bin/env npx tsx
/**
 * Real-World AI Validation (Phase 2)
 *
 * Clone open-source repos, checkout PR branches, render before/after screenshots,
 * run AI analysis, and compare against human-labeled ground truth.
 *
 * This validates Frontguard's AI classification on real-world visual changes
 * from actual pull requests — the ultimate accuracy benchmark.
 *
 * Usage:
 *   npx tsx scripts/validate-ai-real.ts --repo <owner/repo> --pr <number>
 *   npx tsx scripts/validate-ai-real.ts --repo vercel/next.js --pr 12345
 *   npx tsx scripts/validate-ai-real.ts --batch ground-truth.json
 *
 * Environment:
 *   FRONTGUARD_OPENAI_KEY    — OpenAI API key
 *   FRONTGUARD_ANTHROPIC_KEY — Anthropic API key
 *   VALIDATION_PROVIDER      — 'openai' | 'anthropic' (default: 'openai')
 *   VALIDATION_MODEL         — model name (default: 'gpt-4o')
 *   GITHUB_TOKEN             — GitHub token for API access (optional, for private repos)
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { analyzeWithAI } from '../src/diff/ai-vision.js';
import type { DiffResult, Route } from '../src/core/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Human-labeled ground truth for a PR's visual changes */
interface GroundTruth {
  repo: string;
  pr: number;
  title: string;
  routes: GroundTruthRoute[];
}

/** Ground truth for a specific route in a PR */
interface GroundTruthRoute {
  /** Route path that has visual changes (e.g. '/pricing') */
  path: string;
  /** Expected AI classification */
  expectedClassification: 'regression' | 'intentional' | 'content_update';
  /** Expected severity */
  expectedSeverity: 'critical' | 'warning' | 'info';
  /** Human description of what changed */
  description: string;
}

/** Result of validating a single PR */
interface PRValidationResult {
  repo: string;
  pr: number;
  timestamp: string;
  baseRef: string;
  headRef: string;
  routes: RouteValidationResult[];
  summary: {
    total: number;
    classificationCorrect: number;
    severityCorrect: number;
    errors: number;
  };
}

/** Result for a single route within a PR */
interface RouteValidationResult {
  path: string;
  expectedClassification: string;
  expectedSeverity: string;
  gotClassification: string | null;
  gotSeverity: string | null;
  classificationMatch: boolean;
  severityMatch: boolean;
  aiExplanation: string | null;
  confidence: number | null;
  diffPercentage: number | null;
  error: string | null;
}

/** PR metadata from GitHub API */
interface PRInfo {
  title: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  htmlUrl: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROVIDER = (process.env.VALIDATION_PROVIDER ?? 'openai') as 'openai' | 'anthropic';
const MODEL = process.env.VALIDATION_MODEL ?? (PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514');
const RESULTS_DIR = 'validation-results';

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

interface CLIArgs {
  mode: 'single' | 'batch';
  repo?: string;
  pr?: number;
  batchFile?: string;
  groundTruthFile?: string;
  baseUrl?: string;
  routes?: string[];
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = { mode: 'single' };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--repo':
        result.repo = args[++i];
        break;
      case '--pr':
        result.pr = parseInt(args[++i], 10);
        break;
      case '--batch':
        result.mode = 'batch';
        result.batchFile = args[++i];
        break;
      case '--ground-truth':
        result.groundTruthFile = args[++i];
        break;
      case '--base-url':
        result.baseUrl = args[++i];
        break;
      case '--routes':
        result.routes = args[++i]?.split(',');
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
  Real-World AI Validation for Frontguard

  Usage:
    npx tsx scripts/validate-ai-real.ts --repo <owner/repo> --pr <number> [options]
    npx tsx scripts/validate-ai-real.ts --batch <ground-truth.json>

  Options:
    --repo <owner/repo>     GitHub repository (e.g. vercel/next.js)
    --pr <number>           Pull request number
    --batch <file>          JSON file with multiple PRs and ground truth
    --ground-truth <file>   JSON file with expected classifications for routes
    --base-url <url>        Override the base URL for rendering (default: detect from repo)
    --routes <paths>        Comma-separated route paths to test (default: /)
    --help, -h              Show this help message

  Environment Variables:
    FRONTGUARD_OPENAI_KEY     OpenAI API key
    FRONTGUARD_ANTHROPIC_KEY  Anthropic API key
    VALIDATION_PROVIDER       AI provider: 'openai' | 'anthropic'
    VALIDATION_MODEL          AI model name
    GITHUB_TOKEN              GitHub token for API access

  Examples:
    # Validate a single PR
    npx tsx scripts/validate-ai-real.ts --repo shadcn-ui/ui --pr 1234

    # Validate with ground truth expectations
    npx tsx scripts/validate-ai-real.ts --repo shadcn-ui/ui --pr 1234 \\
      --ground-truth ground-truth/shadcn-1234.json

    # Batch validation
    npx tsx scripts/validate-ai-real.ts --batch validation-cases/batch.json

  Ground Truth File Format:
    {
      "repo": "owner/repo",
      "pr": 1234,
      "title": "Fix button styles",
      "routes": [
        {
          "path": "/components/button",
          "expectedClassification": "regression",
          "expectedSeverity": "critical",
          "description": "Button border-radius changed from 8px to 0"
        }
      ]
    }
  `);
}

// ---------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------

async function fetchPRInfo(repo: string, pr: number): Promise<PRInfo> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'frontguard-validation',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${repo}/pulls/${pr}`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub API error (${response.status}): ${body.substring(0, 200)}`);
  }

  const data = await response.json() as {
    title: string;
    base: { ref: string; sha: string };
    head: { ref: string; sha: string };
    html_url: string;
  };

  return {
    title: data.title,
    baseRef: data.base.ref,
    headRef: data.head.ref,
    baseSha: data.base.sha,
    headSha: data.head.sha,
    htmlUrl: data.html_url,
  };
}

// ---------------------------------------------------------------------------
// Repository Operations
// ---------------------------------------------------------------------------

function cloneRepo(repo: string, targetDir: string): void {
  const token = process.env.GITHUB_TOKEN;
  // Use shallow clone for speed
  const cloneUrl = token
    ? `https://x-access-token:${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`;

  console.log(`  Cloning ${repo} (shallow)...`);
  execSync(`git clone --depth 50 ${cloneUrl} ${targetDir}`, {
    stdio: 'pipe',
    timeout: 120_000,
  });
}

function checkoutRef(repoDir: string, ref: string): void {
  try {
    execSync(`git checkout ${ref}`, { cwd: repoDir, stdio: 'pipe', timeout: 30_000 });
  } catch {
    // Try fetching the ref first
    execSync(`git fetch origin ${ref} --depth=50`, { cwd: repoDir, stdio: 'pipe', timeout: 60_000 });
    execSync(`git checkout FETCH_HEAD`, { cwd: repoDir, stdio: 'pipe', timeout: 30_000 });
  }
}

// ---------------------------------------------------------------------------
// Screenshot Rendering (Scaffold)
// ---------------------------------------------------------------------------

/**
 * Detect the framework used in a repository by checking for known config files.
 */
function detectFramework(repoDir: string): 'next' | 'vite' | 'remix' | 'nuxt' | 'unknown' {
  const checks: Array<{ file: string; framework: 'next' | 'vite' | 'remix' | 'nuxt' }> = [
    { file: 'next.config.js', framework: 'next' },
    { file: 'next.config.mjs', framework: 'next' },
    { file: 'next.config.ts', framework: 'next' },
    { file: 'remix.config.js', framework: 'remix' },
    { file: 'remix.config.ts', framework: 'remix' },
    { file: 'vite.config.js', framework: 'vite' },
    { file: 'vite.config.ts', framework: 'vite' },
    { file: 'nuxt.config.ts', framework: 'nuxt' },
    { file: 'nuxt.config.js', framework: 'nuxt' },
  ];
  for (const { file, framework } of checks) {
    if (fs.existsSync(path.join(repoDir, file))) return framework;
  }
  return 'unknown';
}

/**
 * Install dependencies in a repository directory.
 */
function installDeps(repoDir: string): void {
  const hasYarnLock = fs.existsSync(path.join(repoDir, 'yarn.lock'));
  const hasPnpmLock = fs.existsSync(path.join(repoDir, 'pnpm-lock.yaml'));

  const cmd = hasPnpmLock ? 'pnpm install --frozen-lockfile' :
    hasYarnLock ? 'yarn install --frozen-lockfile' :
    'npm ci --ignore-scripts';

  console.log(`    Installing dependencies (${cmd.split(' ')[0]})...`);
  try {
    execSync(cmd, { cwd: repoDir, stdio: 'pipe', timeout: 180_000 });
  } catch {
    // Fallback to non-strict install
    const fallback = hasPnpmLock ? 'pnpm install' :
      hasYarnLock ? 'yarn install' : 'npm install';
    execSync(fallback, { cwd: repoDir, stdio: 'pipe', timeout: 180_000 });
  }
}

/**
 * Start a dev server and return the base URL and a cleanup function.
 */
function startDevServer(
  repoDir: string,
  framework: string,
  baseUrl?: string,
): { url: string; cleanup: () => void } {
  if (baseUrl) {
    return { url: baseUrl, cleanup: () => {} };
  }

  const port = 3099 + Math.floor(Math.random() * 900);
  const cmdMap: Record<string, string> = {
    next: `npx next dev -p ${port}`,
    vite: `npx vite --port ${port}`,
    remix: `npx remix dev --port ${port}`,
    nuxt: `npx nuxi dev --port ${port}`,
    unknown: `npx serve -l ${port} -s`,
  };
  const cmd = cmdMap[framework] ?? cmdMap.unknown;
  console.log(`    Starting dev server on port ${port}...`);

  const child = require('node:child_process').spawn(cmd, {
    cwd: repoDir,
    shell: true,
    stdio: 'pipe',
    detached: true,
  });

  const cleanup = () => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Process already exited
    }
  };

  return { url: `http://localhost:${port}`, cleanup };
}

/**
 * Wait for a URL to become reachable.
 */
async function waitForServer(url: string, maxAttempts = 30, intervalMs = 2000): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (resp.ok || resp.status === 404) return true; // Server is up
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Render screenshots for a set of routes using Playwright.
 *
 * 1. Detects the framework (Next.js, Vite, etc.)
 * 2. Installs dependencies
 * 3. Starts the dev server
 * 4. Uses Playwright to capture screenshots at 1440px viewport
 * 5. Returns PNG buffers keyed by route
 */
async function renderScreenshots(
  repoDir: string,
  routes: string[],
  baseUrl?: string,
): Promise<Map<string, Buffer>> {
  const screenshots = new Map<string, Buffer>();
  const framework = detectFramework(repoDir);
  console.log(`    Framework detected: ${framework}`);

  // Install dependencies
  try {
    installDeps(repoDir);
  } catch (err) {
    console.error(`    ⚠ Dependency install failed: ${err instanceof Error ? err.message : String(err)}`);
    return screenshots;
  }

  // Start dev server
  const server = startDevServer(repoDir, framework, baseUrl);

  try {
    if (!baseUrl) {
      console.log(`    Waiting for server at ${server.url}...`);
      const ready = await waitForServer(server.url);
      if (!ready) {
        console.error('    ⚠ Dev server did not start within timeout');
        return screenshots;
      }
    }

    // Capture screenshots with Playwright
    let playwright;
    try {
      playwright = await import('playwright');
    } catch {
      console.error('    ⚠ Playwright not available — install with: npx playwright install chromium');
      return screenshots;
    }

    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      for (const route of routes) {
        const url = `${server.url}${route}`;
        try {
          console.log(`    Capturing ${route}...`);
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
          // Disable animations for stable screenshots
          await page.addStyleTag({
            content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
          });
          await page.waitForTimeout(500);
          const buffer = await page.screenshot({ fullPage: true, type: 'png' });
          screenshots.set(route, Buffer.from(buffer));
        } catch (err) {
          console.error(`    ⚠ Failed to capture ${route}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await context.close();
    } finally {
      await browser.close();
    }
  } finally {
    server.cleanup();
  }

  return screenshots;
}

// ---------------------------------------------------------------------------
// Validation Pipeline
// ---------------------------------------------------------------------------

async function validatePR(
  repo: string,
  pr: number,
  groundTruth?: GroundTruth,
  baseUrl?: string,
  routes?: string[],
): Promise<PRValidationResult> {
  console.log('');
  console.log(`  ═══════════════════════════════════════════════════`);
  console.log(`  Validating: ${repo} #${pr}`);
  console.log(`  ═══════════════════════════════════════════════════`);
  console.log('');

  // 1. Fetch PR metadata
  console.log('  Fetching PR info...');
  const prInfo = await fetchPRInfo(repo, pr);
  console.log(`  Title:  ${prInfo.title}`);
  console.log(`  Base:   ${prInfo.baseRef} (${prInfo.baseSha.substring(0, 8)})`);
  console.log(`  Head:   ${prInfo.headRef} (${prInfo.headSha.substring(0, 8)})`);
  console.log('');

  // 2. Clone to temp dir
  const tmpDir = path.join(os.tmpdir(), `frontguard-validate-${repo.replace('/', '-')}-${pr}`);
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }

  try {
    cloneRepo(repo, tmpDir);

    // 3. Determine routes to test
    const testRoutes = routes ?? groundTruth?.routes.map((r) => r.path) ?? ['/'];
    console.log(`  Routes to test: ${testRoutes.join(', ')}`);
    console.log('');

    // 4. Checkout base branch and render
    console.log(`  Checking out base: ${prInfo.baseRef}...`);
    checkoutRef(tmpDir, prInfo.baseSha);
    const baseScreenshots = await renderScreenshots(tmpDir, testRoutes, baseUrl);

    // 5. Checkout PR branch and render
    console.log(`  Checking out head: ${prInfo.headRef}...`);
    checkoutRef(tmpDir, prInfo.headSha);
    const headScreenshots = await renderScreenshots(tmpDir, testRoutes, baseUrl);

    // 6. Run pixel diff + AI analysis for each route
    const routeResults: RouteValidationResult[] = [];

    for (const routePath of testRoutes) {
      const baseBuf = baseScreenshots.get(routePath);
      const headBuf = headScreenshots.get(routePath);
      const gt = groundTruth?.routes.find((r) => r.path === routePath);

      if (!baseBuf || !headBuf) {
        routeResults.push({
          path: routePath,
          expectedClassification: gt?.expectedClassification ?? 'unknown',
          expectedSeverity: gt?.expectedSeverity ?? 'unknown',
          gotClassification: null,
          gotSeverity: null,
          classificationMatch: false,
          severityMatch: false,
          aiExplanation: null,
          confidence: null,
          diffPercentage: null,
          error: `Missing screenshot: base=${!!baseBuf}, head=${!!headBuf} — rendering may have failed`,
        });
        continue;
      }

      try {
        // Decode PNGs for pixel comparison
        const basePng = PNG.sync.read(baseBuf);
        const headPng = PNG.sync.read(headBuf);

        // Handle dimension mismatches by using the larger canvas
        const width = Math.max(basePng.width, headPng.width);
        const height = Math.max(basePng.height, headPng.height);

        // Create normalized buffers (pad smaller image with transparent pixels)
        const normalizeToSize = (png: PNG, w: number, h: number): Buffer => {
          if (png.width === w && png.height === h) return png.data as unknown as Buffer;
          const out = Buffer.alloc(w * h * 4, 0);
          for (let y = 0; y < png.height && y < h; y++) {
            for (let x = 0; x < png.width && x < w; x++) {
              const srcIdx = (png.width * y + x) << 2;
              const dstIdx = (w * y + x) << 2;
              out[dstIdx] = png.data[srcIdx];
              out[dstIdx + 1] = png.data[srcIdx + 1];
              out[dstIdx + 2] = png.data[srcIdx + 2];
              out[dstIdx + 3] = png.data[srcIdx + 3];
            }
          }
          return out;
        };

        const baseData = normalizeToSize(basePng, width, height);
        const headData = normalizeToSize(headPng, width, height);
        const diffData = Buffer.alloc(width * height * 4);

        const numDiffPixels = pixelmatch(
          new Uint8Array(baseData),
          new Uint8Array(headData),
          new Uint8Array(diffData),
          width,
          height,
          { threshold: 0.1 },
        );

        const totalPixels = width * height;
        const diffPercentage = totalPixels > 0 ? (numDiffPixels / totalPixels) * 100 : 0;

        // Encode diff image as PNG
        const diffPng = new PNG({ width, height });
        diffPng.data = diffData as unknown as Buffer;
        const diffImageBuf = PNG.sync.write(diffPng);

        // Build a DiffResult for the AI analysis
        const route: Route = { path: routePath };
        const diffResult: DiffResult = {
          route,
          viewport: 1440,
          browser: 'chromium',
          status: diffPercentage > 10 ? 'changed' : diffPercentage > 0 ? 'warning' : 'pass',
          diffPercentage,
          diffImage: diffImageBuf,
          baselineImage: baseBuf,
          currentImage: headBuf,
        };

        // Run AI analysis
        const aiResult = await analyzeWithAI(diffResult, { provider: PROVIDER, model: MODEL });

        routeResults.push({
          path: routePath,
          expectedClassification: gt?.expectedClassification ?? 'unknown',
          expectedSeverity: gt?.expectedSeverity ?? 'unknown',
          gotClassification: aiResult.classification,
          gotSeverity: aiResult.severity,
          classificationMatch: gt ? aiResult.classification === gt.expectedClassification : false,
          severityMatch: gt ? aiResult.severity === gt.expectedSeverity : false,
          aiExplanation: aiResult.explanation,
          confidence: aiResult.confidence,
          diffPercentage,
          error: null,
        });
      } catch (err) {
        routeResults.push({
          path: routePath,
          expectedClassification: gt?.expectedClassification ?? 'unknown',
          expectedSeverity: gt?.expectedSeverity ?? 'unknown',
          gotClassification: null,
          gotSeverity: null,
          classificationMatch: false,
          severityMatch: false,
          aiExplanation: null,
          confidence: null,
          diffPercentage: null,
          error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // 7. Build result
    const result: PRValidationResult = {
      repo,
      pr,
      timestamp: new Date().toISOString(),
      baseRef: prInfo.baseRef,
      headRef: prInfo.headRef,
      routes: routeResults,
      summary: {
        total: routeResults.length,
        classificationCorrect: routeResults.filter((r) => r.classificationMatch).length,
        severityCorrect: routeResults.filter((r) => r.severityMatch).length,
        errors: routeResults.filter((r) => r.error !== null).length,
      },
    };

    return result;
  } finally {
    // Cleanup temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {
      // Non-fatal
    }
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function saveResult(result: PRValidationResult): string {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const filename = `real-${result.repo.replace('/', '-')}-pr${result.pr}-${Date.now()}.json`;
  const filepath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  return filepath;
}

function printResult(result: PRValidationResult): void {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║            REAL-WORLD VALIDATION RESULTS          ║');
  console.log('  ╚═══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Repo: ${result.repo} PR #${result.pr}`);
  console.log(`  Base: ${result.baseRef} → Head: ${result.headRef}`);
  console.log('');

  for (const route of result.routes) {
    const status = route.error ? '⚠' : route.classificationMatch ? '✓' : '✗';
    console.log(`  ${status} ${route.path}`);
    if (route.error) {
      console.log(`    Error: ${route.error}`);
    } else {
      console.log(`    Expected: ${route.expectedClassification}/${route.expectedSeverity}`);
      console.log(`    Got:      ${route.gotClassification}/${route.gotSeverity}`);
      if (route.aiExplanation) {
        console.log(`    Reason:   ${route.aiExplanation.substring(0, 120)}`);
      }
    }
    console.log('');
  }

  console.log(`  Summary: ${result.summary.classificationCorrect}/${result.summary.total} classification correct`);
  console.log(`           ${result.summary.severityCorrect}/${result.summary.total} severity correct`);
  console.log(`           ${result.summary.errors} errors`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════════════════╗');
  console.log('  ║     FRONTGUARD — REAL-WORLD AI VALIDATION (Phase 2)          ║');
  console.log('  ╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Provider: ${PROVIDER} / ${MODEL}`);
  console.log('');

  if (args.mode === 'batch') {
    // Batch mode: read multiple PRs from a JSON file
    if (!args.batchFile) {
      console.error('  ❌ --batch requires a JSON file path');
      process.exit(1);
    }

    const batchData = JSON.parse(fs.readFileSync(args.batchFile, 'utf-8')) as GroundTruth[];
    console.log(`  Batch mode: ${batchData.length} PRs to validate`);
    console.log('');

    const allResults: PRValidationResult[] = [];
    for (const gt of batchData) {
      try {
        const result = await validatePR(gt.repo, gt.pr, gt, args.baseUrl, args.routes);
        allResults.push(result);
        printResult(result);
        const filepath = saveResult(result);
        console.log(`  Saved: ${filepath}`);
      } catch (err) {
        console.error(`  ❌ Failed to validate ${gt.repo} #${gt.pr}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Aggregate summary
    const totalRoutes = allResults.reduce((s, r) => s + r.summary.total, 0);
    const totalCorrect = allResults.reduce((s, r) => s + r.summary.classificationCorrect, 0);
    console.log('');
    console.log('  ═══════════════════════════════════════════════════');
    console.log(`  AGGREGATE: ${totalCorrect}/${totalRoutes} classification correct across ${allResults.length} PRs`);
    console.log('  ═══════════════════════════════════════════════════');
  } else {
    // Single PR mode
    if (!args.repo || !args.pr) {
      console.error('  ❌ --repo and --pr are required for single PR validation');
      console.error('     Example: npx tsx scripts/validate-ai-real.ts --repo shadcn-ui/ui --pr 1234');
      console.error('');
      printUsage();
      process.exit(1);
    }

    // Load ground truth if provided
    let groundTruth: GroundTruth | undefined;
    if (args.groundTruthFile) {
      groundTruth = JSON.parse(fs.readFileSync(args.groundTruthFile, 'utf-8')) as GroundTruth;
    }

    const result = await validatePR(args.repo, args.pr, groundTruth, args.baseUrl, args.routes);
    printResult(result);
    const filepath = saveResult(result);
    console.log(`  Results saved: ${filepath}`);
  }
}

main().catch((err) => {
  console.error('');
  console.error('  ❌ Real-world validation crashed:');
  console.error(`     ${err instanceof Error ? err.message : String(err)}`);
  console.error('');
  process.exit(2);
});

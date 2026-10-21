/**
 * Local pixel and selection measurement for validation/run-external.sh --pixel.
 *
 * Builds the CLI from a git archive into a temp dir (node_modules symlink
 * stays in that temp dir). Does not switch any checkout.
 * update-baselines is invoked for the baseline pass and its stdout is
 * checked for a JSON run result — the command does not emit one.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import {
  PIXEL_VALIDATION_SEED,
  PIXEL_VIEWPORTS,
  SELECTION_ROUTES,
  SELECTION_SCENARIOS,
  renderPixelApp,
  renderSelection,
  writeTree,
} from './mutate.mjs';

const RUN_TIMEOUT_MS = 8 * 60 * 1000;
const here = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function git(cwd, args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
  }
  return (res.stdout || '').trim();
}

function archiveCli(srcRoot, destRoot) {
  mkdirSync(destRoot, { recursive: true });
  const archived = spawnSync('git', ['-C', srcRoot, 'archive', '--format=tar', 'HEAD', 'packages/cli'], {
    maxBuffer: 128 * 1024 * 1024,
  });
  if (archived.status !== 0) {
    throw new Error(archived.stderr?.toString() || 'git archive failed');
  }
  const extracted = spawnSync('tar', ['-x', '-C', destRoot], { input: archived.stdout });
  if (extracted.status !== 0) {
    throw new Error(extracted.stderr?.toString() || 'tar extract failed');
  }
}

function buildCli({ srcRoot, nodeModules, label }) {
  const dest = mkdtempSync(join(tmpdir(), `frontguard-${label}-`));
  archiveCli(srcRoot, dest);
  symlinkSync(nodeModules, join(dest, 'node_modules'));
  const tsup = join(nodeModules, 'tsup/dist/cli-default.js');
  const built = spawnSync(process.execPath, [tsup], {
    cwd: join(dest, 'packages/cli'),
    stdio: 'inherit',
    timeout: 180000,
  });
  const bin = join(dest, 'packages/cli/dist/cli/index.js');
  if (built.status !== 0 || !existsSync(bin)) {
    throw new Error(`${label} CLI build failed with status ${built.status}`);
  }
  const version = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' });
  const pkg = JSON.parse(readFileSync(join(dest, 'packages/cli/package.json'), 'utf8'));
  const sha = git(srcRoot, ['rev-parse', 'HEAD']);
  const branch = git(srcRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const bundle = readFileSync(bin, 'utf8');
  return {
    label,
    tmp: dest,
    bin,
    sha,
    branch,
    packageVersion: pkg.version,
    versionOutput: (version.stdout || '').trim(),
    containsUntracedStaticAsset: bundle.includes('untraced static asset'),
  };
}

function requireFrom(bin, spec) {
  return createRequire(bin)(spec);
}

async function probeBrowser(bin) {
  let chromium;
  try {
    ({ chromium } = requireFrom(bin, 'playwright'));
  } catch (err) {
    return { launched: false, error: `playwright import failed: ${err.message}` };
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const version = browser.version();
    const executablePath = chromium.executablePath();
    await browser.close();
    return { launched: true, version, executablePath, engine: 'chromium' };
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    return { launched: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function pixelmatchVersion(bin) {
  try {
    return requireFrom(bin, 'pixelmatch/package.json').version;
  } catch (err) {
    return `unresolved: ${err.message}`;
  }
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.woff')) return 'font/woff';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function startServer(root) {
  const routes = JSON.parse(readFileSync(join(root, 'routes.json'), 'utf8'));
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    const rel = routes[pathname];
    if (!rel) {
      res.writeHead(404, { connection: 'close' });
      res.end('not found');
      return;
    }
    const file = join(root, rel);
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404, { connection: 'close' });
      res.end('missing');
      return;
    }
    res.writeHead(200, {
      'content-type': contentType(file),
      'cache-control': 'no-store',
      connection: 'close',
    });
    res.end(readFileSync(file));
  });
  // Playwright waits for networkidle. A keep-alive socket to this process
  // never goes idle, so every capture hit pageTimeout. Close each response.
  server.keepAliveTimeout = 1;
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function baseUrlOf(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function writeConfig(file, { baseUrl, routes, smartRender, viewports }) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({
    version: 1,
    baseUrl,
    routes,
    viewports,
    browsers: ['chromium'],
    threshold: 0.1,
    smartRender,
    telemetry: false,
    // One capture at a time. The default of 4 shares this process's server
    // and makes sub-threshold pixel noise harder to read.
    workers: 1,
    outputDir: join(tmpdir(), 'frontguard-validation-report'),
  }, null, 2)}\n`);
}

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra, FRONTGUARD_TELEMETRY: '0' };
  const preload = join(here, 'flush-exit.cjs');
  const existing = env.NODE_OPTIONS ?? '';
  if (!existing.includes(preload)) {
    env.NODE_OPTIONS = `${existing} --require ${preload}`.trim();
  }
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']) {
    delete env[key];
  }
  return env;
}

function parseRunJson(stdout) {
  const values = [];
  let i = 0;
  while (i < stdout.length) {
    const start = stdout.indexOf('{', i);
    if (start === -1) break;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let j = start; j < stdout.length; j++) {
      const c = stdout[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') {
        inStr = true;
        continue;
      }
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) break;
    try {
      values.push(JSON.parse(stdout.slice(start, end + 1)));
    } catch {
      // Keep scanning. A `{` inside a log line is not a run document.
    }
    i = end + 1;
  }
  for (let n = values.length - 1; n >= 0; n--) {
    const parsed = values[n];
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.diffs)) return parsed;
  }
  return null;
}

// The fixture HTTP server runs in this process. spawnSync would block it,
// and Playwright's networkidle would hit pageTimeout on every route.
function runCli(bin, args, cwd, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env });
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    const finish = (status, signal, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      resolve({
        status: status ?? null,
        signal: signal ?? null,
        stdout,
        stderr,
        error: error ? String(error.message || error) : null,
        json: parseRunJson(stdout),
      });
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(null, 'SIGTERM', new Error(`CLI timed out after ${RUN_TIMEOUT_MS}ms`));
    }, RUN_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk);
    });
    child.on('error', (error) => finish(null, null, error));
    child.on('close', (status, signal) => finish(status, signal, null));
  });
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function filterReason(stderr) {
  const lines = stripAnsi(stderr).split('\n').map((line) => line.trim()).filter((line) => line.includes('Smart filter:'));
  if (lines.length === 0) return null;
  return lines[lines.length - 1].replace(/^.*?Smart filter:\s*/, '');
}

function initRepo(dir) {
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.email', 'validation@frontguard.dev']);
  git(dir, ['config', 'user.name', 'Frontguard Validation']);
  commitAll(dir, 'validation: clean fixture');
}

function commitAll(dir, message) {
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-m', message]);
}

function changedSinceParent(dir) {
  return git(dir, ['diff', '--name-only', 'HEAD~1']).split('\n').filter(Boolean);
}

function readManifest(dir) {
  const res = spawnSync('git', ['show', 'frontguard-baselines:manifest.json'], { cwd: dir, encoding: 'utf8' });
  if (res.status !== 0) {
    return { present: false, error: (res.stderr || '').trim() };
  }
  try {
    const manifest = JSON.parse(res.stdout);
    return {
      present: true,
      keys: Object.keys(manifest),
      fingerprintPresent: Object.prototype.hasOwnProperty.call(manifest, 'fingerprint'),
      createdBy: manifest.createdBy ?? null,
      schemaVersion: manifest.schemaVersion ?? null,
    };
  } catch (err) {
    return { present: false, error: err.message };
  }
}

function compactDiff(diff) {
  return {
    route: diff.route,
    viewport: diff.viewport,
    browser: diff.browser,
    status: diff.status,
    diffPercentage: diff.diffPercentage,
    comparisonMethod: diff.comparisonMethod ?? null,
    ssimOverride: diff.ssimOverride === true,
    ssim: diff.ssim ?? null,
    hasBaselineImage: diff.hasBaselineImage === true,
    error: diff.error ?? null,
  };
}

function diffsOf(run) {
  if (!run?.json?.diffs) return [];
  return run.json.diffs.map(compactDiff);
}

function countStatuses(diffs) {
  const counts = { pass: 0, changed: 0, regression: 0, new: 0, error: 0, other: 0, ssimOverride: 0, pixelmatch: 0 };
  for (const diff of diffs) {
    if (counts[diff.status] === undefined) counts.other += 1;
    else counts[diff.status] += 1;
    if (diff.ssimOverride) counts.ssimOverride += 1;
    if (diff.comparisonMethod === 'pixelmatch') counts.pixelmatch += 1;
  }
  return counts;
}

function byRouteViewport(diffs) {
  const map = new Map();
  for (const diff of diffs) {
    if (!map.has(diff.route)) map.set(diff.route, {});
    map.get(diff.route)[diff.viewport] = diff;
  }
  return map;
}

/**
 * Gate catch: pixelmatch status `regression` (over the 10% ratio).
 * `changed` is under the ratio and does not fail the process.
 * ssimOverride flips a borderline diff to pass — counted, not treated as a catch.
 */
function scoreOperator(op, viewportMap) {
  const rows = {};
  let caught = 0;
  let errors = 0;
  const unexpected = [];
  for (const vp of PIXEL_VIEWPORTS) {
    const row = viewportMap[vp] ?? null;
    rows[vp] = row;
    const expected = op.expectedViewports.includes(vp);
    if (!row) {
      if (expected) errors += 1;
      continue;
    }
    const gateFail = row.status === 'regression' && row.ssimOverride !== true;
    if (expected) {
      if (row.status === 'error') errors += 1;
      else if (gateFail) caught += 1;
    } else if (gateFail) {
      unexpected.push(vp);
    }
  }
  const comparable = op.expectedViewports.length - errors;
  let outcome = 'not-recall';
  if (op.class === 'nuisance') outcome = 'nuisance';
  else if (op.expectedViewports.length === 0) outcome = 'not-recall';
  else if (comparable === 0) outcome = 'error';
  else if (errors === 0 && caught === op.expectedViewports.length) outcome = 'caught';
  else if (caught === 0) outcome = 'missed';
  else outcome = 'partial';
  return { outcome, caught, errors, unexpected, byViewport: rows };
}

function recallBuckets(scored) {
  const buckets = { 1: [], 2: [], 3: [] };
  for (const row of scored) {
    if (row.class === 'nuisance' || row.bucket == null) continue;
    buckets[row.bucket].push(row);
  }
  const summarize = (rows) => ({
    denominator: rows.length,
    caught: rows.filter((row) => row.outcome === 'caught').length,
    partial: rows.filter((row) => row.outcome === 'partial').length,
    missed: rows.filter((row) => row.outcome === 'missed').length,
    error: rows.filter((row) => row.outcome === 'error').length,
  });
  return { 1: summarize(buckets[1]), 2: summarize(buckets[2]), 3: summarize(buckets[3]) };
}

function routeSet(diffs) {
  return [...new Set(diffs.map((diff) => diff.route))].sort();
}

function observableRoutes(diffs) {
  const routes = new Set();
  for (const diff of diffs) {
    if (diff.status === 'regression' || diff.status === 'changed') routes.add(diff.route);
  }
  return [...routes].sort();
}

async function withServer(root, fn) {
  const server = await startServer(root);
  try {
    return await fn(server);
  } finally {
    await stopServer(server);
  }
}

async function measurePixel(bin, outDir) {
  const root = mkdtempSync(join(tmpdir(), 'frontguard-pixel-app-'));
  const clean = renderPixelApp(null);
  writeTree(root, clean.files);
  initRepo(root);
  const configPath = join(outDir, 'pixel.config.json');
  const routes = Object.keys(clean.routes);
  const baseline = await withServer(root, async (server) => {
    writeConfig(configPath, {
      baseUrl: baseUrlOf(server),
      routes,
      smartRender: false,
      viewports: PIXEL_VIEWPORTS,
    });
    return runCli(bin, ['update-baselines', '--config', configPath], root, childEnv());
  });
  const manifest = readManifest(root);
  const recheck = await withServer(root, async (server) => {
    writeConfig(configPath, {
      baseUrl: baseUrlOf(server),
      routes,
      smartRender: false,
      viewports: PIXEL_VIEWPORTS,
    });
    return runCli(bin, ['run', '--config', configPath, '--output', 'json'], root, childEnv({
      FRONTGUARD_DISABLE_BYTE_COMPARE: '1',
    }));
  });
  const mutated = renderPixelApp(PIXEL_VALIDATION_SEED);
  writeTree(root, mutated.files);
  commitAll(root, 'validation: seeded mutations');
  const mutatedRun = await withServer(root, async (server) => {
    writeConfig(configPath, {
      baseUrl: baseUrlOf(server),
      routes,
      smartRender: false,
      viewports: PIXEL_VIEWPORTS,
    });
    return runCli(bin, ['run', '--config', configPath, '--output', 'json'], root, childEnv({
      FRONTGUARD_DISABLE_BYTE_COMPARE: '1',
    }));
  });
  rmSync(root, { recursive: true, force: true });

  if (!mutatedRun.json) {
    writeFileSync(join(outDir, 'mutated-stdout.txt'), mutatedRun.stdout);
    writeFileSync(join(outDir, 'mutated-stderr.txt'), mutatedRun.stderr);
  }

  const recheckDiffs = diffsOf(recheck);
  const mutatedDiffs = diffsOf(mutatedRun);
  const grouped = byRouteViewport(mutatedDiffs);
  const scored = mutated.plan.operators.map((op) => {
    const score = scoreOperator(op, grouped.get(op.route) ?? {});
    return {
      id: op.id,
      kind: op.kind,
      class: op.class,
      route: op.route,
      bucket: op.bucket,
      expectedViewports: op.expectedViewports,
      ...score,
    };
  });
  return {
    seed: PIXEL_VALIDATION_SEED,
    plan: mutated.plan,
    updateBaselines: {
      exitStatus: baseline.status,
      stdoutBytes: baseline.stdout.length,
      emittedRunJson: baseline.json != null,
      stderrTail: baseline.stderr.slice(-500),
    },
    manifest,
    recheck: {
      exitStatus: recheck.status,
      error: recheck.error,
      stdoutBytes: recheck.stdout.length,
      counts: countStatuses(recheckDiffs),
      diffs: recheckDiffs,
      filterReason: filterReason(recheck.stderr),
    },
    mutated: {
      exitStatus: mutatedRun.status,
      error: mutatedRun.error,
      stdoutBytes: mutatedRun.stdout.length,
      parsed: mutatedRun.json != null,
      counts: countStatuses(mutatedDiffs),
      diffs: mutatedDiffs,
      filterReason: filterReason(mutatedRun.stderr),
    },
    operators: scored,
    recallByViewportBucket: recallBuckets(scored),
    nuisance: scored.filter((row) => row.class === 'nuisance'),
  };
}

async function measureSelection(bin, outDir) {
  if (!bin) {
    return { ran: false, reason: 'filter CLI was not built' };
  }
  const root = mkdtempSync(join(tmpdir(), 'frontguard-selection-app-'));
  writeTree(root, renderSelection(null).files);
  initRepo(root);
  const cleanSha = git(root, ['rev-parse', 'HEAD']);
  const configPath = join(outDir, 'selection.config.json');
  const baseline = await withServer(root, async (server) => {
    writeConfig(configPath, {
      baseUrl: baseUrlOf(server),
      routes: SELECTION_ROUTES,
      smartRender: false,
      viewports: [1440],
    });
    return runCli(bin, ['update-baselines', '--config', configPath], root, childEnv());
  });
  const scenarios = [];
  for (const name of SELECTION_SCENARIOS) {
    git(root, ['reset', '--hard', cleanSha]);
    git(root, ['clean', '-fd']);
    writeTree(root, renderSelection({ seed: PIXEL_VALIDATION_SEED, name }).files);
    commitAll(root, `validation: ${name}`);
    const changedFiles = changedSinceParent(root);
    const runMode = async (smartRender) => withServer(root, async (server) => {
      writeConfig(configPath, {
        baseUrl: baseUrlOf(server),
        routes: SELECTION_ROUTES,
        smartRender,
        viewports: [1440],
      });
      return runCli(bin, ['run', '--config', configPath, '--output', 'json'], root, childEnv({
        FRONTGUARD_DISABLE_BYTE_COMPARE: '1',
      }));
    });
    const full = await runMode(false);
    const filtered = await runMode(true);
    const fullDiffs = diffsOf(full);
    const filteredDiffs = diffsOf(filtered);
    const observable = observableRoutes(fullDiffs);
    const selected = routeSet(filteredDiffs);
    const omissions = observable.filter((route) => !selected.includes(route));
    scenarios.push({
      name,
      changedFiles,
      fullExit: full.status,
      filteredExit: filtered.status,
      fullError: full.error,
      filteredError: filtered.error,
      fullFilterReason: filterReason(full.stderr),
      filteredFilterReason: filterReason(filtered.stderr),
      fullRoutes: routeSet(fullDiffs),
      filteredRoutes: selected,
      observableRoutes: observable,
      omissionCount: omissions.length,
      omissionDenominator: observable.length,
      omissions,
      fullDiffs,
      filteredDiffs,
    });
  }
  rmSync(root, { recursive: true, force: true });
  const omissionCount = scenarios.reduce((sum, row) => sum + row.omissionCount, 0);
  const omissionDenominator = scenarios.reduce((sum, row) => sum + row.omissionDenominator, 0);
  return {
    ran: true,
    viewports: [1440],
    updateBaselinesEmittedRunJson: baseline.json != null,
    scenarios,
    omissionCount,
    omissionDenominator,
  };
}

function osFacts() {
  const sw = spawnSync('sw_vers', { encoding: 'utf8' });
  const uname = spawnSync('uname', ['-m'], { encoding: 'utf8' });
  return {
    swVers: sw.status === 0 ? sw.stdout.trim() : null,
    arch: (uname.stdout || '').trim() || null,
    node: process.version,
    platform: process.platform,
  };
}

async function main() {
  const outDir = arg('--out');
  const repoRoot = arg('--repo-root');
  const filterSrc = arg('--filter-src');
  const nodeModules = arg('--node-modules');
  if (!outDir || !repoRoot || !nodeModules) {
    throw new Error('usage: run-local.mjs --out DIR --repo-root DIR --node-modules DIR [--filter-src DIR]');
  }
  mkdirSync(outDir, { recursive: true });
  const builds = [];
  const pixel = buildCli({ srcRoot: repoRoot, nodeModules, label: 'pixel' });
  builds.push(pixel);
  if (process.argv.includes('--build-only')) {
    writeFileSync(join(outDir, 'cli-paths.json'), `${JSON.stringify({
      pixelBin: pixel.bin,
      pixelTmp: pixel.tmp,
      filterTmp: null,
    }, null, 2)}\n`);
    console.log(`build-only pixel CLI ${pixel.packageVersion} ${pixel.sha}`);
    return;
  }
  let filter = null;
  let filterError = null;
  const skipSelection = process.argv.includes('--skip-selection');
  if (skipSelection) {
    filterError = 'selection skipped on this invocation';
  } else if (filterSrc) {
    try {
      filter = buildCli({ srcRoot: filterSrc, nodeModules, label: 'filter' });
      builds.push(filter);
    } catch (err) {
      filterError = err instanceof Error ? err.message : String(err);
    }
  } else {
    filterError = 'FRONTGUARD_FILTER_SRC was not set';
  }
  const browser = await probeBrowser(pixel.bin);
  let pixelArm = null;
  let pixelError = null;
  try {
    pixelArm = await measurePixel(pixel.bin, outDir);
  } catch (err) {
    pixelError = err instanceof Error ? err.stack || err.message : String(err);
  }
  let selection = null;
  let selectionError = filterError;
  if (skipSelection) {
    selection = { ran: false, reason: 'skipped' };
  } else if (filter) {
    try {
      selection = await measureSelection(filter.bin, outDir);
      selectionError = null;
    } catch (err) {
      selectionError = err instanceof Error ? err.stack || err.message : String(err);
      selection = { ran: false, reason: selectionError };
    }
  } else {
    selection = { ran: false, reason: filterError };
  }
  const summary = {
    seed: PIXEL_VALIDATION_SEED,
    aiEnabled: false,
    threshold: 0.1,
    viewports: PIXEL_VIEWPORTS,
    browsersConfigured: ['chromium'],
    firefoxRan: false,
    webkitRan: false,
    os: osFacts(),
    pixelCli: {
      packageVersion: pixel.packageVersion,
      versionOutput: pixel.versionOutput,
      gitSha: pixel.sha,
      branch: pixel.branch,
      bin: pixel.bin,
      tmp: pixel.tmp,
      pixelmatchVersion: pixelmatchVersion(pixel.bin),
      containsUntracedStaticAsset: pixel.containsUntracedStaticAsset,
    },
    filterCli: filter ? {
      packageVersion: filter.packageVersion,
      versionOutput: filter.versionOutput,
      gitSha: filter.sha,
      branch: filter.branch,
      bin: filter.bin,
      tmp: filter.tmp,
      containsUntracedStaticAsset: filter.containsUntracedStaticAsset,
    } : null,
    filterError,
    browser,
    pixelError,
    pixel: pixelArm,
    selectionError,
    selection,
    antiFlakeRenders: null,
    consensusNote: 'antiFlakeRenders was not set (CLI default 1). The multi-render consensus loop did not run, so no consensus disagreement was observed. The flaky status exists and was not assigned.',
  };
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(outDir, 'cli-paths.json'), `${JSON.stringify({
    pixelBin: pixel.bin,
    pixelTmp: pixel.tmp,
    filterTmp: filter?.tmp ?? null,
  }, null, 2)}\n`);
  if (pixelError) {
    console.error(pixelError);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

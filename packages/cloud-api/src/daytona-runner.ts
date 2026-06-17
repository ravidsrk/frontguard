import { Daytona } from '@daytonaio/sdk';
import type { SuggestedFix } from './types.js';
import { orphanBaselinePath } from './storage/screenshots.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal R2 surface {@link restoreBaselines} needs to fetch baseline bytes. */
export interface BaselineBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

/** A single prior baseline screenshot to restore into the sandbox. */
export interface BaselineToRestore {
  route: string;
  viewport: number;
  browser: string;
  /** R2 object key holding the baseline PNG bytes. */
  r2Key: string;
}

/**
 * Prior baselines to seed into the sandbox before `frontguard run`. The caller
 * (the `/v1/run` handler) resolves the project's approved-baseline run and its
 * screenshot records — the route metadata lives in D1, not recoverable from the
 * R2 key slug — and hands them here with the R2 bucket to read the bytes from.
 */
export interface BaselineRestore {
  bucket: BaselineBucket;
  baselines: BaselineToRestore[];
}

export interface RunRequest {
  url: string;
  routes: Array<{ path: string }>;
  viewports: number[];
  browsers: string[];
  threshold: number;
  ai?: { provider: string; model?: string };
  openaiKey?: string;
  /** Daytona API key — Workers must pass it explicitly (no Node env). */
  daytonaApiKey?: string;
  /**
   * Prior baselines to restore before the run (cloud-1). When absent (first run
   * for a project, or no R2 binding), the run proceeds with no baselines and
   * every screenshot is a new baseline — the previous, regression-blind
   * behaviour.
   */
  baselineRestore?: BaselineRestore;
}

/** A screenshot PNG downloaded from the sandbox, awaiting persistence. */
export interface SandboxScreenshot {
  /** Reporter image basename, e.g. `home_1440_chromium_0_baseline`. */
  name: string;
  type: 'baseline' | 'current' | 'diff';
  bytes: Uint8Array;
}

export interface RunResult {
  results: Array<{
    route: string;
    viewport: number;
    browser: string;
    status: string;
    diffPercentage: number;
    classification?: string;
    explanation?: string;
    timestamp: string;
    /** AI-generated fix emitted by the CLI report, when present. */
    suggestedFix?: SuggestedFix;
  }>;
  reportHtml: string;
  duration: number;
  /** Screenshot PNGs downloaded from `{outputDir}/images/` (may be empty). */
  screenshots: SandboxScreenshot[];
}

// ---------------------------------------------------------------------------
// Snapshot name — pre-baked sandbox with Playwright + Frontguard installed
// ---------------------------------------------------------------------------
const FRONTGUARD_SNAPSHOT = 'frontguard-playwright-v1';

// ---------------------------------------------------------------------------
// Execute a Frontguard run inside a Daytona sandbox
// ---------------------------------------------------------------------------

export async function executeInSandbox(request: RunRequest): Promise<RunResult> {
  // The SDK falls back to a DAYTONA_API_KEY shell variable on Node, but
  // Workers has no Node env — the caller must pass the key from the
  // Worker env binding.
  const daytona = new Daytona(request.daytonaApiKey ? { apiKey: request.daytonaApiKey } : undefined);

  // Try to create from pre-baked snapshot first, fall back to fresh image
  let sandbox;
  let needsInstall = false;

  try {
    sandbox = await daytona.create(
      {
        snapshot: FRONTGUARD_SNAPSHOT,
        language: 'typescript',
        envVars: {
          ...(request.openaiKey ? { FRONTGUARD_OPENAI_KEY: request.openaiKey } : {}),
        },
        autoStopInterval: 5, // 5 min idle auto-stop
        autoDeleteInterval: 10, // 10 min auto-delete safety net
        ephemeral: true,
        labels: { service: 'frontguard', type: 'run' },
      },
      { timeout: 30 },
    );
  } catch {
    // Snapshot doesn't exist yet — create from base image
    sandbox = await daytona.create(
      {
        image: 'node:20-bookworm',
        resources: {
          cpu: 2,
          memory: 4, // 4 GiB for Chromium
          disk: 10,
        },
        language: 'typescript',
        envVars: {
          ...(request.openaiKey ? { FRONTGUARD_OPENAI_KEY: request.openaiKey } : {}),
        },
        autoStopInterval: 5,
        autoDeleteInterval: 10,
        ephemeral: true,
        labels: { service: 'frontguard', type: 'run' },
      },
      { timeout: 120 },
    );
    needsInstall = true;
  }

  try {
    const homeDir = (await sandbox.getUserHomeDir()) ?? '/home/daytona';

    // If no snapshot, install Playwright + Frontguard from scratch
    if (needsInstall) {
      await sandbox.process.executeCommand(
        'npx playwright install --with-deps chromium',
        undefined,
        undefined,
        120,
      );
      await sandbox.process.executeCommand(
        'npm install -g @frontguard/cli@latest',
        undefined,
        undefined,
        60,
      );
    }

    // Build frontguard config
    const config = {
      baseUrl: request.url,
      routes: request.routes,
      viewports: request.viewports,
      browsers: request.browsers || ['chromium'],
      threshold: request.threshold || 0.01,
      ...(request.ai ? { ai: request.ai } : {}),
    };

    const configPath = `${homeDir}/frontguard.config.json`;
    const outputDir = `${homeDir}/output`;

    // Restore prior baselines from R2 into the sandbox and seed them into the
    // CLI's git orphan branch BEFORE the run, so regressions can be detected
    // instead of every screenshot being a new baseline (cloud-1). Best-effort:
    // any failure degrades to the prior new-baseline behaviour, never breaks
    // the run.
    try {
      const restored = await restoreBaselines(sandbox, request.baselineRestore, homeDir);
      if (restored > 0) {
        await seedBaselineOrphanBranch(sandbox, homeDir);
      }
    } catch {
      // Restore is advisory; proceed without baselines.
    }

    // Write config to sandbox filesystem
    await sandbox.fs.uploadFile(
      Buffer.from(JSON.stringify(config, null, 2)),
      configPath,
    );

    // Run frontguard inside the sandbox. cwd is pinned to homeDir so the CLI's
    // GitOrphanStorage(process.cwd()) resolves the repo we seeded above.
    const startTime = Date.now();
    const execResult = await sandbox.process.executeCommand(
      `frontguard run --config ${configPath} --reporter json --reporter html --output ${outputDir}`,
      homeDir,
      undefined,
      300, // 5 min max
    );
    const duration = Date.now() - startTime;

    // Read JSON results from sandbox
    let results: RunResult['results'] = [];
    try {
      const jsonBuffer = await sandbox.fs.downloadFile(`${outputDir}/results.json`);
      results = JSON.parse(jsonBuffer.toString());
    } catch {
      // JSON file not available — try parsing stdout
      try {
        results = JSON.parse(execResult.result || '[]');
      } catch {
        // Neither available — return empty
      }
    }

    // Read HTML report from sandbox
    let reportHtml = '<p>No report generated</p>';
    try {
      const htmlBuffer = await sandbox.fs.downloadFile(`${outputDir}/report.html`);
      reportHtml = htmlBuffer.toString();
    } catch {
      // Report not generated
    }

    // Download screenshot PNGs written by the reporter under output/images/.
    // Best-effort: a missing images dir simply yields no screenshots.
    const screenshots = await downloadScreenshots(sandbox, `${outputDir}/images`);

    return { results, reportHtml, duration, screenshots };
  } finally {
    // Always destroy the sandbox — best-effort cleanup
    try {
      await daytona.delete(sandbox);
    } catch {
      // Sandbox may already be deleted via ephemeral + autoDeleteInterval
    }
  }
}

// ---------------------------------------------------------------------------
// Baseline restore (cloud-1)
// ---------------------------------------------------------------------------

/** Minimal sandbox surface {@link restoreBaselines} uploads through. */
interface BaselineUploadSandbox {
  fs: { uploadFile(content: Buffer | Uint8Array, remotePath: string): Promise<unknown> };
}

/** Minimal sandbox surface {@link seedBaselineOrphanBranch} runs commands on. */
interface BaselineExecSandbox {
  process: {
    executeCommand(
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeout?: number,
    ): Promise<unknown>;
  };
}

/**
 * Download each prior baseline PNG from R2 and upload it into the sandbox at
 * the CLI's git-orphan baseline path (`baselines/<route>/<viewport>/<browser>.png`).
 * Exported for testing. Best-effort: a missing bucket or empty list yields zero
 * uploads and never throws. Returns the number of baselines staged.
 */
export async function restoreBaselines(
  sandbox: BaselineUploadSandbox,
  restore: BaselineRestore | undefined,
  workDir: string,
): Promise<number> {
  if (!restore || !restore.bucket || restore.baselines.length === 0) return 0;
  let count = 0;
  for (const b of restore.baselines) {
    try {
      const obj = await restore.bucket.get(b.r2Key);
      if (!obj) continue;
      const bytes = Buffer.from(await obj.arrayBuffer());
      const remotePath = `${workDir}/${orphanBaselinePath(b.route, b.viewport, b.browser)}`;
      await sandbox.fs.uploadFile(bytes, remotePath);
      count++;
    } catch {
      // Skip a baseline we couldn't fetch or upload — the run still proceeds.
    }
  }
  return count;
}

/**
 * Commit the staged `baselines/` tree into the `frontguard-baselines` orphan
 * branch the CLI reads from. Runs in {@link workDir}; identity is set inline so
 * a fresh sandbox with no git config can still commit.
 */
async function seedBaselineOrphanBranch(
  sandbox: BaselineExecSandbox,
  workDir: string,
): Promise<void> {
  const git = (args: string) =>
    sandbox.process.executeCommand(
      `git -c user.email=ci@frontguard.local -c user.name="Frontguard CI" ${args}`,
      workDir,
      undefined,
      60,
    );
  await git('init -q');
  await git('checkout -q --orphan frontguard-baselines');
  await git('add -A');
  await git('commit -q -m "Restore baselines"');
}

// ---------------------------------------------------------------------------
// Screenshot download
// ---------------------------------------------------------------------------

/** A minimal structural view of the Daytona sandbox filesystem we rely on. */
interface SandboxFs {
  fs: {
    listFiles(path: string): Promise<Array<{ name: string }>>;
    downloadFile(remotePath: string, timeout?: number): Promise<Buffer>;
  };
}

/** Maps a reporter image basename to its screenshot type. */
function screenshotTypeFromName(name: string): SandboxScreenshot['type'] | null {
  if (name.endsWith('_baseline')) return 'baseline';
  if (name.endsWith('_current')) return 'current';
  if (name.endsWith('_diff')) return 'diff';
  return null;
}

/**
 * Downloads every `*.png` written by the HTML reporter under `imagesDir`.
 * Exported for testing. Best-effort: returns `[]` if the directory is missing.
 */
export async function downloadScreenshots(
  sandbox: SandboxFs,
  imagesDir: string,
): Promise<SandboxScreenshot[]> {
  let entries: Array<{ name: string }>;
  try {
    entries = await sandbox.fs.listFiles(imagesDir);
  } catch {
    return [];
  }
  const out: SandboxScreenshot[] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith('.png')) continue;
    const base = entry.name.slice(0, -4);
    const type = screenshotTypeFromName(base);
    if (!type) continue;
    try {
      const buf = await sandbox.fs.downloadFile(`${imagesDir}/${entry.name}`);
      out.push({ name: base, type, bytes: new Uint8Array(buf) });
    } catch {
      // Skip unreadable files.
    }
  }
  return out;
}

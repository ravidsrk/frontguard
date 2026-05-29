import { Daytona } from '@daytonaio/sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunRequest {
  url: string;
  routes: Array<{ path: string }>;
  viewports: number[];
  browsers: string[];
  threshold: number;
  ai?: { provider: string; model?: string };
  openaiKey?: string;
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
  const daytona = new Daytona();

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
        'npm install -g frontguard@latest',
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

    // Write config to sandbox filesystem
    await sandbox.fs.uploadFile(
      Buffer.from(JSON.stringify(config, null, 2)),
      configPath,
    );

    // Run frontguard inside the sandbox
    const startTime = Date.now();
    const execResult = await sandbox.process.executeCommand(
      `frontguard run --config ${configPath} --reporter json --reporter html --output ${outputDir}`,
      undefined,
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

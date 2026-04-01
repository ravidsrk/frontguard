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

    return { results, reportHtml, duration };
  } finally {
    // Always destroy the sandbox — best-effort cleanup
    try {
      await daytona.delete(sandbox);
    } catch {
      // Sandbox may already be deleted via ephemeral + autoDeleteInterval
    }
  }
}

/**
 * Tests for the discovery-stage bail-out when the base URL is unreachable.
 *
 * Regression: when discovery failed with ECONNREFUSED we previously fell back
 * to `/` and proceeded to render, producing one identical ECONNREFUSED per
 * viewport (`× viewports + 1`). Frontguard now detects connection failures at
 * discovery time and throws a single `UnreachableBaseUrlError` instead.
 */
import { describe, it, expect } from 'vitest';
import { createServer } from 'node:net';
import {
  isUnreachableHostError,
  UnreachableBaseUrlError,
  runPipeline,
} from '../../src/core/pipeline.js';
import type { FrontguardConfig, Reporter, RunResult, PipelineStage } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// isUnreachableHostError — pure helper
// ---------------------------------------------------------------------------

describe('isUnreachableHostError', () => {
  it('matches ECONNREFUSED', () => {
    expect(
      isUnreachableHostError('connect ECONNREFUSED 127.0.0.1:9999'),
    ).toBe(true);
  });

  it('matches ENOTFOUND', () => {
    expect(
      isUnreachableHostError('getaddrinfo ENOTFOUND no-such-host.invalid'),
    ).toBe(true);
  });

  it('matches Playwright net::ERR_CONNECTION_REFUSED', () => {
    expect(
      isUnreachableHostError(
        'page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:9999/',
      ),
    ).toBe(true);
  });

  it('matches net::ERR_NAME_NOT_RESOLVED', () => {
    expect(
      isUnreachableHostError(
        'page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope.invalid/',
      ),
    ).toBe(true);
  });

  it('does NOT match unrelated errors (timeouts, parse failures)', () => {
    expect(isUnreachableHostError('Timeout 30000ms exceeded')).toBe(false);
    expect(isUnreachableHostError('SyntaxError: invalid regex')).toBe(false);
    expect(isUnreachableHostError('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UnreachableBaseUrlError
// ---------------------------------------------------------------------------

describe('UnreachableBaseUrlError', () => {
  it('exposes the unreachable URL and an actionable message', () => {
    const err = new UnreachableBaseUrlError('http://localhost:9999');
    expect(err.baseUrl).toBe('http://localhost:9999');
    expect(err.name).toBe('UnreachableBaseUrlError');
    expect(err.message).toContain('http://localhost:9999');
    expect(err.message).toMatch(/dev server|--url/i);
  });

  it('preserves the underlying cause when provided', () => {
    const cause = new Error('connect ECONNREFUSED 127.0.0.1:9999');
    const err = new UnreachableBaseUrlError('http://localhost:9999', cause);
    expect((err as Error & { cause?: unknown }).cause).toBe(cause);
  });
});

// ---------------------------------------------------------------------------
// runPipeline integration — discovery against a closed port
// ---------------------------------------------------------------------------

/**
 * Returns a port number we are confident nothing else is listening on.
 *
 * We open and immediately close a server on an ephemeral port; the kernel
 * assigns the port and we trust it stays free for the few milliseconds we need.
 */
async function getClosedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('Could not bind ephemeral port'));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function recordingReporter(): Reporter & { stages: Array<{ stage: PipelineStage; phase: 'start' | 'complete'; detail?: string }> } {
  const stages: Array<{ stage: PipelineStage; phase: 'start' | 'complete'; detail?: string }> = [];
  return {
    stages,
    onStageStart(stage, detail) {
      stages.push({ stage, phase: 'start', detail });
    },
    onStageProgress() {},
    onStageComplete(stage, detail) {
      stages.push({ stage, phase: 'complete', detail });
    },
    onComplete(_result: RunResult) {},
    onError(_error: Error) {},
  };
}

describe('runPipeline: unreachable base URL', () => {
  it('throws UnreachableBaseUrlError without progressing to render', async () => {
    const port = await getClosedPort();
    const baseUrl = `http://127.0.0.1:${port}`;

    const config: FrontguardConfig = {
      version: 1,
      baseUrl,
      // Crawl from `/` to force a real network attempt during discovery.
      discover: { startUrl: '/', maxDepth: 1 },
      viewports: [375, 768, 1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: false,
      workers: 1,
      pageTimeout: 5_000,
      maxHeight: 1_000,
      outputDir: './frontguard-report',
    };

    const reporter = recordingReporter();

    await expect(runPipeline(config, reporter)).rejects.toBeInstanceOf(
      UnreachableBaseUrlError,
    );

    // We must NOT have started the render stage — if we had, the user would
    // see one ECONNREFUSED per viewport, which is exactly what this guard
    // exists to prevent.
    expect(reporter.stages.some((s) => s.stage === 'render')).toBe(false);

    // Discovery must have started and reported a single failure line.
    const discoverComplete = reporter.stages.find(
      (s) => s.stage === 'discover' && s.phase === 'complete',
    );
    expect(discoverComplete).toBeDefined();
    expect(discoverComplete?.detail).toMatch(/unreachable/i);
  }, 30_000);
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Reporter, RunResult } from '../../src/core/types.js';
import { CompositeReporter } from '../../src/report/composite.js';
import { createReporter } from '../../src/report/factory.js';

function reporter(onComplete: Reporter['onComplete'] = vi.fn()): Reporter {
  return {
    onStageStart: vi.fn(),
    onStageProgress: vi.fn(),
    onStageComplete: vi.fn(),
    onError: vi.fn(),
    onComplete,
  };
}

describe('CompositeReporter', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('waits for every completion reporter', async () => {
    let finishSecond!: () => void;
    const secondFinished = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
    const firstComplete = vi.fn();
    const secondComplete = vi.fn(() => secondFinished);
    const composite = new CompositeReporter([
      reporter(firstComplete),
      reporter(secondComplete),
    ]);
    const result = {} as RunResult;

    let settled = false;
    const completion = composite.onComplete(result).then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(firstComplete).toHaveBeenCalledWith(result);
    expect(secondComplete).toHaveBeenCalledWith(result);
    expect(settled).toBe(false);

    finishSecond();
    await completion;
    expect(settled).toBe(true);
  });

  it('adds the GitHub PR reporter for pull-request Actions runs', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('GITHUB_TOKEN', 'token');
    vi.stubEnv('GITHUB_REPOSITORY', 'acme/web');
    vi.stubEnv('GITHUB_REF', 'refs/pull/42/merge');

    expect(createReporter('json')).toBeInstanceOf(CompositeReporter);
  });

  it('does not add a PR reporter outside pull-request Actions runs', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('GITHUB_TOKEN', 'token');
    vi.stubEnv('GITHUB_REPOSITORY', 'acme/web');
    vi.stubEnv('GITHUB_REF', 'refs/heads/main');

    expect(createReporter('json')).not.toBeInstanceOf(CompositeReporter);
  });
});

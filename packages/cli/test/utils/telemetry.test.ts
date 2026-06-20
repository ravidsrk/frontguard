import { describe, it, expect, vi } from 'vitest';
import {
  isTelemetryEnabled,
  detectCI,
  sendTelemetry,
  type TelemetryEvent,
} from '../../src/utils/telemetry.js';

const evt: TelemetryEvent = { command: 'run', version: '0.2.0' };

describe('isTelemetryEnabled', () => {
  it('disabled by default with empty env', () => {
    expect(isTelemetryEnabled({ env: {} as NodeJS.ProcessEnv })).toBe(false);
  });

  it('enabled by FRONTGUARD_TELEMETRY=1', () => {
    expect(isTelemetryEnabled({ env: { FRONTGUARD_TELEMETRY: '1' } as NodeJS.ProcessEnv })).toBe(
      true,
    );
  });

  it('enabled by config telemetry:true', () => {
    expect(isTelemetryEnabled({ configEnabled: true, env: {} as NodeJS.ProcessEnv })).toBe(true);
  });

  it('disabled by --no-telemetry flag', () => {
    expect(isTelemetryEnabled({ optOutFlag: true, env: {} as NodeJS.ProcessEnv })).toBe(false);
  });

  it('disabled by config telemetry:false', () => {
    expect(isTelemetryEnabled({ configEnabled: false, env: {} as NodeJS.ProcessEnv })).toBe(false);
  });

  it('disabled by FRONTGUARD_TELEMETRY=0', () => {
    expect(isTelemetryEnabled({ env: { FRONTGUARD_TELEMETRY: '0' } as NodeJS.ProcessEnv })).toBe(false);
  });

  it('disabled by FRONTGUARD_TELEMETRY=false/off/no', () => {
    for (const v of ['false', 'off', 'no', 'FALSE']) {
      expect(isTelemetryEnabled({ env: { FRONTGUARD_TELEMETRY: v } as NodeJS.ProcessEnv })).toBe(false);
    }
  });

  it('disabled by DO_NOT_TRACK=1 (cross-tool standard)', () => {
    expect(isTelemetryEnabled({ env: { DO_NOT_TRACK: '1' } as NodeJS.ProcessEnv })).toBe(false);
  });

  it('DO_NOT_TRACK=0 does not enable without opt-in', () => {
    expect(isTelemetryEnabled({ env: { DO_NOT_TRACK: '0' } as NodeJS.ProcessEnv })).toBe(false);
  });

  it('DO_NOT_TRACK=1 disables telemetry even when config telemetry:true', () => {
    expect(
      isTelemetryEnabled({
        configEnabled: true,
        env: { DO_NOT_TRACK: '1' } as NodeJS.ProcessEnv,
      }),
    ).toBe(false);
  });

  it('FRONTGUARD_TELEMETRY=0 disables telemetry even when config telemetry:true', () => {
    expect(
      isTelemetryEnabled({
        configEnabled: true,
        env: { FRONTGUARD_TELEMETRY: '0' } as NodeJS.ProcessEnv,
      }),
    ).toBe(false);
  });
});

describe('detectCI', () => {
  it('detects GitHub Actions', () => {
    expect(detectCI({ GITHUB_ACTIONS: 'true' } as NodeJS.ProcessEnv)).toBe('github-actions');
  });
  it('detects GitLab', () => {
    expect(detectCI({ GITLAB_CI: 'true' } as NodeJS.ProcessEnv)).toBe('gitlab-ci');
  });
  it('detects generic CI', () => {
    expect(detectCI({ CI: 'true' } as NodeJS.ProcessEnv)).toBe('generic-ci');
  });
  it('returns local when no CI', () => {
    expect(detectCI({} as NodeJS.ProcessEnv)).toBe('local');
  });
});

describe('sendTelemetry', () => {
  it('does nothing when disabled', async () => {
    const fetchImpl = vi.fn();
    await sendTelemetry(evt, { enabled: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs the event when enabled', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await sendTelemetry(evt, {
      enabled: true,
      endpoint: 'https://t.test/e',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {} as NodeJS.ProcessEnv,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://t.test/e');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.command).toBe('run');
    expect(body.ci).toBeDefined();
    expect(body.ts).toBeDefined();
  });

  it('never throws when fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      sendTelemetry(evt, {
        enabled: true,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        env: {} as NodeJS.ProcessEnv,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not include PII fields like URLs or paths', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await sendTelemetry(
      { command: 'run', version: '0.2.0', routes: 5, regressions: 1, aiProvider: 'openai' },
      { enabled: true, fetchImpl: fetchImpl as unknown as typeof fetch, env: {} as NodeJS.ProcessEnv },
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const keys = Object.keys(body);
    // Assert known anonymous keys only.
    for (const k of keys) {
      expect([
        'command', 'version', 'routes', 'regressions', 'aiProvider',
        'antiFlake', 'ci', 'durationMs', 'errorType', 'ts',
      ]).toContain(k);
    }
  });
});

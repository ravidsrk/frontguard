/**
 * Anonymous, opt-out usage telemetry.
 *
 * Sends a small, PII-free event after each command so we can understand which
 * features are used and prioritise work. Telemetry is:
 *
 * - **Anonymous** — no URLs, file paths, config contents, or user identity.
 * - **Opt-in** — disabled by default until a hosted collector is live. Enable
 *   with `FRONTGUARD_TELEMETRY=1`, `telemetry: true` in config, or opt out via
 *   `--no-telemetry`, `FRONTGUARD_TELEMETRY=0`, `DO_NOT_TRACK=1`.
 * - **Non-blocking** — fire-and-forget with a short timeout; never slows or
 *   fails the CLI.
 *
 * @module utils/telemetry
 */

import { logger } from './logger.js';

/** Default ingestion endpoint (a simple collector). Override with env. */
const DEFAULT_ENDPOINT = 'https://telemetry.frontguard.dev/v1/events';

/** Network timeout for the fire-and-forget send. */
const SEND_TIMEOUT_MS = 1500;

/** A single telemetry event. All fields are anonymous. */
export interface TelemetryEvent {
  /** Command invoked. */
  command: 'run' | 'init' | 'update-baselines' | 'doctor' | 'monitor' | 'plugin-install';
  /** Frontguard version. */
  version: string;
  /** Number of routes tested (run only). */
  routes?: number;
  /** Number of regressions found (run only). */
  regressions?: number;
  /** AI provider used. */
  aiProvider?: 'openai' | 'anthropic' | 'none';
  /** Whether anti-flake rendering was enabled. */
  antiFlake?: boolean;
  /** Detected CI environment. */
  ci?: string;
  /** Execution time in milliseconds. */
  durationMs?: number;
  /** Error type/class if the command failed (no message — could contain PII). */
  errorType?: string;
}

/**
 * Determines whether telemetry is enabled.
 *
 * Disabled by default (hosted collector not live). Enabled when:
 * - `FRONTGUARD_TELEMETRY` is `1`/`true`/`on`/`yes`
 * - `configEnabled` is explicitly `true`
 *
 * Disabled when any opt-out signal is present:
 * - `optOutFlag` is `true` (from `--no-telemetry`)
 * - `configEnabled` is explicitly `false`
 * - `FRONTGUARD_TELEMETRY` is `0`/`false`/`off`
 * - `DO_NOT_TRACK` is truthy (the cross-tool standard)
 */
export function isTelemetryEnabled(opts?: {
  configEnabled?: boolean;
  optOutFlag?: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = opts?.env ?? process.env;

  if (opts?.optOutFlag) return false;
  if (opts?.configEnabled === false) return false;

  const dnt = env.DO_NOT_TRACK;
  if (dnt && dnt !== '0' && dnt !== 'false') return false;

  const flag = (env.FRONTGUARD_TELEMETRY ?? '').toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off' || flag === 'no') return false;

  if (opts?.configEnabled === true) return true;
  if (flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes') return true;

  return false;
}

/**
 * Detects the CI environment from well-known env vars.
 * Returns a coarse label (no identifiers).
 */
export function detectCI(env: NodeJS.ProcessEnv = process.env): string {
  if (env.GITHUB_ACTIONS) return 'github-actions';
  if (env.GITLAB_CI) return 'gitlab-ci';
  if (env.CIRCLECI) return 'circleci';
  if (env.JENKINS_URL) return 'jenkins';
  if (env.BUILDKITE) return 'buildkite';
  if (env.TRAVIS) return 'travis';
  if (env.CI) return 'generic-ci';
  return 'local';
}

let firstRunNoticeShown = false;

/**
 * Shows a one-time disclosure on first run. Idempotent within a process.
 */
export function showFirstRunNotice(): void {
  if (firstRunNoticeShown) return;
  firstRunNoticeShown = true;
  logger.debug(
    'Frontguard can send anonymous usage telemetry (no URLs, paths, or config). ' +
      'Enable with FRONTGUARD_TELEMETRY=1 or telemetry: true in config.',
  );
}

/**
 * Sends a telemetry event. Fire-and-forget: resolves quickly and never throws.
 *
 * @param event - The event to send.
 * @param opts  - Enable/endpoint overrides (used by tests).
 */
export async function sendTelemetry(
  event: TelemetryEvent,
  opts?: {
    enabled?: boolean;
    endpoint?: string;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
  },
): Promise<void> {
  const env = opts?.env ?? process.env;
  const enabled = opts?.enabled ?? isTelemetryEnabled({ env });
  if (!enabled) return;

  const endpoint = opts?.endpoint ?? env.FRONTGUARD_TELEMETRY_ENDPOINT ?? DEFAULT_ENDPOINT;
  const doFetch = opts?.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') return; // No fetch available — skip silently.

  const payload = {
    ...event,
    ci: event.ci ?? detectCI(env),
    ts: Date.now(),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    await doFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => {
      /* network errors are ignored — telemetry must never break the CLI */
    });
    clearTimeout(timer);
  } catch {
    // Swallow everything — telemetry is best-effort.
  }
}

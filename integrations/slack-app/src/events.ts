import { isAllowedRunUrl } from './runs.js';

/**
 * Pure decisioning for Slack Events API envelopes and slash commands.
 *
 * The HTTP shell (signature check, responses) lives in `handler.ts`; this module
 * is the pure, testable core.
 *
 * @module events
 */

/** A parsed Slack Events API envelope. */
export interface SlackEnvelope {
  type: string;
  challenge?: string;
  team_id?: string;
  event?: { type: string; text?: string; channel?: string; user?: string };
}

/** The decision for an incoming events request. */
export type EnvelopeDecision =
  | { kind: 'url_verification'; challenge: string }
  | { kind: 'event'; eventType: string; teamId?: string; channel?: string }
  | { kind: 'ignore'; reason: string };

/**
 * Classifies a Slack Events API envelope: the one-time `url_verification`
 * handshake, an `event_callback`, or something we ignore.
 */
export function parseSlackEnvelope(body: unknown): EnvelopeDecision {
  if (!body || typeof body !== 'object') return { kind: 'ignore', reason: 'non-object body' };
  const env = body as SlackEnvelope;

  if (env.type === 'url_verification') {
    return typeof env.challenge === 'string'
      ? { kind: 'url_verification', challenge: env.challenge }
      : { kind: 'ignore', reason: 'url_verification without challenge' };
  }

  if (env.type === 'event_callback' && env.event?.type) {
    return { kind: 'event', eventType: env.event.type, teamId: env.team_id, channel: env.event.channel };
  }

  return { kind: 'ignore', reason: `unhandled envelope type: ${env.type}` };
}

/** A parsed Slack slash command (form-encoded POST). */
export interface SlackCommand {
  command: string;
  text: string;
  userId: string;
  channelId: string;
  responseUrl: string;
  teamId: string;
}

/** Parses a slash-command form body. */
export function parseSlashCommand(form: URLSearchParams): SlackCommand {
  return {
    command: form.get('command') ?? '',
    text: (form.get('text') ?? '').trim(),
    userId: form.get('user_id') ?? '',
    channelId: form.get('channel_id') ?? '',
    responseUrl: form.get('response_url') ?? '',
    teamId: form.get('team_id') ?? '',
  };
}

/**
 * A typed decision for a `/frontguard …` invocation. The HTTP handler turns
 * this into both the ack response *and* (for `status`) the deferred work
 * that submits a run to the cloud-api.
 */
export type CommandDecision =
  | { kind: 'status'; url: string }
  | { kind: 'status_invalid'; reason: string }
  | { kind: 'help' };

/**
 * Classifies a slash-command body into a structured decision. Pure — no
 * side effects, no network. URL parsing is permissive enough to accept the
 * `<url|url>` form Slack emits when it auto-links a URL in the message text.
 */
export function decideCommand(cmd: SlackCommand): CommandDecision {
  const [sub, ...rest] = cmd.text.split(/\s+/);
  const rawArg = rest.join(' ').trim();

  if (sub === 'status') {
    if (!rawArg) return { kind: 'status_invalid', reason: 'Missing URL — try `/frontguard status https://example.com`' };
    const cleaned = cleanSlackLink(rawArg);
    if (!/^https?:\/\//i.test(cleaned)) {
      return { kind: 'status_invalid', reason: 'URL must start with http(s)://' };
    }
    try {
      new URL(cleaned);
    } catch {
      return { kind: 'status_invalid', reason: 'That URL is not valid' };
    }
    if (!isAllowedRunUrl(cleaned)) {
      return {
        kind: 'status_invalid',
        reason: 'That URL targets a private or internal address and cannot be checked',
      };
    }
    return { kind: 'status', url: cleaned };
  }

  return { kind: 'help' };
}

/**
 * Slack wraps URLs in `<https://…|label>` when it auto-links text inside
 * slash-command bodies. Strip the wrapper so the cloud-api receives the raw URL.
 */
export function cleanSlackLink(raw: string): string {
  const m = raw.match(/^<([^|>]+)(?:\|[^>]*)?>$/);
  return (m ? m[1] : raw).trim();
}

/** Help text reused by the immediate ack and by `status_invalid`. */
export const HELP_TEXT = [
  '*Frontguard* — visual regression testing in Slack',
  '• `/frontguard status <url>` — run a visual check against a URL',
  '• `/frontguard help` — show this help',
].join('\n');

/**
 * Builds the immediate (ephemeral) ack response to a `/frontguard` slash
 * command. The ack must be returned within 3 seconds; follow-up messages
 * for an enqueued `status` run go through the `response_url`.
 */
export function buildCommandResponse(cmd: SlackCommand): unknown {
  const decision = decideCommand(cmd);

  if (decision.kind === 'status') {
    return {
      response_type: 'ephemeral',
      text: `🔍 Queued a visual check for \`${decision.url}\`. I'll post the result here when it's done.`,
    };
  }
  if (decision.kind === 'status_invalid') {
    return {
      response_type: 'ephemeral',
      text: `:warning: ${decision.reason}\n\n${HELP_TEXT}`,
    };
  }

  return {
    response_type: 'ephemeral',
    text: HELP_TEXT,
  };
}

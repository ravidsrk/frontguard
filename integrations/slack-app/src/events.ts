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
 * Builds the immediate (ephemeral) response to a `/frontguard` slash command.
 * Subcommands: `status <url>` (acknowledge a check request), `help` (default).
 */
export function buildCommandResponse(cmd: SlackCommand): unknown {
  const [sub, ...rest] = cmd.text.split(/\s+/);
  const arg = rest.join(' ');

  if (sub === 'status' && arg) {
    return {
      response_type: 'ephemeral',
      text: `🔍 Queued a visual check for \`${arg}\`. I'll post the result here when it's done.`,
    };
  }

  return {
    response_type: 'ephemeral',
    text: [
      '*Frontguard* — visual regression testing in Slack',
      '• `/frontguard status <url>` — run a visual check against a URL',
      '• `/frontguard help` — show this help',
    ].join('\n'),
  };
}

/**
 * Durable storage for Slack installs.
 *
 * Slack OAuth gives us a bot token per workspace; we need to find that token
 * again when the same workspace later invokes a slash command. We store one
 * record per `team_id` in Cloudflare Workers KV (`SLACK_TEAMS` binding). The
 * KV interface is declared locally so the integration does not depend on
 * `@cloudflare/workers-types` — any compatible KV (real, in-memory test stub)
 * works.
 *
 * Keys are namespaced `team:<team_id>` so a single KV namespace can carry
 * other Slack-related entries later (delivery dedup, state nonces, etc.)
 * without colliding.
 *
 * @module storage
 */

/**
 * Minimal KV binding (Workers KV / compatible). Declared locally to avoid a
 * dependency on `@cloudflare/workers-types`.
 */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
}

/**
 * One stored Slack install. Bot tokens are persisted as-is — KV writes never
 * appear in logs (we never `console.log` token-bearing values).
 */
export interface StoredSlackInstall {
  teamId: string;
  teamName?: string;
  accessToken: string;
  botUserId?: string;
  scope?: string;
  installedAt: string;
}

const KEY_PREFIX = 'team:';

/** Builds the KV key for a given Slack team id. */
export function teamKey(teamId: string): string {
  return `${KEY_PREFIX}${teamId}`;
}

/**
 * Persists a Slack install record. Throws if `teamId` is empty so we never
 * write an unkeyed record that could clobber another team.
 */
export async function putTeamInstall(kv: KVNamespace, install: StoredSlackInstall): Promise<void> {
  if (!install.teamId) throw new Error('putTeamInstall: teamId is required');
  await kv.put(teamKey(install.teamId), JSON.stringify(install));
}

/**
 * Loads a Slack install by team id. Returns `null` when no install exists or
 * the stored value is unparseable (treat corrupt rows as missing rather than
 * crashing the request).
 */
export async function getTeamInstall(
  kv: KVNamespace,
  teamId: string,
): Promise<StoredSlackInstall | null> {
  if (!teamId) return null;
  const raw = await kv.get(teamKey(teamId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSlackInstall;
    if (!parsed.accessToken || !parsed.teamId) return null;
    return parsed;
  } catch {
    return null;
  }
}

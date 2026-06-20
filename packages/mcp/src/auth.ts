/**
 * Reads Frontguard cloud credentials from the process environment.
 *
 * The MCP server starts cleanly on stdio even without an API key — the SDK
 * is supposed to advertise its tools first and only fail when a tool is
 * actually called. That way an editor can list tools and surface a clean
 * "configure FRONTGUARD_API_KEY" error instead of refusing to connect.
 *
 * @module auth
 */

export interface FrontguardAuth {
  apiKey: string;
  apiUrl: string;
}

/**
 * Thrown by tool handlers when {@link FRONTGUARD_API_KEY} is missing.
 *
 * The message is intentionally human-readable — agents surface it back to
 * the user verbatim, so it has to read as actionable guidance.
 */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'FRONTGUARD_API_KEY is not set. Add it to your MCP client config (e.g. mcp.json -> servers.frontguard.env) or export it in your shell, then restart the agent.',
    );
    this.name = 'MissingApiKeyError';
  }
}

/**
 * Thrown when {@link FRONTGUARD_API_URL} is missing. There is no hosted
 * default — point the server at your self-hosted cloud-api or local
 * `wrangler dev` instance.
 */
export class MissingApiUrlError extends Error {
  constructor() {
    super(
      'FRONTGUARD_API_URL is not set. Add your cloud-api base URL to your MCP client config (e.g. mcp.json -> servers.frontguard.env) or export it in your shell — for local dev: http://localhost:8787. Then restart the agent.',
    );
    this.name = 'MissingApiUrlError';
  }
}

/**
 * Resolve auth from `process.env`. Throws {@link MissingApiKeyError} when
 * `FRONTGUARD_API_KEY` is empty/unset. Tool handlers call this lazily so
 * the server can still start (and list its tool catalog) without a key.
 */
export function requireAuth(env: NodeJS.ProcessEnv = process.env): FrontguardAuth {
  const apiKey = env.FRONTGUARD_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  const apiUrl = env.FRONTGUARD_API_URL?.trim();
  if (!apiUrl) {
    throw new MissingApiUrlError();
  }
  return { apiKey, apiUrl: apiUrl.replace(/\/+$/, '') };
}

/**
 * Frontguard Slack app entry point.
 *
 * @module slack-app
 */

export { createSlackApp, type SlackAppEnv } from './handler.js';
export { verifySlackSignature, timingSafeEqual } from './verify.js';
export {
  parseSlackEnvelope,
  parseSlashCommand,
  buildCommandResponse,
  type SlackEnvelope,
  type SlackCommand,
  type EnvelopeDecision,
} from './events.js';
export {
  buildSlackAuthorizeUrl,
  exchangeSlackCode,
  type SlackOAuthConfig,
  type SlackInstall,
} from './oauth.js';
export {
  buildVisualResultBlocks,
  postSlackMessage,
  type RunSummary,
  type PostResult,
} from './slack-api.js';

// Default export is the Hono app, for Cloudflare Workers / Node servers.
import { createSlackApp } from './handler.js';
export default createSlackApp();

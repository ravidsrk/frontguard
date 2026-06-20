/**
 * Frontguard Slack app entry point.
 *
 * @module slack-app
 */

export { createSlackApp, type SlackAppEnv, type KVNamespace } from './handler.js';
export { verifySlackSignature, timingSafeEqual } from './verify.js';
export {
  parseSlackEnvelope,
  parseSlashCommand,
  buildCommandResponse,
  decideCommand,
  cleanSlackLink,
  HELP_TEXT,
  type SlackEnvelope,
  type SlackCommand,
  type EnvelopeDecision,
  type CommandDecision,
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
export {
  putTeamInstall,
  getTeamInstall,
  teamKey,
  type StoredSlackInstall,
} from './storage.js';
export {
  submitCloudRun,
  pollRunUntilTerminal,
  summarizeRun,
  postSlackResponse,
  buildFollowUpResponse,
  deliverRunResult,
  isAllowedRunUrl,
  assertSafeRunUrl,
  type CloudRunResponse,
  type CloudRunStatus,
  type CloudRunResult,
  type SubmitRunOptions,
} from './runs.js';

// Default export is the Hono app, for Cloudflare Workers / Node servers.
import { createSlackApp } from './handler.js';
export default createSlackApp();

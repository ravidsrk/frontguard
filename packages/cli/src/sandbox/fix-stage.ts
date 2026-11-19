/**
 * Sibling entry for Stage 5.5 (optional AI CSS fix generation, fix-pattern DB,
 * and sandbox verification). Loaded lazily by `pipeline-run.ts` only when
 * `config.generateFixes` is enabled.
 */
export { generateFix, FIX_CATEGORIES } from '../diff/ai-fix.js';
export { verifyFix } from './verify-fix.js';
export { FixPatternDB, contextHashFor } from '../storage/fix-patterns.js';

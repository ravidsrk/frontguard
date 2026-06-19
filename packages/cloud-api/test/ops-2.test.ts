/**
 * OPS-2 — pre-deploy guard detects placeholder binding IDs in wrangler configs.
 */
import { describe, it, expect } from 'vitest';
import {
  assertNoWranglerPlaceholders,
  findWranglerPlaceholderOffenders,
  hasWranglerPlaceholder,
} from '../src/ops/wrangler-guard.js';

describe('OPS-2: wrangler placeholder guard', () => {
  it('detects REPLACE_WITH placeholder binding ids', () => {
    expect(hasWranglerPlaceholder('database_id = "REPLACE_WITH_D1_DATABASE_ID"')).toBe(true);
    expect(hasWranglerPlaceholder('id = "REPLACE_WITH_KV_NAMESPACE_ID"')).toBe(true);
  });

  it('passes configs with non-placeholder ids', () => {
    expect(hasWranglerPlaceholder('database_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"')).toBe(
      false,
    );
  });

  it('findWranglerPlaceholderOffenders returns only offending paths', () => {
    const offenders = findWranglerPlaceholderOffenders([
      { path: 'packages/cloud-api/wrangler.toml', content: 'database_id = "REPLACE_WITH_D1"' },
      { path: 'integrations/github-app/wrangler.toml', content: 'name = "ok"' },
    ]);
    expect(offenders).toEqual(['packages/cloud-api/wrangler.toml']);
  });

  it('assertNoWranglerPlaceholders throws when placeholders remain', () => {
    expect(() =>
      assertNoWranglerPlaceholders([
        { path: 'integrations/slack-app/wrangler.toml', content: 'id = "REPLACE_WITH_KV"' },
      ]),
    ).toThrow(/placeholder binding id/i);
  });

  it('assertNoWranglerPlaceholders passes when all configs are clean', () => {
    expect(() =>
      assertNoWranglerPlaceholders([
        { path: 'packages/cloud-api/wrangler.toml', content: 'database_id = "real-id"' },
      ]),
    ).not.toThrow();
  });
});
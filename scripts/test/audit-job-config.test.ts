import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ciWorkflow = readFileSync(
  path.join(repoRoot, '.github/workflows/ci.yml'),
  'utf8',
);

describe('CI audit job config (C11 / supply-6)', () => {
  it('defines an audit job that runs npm audit --omit=dev --audit-level=high', () => {
    expect(ciWorkflow).toMatch(/^\s+audit:/m);
    expect(ciWorkflow).toMatch(/npm audit --omit=dev --audit-level=high/);
  });

  it('does not allow the audit gate to fail open via continue-on-error', () => {
    const auditBlock = ciWorkflow.slice(ciWorkflow.indexOf('  audit:'));
    expect(auditBlock).not.toMatch(/continue-on-error:\s*true/);
  });
});
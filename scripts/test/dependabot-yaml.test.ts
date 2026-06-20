import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const yaml = readFileSync(path.join(repoRoot, '.github/dependabot.yml'), 'utf8');

describe('dependabot config (C11 / supply-6)', () => {
  it('enables weekly npm and github-actions updates with OTel grouping', () => {
    expect(yaml).toMatch(/^version:\s*2/m);
    expect(yaml).toMatch(/package-ecosystem:\s*"npm"/);
    expect(yaml).toMatch(/package-ecosystem:\s*"github-actions"/);
    expect(yaml).toMatch(/interval:\s*"weekly"/);
    expect(yaml).toMatch(/otel:/);
  });
});
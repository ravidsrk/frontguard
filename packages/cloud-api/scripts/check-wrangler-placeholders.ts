/**
 * Pre-deploy guard (OPS-2) — exit 1 when tracked wrangler.toml files still
 * contain REPLACE_WITH placeholder binding ids.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoWranglerPlaceholders } from '../src/ops/wrangler-guard.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function collectWranglerConfigs(dir: string): Array<{ path: string; content: string }> {
  const found: Array<{ path: string; content: string }> = [];

  function walk(current: string): void {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const full = join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (entry === 'wrangler.toml') {
        found.push({
          path: relative(repoRoot, full),
          content: readFileSync(full, 'utf-8'),
        });
      }
    }
  }

  walk(repoRoot);
  return found;
}

try {
  assertNoWranglerPlaceholders(collectWranglerConfigs(repoRoot));
  console.log('wrangler placeholder guard: ok');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
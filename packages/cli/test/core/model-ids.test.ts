/**
 * Model-ID drift guard (#376).
 *
 * Source, shipped docs and the website may name only the current default
 * models. Any other OpenAI / Claude / Gemini model ID (for example a retired
 * default left behind in an example) fails here. History files (changelogs,
 * docs/archive, research notes) are not scanned.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { DEFAULT_AI_MODELS } from '../../src/diff/ai-provider.js';
import { DEFAULT_AI_MODELS as CONFIG_DEFAULTS } from '../../src/core/config.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

const MODEL_ID = /\b(?:gpt-\d[\w.-]*|claude-(?:opus|sonnet|haiku|fable|mythos)-[\w.-]+|gemini-\d[\w.-]*)/g;

const ROOTS = [
  'README.md',
  '.env.example',
  'action.yml',
  'packages/cli/README.md',
  'packages/cli/frontguard.config.ts',
  'packages/cli/src',
  'packages/cli/scripts',
  'packages/playwright/README.md',
  'packages/playwright/src',
  'packages/mcp/README.md',
  'packages/mcp/src',
  'skills',
  'apps/web/public',
  'apps/web/src',
];

const SKIP = [/\/test\//, /\.test\.tsx?$/, /\/changelog\//, /routeTree\.gen\.ts$/, /\.(png|jpe?g|svg|webp|ico|woff2?)$/];

function files(path: string): string[] {
  const abs = join(repoRoot, path);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return [];
  }
  if (st.isFile()) return [path];
  return readdirSync(abs).flatMap((name) => (name === 'node_modules' || name === 'dist' ? [] : files(join(path, name))));
}

describe('model IDs', () => {
  it('has one source of defaults', () => {
    expect(CONFIG_DEFAULTS).toBe(DEFAULT_AI_MODELS);
  });

  it('docs and source name only current default models', () => {
    const allowed = new Set(Object.values(DEFAULT_AI_MODELS));
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(files)) {
      if (SKIP.some((re) => re.test(file))) continue;
      const text = readFileSync(join(repoRoot, file), 'utf8');
      for (const match of text.matchAll(MODEL_ID)) {
        const id = match[0].replace(/[.,;:)'"`]+$/, '');
        if (!allowed.has(id)) {
          const line = text.slice(0, match.index).split('\n').length;
          offenders.push(`${relative(repoRoot, join(repoRoot, file))}:${line} ${id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the Playwright plugin takes its defaults from the shared provider module', () => {
    const plugin = readFileSync(join(repoRoot, 'packages/playwright/src/ai.ts'), 'utf8');
    expect(plugin).toContain("from '../../cli/src/diff/ai-provider.js'");
    expect(plugin).toContain('DEFAULT_AI_MODELS[provider]');
  });
});

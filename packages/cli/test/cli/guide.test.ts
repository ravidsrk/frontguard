import { describe, it, expect, vi } from 'vitest';
import {
  GUIDE_TOPICS,
  getGuideTopic,
  formatGuideIndex,
} from '../../src/cli/guide.js';
import { main, buildConfig } from '../../src/cli/index.js';

describe('CLI guide command & topics', () => {
  it('exposes all 5 canonical guide topics', () => {
    const ids = GUIDE_TOPICS.map((t) => t.id);
    expect(ids).toEqual(['setup', 'diffing', 'mcp', 'playwright', 'ci']);
  });

  it('resolves topics case-insensitively and returns undefined for unknown topic', () => {
    expect(getGuideTopic('MCP')?.id).toBe('mcp');
    expect(getGuideTopic('  diffing ')?.id).toBe('diffing');
    expect(getGuideTopic('nonexistent')).toBeUndefined();
  });

  it('formats human-readable guide index with all topics', () => {
    const indexText = formatGuideIndex();
    expect(indexText).toContain('Frontguard Developer & Agent Guide');
    for (const topic of GUIDE_TOPICS) {
      expect(indexText).toContain(topic.id);
      expect(indexText).toContain(topic.summary);
    }
  });

  it('executes `frontguard guide --json` and outputs structured topic index', async () => {
    const chunks: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        chunks.push(String(chunk));
        return true;
      });

    const code = await main(['node', 'frontguard', 'guide', '--json']);
    writeSpy.mockRestore();

    expect(code).toBe(0);
    const parsed = JSON.parse(chunks.join(''));
    expect(parsed.topics).toHaveLength(5);
    expect(parsed.topics[0].id).toBe('setup');
  });

  it('executes `frontguard guide diffing` and prints topic markdown', async () => {
    const chunks: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        chunks.push(String(chunk));
        return true;
      });

    const code = await main(['node', 'frontguard', 'guide', 'diffing']);
    writeSpy.mockRestore();

    expect(code).toBe(0);
    expect(chunks.join('')).toContain('chromaSSIM');
    expect(chunks.join('')).toContain('cwSSIM');
  });

  it('returns exit code 2 for unknown guide topic', async () => {
    const code = await main(['node', 'frontguard', 'guide', 'unknown-topic']);
    expect(code).toBe(2);
  });
});

describe('buildConfig CLI flags for stability, redaction, and colorScheme', () => {
  it('applies --redact-sensitive, --wait-for-stability, and --color-scheme flags', async () => {
    const config = await buildConfig({
      url: 'http://localhost:3000',
      redactSensitive: true,
      waitForStability: true,
      colorScheme: 'dark',
    });

    expect(config.redactSensitive).toBe(true);
    expect(config.waitForStability).toBe(true);
    expect(config.colorScheme).toBe('dark');
  });
});

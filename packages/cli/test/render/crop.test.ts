import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { cropToMaxHeight } from '../../src/render/crop.js';
import { createTestPng } from '../fixtures/helpers.js';

function dims(buf: Buffer): { width: number; height: number } {
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height };
}

describe('cropToMaxHeight', () => {
  it('crops a tall image down to maxHeight, preserving width', async () => {
    const tall = createTestPng(40, 9000, 0, 0, 0);
    const cropped = await cropToMaxHeight(tall, 5000);
    expect(dims(cropped)).toEqual({ width: 40, height: 5000 });
  });

  it('leaves a short image unchanged', async () => {
    const short = createTestPng(40, 100, 0, 0, 0);
    const out = await cropToMaxHeight(short, 5000);
    expect(dims(out)).toEqual({ width: 40, height: 100 });
  });

  it('produces matching dimensions for renderer and sandbox paths', async () => {
    // Same source height + same maxHeight => identical cropped dimensions, so a
    // baseline (renderer) and after-fix (sandbox) buffer can be diffed.
    const rendererBaseline = await cropToMaxHeight(createTestPng(30, 8000), 5000);
    const sandboxAfter = await cropToMaxHeight(createTestPng(30, 8000), 5000);
    expect(dims(rendererBaseline)).toEqual(dims(sandboxAfter));
  });

  it('returns the original buffer when it cannot parse', async () => {
    const garbage = Buffer.from('not a png');
    const out = await cropToMaxHeight(garbage, 5000);
    expect(out).toBe(garbage);
  });
});

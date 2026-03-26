import { PNG } from 'pngjs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function createTestPng(width: number, height: number, r = 255, g = 0, b = 0, a = 255): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r; png.data[idx+1] = g; png.data[idx+2] = b; png.data[idx+3] = a;
    }
  }
  return PNG.sync.write(png);
}

export function createTempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'frontguard-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function writeFiles(dir: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
}

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_READABLE_KEY_LENGTH = 174;

function safeKeyName(key: string): string {
  const readable = key
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, MAX_READABLE_KEY_LENGTH) || 'baseline';
  const digest = createHash('sha256').update(key).digest('hex');

  return `${readable}-${digest}`;
}

/**
 * File-based baseline storage for visual tests.
 * Stores baselines in a configurable directory (default: __visual_baselines__).
 */
export class BaselineStorage {
  private readonly dir: string;

  constructor(baselineDir: string = '__visual_baselines__') {
    this.dir = path.resolve(baselineDir);
  }

  /**
   * Read a baseline image. Returns null only if it doesn't exist.
   */
  readBaseline(key: string): Buffer | null {
    const filePath = this.getPath(key);
    try {
      return fs.readFileSync(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Write a baseline image.
   */
  writeBaseline(key: string, data: Buffer): void {
    this.ensureDir();
    fs.writeFileSync(this.getPath(key), data);
  }

  /**
   * Write a file with a suffix (e.g., 'current', 'diff').
   */
  writeFile(key: string, suffix: string, data: Buffer): void {
    this.ensureDir();
    fs.writeFileSync(this.getPath(key, suffix), data);
  }

  /**
   * Get the file path for a baseline key and optional suffix.
   */
  getPath(key: string, suffix?: string): string {
    const safeName = safeKeyName(key);
    const filename = suffix ? `${safeName}.${suffix}.png` : `${safeName}.png`;
    return path.join(this.dir, filename);
  }

  /**
   * Ensure the baseline directory exists.
   */
  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }
}

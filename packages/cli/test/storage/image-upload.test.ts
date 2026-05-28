import { describe, it, expect, afterEach } from 'vitest';
import {
  buildImageKey,
  createUploader,
  LocalUploader,
  GitHubArtifactUploader,
  S3CompatibleUploader,
  type ImageUploader,
} from '../../src/storage/image-upload.js';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'fg-img-'));
}

describe('buildImageKey', () => {
  it('namespaces keys as project/runId/route-viewport-browser-type.png', () => {
    const key = buildImageKey({
      project: 'myapp',
      runId: 'run123',
      route: '/checkout',
      viewport: 1440,
      browser: 'chromium',
      type: 'baseline',
    });
    expect(key).toBe('myapp/run123/checkout-1440-chromium-baseline.png');
  });

  it('sanitises the root route to "root"', () => {
    const key = buildImageKey({
      project: 'p',
      runId: 'r',
      route: '/',
      viewport: 375,
      browser: 'firefox',
      type: 'current',
    });
    expect(key).toBe('p/r/root-375-firefox-current.png');
  });

  it('sanitises unsafe characters in nested routes', () => {
    const key = buildImageKey({
      project: 'p',
      runId: 'r',
      route: '/blog/post?id=1',
      viewport: 768,
      browser: 'webkit',
      type: 'diff',
    });
    expect(key).toMatch(/^p\/r\/blog_post_id_1-768-webkit-diff\.png$/);
  });
});

describe('LocalUploader', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes the buffer to disk and returns a file:// URL', async () => {
    dir = tmp();
    const uploader = new LocalUploader(dir);
    const buf = Buffer.from('PNGDATA');
    const url = await uploader.upload('a/b/img.png', buf, 'image/png');
    expect(url.startsWith('file://')).toBe(true);
    const filePath = fileURLToPath(url);
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath).toString()).toBe('PNGDATA');
  });

  it('getUrl is consistent with upload', async () => {
    dir = tmp();
    const uploader = new LocalUploader(dir);
    const url = await uploader.upload('x.png', Buffer.from('z'));
    expect(uploader.getUrl('x.png')).toBe(url);
  });
});

describe('GitHubArtifactUploader', () => {
  let dir: string;
  const original = { ...process.env };
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    process.env = { ...original };
  });

  it('returns a run artifacts URL when in CI', async () => {
    dir = tmp();
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    process.env.GITHUB_RUN_ID = '999';
    process.env.GITHUB_SERVER_URL = 'https://github.com';
    const uploader = new GitHubArtifactUploader(dir);
    const url = await uploader.upload('k.png', Buffer.from('a'));
    expect(url).toContain('owner/repo/actions/runs/999');
  });

  it('falls back to file URL outside CI', async () => {
    dir = tmp();
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_RUN_ID;
    const uploader = new GitHubArtifactUploader(dir);
    const url = await uploader.upload('k.png', Buffer.from('a'));
    expect(url.startsWith('file://')).toBe(true);
  });
});

describe('createUploader factory', () => {
  it('creates a LocalUploader for provider=local', () => {
    const u = createUploader({ provider: 'local', outputDir: tmp() });
    expect(u).toBeInstanceOf(LocalUploader);
  });

  it('creates a GitHubArtifactUploader for provider=github-artifacts', () => {
    const u = createUploader({ provider: 'github-artifacts' });
    expect(u).toBeInstanceOf(GitHubArtifactUploader);
  });

  it('creates an S3CompatibleUploader for provider=s3 with creds', () => {
    const u = createUploader({
      provider: 's3',
      bucket: 'my-bucket',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
    });
    expect(u).toBeInstanceOf(S3CompatibleUploader);
  });

  it('throws for s3 without bucket', () => {
    expect(() =>
      createUploader({ provider: 's3', accessKeyId: 'AK', secretAccessKey: 'SK' }),
    ).toThrow(/bucket/);
  });

  it('throws for s3 without credentials', () => {
    const saved = { ...process.env };
    delete process.env.FRONTGUARD_S3_ACCESS_KEY;
    delete process.env.FRONTGUARD_S3_SECRET_KEY;
    expect(() => createUploader({ provider: 's3', bucket: 'b' })).toThrow(/credentials/i);
    process.env = saved;
  });
});

describe('S3CompatibleUploader.getUrl', () => {
  it('uses publicUrlPrefix when provided', () => {
    const u = new S3CompatibleUploader({
      provider: 'r2',
      bucket: 'b',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      publicUrlPrefix: 'https://cdn.example.com',
    });
    expect(u.getUrl('a/b.png')).toBe('https://cdn.example.com/a/b.png');
  });

  it('builds an S3 virtual-hosted URL by default', () => {
    const u = new S3CompatibleUploader({
      provider: 's3',
      bucket: 'mybucket',
      region: 'eu-west-1',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
    });
    expect(u.getUrl('k.png')).toBe('https://mybucket.s3.eu-west-1.amazonaws.com/k.png');
  });
});

// A mock uploader demonstrates the interface for downstream consumers (PR thumbnails).
describe('ImageUploader contract (mock)', () => {
  class MockUploader implements ImageUploader {
    public uploaded = new Map<string, Buffer>();
    async upload(key: string, buffer: Buffer): Promise<string> {
      this.uploaded.set(key, buffer);
      return this.getUrl(key);
    }
    getUrl(key: string): string {
      return `https://mock.test/${key}`;
    }
    async delete(key: string): Promise<void> {
      this.uploaded.delete(key);
    }
  }

  it('upload then delete works', async () => {
    const m = new MockUploader();
    const url = await m.upload('k.png', Buffer.from('x'));
    expect(url).toBe('https://mock.test/k.png');
    expect(m.uploaded.has('k.png')).toBe(true);
    await m.delete('k.png');
    expect(m.uploaded.has('k.png')).toBe(false);
  });
});

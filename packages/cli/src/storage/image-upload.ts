/**
 * Image upload abstraction for screenshot hosting.
 *
 * Uploads baseline/current/diff PNG buffers and returns public URLs that can
 * be embedded in PR comments. Four backends are supported:
 *
 * - `r2`               — Cloudflare R2 via the S3-compatible API
 * - `s3`               — AWS S3
 * - `github-artifacts` — zero-config in GitHub Actions (writes to the workspace
 *                        artifact dir; URLs point at the run's artifacts)
 * - `local`            — writes to disk and returns `file://` URLs (local dev)
 *
 * The AWS SDK is imported dynamically so it is an OPTIONAL dependency — users
 * who only need the `local` or `github-artifacts` backend don't pay for it.
 *
 * Security: credentials are read from config OR environment variables and are
 * never logged or written to disk.
 *
 * @module storage/image-upload
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ImageUploadConfig } from '../core/types.js';

/**
 * Contract implemented by every image uploader.
 */
export interface ImageUploader {
  /**
   * Uploads a buffer under `key` and returns its public URL.
   * @param key         - Object key (namespaced path).
   * @param buffer      - Raw image bytes.
   * @param contentType - MIME type (e.g. `image/png`).
   */
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>;
  /** Returns the public URL for a key without uploading. */
  getUrl(key: string): string;
  /** Deletes an object by key. No-op for backends that can't delete. */
  delete(key: string): Promise<void>;
}

/**
 * Builds a namespaced object key.
 *
 * Format: `{project}/{runId}/{route}-{viewport}-{browser}-{type}.png`
 * The route is sanitised to a filesystem/URL-safe slug.
 */
export function buildImageKey(params: {
  project: string;
  runId: string;
  route: string;
  viewport: number;
  browser: string;
  type: 'baseline' | 'current' | 'diff';
}): string {
  const safeRoute =
    params.route.replace(/^\/+/, '').replace(/[^a-zA-Z0-9._-]+/g, '_') || 'root';
  return `${params.project}/${params.runId}/${safeRoute}-${params.viewport}-${params.browser}-${params.type}.png`;
}

// ---------------------------------------------------------------------------
// Local uploader
// ---------------------------------------------------------------------------

/** Writes images to a local directory and returns `file://` URLs. */
export class LocalUploader implements ImageUploader {
  private readonly baseDir: string;

  constructor(outputDir: string) {
    this.baseDir = resolve(outputDir, 'images');
  }

  async upload(key: string, buffer: Buffer): Promise<string> {
    const filePath = join(this.baseDir, key);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, buffer);
    return this.getUrl(key);
  }

  getUrl(key: string): string {
    return pathToFileURL(join(this.baseDir, key)).href;
  }

  async delete(): Promise<void> {
    // Local files are cleaned up with the report dir; no-op here.
  }
}

// ---------------------------------------------------------------------------
// GitHub Artifacts uploader
// ---------------------------------------------------------------------------

/**
 * Zero-config uploader for GitHub Actions. Writes images into a directory that
 * the workflow can upload as an artifact, and returns URLs pointing at the
 * run's artifact page.
 *
 * This does not call the GitHub API directly (artifact upload is handled by
 * `actions/upload-artifact`); instead it stages files and produces best-effort
 * URLs from `GITHUB_*` env vars. Falls back to local file URLs when not in CI.
 */
export class GitHubArtifactUploader implements ImageUploader {
  private readonly stageDir: string;
  private readonly serverUrl: string;
  private readonly repo?: string;
  private readonly runId?: string;

  constructor(stageDir = resolve(process.cwd(), '.frontguard', 'artifacts')) {
    this.stageDir = stageDir;
    this.serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
    this.repo = process.env.GITHUB_REPOSITORY;
    this.runId = process.env.GITHUB_RUN_ID;
  }

  async upload(key: string, buffer: Buffer): Promise<string> {
    const filePath = join(this.stageDir, key);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, buffer);
    return this.getUrl(key);
  }

  getUrl(key: string): string {
    // When running in GitHub Actions, link to the run's artifacts page.
    if (this.repo && this.runId) {
      return `${this.serverUrl}/${this.repo}/actions/runs/${this.runId}#artifacts:${key}`;
    }
    // Outside CI, fall back to a file URL.
    return pathToFileURL(join(this.stageDir, key)).href;
  }

  async delete(): Promise<void> {
    // Artifacts are managed by GitHub retention; no-op.
  }
}

// ---------------------------------------------------------------------------
// S3-compatible uploader (AWS S3 + Cloudflare R2)
// ---------------------------------------------------------------------------

/**
 * S3-compatible uploader used by both AWS S3 (`s3`) and Cloudflare R2 (`r2`).
 * R2 differs only in `region: 'auto'` and a custom `endpoint`.
 *
 * Uses a dynamically-imported `@aws-sdk/client-s3` so the dependency is
 * optional. Credentials come from config or `FRONTGUARD_S3_ACCESS_KEY` /
 * `FRONTGUARD_S3_SECRET_KEY`.
 */
export class S3CompatibleUploader implements ImageUploader {
  private readonly config: ImageUploadConfig;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  // The S3 client is created lazily on first upload.
  private client: unknown;

  constructor(config: ImageUploadConfig) {
    this.config = config;

    const accessKeyId = config.accessKeyId ?? process.env.FRONTGUARD_S3_ACCESS_KEY;
    const secretAccessKey =
      config.secretAccessKey ?? process.env.FRONTGUARD_S3_SECRET_KEY;

    if (!config.bucket) {
      throw new Error(
        `imageUpload.bucket is required for the "${config.provider}" provider.`,
      );
    }
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        `Missing credentials for "${config.provider}" image upload. Set ` +
          'imageUpload.accessKeyId/secretAccessKey or the env vars ' +
          'FRONTGUARD_S3_ACCESS_KEY and FRONTGUARD_S3_SECRET_KEY.',
      );
    }

    this.bucket = config.bucket;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
  }

  /** Lazily constructs the S3 client via dynamic import. */
  private async getClient(): Promise<{
    client: { send: (cmd: unknown) => Promise<unknown> };
    PutObjectCommand: new (input: unknown) => unknown;
    DeleteObjectCommand: new (input: unknown) => unknown;
  }> {
    let mod: typeof import('@aws-sdk/client-s3');
    try {
      mod = await import('@aws-sdk/client-s3');
    } catch {
      throw new Error(
        'The "@aws-sdk/client-s3" package is required for R2/S3 image upload. ' +
          'Install it: npm install @aws-sdk/client-s3',
      );
    }

    if (!this.client) {
      this.client = new mod.S3Client({
        region: this.config.region ?? (this.config.provider === 'r2' ? 'auto' : 'us-east-1'),
        endpoint: this.config.endpoint,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
      });
    }

    return {
      client: this.client as { send: (cmd: unknown) => Promise<unknown> },
      PutObjectCommand: mod.PutObjectCommand as unknown as new (input: unknown) => unknown,
      DeleteObjectCommand: mod.DeleteObjectCommand as unknown as new (input: unknown) => unknown,
    };
  }

  async upload(key: string, buffer: Buffer, contentType = 'image/png'): Promise<string> {
    const { client, PutObjectCommand } = await this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return this.getUrl(key);
  }

  getUrl(key: string): string {
    if (this.config.publicUrlPrefix) {
      return `${this.config.publicUrlPrefix.replace(/\/$/, '')}/${key}`;
    }
    if (this.config.provider === 'r2' && this.config.endpoint) {
      return `${this.config.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    }
    const region = this.config.region ?? 'us-east-1';
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  async delete(key: string): Promise<void> {
    const { client, DeleteObjectCommand } = await this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an {@link ImageUploader} from config.
 *
 * @param config    - Image upload configuration.
 * @param outputDir - Fallback output dir for the `local` provider.
 */
export function createUploader(
  config: ImageUploadConfig,
  outputDir = './frontguard-report',
): ImageUploader {
  switch (config.provider) {
    case 'r2':
    case 's3':
      return new S3CompatibleUploader(config);
    case 'github-artifacts':
      return new GitHubArtifactUploader();
    case 'local':
      return new LocalUploader(config.outputDir ?? outputDir);
    default: {
      // Exhaustiveness guard.
      const never: never = config.provider;
      throw new Error(`Unknown image upload provider: ${String(never)}`);
    }
  }
}

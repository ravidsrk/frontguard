import { defineConfig } from 'tsup';
import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('./package.json') as {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

// Optional peer modules that the CLI imports lazily (inside try/catch) but
// intentionally does NOT declare in package.json — consumers install them only
// when they use the corresponding feature. They must be external so esbuild
// doesn't inline their (large) dependency trees; e.g. @aws-sdk/client-s3 pulls
// in the entire @smithy/* + fast-xml-parser tree (~1.4MB) for R2/S3 uploads.
const OPTIONAL_PEERS = ['@aws-sdk/client-s3'];

// As a published package, runtime deps are declared in package.json and resolved
// from node_modules at install time — they must NOT be inlined by the bundler.
// Externalizing all of them keeps dist/index.js (the library entry) thin and lets
// native/optional addons (better-sqlite3, playwright, @daytonaio/sdk) load at runtime.
const EXTERNAL = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...OPTIONAL_PEERS,
];

export default defineConfig([
  // CLI entry — gets shebang for bin
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    target: 'node18',
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    external: EXTERNAL,
    banner: { js: '#!/usr/bin/env node' },
  },
  // Library entries — no shebang
  {
    entry: {
      'index': 'src/core/pipeline.ts',
      'plugins/index': 'src/plugins/index.ts',
    },
    format: ['esm'],
    target: 'node18',
    dts: true,
    clean: false,
    splitting: false,
    sourcemap: true,
    external: EXTERNAL,
  },
]);

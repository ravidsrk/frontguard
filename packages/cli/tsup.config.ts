import { defineConfig } from 'tsup';

// Native/optional modules must stay external so their runtime addons resolve
// from node_modules instead of being inlined by the bundler.
const EXTERNAL = ['better-sqlite3', 'playwright', '@daytonaio/sdk'];

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

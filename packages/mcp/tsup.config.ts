import { defineConfig } from 'tsup';
import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('./package.json') as {
  dependencies?: Record<string, string>;
};

const EXTERNAL = Object.keys(pkg.dependencies ?? {});

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node18',
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    external: EXTERNAL,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: { 'tools/index': 'src/tools/index.ts' },
    format: ['esm'],
    target: 'node18',
    dts: true,
    clean: false,
    splitting: false,
    sourcemap: true,
    external: EXTERNAL,
  },
]);

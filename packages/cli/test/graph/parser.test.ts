import { describe, it, expect, afterEach } from 'vitest';
import { createTempDir, writeFiles } from '../fixtures/helpers.js';
import { parseImports, buildDependencyGraph } from '../../src/graph/parser.js';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('parseImports', () => {
  it('extracts ES module imports from a file', () => {
    const tmp = createTempDir();
    cleanup = tmp.cleanup;
    writeFiles(tmp.dir, {
      'index.ts': `
        import Button from './Button';
        import { useState } from 'react';
        import './styles.css';
      `,
      'Button.ts': 'export default function Button() {}',
      'styles.css': 'body { margin: 0; }',
    });
    const imports = parseImports(`${tmp.dir}/index.ts`);
    // Should resolve ./Button and ./styles.css, skip 'react' (bare specifier)
    expect(imports.length).toBeGreaterThanOrEqual(1);
    const names = imports.map(f => f.split('/').pop());
    expect(names).toContain('Button.ts');
  });

  it('extracts CSS @import', () => {
    const tmp = createTempDir();
    cleanup = tmp.cleanup;
    writeFiles(tmp.dir, {
      'main.css': `@import './reset.css';`,
      'reset.css': '* { margin: 0; }',
    });
    const imports = parseImports(`${tmp.dir}/main.css`);
    expect(imports.length).toBe(1);
    expect(imports[0]).toContain('reset.css');
  });

  it('extracts require() calls', () => {
    const tmp = createTempDir();
    cleanup = tmp.cleanup;
    writeFiles(tmp.dir, {
      'index.js': `const utils = require('./utils');`,
      'utils.js': 'module.exports = {};',
    });
    const imports = parseImports(`${tmp.dir}/index.js`);
    expect(imports.length).toBeGreaterThanOrEqual(1);
    expect(imports[0]).toContain('utils');
  });

  it('skips bare specifiers (node_modules)', () => {
    const tmp = createTempDir();
    cleanup = tmp.cleanup;
    writeFiles(tmp.dir, {
      'index.ts': `
        import React from 'react';
        import lodash from 'lodash';
        import { join } from 'node:path';
      `,
    });
    const imports = parseImports(`${tmp.dir}/index.ts`);
    // All are bare specifiers — should be empty
    expect(imports).toHaveLength(0);
  });

  it('returns empty array for non-existent file', () => {
    const imports = parseImports('/nonexistent/file.ts');
    expect(imports).toHaveLength(0);
  });

  it('resolves index files', () => {
    const tmp = createTempDir();
    cleanup = tmp.cleanup;
    writeFiles(tmp.dir, {
      'index.ts': `import { Button } from './components';`,
      'components/index.ts': 'export const Button = () => {};',
    });
    const imports = parseImports(`${tmp.dir}/index.ts`);
    expect(imports.length).toBe(1);
    expect(imports[0]).toContain('components');
  });
});

describe('buildDependencyGraph', () => {
  it('builds a graph from entry files', () => {
    const tmp = createTempDir();
    cleanup = tmp.cleanup;
    writeFiles(tmp.dir, {
      'page.ts': `import { Header } from './Header';`,
      'Header.ts': `import './header.css';`,
      'header.css': 'h1 { color: red; }',
    });
    const graph = buildDependencyGraph([`${tmp.dir}/page.ts`], tmp.dir);
    expect(graph.size).toBeGreaterThanOrEqual(1);
    const pageEntry = graph.get(`${tmp.dir}/page.ts`);
    expect(pageEntry).toBeDefined();
  });

  it('handles circular dependencies without infinite loop', () => {
    const tmp = createTempDir();
    cleanup = tmp.cleanup;
    writeFiles(tmp.dir, {
      'a.ts': `import './b';`,
      'b.ts': `import './a';`,
    });
    // Should not hang or throw
    const graph = buildDependencyGraph([`${tmp.dir}/a.ts`], tmp.dir);
    expect(graph.size).toBeGreaterThanOrEqual(2);
  });

  it('returns empty graph for non-existent entry', () => {
    const graph = buildDependencyGraph(['/nonexistent/entry.ts'], '/nonexistent');
    expect(graph.size).toBe(0); // Non-existent file not added to graph
  });
});

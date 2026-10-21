/**
 * Real parser, resolver, and git diffs. No browser.
 * A public asset changed beside a mapped route must not drop the asset's page.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FrontguardConfig, Route } from '../../src/core/types.js';
import { smartFilter } from '../../src/graph/filter.js';

const routes: Route[] = [{ path: '/' }, { path: '/about' }];
const config = { smartRender: true } as FrontguardConfig;
const directories: string[] = [];

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeTree(dir: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
}

function initFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'frontguard-smart-filter-'));
  directories.push(dir);
  writeTree(dir, files);
  git(dir, ['init', '--quiet']);
  git(dir, ['add', '.']);
  git(dir, [
    '-c', 'user.name=Frontguard fixture',
    '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '-m', 'Record fixture',
  ]);
  return dir;
}

const baseFiles = {
  'app/layout.tsx': 'export default function Layout({ children }) { return children; }\n',
  'app/page.tsx': 'export default function Home() { return <img src="/brand.svg" alt="Brand" />; }\n',
  'app/about/page.tsx': 'export default function About() { return <p>About</p>; }\n',
  'app/home.module.css': '.hero { background: url("/hero.png"); }\n',
  'public/brand.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>\n',
  'public/hero.png': 'png\n',
  'public/fonts/brand.woff2': 'font\n',
};

async function filterAfter(dir: string, mutate: () => void) {
  mutate();
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await smartFilter(routes, config);
  } finally {
    process.chdir(previous);
  }
}

afterEach(() => {
  for (const dir of directories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('smartFilter public assets', () => {
  it('keeps the homepage when a public svg changes beside another route', async () => {
    const dir = initFixture(baseFiles);
    const result = await filterAfter(dir, () => {
      writeFileSync(join(dir, 'public/brand.svg'), '<svg xmlns="http://www.w3.org/2000/svg" id="next"/>\n');
      writeFileSync(join(dir, 'app/about/page.tsx'), 'export default function About() { return <p>Updated</p>; }\n');
    });
    expect(result.filtered.map((route) => route.path).sort()).toEqual(['/', '/about']);
    expect(result.skipped).toHaveLength(0);
    expect(result.reason).toContain('public/brand.svg');
  });

  it('captures every route for an asset-only change', async () => {
    const dir = initFixture(baseFiles);
    const result = await filterAfter(dir, () => {
      writeFileSync(join(dir, 'public/brand.svg'), '<svg xmlns="http://www.w3.org/2000/svg" id="only"/>\n');
    });
    expect(result.filtered.map((route) => route.path).sort()).toEqual(['/', '/about']);
    expect(result.reason).toContain('public/brand.svg');
  });

  it('captures every route when a public image or font changes beside a mapped route', async () => {
    const dir = initFixture({
      ...baseFiles,
      'app/page.tsx': "import './home.module.css';\nexport default function Home() { return <div className=\"hero\" />; }\n",
    });
    const image = await filterAfter(dir, () => {
      writeFileSync(join(dir, 'public/hero.png'), 'png-next\n');
      writeFileSync(join(dir, 'app/about/page.tsx'), 'export default function About() { return <p>Updated</p>; }\n');
    });
    expect(image.reason).toContain('public/hero.png');
    expect(image.filtered.map((route) => route.path)).toContain('/');

    const fontDir = initFixture(baseFiles);
    const font = await filterAfter(fontDir, () => {
      writeFileSync(join(fontDir, 'public/fonts/brand.woff2'), 'font-next\n');
      writeFileSync(join(fontDir, 'app/about/page.tsx'), 'export default function About() { return <p>Updated</p>; }\n');
    });
    expect(font.reason).toContain('public/fonts/brand.woff2');
    expect(font.filtered.map((route) => route.path)).toContain('/');
  });

  it('captures every route when a public font is deleted beside a mapped route', async () => {
    const dir = initFixture(baseFiles);
    const result = await filterAfter(dir, () => {
      rmSync(join(dir, 'public/fonts/brand.woff2'));
      writeFileSync(join(dir, 'app/about/page.tsx'), 'export default function About() { return <p>Updated</p>; }\n');
    });
    expect(result.reason).toContain('removed file');
    expect(result.reason).toContain('brand.woff2');
    expect(result.filtered.map((route) => route.path)).toContain('/');
  });

  it('still scopes a route-only edit', async () => {
    const dir = initFixture(baseFiles);
    const result = await filterAfter(dir, () => {
      writeFileSync(join(dir, 'app/about/page.tsx'), 'export default function About() { return <p>Updated</p>; }\n');
    });
    expect(result.filtered.map((route) => route.path)).toEqual(['/about']);
    expect(result.skipped.map((route) => route.path)).toEqual(['/']);
    expect(result.reason).toContain('1/2');
  });

  it('expands when a route entry has an unresolved relative import', async () => {
    const dir = initFixture({
      ...baseFiles,
      'app/page.tsx': "import './missing-widget';\nexport default function Home() { return null; }\n",
    });
    const result = await filterAfter(dir, () => {
      writeFileSync(join(dir, 'app/about/page.tsx'), 'export default function About() { return <p>Updated</p>; }\n');
    });
    expect(result.reason).toContain('./missing-widget');
    expect(result.filtered.map((route) => route.path)).toContain('/');
  });
});

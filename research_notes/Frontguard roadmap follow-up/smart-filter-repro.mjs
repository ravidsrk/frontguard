/**
 * Run from the repository root:
 *   node --import tsx 'research_notes/Frontguard roadmap follow-up/smart-filter-repro.mjs'
 *
 * Uses the real smartFilter, parser and resolver with a disposable git repository.
 * No browser, network, dependency installation or application server is needed.
 * Exit 1 means an asset consumer was omitted; exit 0 means it was selected.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { smartFilter } from '../../packages/cli/src/graph/filter.ts';

const originalDirectory = process.cwd();
const fixtureDirectory = mkdtempSync(join(tmpdir(), 'frontguard-filter-evidence-'));
const git = (...args) => execFileSync('git', args, {
  cwd: fixtureDirectory,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  mkdirSync(join(fixtureDirectory, 'app', 'about'), { recursive: true });
  mkdirSync(join(fixtureDirectory, 'public'));
  writeFileSync(join(fixtureDirectory, 'app', 'layout.tsx'),
    'export default function Layout({ children }) { return <html lang="en"><body>{children}</body></html>; }\n');
  writeFileSync(join(fixtureDirectory, 'app', 'page.tsx'),
    'export default function Home() { return <img src="/brand.svg" alt="Brand" />; }\n');
  writeFileSync(join(fixtureDirectory, 'app', 'about', 'page.tsx'),
    'export default function About() { return <p>About</p>; }\n');
  const asset = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${color}"/></svg>\n`;
  writeFileSync(join(fixtureDirectory, 'public', 'brand.svg'), asset('red'));
  git('init', '--quiet');
  git('add', '.');
  git('-c', 'user.name=Frontguard research fixture',
    '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Record fixture');

  writeFileSync(join(fixtureDirectory, 'public', 'brand.svg'), asset('blue'));
  writeFileSync(join(fixtureDirectory, 'app', 'about', 'page.tsx'),
    'export default function About() { return <p>Updated about</p>; }\n');

  // The production entry point resolves files relative to process.cwd().
  process.chdir(fixtureDirectory);
  const result = await smartFilter([{ path: '/' }, { path: '/about' }], {
    smartRender: true,
  });
  const assetConsumerSelected = result.filtered.some((route) => route.path === '/');
  console.log(JSON.stringify({
    changedFiles: git('diff', '--name-only', 'HEAD').trim().split('\n'),
    selected: result.filtered.map((route) => route.path),
    skipped: result.skipped.map((route) => route.path),
    assetConsumerSelected,
    reason: result.reason,
    evidenceLimit: 'Route selection only; no rendered pixels or CLI exit code measured.',
  }, null, 2));
  process.exitCode = assetConsumerSelected ? 0 : 1;
} finally {
  process.chdir(originalDirectory);
  rmSync(fixtureDirectory, { recursive: true, force: true });
}

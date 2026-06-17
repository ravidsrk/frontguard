#!/usr/bin/env node
// prepublishOnly drift guard (install-7).
//
// The README bundled inside the npm tarball is packages/cli/README.md — it is
// what renders on the npmjs.com landing page, NOT the repo-root README. It has
// drifted before (shipped the v0.1.x copy on a 0.2.0 release). This guard fails
// the publish if the bundled README does not mention the current package
// version, so the textual copy can never silently fall behind package.json.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, '..', 'package.json');
const readmePath = resolve(here, '..', 'README.md');

const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
const readme = readFileSync(readmePath, 'utf8');

if (!readme.includes(version)) {
  console.error(
    `\n✘ README drift: packages/cli/README.md does not mention version ${version}.\n` +
      `  The npm tarball ships this README as the package landing page — refresh it\n` +
      `  (e.g. the "What's New in ${version}" section / version badge) before publishing.\n`,
  );
  process.exit(1);
}

console.log(`✓ README mentions version ${version}`);

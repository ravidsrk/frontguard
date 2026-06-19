#!/usr/bin/env node
/**
 * Generate the repo-root action.yml shim from the canonical manifest at
 * packages/cli/action.yml.
 *
 * GitHub resolves `uses: <owner>/<repo>@<ref>` against action.yml at the
 * repository root — not a sub-path. The root shim must mirror the canonical
 * manifest body exactly; edit packages/cli/action.yml and re-run this script.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');
const canonicalPath = join(repoRoot, 'packages/cli/action.yml');
const rootPath = join(repoRoot, 'action.yml');

const canonical = readFileSync(canonicalPath, 'utf8');

const header = `# Repo-root composite-action shim.
#
# GitHub resolves \`uses: <owner>/<repo>@<ref>\` against an \`action.yml\` at the
# repository ROOT — it does NOT honour a sub-path \`action.yml\` by default. The
# canonical manifest lives at \`packages/cli/action.yml\`; this root shim mirrors
# it byte-for-byte (same inputs, outputs, and steps) so that
# \`uses: ravidsrk/frontguard@v0\` resolves end-to-end.
#
# Why the steps are duplicated rather than delegated via \`uses: ./packages/cli\`:
# a local-path \`uses:\` inside a composite action is resolved against the
# CONSUMER's checkout, which will not contain \`packages/cli\`. Re-implementing
# the steps here is the only form that works for an external consumer pinning
# \`ravidsrk/frontguard@v0\`.
#
# GENERATED BODY — do not edit the steps below. Edit \`packages/cli/action.yml\`
# and run \`node packages/cli/scripts/sync-root-action.mjs\`.
#
# Sub-path consumers (\`uses: ravidsrk/frontguard/packages/cli@v0.2.0\`) continue
# to resolve against \`packages/cli/action.yml\` — that file is intentionally
# preserved.
`;

writeFileSync(rootPath, `${header}\n${canonical.endsWith('\n') ? canonical : `${canonical}\n`}`);
console.log(`Synced ${rootPath} from ${canonicalPath}`);
#!/usr/bin/env node
/**
 * Materialize version-pinned action manifests from packages/cli/action.template.yml
 * and generate the repo-root shim.
 *
 * Edit action.template.yml (uses @@FRONTGUARD_VERSION@@ placeholder), then run:
 *   node packages/cli/scripts/sync-root-action.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');
const templatePath = join(repoRoot, 'packages/cli/action.template.yml');
const canonicalPath = join(repoRoot, 'packages/cli/action.yml');
const rootPath = join(repoRoot, 'action.yml');
const actionRunnerPath = join(repoRoot, 'packages/cli/action-run.sh');
const rootActionRunnerPath = join(repoRoot, 'action-run.sh');
const dockerfilePath = join(repoRoot, 'packages/cli/Dockerfile');

const version = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();
const cliPkg = JSON.parse(readFileSync(join(repoRoot, 'packages/cli/package.json'), 'utf8'));
if (cliPkg.version !== version) {
  console.error(
    `VERSION (${version}) does not match packages/cli/package.json (${cliPkg.version})`,
  );
  process.exit(1);
}

const template = readFileSync(templatePath, 'utf8');
if (!template.includes('@@FRONTGUARD_VERSION@@')) {
  console.error(
    'packages/cli/action.template.yml must contain @@FRONTGUARD_VERSION@@ placeholder',
  );
  process.exit(1);
}

const canonical = template.replaceAll('@@FRONTGUARD_VERSION@@', version);
const canonicalBody = canonical.endsWith('\n') ? canonical : `${canonical}\n`;
writeFileSync(canonicalPath, canonicalBody);

const header = `# Repo-root composite-action shim.
#
# GitHub resolves \`uses: <owner>/<repo>@<ref>\` against an \`action.yml\` at the
# repository ROOT — it does NOT honour a sub-path \`action.yml\` by default. The
# canonical manifest lives at \`packages/cli/action.yml\`; this root shim mirrors
# it byte-for-byte (same inputs, outputs, and steps). The mutable public \`v0\`
# reference remains pre-release until its external consumer smoke passes.
#
# Why the steps are duplicated rather than delegated via \`uses: ./packages/cli\`:
# a local-path \`uses:\` inside a composite action is resolved against the
# CONSUMER's checkout, which will not contain \`packages/cli\`. Re-implementing
# the steps here is the form intended for a future validated external consumer.
#
# GENERATED BODY — do not edit the steps below. Edit \`packages/cli/action.template.yml\`
# and run \`node packages/cli/scripts/sync-root-action.mjs\`.
#
# Sub-path consumers (\`uses: ravidsrk/frontguard/packages/cli@${version}\`) continue
# to resolve against \`packages/cli/action.yml\` — that file is intentionally
# preserved.
`;

writeFileSync(rootPath, `${header}\n${canonicalBody}`);
writeFileSync(rootActionRunnerPath, readFileSync(actionRunnerPath, 'utf8'));

let dockerfile = readFileSync(dockerfilePath, 'utf8');
dockerfile = dockerfile.replace(
  /npm install -g @frontguard\/cli@[^\s]+/,
  `npm install -g @frontguard/cli@${version}`,
);
writeFileSync(dockerfilePath, dockerfile);

console.log(`Synced action manifests, runner, and Dockerfile to @frontguard/cli@${version}`);

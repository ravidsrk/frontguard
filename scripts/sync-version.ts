/**
 * sync-version — propagate the root VERSION file to every version-coupled location.
 *
 * VERSION is the single source of truth (release.sh validates package.json == VERSION).
 * The release version is hardcoded in several places that `changeset version` does NOT
 * touch; this keeps them all in sync. Run after bumping VERSION:
 *
 *   npm run sync-version          # write the propagated version everywhere
 *   npm run sync-version -- --check   # exit non-zero if anything is out of sync (CI/pre-commit)
 *
 * Adding a new version-coupled file? Add a target below — do not hardcode the version elsewhere.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

const version = readFileSync(join(ROOT, "VERSION"), "utf8").trim();
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`✗ VERSION is not valid semver: "${version}"`);
  process.exit(1);
}

// Publishable packages whose package.json version tracks VERSION.
// Keep in sync with scripts/release.sh NPM_PACKAGES. Private packages are intentionally excluded
// (cloud-api, slack-app, github-app, vercel version independently).
const PUBLISHABLE_PKGS = [
  "packages/cli",
  "packages/playwright",
  "packages/mcp",
  "packages/create-frontguard-plugin",
  "integrations/netlify",
];

type Edit = { find: RegExp; replace: string; label: string };

// Non-package.json files that hardcode the release version, with the exact pattern to rewrite.
const FILE_EDITS: Array<{ file: string; edits: Edit[] }> = [
  {
    file: "action.yml",
    edits: [
      {
        find: /FRONTGUARD_CLI_VERSION: '[^']*'/g,
        replace: `FRONTGUARD_CLI_VERSION: '${version}'`,
        label: "FRONTGUARD_CLI_VERSION",
      },
      {
        find: /packages\/cli@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
        replace: `packages/cli@${version}`,
        label: "sub-path comment",
      },
    ],
  },
  {
    file: "packages/cli/action.yml",
    edits: [
      {
        find: /FRONTGUARD_CLI_VERSION: '[^']*'/g,
        replace: `FRONTGUARD_CLI_VERSION: '${version}'`,
        label: "FRONTGUARD_CLI_VERSION",
      },
    ],
  },
  {
    file: "packages/cli/Dockerfile",
    edits: [
      {
        find: /@frontguard\/cli@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
        replace: `@frontguard/cli@${version}`,
        label: "pinned install",
      },
    ],
  },
  {
    file: "packages/cli/src/cli/index.ts",
    edits: [
      {
        find: /const VERSION = '[^']*';/g,
        replace: `const VERSION = '${version}';`,
        label: "cli --version",
      },
    ],
  },
  {
    file: "packages/cli/src/cli/render.ts",
    edits: [
      {
        find: /const VERSION = '[^']*';/g,
        replace: `const VERSION = '${version}';`,
        label: "render --version",
      },
    ],
  },
  {
    file: "packages/mcp/src/index.ts",
    edits: [
      {
        find: /const SERVER_VERSION = '[^']*';/g,
        replace: `const SERVER_VERSION = '${version}';`,
        label: "mcp SERVER_VERSION",
      },
    ],
  },
  {
    file: "packages/cli/README.md",
    edits: [
      {
        find: /frontguard v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
        replace: `frontguard v${version}`,
        label: "CLI-output example",
      },
    ],
  },
];

const drift: string[] = [];

function syncFile(rel: string, transform: (src: string) => string): void {
  const path = join(ROOT, rel);
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) return;
  drift.push(rel);
  if (!CHECK) writeFileSync(path, after);
}

// Publishable package.json versions (only the top-level "version" field).
for (const pkg of PUBLISHABLE_PKGS) {
  syncFile(`${pkg}/package.json`, (src) =>
    src.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`),
  );
}

// Hardcoded version strings in source/config.
for (const { file, edits } of FILE_EDITS) {
  syncFile(file, (src) =>
    edits.reduce((s, e) => s.replace(e.find, e.replace), src),
  );
}

if (CHECK) {
  if (drift.length) {
    console.error(
      `✗ ${drift.length} file(s) out of sync with VERSION (${version}):`,
    );
    for (const f of drift) console.error(`    ${f}`);
    console.error("Run: npm run sync-version");
    process.exit(1);
  }
  console.log(`✓ all version-coupled files match VERSION (${version})`);
} else {
  if (drift.length) {
    console.log(`✓ synced ${drift.length} file(s) to VERSION (${version}):`);
    for (const f of drift) console.log(`    ${f}`);
  } else {
    console.log(`✓ already in sync with VERSION (${version})`);
  }
}

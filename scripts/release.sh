#!/usr/bin/env bash
# Frontguard release orchestrator.
#
# Usage:
#   scripts/release.sh             # full release (requires NPM_TOKEN)
#   scripts/release.sh --dry-run   # validate everything end-to-end, publish nothing
#   scripts/release.sh --skip-build
#   scripts/release.sh --only-npm  # skip the marketplace checklist section
#
# This script is the single source of truth for what shipping a Frontguard
# release looks like. It is idempotent and safe to re-run. In --dry-run mode
# no external state is mutated — no npm publish, no git tag, no commits.

set -euo pipefail

# ----------------------------------------------------------------------------
# Config
# ----------------------------------------------------------------------------

DRY_RUN=0
SKIP_BUILD=0
ONLY_NPM=0

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$ROOT_DIR/VERSION"

# npm packages that we publish to the public registry.
# Format: "<workspace-path>:<expected-name>"
NPM_PACKAGES=(
  "packages/cli:@frontguard/cli"
  "packages/playwright:@frontguard/playwright"
  "packages/mcp:@frontguard/mcp"
  "packages/create-frontguard-plugin:create-frontguard-plugin"
  "integrations/netlify:@frontguard/netlify-plugin"
)

# Marketplace targets we *cannot* publish from a script — they require human
# review or owner-only credentials. The script prints each one's submission
# URL and the artifact path the user needs to upload.
declare -a MARKETPLACES=(
  "GitHub Marketplace|integrations/github-app/manifest.yml|https://github.com/marketplace/new"
  "Vercel Marketplace|integrations/vercel/frontguard.config.ts|https://vercel.com/dashboard/integrations/console"
  "Netlify Build Plugins|integrations/netlify/manifest.yml|https://app.netlify.com/integrations/build-plugins"
  "Slack App Directory|integrations/slack-app/manifest.yml|https://api.slack.com/apps"
)

# ----------------------------------------------------------------------------
# Plumbing
# ----------------------------------------------------------------------------

color() {
  # color <code> <text...>
  local code=$1; shift
  printf '\033[%sm%s\033[0m\n' "$code" "$*"
}
info() { color "0;36" "==> $*"; }
ok()   { color "0;32" "OK  $*"; }
warn() { color "0;33" "!!  $*"; }
fail() { color "0;31" "ERR $*" >&2; exit 1; }

run() {
  # run <cmd...> — echoes the command, then runs it. In --dry-run mode it
  # only echoes (with a "[dry]" prefix) and does not execute.
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '    [dry] %s\n' "$*"
    return 0
  fi
  printf '    $ %s\n' "$*"
  "$@"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

# ----------------------------------------------------------------------------
# Arg parsing
# ----------------------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)    DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --only-npm)   ONLY_NPM=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) fail "Unknown flag: $1" ;;
  esac
  shift
done

cd "$ROOT_DIR"

# ----------------------------------------------------------------------------
# Preflight
# ----------------------------------------------------------------------------

[ -f "$VERSION_FILE" ] || fail "VERSION file missing at $VERSION_FILE"
VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
[ -n "$VERSION" ] || fail "VERSION file is empty"
info "Release version: $VERSION"

require_cmd node
require_cmd npm
require_cmd git
require_cmd jq

# Bail early if the tree is dirty unless we're in dry-run mode.
if [ "$DRY_RUN" -eq 0 ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    fail "Working tree is dirty — commit or stash before releasing."
  fi
fi

# Check that each publishable package.json's version matches VERSION.
for entry in "${NPM_PACKAGES[@]}"; do
  pkg_path="${entry%%:*}"
  pkg_name="${entry##*:}"
  pkg_json="$ROOT_DIR/$pkg_path/package.json"
  [ -f "$pkg_json" ] || fail "Missing package.json at $pkg_json"

  found_name="$(jq -r '.name' "$pkg_json")"
  found_version="$(jq -r '.version' "$pkg_json")"
  [ "$found_name" = "$pkg_name" ] || fail "$pkg_path: name '$found_name' != expected '$pkg_name'"
  [ "$found_version" = "$VERSION" ] || fail "$pkg_path: version '$found_version' != VERSION '$VERSION'"

  # Scoped packages must publish as public.
  case "$pkg_name" in
    @*/*)
      access="$(jq -r '.publishConfig.access // "missing"' "$pkg_json")"
      [ "$access" = "public" ] || fail "$pkg_path: publishConfig.access must be 'public' (got '$access')"
      ;;
  esac

  # Reject 'private: true' on publishable packages.
  is_private="$(jq -r '.private // false' "$pkg_json")"
  [ "$is_private" = "false" ] || fail "$pkg_path: 'private: true' would block npm publish"
  ok "$pkg_name@$VERSION metadata OK"
done

# ----------------------------------------------------------------------------
# Build
# ----------------------------------------------------------------------------

if [ "$SKIP_BUILD" -eq 1 ]; then
  warn "Skipping build (--skip-build)"
else
  info "Building all workspaces"
  run npm run build --workspaces --if-present
fi

# ----------------------------------------------------------------------------
# npm pack --dry-run (always) — catches bad files entries before publish.
# ----------------------------------------------------------------------------

info "Verifying tarball contents (npm pack --dry-run)"
for entry in "${NPM_PACKAGES[@]}"; do
  pkg_path="${entry%%:*}"
  pkg_name="${entry##*:}"
  (
    cd "$ROOT_DIR/$pkg_path"
    npm pack --dry-run --json > /tmp/frontguard-pack.json 2>/dev/null || \
      npm pack --dry-run 2>&1 | tail -20
  )
  ok "$pkg_name pack succeeded"
done

# ----------------------------------------------------------------------------
# npm publish
# ----------------------------------------------------------------------------

info "Publishing npm packages"
if [ "$DRY_RUN" -eq 0 ]; then
  [ -n "${NPM_TOKEN:-}" ] || fail "NPM_TOKEN env var required (not set). Use --dry-run to validate without secrets."
  printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > "$HOME/.npmrc.frontguard-release"
  export NPM_CONFIG_USERCONFIG="$HOME/.npmrc.frontguard-release"
  trap 'rm -f "$HOME/.npmrc.frontguard-release"' EXIT
fi

# Provenance signing only works when the publish runs inside a recognised
# CI provider (GitHub Actions / GitLab CI / CircleCI / Buildkite). When run
# locally we must opt out explicitly, otherwise npm refuses to publish any
# package whose package.json declares `publishConfig.provenance: true`.
PUBLISH_FLAGS=(--access public)
if [ -z "${CI:-}" ] && [ -z "${GITHUB_ACTIONS:-}" ]; then
  PUBLISH_FLAGS+=(--provenance=false)
fi

for entry in "${NPM_PACKAGES[@]}"; do
  pkg_path="${entry%%:*}"
  pkg_name="${entry##*:}"

  # Skip if this exact version is already on the registry. Allows re-running
  # the script after a partial failure without duplicate-publish errors.
  if [ "$DRY_RUN" -eq 0 ]; then
    if npm view "$pkg_name@$VERSION" version >/dev/null 2>&1; then
      warn "$pkg_name@$VERSION already on registry — skipping"
      continue
    fi
  fi

  (
    cd "$ROOT_DIR/$pkg_path"
    run npm publish "${PUBLISH_FLAGS[@]}"
  )
  ok "$pkg_name@$VERSION published"
done

# ----------------------------------------------------------------------------
# Marketplace submission checklist
# ----------------------------------------------------------------------------

if [ "$ONLY_NPM" -eq 1 ]; then
  ok "npm publish complete (--only-npm). Skipping marketplace checklist."
  exit 0
fi

info "Marketplace submission checklist"
cat <<'EOF'

The following surfaces require manual review / owner credentials and cannot
be published from CI. For each, the script confirms the manifest exists and
prints the submission URL the release owner must visit.

EOF

for entry in "${MARKETPLACES[@]}"; do
  IFS='|' read -r name manifest url <<< "$entry"
  manifest_path="$ROOT_DIR/$manifest"
  if [ -f "$manifest_path" ]; then
    ok "$name — manifest at $manifest"
  else
    warn "$name — manifest missing at $manifest"
  fi
  printf '    submit: %s\n\n' "$url"
done

# ----------------------------------------------------------------------------
# CHANGELOG entry stub
# ----------------------------------------------------------------------------

info "Per-release CHANGELOG entry"
mkdir -p "$ROOT_DIR/.release-notes"
CHANGELOG_STUB="$ROOT_DIR/.release-notes/$VERSION.md"
{
  printf '## [%s] - %s\n\n' "$VERSION" "$(date +%Y-%m-%d 2>/dev/null || echo 'TODO-DATE')"
  printf '### npm\n\n'
  for entry in "${NPM_PACKAGES[@]}"; do
    pkg_name="${entry##*:}"
    printf -- '- %s@%s\n' "$pkg_name" "$VERSION"
  done
  printf '\n### Marketplace listings\n\n'
  for entry in "${MARKETPLACES[@]}"; do
    IFS='|' read -r name _ url <<< "$entry"
    printf -- '- %s — submission queue: %s\n' "$name" "$url"
  done
} > "$CHANGELOG_STUB"
ok "Release notes draft: $CHANGELOG_STUB"

if [ "$DRY_RUN" -eq 1 ]; then
  ok "Dry-run complete. No npm publish, no marketplace submission, no git tags."
else
  ok "Release $VERSION published. Submit the marketplace listings above by hand."
fi

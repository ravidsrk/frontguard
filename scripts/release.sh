#!/usr/bin/env bash
# Frontguard release orchestrator.
#
# Usage:
#   scripts/release.sh                       # publish from an approved immutable tag
#   scripts/release.sh --dry-run             # run local validation/build/pack only
#   scripts/release.sh --dry-run --require-prepared
#   scripts/release.sh --skip-build
#   scripts/release.sh --only-npm

set -euo pipefail

DRY_RUN=0
SKIP_BUILD=0
ONLY_NPM=0
REQUIRE_PREPARED=0

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$ROOT_DIR/VERSION"
CHANGELOG_FILE="$ROOT_DIR/CHANGELOG.md"
LOCK_FILE="$ROOT_DIR/package-lock.json"

# Format: "<workspace-path>:<expected-name>"
NPM_PACKAGES=(
  "packages/cli:@frontguard/cli"
  "packages/playwright:@frontguard/playwright"
  "packages/mcp:@frontguard/mcp"
  "packages/create-frontguard-plugin:create-frontguard-plugin"
  "integrations/netlify:@frontguard/netlify-plugin"
)

declare -a MARKETPLACES=(
  "GitHub Marketplace|integrations/github-app/manifest.yml|https://github.com/marketplace/new"
  "Vercel Marketplace|integrations/vercel/frontguard.config.ts|https://vercel.com/dashboard/integrations/console"
  "Netlify Build Plugins|integrations/netlify/manifest.yml|https://app.netlify.com/integrations/build-plugins"
  "Slack App Directory|integrations/slack-app/manifest.yml|https://api.slack.com/apps"
)

color() {
  local code=$1
  shift
  printf '\033[%sm%s\033[0m\n' "$code" "$*"
}

info() { color "0;36" "==> $*"; }
ok() { color "0;32" "OK  $*"; }
warn() { color "0;33" "!!  $*"; }
fail() { color "0;31" "ERR $*" >&2; exit 1; }

run() {
  printf '    $'
  printf ' %q' "$@"
  printf '\n'
  "$@"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

validate_iso_date() {
  node -e '
    const value = process.argv[1];
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
      process.exit(1);
    }
  ' "$1"
}

validate_publish_context() {
  local expected_tag="v$VERSION"
  local event_sha

  [ "${GITHUB_ACTIONS:-}" = "true" ] || fail "Publication is restricted to GitHub Actions."
  [ "${GITHUB_EVENT_NAME:-}" = "push" ] || fail "Publication requires a tag push; ${GITHUB_EVENT_NAME:-no event} cannot publish."
  [ "${GITHUB_REF_TYPE:-}" = "tag" ] || fail "Publication requires a tag ref."
  [ "${GITHUB_REF_NAME:-}" = "$expected_tag" ] || fail "Tag '${GITHUB_REF_NAME:-}' must exactly match '$expected_tag'."
  [ "${GITHUB_REF:-}" = "refs/tags/$expected_tag" ] || fail "Ref '${GITHUB_REF:-}' must exactly match 'refs/tags/$expected_tag'."
  [ -n "${GITHUB_SHA:-}" ] || fail "GITHUB_SHA is required for publication."
  [ -n "${RELEASE_SOURCE_SHA:-}" ] || fail "RELEASE_SOURCE_SHA is required for publication."
  [ "${RELEASE_APPROVED_SHA:-}" = "$RELEASE_SOURCE_SHA" ] || fail "The release commit is not the CI-approved commit."
  [ "${RELEASE_IMMUTABLE:-}" = "true" ] || fail "The GitHub Release and tag must be immutable before npm publication."

  event_sha="$(git rev-parse "${GITHUB_SHA}^{commit}" 2>/dev/null)" || fail "GITHUB_SHA does not resolve to a commit."
  [ "$event_sha" = "$RELEASE_SOURCE_SHA" ] || fail "The approved release SHA does not match the tag event SHA."
  ok "Publication context is approved for $expected_tag at $RELEASE_SOURCE_SHA"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --only-npm) ONLY_NPM=1 ;;
    --require-prepared) REQUIRE_PREPARED=1 ;;
    -h|--help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *) fail "Unknown flag: $1" ;;
  esac
  shift
done

cd "$ROOT_DIR"

[ -f "$VERSION_FILE" ] || fail "VERSION file missing at $VERSION_FILE"
[ -f "$CHANGELOG_FILE" ] || fail "CHANGELOG.md is missing."
[ -f "$LOCK_FILE" ] || fail "package-lock.json is missing."

VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
[[ "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]] || \
  fail "VERSION '$VERSION' is not a semantic version."
info "Release version: $VERSION"

require_cmd git
require_cmd jq
require_cmd node
require_cmd npm
require_cmd shasum

SOURCE_SHA="${RELEASE_SOURCE_SHA:-${GITHUB_SHA:-}}"
if [ -z "$SOURCE_SHA" ]; then
  SOURCE_SHA="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
fi

if [ "$DRY_RUN" -eq 0 ]; then
  validate_publish_context
  [ -z "$(git status --porcelain)" ] || fail "Working tree is dirty; publication requires a clean checkout."
fi

if [ -n "${RELEASE_EVIDENCE_DIR:-}" ]; then
  EVIDENCE_DIR="$RELEASE_EVIDENCE_DIR"
  mkdir -p "$EVIDENCE_DIR"
else
  EVIDENCE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/frontguard-release.XXXXXX")"
fi

ROOT_REAL="$(cd "$ROOT_DIR" && pwd -P)"
EVIDENCE_REAL="$(cd "$EVIDENCE_DIR" && pwd -P)"
case "$EVIDENCE_REAL/" in
  "$ROOT_REAL/"*) fail "Release evidence must be outside the worktree (got $EVIDENCE_REAL)." ;;
esac
EVIDENCE_DIR="$EVIDENCE_REAL"
info "Release evidence directory: $EVIDENCE_DIR"

jq -e '.lockfileVersion == 3 and (.packages | type == "object")' "$LOCK_FILE" >/dev/null || \
  fail "package-lock.json must be a lockfileVersion 3 workspace lock."

PACKAGES_JSON='[]'
for entry in "${NPM_PACKAGES[@]}"; do
  pkg_path="${entry%%:*}"
  pkg_name="${entry##*:}"
  pkg_json="$ROOT_DIR/$pkg_path/package.json"
  [ -f "$pkg_json" ] || fail "Missing package.json at $pkg_json"

  found_name="$(jq -r '.name // empty' "$pkg_json")"
  found_version="$(jq -r '.version // empty' "$pkg_json")"
  [ "$found_name" = "$pkg_name" ] || fail "$pkg_path: name '$found_name' != expected '$pkg_name'"
  [ "$found_version" = "$VERSION" ] || fail "$pkg_path: version '$found_version' != VERSION '$VERSION'"

  lock_version="$(jq -r --arg path "$pkg_path" '.packages[$path].version // empty' "$LOCK_FILE")"
  [ "$lock_version" = "$VERSION" ] || fail "$pkg_path: package-lock root version '$lock_version' != VERSION '$VERSION'"
  lock_name="$(jq -r --arg path "$pkg_path" '.packages[$path].name // empty' "$LOCK_FILE")"
  if [ -n "$lock_name" ] && [ "$lock_name" != "$pkg_name" ]; then
    fail "$pkg_path: package-lock root name '$lock_name' != expected '$pkg_name'"
  fi

  case "$pkg_name" in
    @*/*)
      access="$(jq -r '.publishConfig.access // "missing"' "$pkg_json")"
      [ "$access" = "public" ] || fail "$pkg_path: publishConfig.access must be 'public' (got '$access')"
      ;;
  esac

  is_private="$(jq -r '.private // false' "$pkg_json")"
  [ "$is_private" = "false" ] || fail "$pkg_path: 'private: true' would block npm publish"
  provenance="$(jq -r '.publishConfig.provenance // false' "$pkg_json")"
  PACKAGES_JSON="$(jq \
    --arg path "$pkg_path" \
    --arg name "$pkg_name" \
    --arg version "$VERSION" \
    --argjson provenance "$provenance" \
    '. + [{path: $path, name: $name, version: $version, npmProvenance: $provenance}]' \
    <<< "$PACKAGES_JSON")"
  ok "$pkg_name@$VERSION package and lock metadata OK"
done

grep -Fxq '## [Unreleased]' "$CHANGELOG_FILE" || fail "CHANGELOG.md must retain an [Unreleased] section."

while IFS= read -r release_heading; do
  [ "$release_heading" = '## [Unreleased]' ] && continue
  if [[ "$release_heading" =~ ^##\ \[[^]]+\]\ -\ ([0-9]{4}-[0-9]{2}-[0-9]{2})$ ]]; then
    validate_iso_date "${BASH_REMATCH[1]}" || fail "Invalid CHANGELOG date in: $release_heading"
  else
    fail "Versioned CHANGELOG headings must be dated: $release_heading"
  fi
done < <(grep -E '^## \[' "$CHANGELOG_FILE" || true)

VERSION_REGEX="${VERSION//./\.}"
version_headings="$(grep -E "^## \\[$VERSION_REGEX\\]($| )" "$CHANGELOG_FILE" || true)"
heading_count="$(printf '%s\n' "$version_headings" | awk 'NF { count++ } END { print count + 0 }')"
[ "$heading_count" -le 1 ] || fail "CHANGELOG.md contains multiple entries for $VERSION."

RELEASE_STATUS="unreleased"
RELEASE_DATE=""
RELEASE_HEADING=""
if [ "$heading_count" -eq 1 ]; then
  RELEASE_HEADING="$version_headings"
  if [[ "$RELEASE_HEADING" =~ ^##\ \[$VERSION_REGEX\]\ -\ ([0-9]{4}-[0-9]{2}-[0-9]{2})$ ]]; then
    RELEASE_DATE="${BASH_REMATCH[1]}"
    validate_iso_date "$RELEASE_DATE" || fail "CHANGELOG.md has an invalid release date for $VERSION."
    RELEASE_STATUS="prepared"
  else
    fail "CHANGELOG entry for $VERSION must be exactly '## [$VERSION] - YYYY-MM-DD'."
  fi
fi

if [ "$RELEASE_STATUS" = "prepared" ]; then
  RELEASE_SECTION="$(awk -v heading="$RELEASE_HEADING" '
    $0 == heading { capture = 1 }
    capture {
      if (seen && /^## \[/) exit
      print
      seen = 1
    }
  ' "$CHANGELOG_FILE")"
  for entry in "${NPM_PACKAGES[@]}"; do
    pkg_name="${entry##*:}"
    grep -Fq -- "- \`$pkg_name@$VERSION\`" <<< "$RELEASE_SECTION" || \
      fail "CHANGELOG entry for $VERSION must list $pkg_name@$VERSION."
  done
  ok "Dated CHANGELOG entry for $VERSION is release-prepared ($RELEASE_DATE)"
else
  ok "Source $VERSION remains under [Unreleased]; no published release is claimed"
fi

if [ "$REQUIRE_PREPARED" -eq 1 ] || [ "$DRY_RUN" -eq 0 ]; then
  [ "$RELEASE_STATUS" = "prepared" ] || \
    fail "Release $VERSION is not prepared. Add a dated CHANGELOG entry and published-package list explicitly before tagging."
fi

if [ "$SKIP_BUILD" -eq 1 ]; then
  warn "Skipping build (--skip-build)"
else
  info "Building all workspaces"
  run npm run build --workspaces --if-present
fi

info "Verifying tarball contents (npm pack --dry-run)"
for entry in "${NPM_PACKAGES[@]}"; do
  pkg_path="${entry%%:*}"
  pkg_name="${entry##*:}"
  evidence_name="${pkg_name#@}"
  evidence_name="${evidence_name//\//-}"
  pack_evidence="$EVIDENCE_DIR/$evidence_name.pack.json"

  if ! (cd "$ROOT_DIR/$pkg_path" && npm pack --dry-run --json) > "$pack_evidence"; then
    fail "$pkg_name npm pack --dry-run failed"
  fi
  jq -e 'type == "array" and length > 0 and (.[0].filename | type == "string")' "$pack_evidence" >/dev/null || \
    fail "$pkg_name npm pack did not produce valid JSON evidence"
  ok "$pkg_name pack succeeded"
done

if [ "$RELEASE_STATUS" = "prepared" ]; then
  printf '%s\n' "$RELEASE_SECTION" > "$EVIDENCE_DIR/release-notes.md"
else
  {
    printf '# Unreleased source validation: %s\n\n' "$VERSION"
    printf 'Source version %s remains unreleased. This is validation evidence, not a publication record.\n\n' "$VERSION"
    awk '
      $0 == "## [Unreleased]" { capture = 1 }
      capture {
        if (seen && /^## \[/) exit
        print
        seen = 1
      }
    ' "$CHANGELOG_FILE"
  } > "$EVIDENCE_DIR/release-notes.md"
fi

GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
WORKFLOW_URL=""
CI_APPROVAL_URL="${RELEASE_CI_URL:-}"
EVIDENCE_TAG=""
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GITHUB_RUN_ID:-}" ]; then
  WORKFLOW_URL="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
fi
if [ "${GITHUB_REF_TYPE:-}" = "tag" ]; then
  EVIDENCE_TAG="${GITHUB_REF_NAME:-}"
fi

jq -n \
  --arg version "$VERSION" \
  --arg status "$RELEASE_STATUS" \
  --arg releaseDate "$RELEASE_DATE" \
  --arg sourceSha "$SOURCE_SHA" \
  --arg tag "$EVIDENCE_TAG" \
  --arg generatedAt "$GENERATED_AT" \
  --arg workflowUrl "$WORKFLOW_URL" \
  --arg ciApprovalUrl "$CI_APPROVAL_URL" \
  --argjson packages "$PACKAGES_JSON" \
  '{
    schemaVersion: 1,
    version: $version,
    releaseStatus: $status,
    releaseDate: (if $releaseDate == "" then null else $releaseDate end),
    sourceSha: $sourceSha,
    tag: (if $tag == "" then null else $tag end),
    generatedAt: $generatedAt,
    workflowUrl: (if $workflowUrl == "" then null else $workflowUrl end),
    ciApprovalUrl: (if $ciApprovalUrl == "" then null else $ciApprovalUrl end),
    packages: $packages
  }' > "$EVIDENCE_DIR/release-evidence.json"

(
  cd "$EVIDENCE_DIR"
  : > SHA256SUMS
  for evidence_file in release-evidence.json release-notes.md ./*.pack.json; do
    [ -f "$evidence_file" ] || continue
    shasum -a 256 "$evidence_file" >> SHA256SUMS
  done
)
ok "Validation evidence written outside the worktree: $EVIDENCE_DIR"

if [ "$DRY_RUN" -eq 1 ]; then
  ok "Dry-run complete. Local validation, build, and pack ran; external publication was suppressed."
else
  info "Publishing npm packages"
  [ -n "${NPM_TOKEN:-}" ] || fail "NPM_TOKEN env var required for publication."
  NPMRC_PATH="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/frontguard-npmrc.$$"
  printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > "$NPMRC_PATH"
  export NPM_CONFIG_USERCONFIG="$NPMRC_PATH"
  trap 'rm -f "$NPMRC_PATH"' EXIT

  for entry in "${NPM_PACKAGES[@]}"; do
    pkg_path="${entry%%:*}"
    pkg_name="${entry##*:}"
    if npm view "$pkg_name@$VERSION" version >/dev/null 2>&1; then
      warn "$pkg_name@$VERSION already exists on the registry; skipping"
      continue
    fi

    publish_flags=(--access public)
    if [ "$(jq -r '.publishConfig.provenance // false' "$ROOT_DIR/$pkg_path/package.json")" = "true" ]; then
      publish_flags+=(--provenance)
    fi
    (cd "$ROOT_DIR/$pkg_path" && run npm publish "${publish_flags[@]}")

    if [[ "$pkg_name" == @*/* ]]; then
      if ! run npm access set status=public "$pkg_name"; then
        warn "$pkg_name: failed to set access=public; verify registry access manually"
      fi
    fi
    ok "$pkg_name@$VERSION published"
  done
fi

if [ "$ONLY_NPM" -eq 1 ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    ok "npm release validation complete (--only-npm)."
  else
    ok "npm publication complete (--only-npm)."
  fi
  exit 0
fi

info "Marketplace submission checklist"
for entry in "${MARKETPLACES[@]}"; do
  IFS='|' read -r name manifest url <<< "$entry"
  if [ -f "$ROOT_DIR/$manifest" ]; then
    ok "$name - manifest at $manifest"
  else
    warn "$name - manifest missing at $manifest"
  fi
  printf '    submit: %s\n\n' "$url"
done

if [ "$DRY_RUN" -eq 1 ]; then
  ok "No npm publish, marketplace submission, git tag, or commit was performed."
else
  ok "Release $VERSION published. Submit marketplace listings separately after review."
fi

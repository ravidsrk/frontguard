#!/usr/bin/env bash
#
# run-external.sh — Frontguard external repo validation harness
# ------------------------------------------------------------------
# Clones a set of real-world public repositories (validation/repos.json),
# installs their dependencies, boots each dev server, runs Frontguard against
# the configured routes, and captures the JSON results to validation/results/.
#
# This is how we dogfood Frontguard against production-grade frontends to
# measure real false-positive rates and classification accuracy.
#
# USAGE:
#   ./validation/run-external.sh                # run all repos in repos.json
#   ./validation/run-external.sh taxonomy       # run a single repo by "name"
#
# REQUIREMENTS:
#   - node (>=20) and npm/npx
#   - git
#   - jq
#   Optional: pnpm / yarn if a repo's devCommand uses them.
#
# NOTES:
#   - Each repo runs in an isolated temp dir and is torn down afterwards.
#   - Any single repo failing (clone/install/boot/run) is logged as a WARNING
#     and skipped — the harness keeps going.
#   - Results land in validation/results/<name>.json
# ------------------------------------------------------------------

set -euo pipefail

# --- Paths -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_FILE="${SCRIPT_DIR}/repos.json"
RESULTS_DIR="${SCRIPT_DIR}/results"
FILTER="${1:-}" # optional repo name filter

# --- Cleanup state -----------------------------------------------------------
WORK_DIR=""
DEV_PID=""

cleanup() {
  # Kill any running dev server (and its children) and remove the temp dir.
  if [[ -n "${DEV_PID}" ]] && kill -0 "${DEV_PID}" 2>/dev/null; then
    echo "  → stopping dev server (pid ${DEV_PID})"
    kill "${DEV_PID}" 2>/dev/null || true
    # give it a moment, then force kill the process group if needed
    sleep 2
    kill -9 "${DEV_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WORK_DIR}" ]] && [[ -d "${WORK_DIR}" ]]; then
    echo "  → removing temp dir ${WORK_DIR}"
    rm -rf "${WORK_DIR}"
  fi
  DEV_PID=""
  WORK_DIR=""
}
trap cleanup EXIT INT TERM

# Kill only the running dev server, leaving WORK_DIR (and the cloned repo +
# baseline orphan branch) intact. Used between the baseline and recheck passes
# so the recheck runs against a FRESH dev-server process — new PID, fresh
# in-memory CSS/JS hashes, fresh font sub-pixel decisions — which is what makes
# the recheck an independent measurement rather than a determinism test (val-5).
kill_dev_only() {
  if [[ -n "${DEV_PID}" ]] && kill -0 "${DEV_PID}" 2>/dev/null; then
    echo "  → stopping dev server (pid ${DEV_PID})"
    kill "${DEV_PID}" 2>/dev/null || true
    sleep 2
    kill -9 "${DEV_PID}" 2>/dev/null || true
  fi
  DEV_PID=""
}

# --- Pre-flight checks -------------------------------------------------------
for bin in node npx git jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: required tool '$bin' is not installed." >&2
    exit 1
  fi
done

if [[ ! -f "${REPOS_FILE}" ]]; then
  echo "ERROR: ${REPOS_FILE} not found." >&2
  exit 1
fi

mkdir -p "${RESULTS_DIR}"

# Wait for a URL to respond (up to ~120s). Returns 0 on success, 1 on timeout.
# Real-world frontends (Nextra monorepo, contentlayer-backed sites) take
# substantially longer than 60s to compile the first time.
wait_for_url() {
  local url="$1"
  local retries=120
  echo "  → waiting for ${url}"
  while (( retries > 0 )); do
    if curl -sSf -o /dev/null --max-time 3 "${url}" 2>/dev/null; then
      echo "  → ${url} is up"
      return 0
    fi
    sleep 1
    (( retries-- ))
  done
  return 1
}

# Run a single repo entry. Never aborts the whole harness on failure.
run_repo() {
  local name repo url devCommand category routes_json
  name="$1"; repo="$2"; url="$3"; devCommand="$4"; category="$5"; routes_json="$6"

  echo ""
  echo "=============================================================="
  echo "▶ ${name} (${repo}) — ${category}"
  echo "=============================================================="

  WORK_DIR="$(mktemp -d -t frontguard-val-XXXXXX)"
  local repo_dir="${WORK_DIR}/repo"

  # --- Clone (shallow) ---
  if ! git clone --depth 1 "https://github.com/${repo}.git" "${repo_dir}" 2>/dev/null; then
    echo "WARNING: failed to clone ${repo} — skipping" >&2
    cleanup
    return 0
  fi

  pushd "${repo_dir}" >/dev/null

  # Identify the harness as the git author so post-install commits don't error
  # on missing user.name / user.email, and disable pnpm's pre-run deps check
  # (pnpm 11 re-runs `pnpm install` before `pnpm dev` and exits non-zero on
  # ignored-build warnings, which we already tolerate).
  git config user.email "validation@frontguard.dev"
  git config user.name "Frontguard Validation"
  {
    echo "verify-deps-before-run=false"
    echo "auto-install-peers=true"
    echo "strict-peer-dependencies=false"
  } >.npmrc
  # Pin the package.json toggle too — some pnpm versions only honor it there,
  # and pre-approve every plausible native dep so pnpm 11's ignored-build
  # policy doesn't fail the install with [ERR_PNPM_IGNORED_BUILDS].
  if [[ -f package.json ]] && command -v node >/dev/null 2>&1; then
    node -e '
      const fs=require("fs");
      const p=JSON.parse(fs.readFileSync("package.json","utf8"));
      p.pnpm = p.pnpm || {};
      p.pnpm.verifyDepsBeforeRun = "warn";
      p.pnpm.onlyBuiltDependencies = [
        "@prisma/client","@prisma/engines","prisma",
        "contentlayer","esbuild","sharp","protobufjs",
        "core-js","es5-ext","unrs-resolver","puppeteer",
        "playwright","@swc/core","@biomejs/biome","cypress",
        "deasync","node-gyp","node-sass","fsevents","keytar",
        "@parcel/watcher","cpu-features","ssh2","msgpackr-extract",
        "level","leveldown","sqlite3","better-sqlite3","node-pty",
        "websocket-driver","grpc","@grpc/grpc-js","mongodb-client-encryption",
        "@vercel/speed-insights","@swc/wasm","msgpackr"
      ];
      fs.writeFileSync("package.json", JSON.stringify(p, null, 2));
    ' >/dev/null 2>&1 || true
  fi
  # Belt-and-suspenders env override; pnpm 11 also honors NPM_CONFIG_*.
  export NPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false
  export PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

  # --- Install deps (auto-detect package manager from lockfile) ---
  # Real-world repos have lockfiles tied to older toolchains, so we always
  # log the failure and try a relaxed (non-frozen) install before giving up.
  # Success is judged by node_modules being populated — pnpm's ignored-build
  # warnings cause non-zero exit even when packages installed successfully.
  echo "  → installing dependencies"
  local install_log="${WORK_DIR}/install.log"
  install_try() { "$@" >>"${install_log}" 2>&1 || true; }

  if [[ -f "pnpm-lock.yaml" ]] && command -v pnpm >/dev/null 2>&1; then
    install_try pnpm install --frozen-lockfile
    if [[ ! -d node_modules ]] || [[ "$(ls node_modules 2>/dev/null | wc -l)" -lt 5 ]]; then
      install_try pnpm install --no-frozen-lockfile
    fi
  elif [[ -f "yarn.lock" ]] && command -v yarn >/dev/null 2>&1; then
    install_try yarn install --frozen-lockfile
    if [[ ! -d node_modules ]] || [[ "$(ls node_modules 2>/dev/null | wc -l)" -lt 5 ]]; then
      install_try yarn install
    fi
  else
    install_try npm install --no-audit --no-fund
    if [[ ! -d node_modules ]] || [[ "$(ls node_modules 2>/dev/null | wc -l)" -lt 5 ]]; then
      install_try npm install --no-audit --no-fund --legacy-peer-deps
    fi
  fi

  if [[ ! -d node_modules ]] || [[ "$(ls node_modules 2>/dev/null | wc -l)" -lt 5 ]]; then
    echo "WARNING: dependency install failed for ${name} — skipping" >&2
    echo "  ---- last 20 lines of install.log ----"
    tail -n 20 "${install_log}" 2>/dev/null || true
    popd >/dev/null
    cleanup
    return 0
  fi

  # Frontguard's GitOrphanStorage refuses to write baselines if the working
  # tree is dirty (install populates node_modules and may touch the lockfile).
  # Commit everything into the shallow clone as one "install state" snapshot
  # so subsequent frontguard runs can manage the baseline orphan branch.
  echo "  → snapshotting install state for baseline storage"
  git add -A >/dev/null 2>&1 || true
  git commit -m "validation: install state" --allow-empty --no-verify >/dev/null 2>&1 || true

  # --- Start dev server in background ---
  echo "  → starting dev server: ${devCommand}"
  # shellcheck disable=SC2086
  ${devCommand} >"${WORK_DIR}/dev.log" 2>&1 &
  DEV_PID=$!

  if ! wait_for_url "${url}"; then
    echo "WARNING: dev server for ${name} did not come up at ${url} — skipping" >&2
    echo "  ---- last 20 lines of dev.log ----"
    tail -n 20 "${WORK_DIR}/dev.log" 2>/dev/null || true
    popd >/dev/null
    cleanup
    return 0
  fi

  # --- Run Frontguard against each route ---
  # Two-pass methodology for honest false-positive measurement (val-5):
  #   pass 1 "baseline": fresh run, no baseline exists yet (routes are "new").
  #   pass 2 "recheck":  re-run against unchanged code on a FRESH dev-server
  #                      process (see kill_dev_only + reboot below) with the
  #                      byte-identical fast path disabled
  #                      (FRONTGUARD_DISABLE_BYTE_COMPARE=1). Any non-pass status
  #                      here is a pixel-only false positive. Restarting the dev
  #                      server + disabling the fast path is what turns the
  #                      recheck from a Chromium-encoder determinism test into an
  #                      independent measurement of the diff engine.
  local out_file="${RESULTS_DIR}/${name}.json"
  local run_ok=1
  echo "  → running frontguard against ${url}"

  local routes
  routes="$(echo "${routes_json}" | jq -r '.[]')"

  # Resolve the frontguard binary (prefer a globally-linked one for hermeticity).
  local FG_BIN="frontguard"
  if ! command -v frontguard >/dev/null 2>&1; then
    FG_BIN="npx -p @frontguard/cli frontguard"
  fi

  run_one_pass() {
    local pass_name="$1"
    # baselineRuns establishes baselines (--update-baselines), recheckRuns is the
    # green re-compare against unchanged code. Anything non-pass in recheck is a
    # pixel-only false positive.
    local extra_flag=""
    [[ "${pass_name}" == "baselineRuns" ]] && extra_flag="--update-baselines"
    local pass_first=1
    {
      echo "  \"${pass_name}\": ["
    } >>"${out_file}"
    while IFS= read -r route; do
      [[ -z "${route}" ]] && continue
      local full_url="${url%/}${route}"
      echo "    [${pass_name}] • ${full_url}"
      local result
      if result="$(${FG_BIN} run --url "${full_url}" ${extra_flag} --output json 2>>"${WORK_DIR}/frontguard.log")"; then
        :
      else
        echo "WARNING: frontguard ${pass_name} run failed for ${full_url}" >&2
        run_ok=0
        result="{\"url\":\"${full_url}\",\"error\":\"frontguard run failed\"}"
      fi
      # --update-baselines exits 0 with no stdout — substitute a placeholder so
      # the per-repo JSON stays parseable.
      if [[ -z "${result// /}" ]]; then
        result="{\"url\":\"${full_url}\",\"note\":\"no JSON emitted (likely --update-baselines run)\"}"
      fi
      if [[ "${pass_first}" -eq 1 ]]; then pass_first=0; else echo "," >>"${out_file}"; fi
      printf '    { "route": "%s", "url": "%s", "result": %s }' "${route}" "${full_url}" "${result}" >>"${out_file}"
    done <<< "${routes}"
    {
      echo ""
      echo "  ]"
    } >>"${out_file}"
  }

  {
    echo "{"
    echo "  \"name\": \"${name}\","
    echo "  \"repo\": \"${repo}\","
    echo "  \"category\": \"${category}\","
    echo "  \"baseUrl\": \"${url}\","
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"aiEnabled\": ${FRONTGUARD_AI_ENABLED:-false},"
  } >"${out_file}"

  run_one_pass "baselineRuns"
  echo "  ," >>"${out_file}"

  # --- Restart the dev server for an independent recheck pass (val-5) ---------
  # Kill the baseline-pass server and boot a brand-new one with the same command.
  # A fresh process re-derives CSS/JS content hashes and font sub-pixel layout,
  # so the recheck captures are no longer guaranteed byte-identical to baseline.
  echo "  → restarting dev server for recheck pass (fresh PID)"
  kill_dev_only
  # shellcheck disable=SC2086
  ${devCommand} >"${WORK_DIR}/dev-recheck.log" 2>&1 &
  DEV_PID=$!
  if ! wait_for_url "${url}"; then
    echo "WARNING: fresh dev server for ${name} recheck pass did not come up at ${url}" >&2
    echo "  ---- last 20 lines of dev-recheck.log ----"
    tail -n 20 "${WORK_DIR}/dev-recheck.log" 2>/dev/null || true
    run_ok=0
    # Fall through anyway: the recheck pass will record `error` envelopes, which
    # the aggregator counts separately from false positives — an honest signal
    # that the recheck server failed rather than a fabricated 0%.
  fi

  # Disable the byte-identical fast path for the recheck pass ONLY, then unset so
  # it never bleeds into the next repo's baseline pass.
  export FRONTGUARD_DISABLE_BYTE_COMPARE=1
  run_one_pass "recheckRuns"
  unset FRONTGUARD_DISABLE_BYTE_COMPARE

  {
    echo "}"
  } >>"${out_file}"

  if [[ "${run_ok}" -eq 1 ]]; then
    echo "  ✓ results written to ${out_file}"
  else
    echo "  ⚠ partial results written to ${out_file} (some routes failed)"
  fi

  popd >/dev/null
  cleanup
  return 0
}

# --- Main loop ---------------------------------------------------------------
COUNT="$(jq 'length' "${REPOS_FILE}")"
echo "Loaded ${COUNT} repos from ${REPOS_FILE}"
[[ -n "${FILTER}" ]] && echo "Filtering to repo: ${FILTER}"

for (( i = 0; i < COUNT; i++ )); do
  name="$(jq -r ".[$i].name" "${REPOS_FILE}")"
  if [[ -n "${FILTER}" ]] && [[ "${FILTER}" != "${name}" ]]; then
    continue
  fi
  repo="$(jq -r ".[$i].repo" "${REPOS_FILE}")"
  url="$(jq -r ".[$i].url" "${REPOS_FILE}")"
  devCommand="$(jq -r ".[$i].devCommand" "${REPOS_FILE}")"
  category="$(jq -r ".[$i].category" "${REPOS_FILE}")"
  routes_json="$(jq -c ".[$i].routes" "${REPOS_FILE}")"

  run_repo "${name}" "${repo}" "${url}" "${devCommand}" "${category}" "${routes_json}"
done

echo ""
echo "All done. Results are in ${RESULTS_DIR}/"

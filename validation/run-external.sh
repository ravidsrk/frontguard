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

# Wait for a URL to respond (up to ~60s). Returns 0 on success, 1 on timeout.
wait_for_url() {
  local url="$1"
  local retries=60
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
  # Two-pass methodology for honest false-positive measurement:
  #   pass 1 "baseline": fresh run, no baseline exists yet (routes are "new")
  #   pass 2 "recheck":  re-run against unchanged code — any non-pass status
  #                      is a pixel-only false positive.
  local out_file="${RESULTS_DIR}/${name}.json"
  local run_ok=1
  echo "  → running frontguard against ${url}"

  local routes
  routes="$(echo "${routes_json}" | jq -r '.[]')"

  # Resolve the frontguard binary (prefer a globally-linked one for hermeticity).
  local FG_BIN="frontguard"
  if ! command -v frontguard >/dev/null 2>&1; then
    FG_BIN="npx frontguard"
  fi

  run_one_pass() {
    local pass_name="$1"
    local pass_first=1
    {
      echo "  \"${pass_name}\": ["
    } >>"${out_file}"
    while IFS= read -r route; do
      [[ -z "${route}" ]] && continue
      local full_url="${url%/}${route}"
      echo "    [${pass_name}] • ${full_url}"
      local result
      if result="$(${FG_BIN} run --url "${full_url}" --output json 2>>"${WORK_DIR}/frontguard.log")"; then
        :
      else
        echo "WARNING: frontguard ${pass_name} run failed for ${full_url}" >&2
        run_ok=0
        result="{\"url\":\"${full_url}\",\"error\":\"frontguard run failed\"}"
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
  run_one_pass "recheckRuns"

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

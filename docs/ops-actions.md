# OPS actions

Out-of-band operational actions that the autonomous remediation loop cannot
perform itself — registry pushes, DNS changes, `npm publish`, deploys. Each
entry is queued by a code-side PR and executed by the maintainer, who holds the
required credentials. The linked findings are fully closed only once the action
below has run; the shipped code already covers the customer-impact half (e.g. an
actionable preflight error instead of a cryptic failure).

---

## OPS — Publish the pinned frontguard/render image

**Unblocks:** renderer distribution. This does not establish cross-host render equivalence.

**Action:**

```bash
npm ci
npm run build --workspace=packages/cli
npm pack ./packages/cli --pack-destination packages/cli/docker
mv packages/cli/docker/frontguard-cli-*.tgz packages/cli/docker/frontguard-cli.tgz
docker buildx create --use   # if not already
docker buildx build --platform linux/amd64 \
  -t frontguard/render:$(cat VERSION) -t frontguard/render:latest \
  --push packages/cli/docker
# Keep one architecture until a measured cross-host matrix justifies expansion.
```

**Verification:**

```bash
curl -s -o /dev/null -w '%{http_code}' https://hub.docker.com/v2/repositories/frontguard/render/  # expect 200
docker manifest inspect frontguard/render:$(cat VERSION)  # expect a valid manifest
```

**Owner:** ravidsrk

**Date queued:** 2026-06-17

---

## OPS — Publish the next CLI and run the external Action smoke

**Unblocks:** the public `ravidsrk/frontguard@v0` integration.

The source Action must not be treated as released while its pinned CLI version
is unavailable. After the reviewed commit lands, publish the exact version from
`VERSION`, then advance `v0` to that commit. From a separate public fixture
repository, run both required controls without `continue-on-error`:

1. Seed and push `frontguard-baselines`, then verify an unchanged page passes.
2. Introduce a deliberate visual mutation and verify the Action turns red with
   `status=fail`, not `status=error`.
3. Verify the JSON output, report artifact, and PR comment are consumable from
   the external repository.

Do not advertise the Action as launch-ready until both controls pass against
the public `ravidsrk/frontguard@v0` reference.

**Owner:** ravidsrk

**Date queued:** 2026-08-29

---

## OPS — Redeploy frontguard.dev from the canonical web app

**Unblocks:** publication of the reviewed public truth, legal, and accessibility changes.

**Context:** `apps/web` is the canonical public site. Its build checks semantic
links, machine-readable files, and the generated route surface. The reviewed
build must replace any stale deployment before its claims can be treated as live.

**Action:**

```bash
npm ci
npm run build --workspace=apps/web
npm run deploy --workspace=apps/web
```

**Verification:**

Load `/`, `/docs`, `/privacy`, `/terms`, and `/status` from the deployed origin.
Confirm the Action remains marked pre-release and the legal links resolve.

**Owner:** ravidsrk

**Date queued:** 2026-08-30

---

## OPS — Deploy cloud-api Worker (C7 data-model fixes)

**Unblocks:** cloud-1, cloud-9, mcp-1, mcp-2, mcp-7, mcp-9 (full closure — the
code is merged; the live API only serves the fixes after a deploy)

**Action:**

```bash
npm run build --workspace=packages/cloud-api
npm run deploy --workspace=packages/cloud-api
```

**Verification:**

```bash
# /health and the report footer now track package.json (cloud-9)
curl -s https://api.frontguard.dev/health   # expect {"status":"ok","version":"0.2.0"}
```

No D1 migration is required for C7: `run.github` (mcp-1) and `suggestedFix`
(mcp-2) were folded into the existing `runs.config` / `runs.results` JSON blobs
(Option B), so the schema is unchanged.

**Owner:** ravidsrk

**Date queued:** 2026-06-17

---

## OPS — Verify cloud-1 baseline restore against live Daytona

**Unblocks:** cloud-1 (end-to-end confidence; the data-plane restore + orphan
seeding are unit-tested, but the sandbox git flow cannot run in CI)

**Context:** The runner now restores a project's prior approved baselines from
R2 into the sandbox and seeds them into the `frontguard-baselines` git orphan
branch before `frontguard run`, so regressions are detectable instead of every
screenshot being a new baseline. The restore is best-effort: if the git seeding
fails in a real sandbox it degrades to the prior new-baseline behaviour rather
than breaking the run. This needs one live confirmation.

**Action:**

1. With `DAYTONA_API_KEY` and the `SCREENSHOTS` R2 binding configured, submit a
   run under a project that already has an approved baseline run.
2. Confirm the run reports `regression`/`changed` results (not all
   `new_baseline`) when the target visibly differs from the baseline.
3. Confirm the sandbox snapshot image has `git` available (the orphan seeding
   shells out to it).

**Owner:** ravidsrk

**Date queued:** 2026-06-17

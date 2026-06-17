# OPS actions

Out-of-band operational actions that the autonomous remediation loop cannot
perform itself — registry pushes, DNS changes, `npm publish`, deploys. Each
entry is queued by a code-side PR and executed by the maintainer, who holds the
required credentials. The linked findings are fully closed only once the action
below has run; the shipped code already covers the customer-impact half (e.g. an
actionable preflight error instead of a cryptic failure).

---

## OPS — Publish frontguard/render multi-arch images

**Unblocks:** install-4, docker-1, docs-3 (full closure; code-side preflight + docs already shipped)

**Action:**

```bash
docker buildx create --use   # if not already
docker buildx build --platform linux/amd64 \
  -t frontguard/render:v0.2.0 -t frontguard/render:latest \
  --push packages/cli/docker
# (arm64 not published — byte-equivalence requires linux/amd64 only; see docker-3 / docs-3)
```

**Verification:**

```bash
curl -s -o /dev/null -w '%{http_code}' https://hub.docker.com/v2/repositories/frontguard/render/  # expect 200
docker manifest inspect frontguard/render:v0.2.0  # expect a valid manifest
```

**Owner:** ravidsrk

**Date queued:** 2026-06-17

---

## OPS — Deploy cloud-api Worker (C7 data-model fixes)

**Unblocks:** cloud-1, cloud-9, mcp-1, mcp-2, mcp-7, mcp-9 (full closure — the
code is merged; the live API only serves the fixes after a deploy)

**Action:**

```bash
# from packages/cloud-api
wrangler deploy
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

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

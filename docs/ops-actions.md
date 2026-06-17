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

## OPS — Redeploy frontguard.dev (ship the AggregateRating-free index.html)

**Unblocks:** dist-11 (full closure; the source HTML and an SSG regression guard already shipped)

**Context:** `apps/landing/index.html` on `main` is already AggregateRating-free
(offers-only SoftwareApplication JSON-LD), and `apps/landing/src/test/ssg-output.test.ts`
now fails the build if any built route re-introduces an `AggregateRating` /
`ratingValue` / `ratingCount` block. But the live deployment is stale and still
serves the old `4.8/36` rating on a 0-star repo. The regression test cannot push
bytes to the CDN — a redeploy of the built `apps/landing/dist/` is required.

**Action:**

```bash
# Build and redeploy the landing site (whatever ships apps/landing/dist/ —
# Cloudflare Pages / Fly.io / Netlify per the project's deploy config).
cd apps/landing && npm run build
# then trigger the landing-site deploy for the freshly built dist/
```

**Verification:**

```bash
curl -s https://frontguard.dev/ | grep -E 'AggregateRating|ratingValue|ratingCount' || echo "clean"
# expect: clean
```

**Owner:** ravidsrk

**Date queued:** 2026-06-17

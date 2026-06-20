# OPS / VERIFY-AT-SCALE QUEUE — Adversarial Fresh Run (2026-06-19)

Actions that are CODE (written, reviewed, merged into BASE) but whose APPLY/verify is OPS — NOT executed by the swarm. Human/ops owned. Each entry: the action, the findings it unblocks, the merged PR.

Safety rails: testnet/staging/fixtures only; never real keys/prod/`terraform apply`/`wrangler deploy`/live env from the swarm. Merge ≠ deploy. BASE→main promotion is a separate human meta-PR.

## Queue

- [OPS-APPLY] DM-1 (PR#74): a versioned migration system + `schema_migrations` ledger now exists; when DM-2/DM-3/SEC-4 land their v2+ migrations, apply pending migrations to the staging/prod D1 via `migrate()`/wrangler. Not run by the swarm.
- [OPS-APPLY] DM-2/DM-3 (PR#80): migration v002 (ON DELETE CASCADE + team_usage table) — apply pending D1 migrations to staging/prod so cascades + team-pooled metering take effect. Not run by the swarm.
- [OPS-APPLY] CONC-2/SEC-4 (PR#82): migration 003 (version columns, invitation expires_at, users.github_login) — apply pending D1 migrations to staging/prod. Not run by the swarm.
- [VERIFY_AT_SCALE/OPS] SEC-2 (PR#83): the submit-time SSRF resolve+check (pure-TS, edge-safe, blocks private/loopback/link-local/metadata + mapped-IPv6/obfuscated forms, fails closed) cannot fully prevent the Daytona renderer from RE-RESOLVING the hostname (DNS rebinding). Residual hardening = pin the renderer connection to the validated IP — a Daytona/infra change, OPS-owned. Code mitigates to the extent feasible server-side.
- [OPS-APPLY] CONC-3 (PR#84): migration 004 (monitor execution lease) — apply pending D1 migrations to staging/prod. Not run by the swarm.
- [OPS] REL-3/SEC-6/OPS-2 (PR#85): (REL-3) bounded in-isolate limiter fixes the memory leak; a TRULY distributed limiter needs Durable Objects/KV — infra/OPS. (SEC-6) set ENVIRONMENT=production + real bindings in the deployed env (code fails closed if prod-but-misconfigured). (OPS-2) replace placeholder wrangler binding ids with real ones at deploy (pre-deploy guard now blocks placeholders). All OPS-owned.
- [VERIFY_AT_SCALE] REL-1 (PR#73): code wraps `/v1/run` work in `executionCtx.waitUntil`; confirm on staging that the isolate survives a full multi-minute Daytona run (run reaches `completed`, results/reportHtml persisted). Telemetry the swarm can't see. Longer-term OPS: evaluate Cloudflare Queues so a single isolate lifetime isn't the durability boundary.

_(more appended as findings land — DM-1 migration apply, OPS-1/OPS-2/SEC-6 wrangler secret+binding setup, COST-1/CONC-1 load-verify, etc.)_

## C3 / B1 — DNS, waitlist, deploy (PR#95, merge `d3d15b5`) — human-owned, NOT executed

PR#95 removed the false `api.frontguard.dev` / `app.frontguard.dev` / `docs.frontguard.dev`
hosted defaults (mcp/netlify/slack/cli), switched the Pro CTA to a `mailto:` waitlist, and made
telemetry opt-in. Code is CODE_CLOSED; the live attach below is OPS. **Commands are recorded for
the human operator — the swarm did NOT run any of them** (no `wrangler deploy`, no DNS edit, no
secrets). Mirrors `docs/production-close-progress.md` OPS rows **O1, O2, O3, O12**.

- **[OPS] O1 — DNS attach (`claim-4`, `dist-3`, `docs-2`, `install-9`):** move the `frontguard.dev`
  zone to Cloudflare, then bind Worker custom domains so `api/app/github-app/telemetry.frontguard.dev`
  resolve. Per Worker:
  ```sh
  npx wrangler deploy --config packages/cloud-api/wrangler.toml         # then add custom domain api.frontguard.dev in CF dash → Workers → Triggers → Custom Domains
  npx wrangler deploy --config integrations/github-app/wrangler.toml    # custom domain github-app.frontguard.dev
  # app.frontguard.dev + telemetry.frontguard.dev: create CNAME/records to the apps/web (Pages) + telemetry collector targets
  # verify:
  host api.frontguard.dev && host app.frontguard.dev && host github-app.frontguard.dev && host telemetry.frontguard.dev
  curl -sf https://api.frontguard.dev/health
  ```
- **[OPS] O2 — deploy cloud-api / integrations + redeploy apps/web:**
  ```sh
  npx wrangler deploy --config packages/cloud-api/wrangler.toml
  npx wrangler deploy --config integrations/github-app/wrangler.toml
  npx wrangler deploy --config integrations/slack-app/wrangler.toml
  # apps/web redeploy after the doc/link fixes in this PR (Cloudflare Pages / CI deploy):
  npm --workspace apps/web run build && npx wrangler pages deploy apps/web/dist
  ```
- **[OPS] O3 — Worker secrets (forged-cookie test, billing):** set against `packages/cloud-api/wrangler.toml`:
  ```sh
  npx wrangler secret put DASHBOARD_SESSION_SECRET --config packages/cloud-api/wrangler.toml   # ≥32 bytes
  npx wrangler secret put STRIPE_SECRET_KEY        --config packages/cloud-api/wrangler.toml
  npx wrangler secret put STRIPE_WEBHOOK_SECRET    --config packages/cloud-api/wrangler.toml
  npx wrangler secret put DAYTONA_API_KEY          --config packages/cloud-api/wrangler.toml
  npx wrangler secret put GITHUB_APP_ID            --config integrations/github-app/wrangler.toml
  npx wrangler secret put GITHUB_PRIVATE_KEY       --config integrations/github-app/wrangler.toml
  # + OAuth client id/secret for the dashboard sign-in
  ```
- **[OPS] O12 — waitlist standup + marketplace + install 404 (`docs-6`, `claim-4` waitlist):**
  ```sh
  # waitlist: provision the hello@frontguard.dev mailbox so the Pro CTA mailto resolves
  #   (Pro CTA = mailto:hello@frontguard.dev?subject=Pro%20waitlist); optionally stand up app.frontguard.dev/signup once O1+O2 land.
  # marketplace listings (web dashboards, human-submitted): GitHub Action/App, Vercel, Netlify, Slack.
  # fix frontguard.dev/api/install 404 — route served once cloud-api (O2) is deployed behind api.frontguard.dev (O1).
  curl -sf https://frontguard.dev/api/install   # expect non-404 after O1+O2
  ```

## C14 / A9 — marketing claims redeploy (PR#104, merge `504a038`) — human-owned, NOT executed

PR#104 corrected the marketing/README claims and the apps/web Schema.org structured data. Code is
CODE_CLOSED; the live site at `frontguard.dev` / apps-web still serves the **stale Schema.org HTML**
(`dist-11`) until apps/web is rebuilt and redeployed. **The swarm did NOT run any of the commands
below** (no `wrangler` / Pages deploy, no DNS edit). Mirrors `docs/production-close-progress.md` OPS
row **O2** (apps/web redeploy).

- **[OPS] O2-C14 — redeploy apps/web for corrected Schema.org / marketing claims (`dist-11`):**
  ```sh
  # rebuild + redeploy apps/web so live frontguard.dev HTML reflects the PR#104 Schema.org/claims fix:
  npm --workspace apps/web run build && npx wrangler pages deploy apps/web/dist
  # verify the served structured data is no longer stale (corrected claims present in the live HTML):
  curl -sf https://frontguard.dev | grep -i 'application/ld+json'
  # dist-11 acceptance — the live HTML must NOT ship the fabricated Schema.org rating;
  # this grep MUST return no matches (exit 1) after the redeploy:
  curl -s https://frontguard.dev/ | grep -E 'AggregateRating|ratingValue|ratingCount'   # expect NO matches
  ```

## A10 / B7 — npm 0.2.1 republish (production-close release-prep) — human-owned, NOT executed

Code-side release prep (VERSION, workspace `package.json` versions, `CHANGELOG.md`,
`.changeset/production-close-0.2.1.md`) is staged on branch `ravidsrk/a10-release-prep`
and merged into BASE `ravidsrk/production-close` via PR. **The swarm did NOT run any
of the commands below** (no `scripts/release.sh`, no `npm publish`, no `git tag
v0.2.1` push). Mirrors `docs/production-close-progress.md` OPS rows **O10, O11**.

**Context.** npm `v0.2.0` (2026-06-17) predates remediation PRs #73–#104. Consumers
still install stale artifacts until OPS publishes `0.2.1`.

**Publishable packages** (from `scripts/release.sh` `NPM_PACKAGES`):

- `@frontguard/cli`
- `@frontguard/playwright`
- `@frontguard/mcp`
- `create-frontguard-plugin`
- `@frontguard/netlify-plugin`

**Prerequisites (human checks before tagging):**

1. Merge the `a10-release-prep` PR into BASE; promote BASE → `main` when ready.
2. Confirm `VERSION` file reads `0.2.1` and every publishable `package.json`
   version matches (release script enforces this).
3. Confirm working tree is clean.

**Release procedure (exact OPS handoff):**

```sh
# 1. Final engineering gate on the release commit
git checkout ravidsrk/production-close   # or main after promotion
git pull
npm ci && npm run build && npm test

# 2. Dry-run validates metadata, build, and npm pack without secrets
./scripts/release.sh --dry-run

# 3. Tag the release (triggers .github/workflows/release.yml on push)
git tag -a v0.2.1 -m "Frontguard 0.2.1 — production-close remediation"
git push origin v0.2.1

# 4. If not using the tag-triggered workflow, publish locally instead:
#    export NPM_TOKEN=<npmjs automation token>
#    ./scripts/release.sh --only-npm

# 5. Post-publish verification
npm view @frontguard/cli@0.2.1 version
npm view @frontguard/mcp@0.2.1 version
npm view @frontguard/playwright@0.2.1 version
npm view create-frontguard-plugin@0.2.1 version
npm view @frontguard/netlify-plugin@0.2.1 version
npx -y @frontguard/mcp@0.2.1 --help 2>&1 | head -5   # stderr banner, not empty crash
npm audit --omit=dev --audit-level=high                # expect 0 critical/high
```

**Optional (closes `docs-1` option a):** publish an unscoped `frontguard` npm shim
that depends on `@frontguard/cli@0.2.1` — not included in `scripts/release.sh`;
separate human decision.

**Related OPS (publish-adjacent, still human-owned):**

- **O10** — push lightweight `v0` tag to the stable commit so
  `uses: ravidsrk/frontguard@v0` resolves (see B6 in `docs/production-pending.md`).
- **O9** — Docker Hub `frontguard/render:0.2.1` build+push (B5).
- **O15** — enable Dependabot in repo settings so `.github/dependabot.yml` activates.

---

## Downstream human gates (NOT done; human-owned)

- BASE (`ravidsrk/adversarial-fresh`) → `main` promotion: human meta-PR.
- Production deploy / `wrangler deploy` of cloud-api + integrations.
- Any OPS apply above (D1 migrations on the live DB, live env/secret/binding setup).

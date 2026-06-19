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

## Downstream human gates (NOT done; human-owned)

- BASE (`ravidsrk/adversarial-fresh`) → `main` promotion: human meta-PR.
- Production deploy / `wrangler deploy` of cloud-api + integrations.
- Any OPS apply above (D1 migrations on the live DB, live env/secret/binding setup).

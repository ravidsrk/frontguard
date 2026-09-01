# Assumption Ledger (A-NN)

Decision protocol R7: keep `main` green · reversible · closest to what the code already does ·
safest for money and data — in that order.

---

## A-01 — Package manager is npm, against the committed lockfile

**Phase:** 0
**Decision:** Use `npm ci` / `npm run` for every install, build, and test step.
**Rejected:** `pnpm`, mandated by the fleet-global `~/.claude/CLAUDE.md`.
**Reason:** Confirmed with the operator before the run. The repo ships `package-lock.json` and a
`workspaces` field; `pnpm` refuses to run against it at all (`The "workspaces" field in package.json
is not supported by pnpm`). CI installs with npm. Using pnpm would mean an unlocked resolve that
does not match CI, converting a baseline measurement into a migration. Deviation from the global
rule is deliberate and logged here. A pnpm migration, if ever wanted, is its own change.

## A-02 — Work in the primary checkout on task branches, not one worktree per task

**Phase:** 0
**Decision:** Create branches in `/Users/ravindra/projects/frontguard` and switch within it.
**Rejected:** `git worktree add` per task branch, per the fleet-global concurrency rule.
**Reason:** The global rule exists to stop concurrent agents colliding in a shared checkout. This is
a single-agent run and the only other worktree (`../frontguard-launch-review`) sits on a different
branch, so no collision is possible. Per-task worktrees across a plan this size would also churn
evidence paths, which R5 requires to be stable. Reversible: any task needing isolation can still
take a worktree, and R10 cleanup covers removing it.

## A-03 — PRODUCT inferred as "Frontguard — AI-powered frontend visual regression testing"

**Phase:** 0
**Decision:** Take the product identity from `README.md` H1 + root manifest `description` +
`homepage: https://frontguard.dev`.
**Rejected:** Treating the monorepo as a multi-product fleet (CLI, cloud API, four integrations as
separate products).
**Reason:** All workspaces are published under one `@frontguard/*` scope, one VERSION file, and one
changeset line. The integrations are distribution surfaces for the CLI, not independent products.
Revisit if Phase 1 angle 1 finds a critical flow that belongs to `cloud-api` alone.

## A-04 — `DOMAIN_HINTS` inferred as `devtool-oss` (not fintech/crypto/consumer)

**Phase:** 0
**Decision:** Treat Appendix D's India-payments, VDA/crypto, and money-transmitter sections as
not-applicable pending Phase 2 verification, and focus domain research on: OSS/npm supply-chain,
DPDP/GDPR exposure via any telemetry or cloud-api data collection, AI-provider ToS for the vision
layer, and marketplace rules for the GitHub/Slack/Vercel/Netlify integrations.
**Rejected:** Running the full fintech compliance sweep.
**Reason:** MIT-licensed developer tool, no money path observed in Phase 0 inventory. Marked as an
inference, not a conclusion: angle 15 and Phase 2 Track B must confirm, and the presence of
`packages/cloud-api` + a `pricing` route means a billing path may yet exist. If Phase 1 finds one,
this assumption is void and the payments areas of Appendix D come back into scope.

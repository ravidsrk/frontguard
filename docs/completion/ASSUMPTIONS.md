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

## A-06 — Angles 6 (Data) and 7 (Infra) target ≥2, not the default ≥3

**Phase:** 3
**Decision:** Lower the required minimum score for angles 6 and 7 from ≥3 to ≥2 in `DEFINITION.md`.
**Rejected:** Holding both at ≥3 per the framework default.
**Reason:** Both angles are dominated by `packages/cloud-api`, which the frozen definition places
out of scope behind a hard deployment gate. Requiring ≥3 would force scoring — and therefore
building out — an undeployed subsystem the definition explicitly says must not be deployed yet.
This is a scope alignment, not a lowered bar: the substantive proofs those angles exist to
guarantee (a performed backup restore, a rehearsed rollback) are still demanded *directly* by the
launch gate, where they cannot be scored around. Note this is a deviation permitted by the
framework ("state any deviation as A-NN"), taken before freeze, not after — R13 forbids lowering
the definition once frozen, and this is part of the freeze itself.

## A-07 — Angle 12 (AI) satisfied via the CF-04 honesty clause

**Phase:** 3
**Decision:** Keep angle 12's target at the published ≥2, and satisfy it through CF-04's
requirement to either measure classification accuracy or reduce public claims to what is
demonstrable.
**Rejected:** Requiring a full evaluation harness with an accuracy threshold before launch.
**Reason:** Building a labelled eval set and an accuracy gate is a genuine project, and the
framework forbids adding features after freeze (R6). The completion-relevant defect is not that
accuracy is unmeasured — it is that accuracy is unmeasured *while being marketed*. Closing the
honesty gap is the smaller, correct, and fully sufficient fix; measuring accuracy properly is
filed post-launch. AI is optional and disabled without a provider key, and pixel-diff remains the
authoritative pass/fail signal (verified by T-17), so an unmeasured classifier cannot silently
break the core flow.

## A-08 — P1 landed as one integration branch, not ten single-task PRs

**Phase:** 5
**Decision:** Land all ten P1 tasks on `ravidsrk/p1-green-baseline` as one PR, each task a separate
commit.
**Rejected:** One branch and one PR per task, as R10 prescribes.
**Reason:** R10 requires merging only when CI is green, but `main` had six independent red causes
(lint, build, two test matrix legs, e2e, plus a path-filtered deploy). No single-task PR could
reach green, so R10 and R9's green-state invariant were in direct conflict; following R10 literally
would have meant either never merging or merging red. One integration branch with per-task commits
preserves the reviewable unit of work, satisfies R9, and matches R10's own allowance for related
commits sharing a PR. Later phases return to one task per PR now that `main` is green and a single
fix can be verified in isolation.

## A-09 — Explicit baseline-ref fetch, not fetch-depth: 0 alone

**Phase:** P3 / T-15
**Decision:** The documented CI path fetches `refs/heads/frontguard-baselines` into
`refs/remotes/origin/frontguard-baselines`. Keep `fetch-depth: 0` on the generated `init --ci`
workflow (already present) and add the explicit fetch. GitHub App bootstrap uses `fetch-depth: 1`
plus the same fetch.
**Rejected:** Treating `actions/checkout` `fetch-depth: 0` as sufficient by itself; dropping
`fetch-depth: 0` from the generated workflow.
**Reason:** Checkout's `fetch-depth: 0` fetches history of the *triggering* ref. It does not
reliably retrieve a sibling orphan branch. The repo's own `frontguard-example.yml` already learned
this (it has both). The CLI also fetches in `GitOrphanStorage.init`; the documented checkout is
the user-facing contract and must not depend on that internal call. Node 22 is the generated
workflow default because T-06 already raised `engines.node` to `>=22`.

## A-10 — T-16 does not edit `apps/web` (Deploy Web is production)

**Phase:** P3 / T-16
**Decision:** Close G-14 in README.md, packages/cli/README.md, and `doctor`'s Node floor. Leave
`apps/web/src/lib/docs-content.ts` unchanged.
**Rejected:** Updating the live Getting Started / Installation / Quick Start articles in the same PR.
**Reason:** `Deploy Web` is path-filtered to `apps/web/**`. Merging those files publishes production,
which R15 forbids. The Stranger Test in the gate is clone → README. Live-site docs wait on H-07.

## A-11 — T-17 does not edit live-site AI copy

**Phase:** P3 / T-17
**Decision:** Stop the CLI from letting AI classification change pass/fail. Leave
`apps/web` sentences about the 0.8 auto-downgrade unchanged.
**Rejected:** Updating homepage and docs-content in the same PR so marketing matches the code.
**Reason:** Those files sit under `apps/web/**` and would trigger Deploy Web (R15). The live
canonical domain is also not routed to this worker (H-07). T-18 records the stale copy as a
public-claim gap until H-07.

## A-12 — CF-03 evidence uses the CLI demo fixture, not the unpublished Action

**Phase:** P3 / T-20
**Decision:** Capture CF-03 with `.github/workflows/frontguard-example.yml` (the documented
demo CI path: checkout, explicit `frontguard-baselines` fetch, published `@frontguard/cli@0.2.2`).
**Rejected:** Invoking the composite GitHub Action (`uses: ravidsrk/frontguard@v0`) as the
evidence run; adding a new always-on PR workflow.
**Reason:** CF-06 (Action marketplace path) is out of scope. The fixture already encodes the
documented checkout+fetch contract from T-15 and the green/red controls CF-03 requires.
Pushing `origin/frontguard-baselines` is git, not a production deploy (R15).

## A-13 — Documented CI uploads use upload-artifact v7 only

**Phase:** P3 / T-20
**Decision:** Remove `actions/upload-artifact@v3.2.2-node20` from the example fixture,
generated `init --ci` workflow, and composite Action. Use v7 unconditionally.
**Rejected:** Keep a GHES-only v3 step behind `github.server_url != 'https://github.com'`.
**Reason:** GitHub.com now fails the job at *setup* if the workflow even *references* the
deprecated v3 action, including skipped steps. That made the CF-03 fixture unable to start
(run 34840303128). GHES report upload is deferred; the report still lands on disk. Logged
from greptile P1 on this branch.
**Amendment:** Skip the v7 upload when `github.server_url != 'https://github.com'` so a GHES
job is not marked failed by an unsupported artifact backend. Still no v3 reference.

## A-14 — T-26 does not edit apps/web

**Phase:** P3 / T-26
**Decision:** Publish telemetry disclosure in root README, `packages/cli/README.md`, and
`docs/telemetry.md`. Delete unused `showFirstRunNotice`. Do not edit `apps/web` privacy copy.
**Rejected:** Updating `apps/web/src/routes/privacy.tsx` in this task.
**Reason:** `apps/web/**` path-filters Deploy Web (R15). Live `/privacy` remains T-25 / H-07.

## A-15 — Stranger Test uses the published CLI the README invokes

**Phase:** P7 / T-29
**Decision:** Time the README Quick Start with `npx -p @frontguard/cli` (registry 0.2.2), not
the unpublished workspace CLI.
**Rejected:** Running the in-repo 0.2.3 source as the stranger path.
**Reason:** Gate item 7 is "using the README alone." 0.2.2 still requires a clean working tree
to create `frontguard-baselines`; source already narrowed that check to the checkout fallback.
The README now includes the commit step 0.2.2 needs.

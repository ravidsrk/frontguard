# 294: Hosted Review UI Design Record and In-Memory Spike

## Context and Scope

Local HTML reports (`report.html`) and `frontguard review --from ./frontguard-report` (`#305`) already cover the single-user interactive diff review and per-shot promotion loop without any server or account.

A hosted review UI is only needed when **multiple reviewers** must coordinate approvals and rejections on a pull request before baselines are promoted. Per `#293` and `#290`, `packages/cloud-api` remains undeployed (`api.frontguard.dev` is not live) and is kept strictly as a self-hosted reference / design spike.

## Non-Negotiable Invariants

1. **`pixelmatch` is the only pass/fail signal**: Every diff status (`pass`, `changed`, `regression`, `new`, `error`) comes exclusively from deterministic `pixelmatch` comparison (`#304`). Model classifications, explanations, and judge-mode notes (`#291`) are rendered with an explicit **Advisory — model output does not affect pass/fail** badge and cannot approve or reject a shot.
2. **Latest-review-per-reviewer with single-rejection block**:
   - Reviews are keyed by `(targetKey, reviewerId)` ordered by timestamp.
   - Only each reviewer's **latest** review on a shot or run counts (an earlier rejection superseded by a later approval from the same reviewer unblocks; an earlier approval superseded by a later rejection from the same reviewer blocks).
   - **One active rejection from any reviewer blocks promotion**, regardless of how many other reviewers approved.
3. **Explicit human confirmation & judge-mode refusal (`#287`)**:
   - Promotion requires an explicit human confirmation (`confirmHumanReview: true`) from an authenticated human actor (`actorKind: 'human'`).
   - Judge mode (`judgeMode: true`), agent callers (`actorKind: 'agent'`), or advisory model verdicts are unconditionally refused.
4. **Accessibility gate (`#288`)**:
   - When the `axe-core` accessibility plugin reports blocking violations above the configured impact cutoff (`axeBlocked: true`), baseline promotion is refused even if all human reviewers approved the visual diff.
5. **PR-scoped vs branch promotion (`#306`)**:
   - PR-scoped approvals bind to the exact `(route, viewport, browser, mode, baselineSha256, candidateSha256)` tuple from `#306` without mutating `frontguard-baselines` until merge.
6. **Deployment posture (`#293`, `#290`)**:
   - `packages/cloud-api` remains undeployed; no hosted production database or public endpoint is provisioned by this spike.

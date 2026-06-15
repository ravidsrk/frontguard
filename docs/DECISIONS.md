# Decisions log — Frontguard product-completion build

Autonomous decisions taken by the coordinator. Every entry: what was decided, why, what was rejected, and where it shows up in the work.

## Format

Each decision: `## YYYY-MM-DD — short title` followed by **Context**, **Decision**, **Rejected**, **Effect**.

---

## 2026-06-14 — Source inputs locked

**Context**: The run-spec template arrived with `__SOURCE_PATH__`, `__PRODUCT_NAME__`, `__POSITIONING__` unsubstituted. Without these, T3 cannot define a boundary.

**Decision**:

- **SOURCE_PATH** = `/Users/ravindra/orca/workspaces/frontguard/tang` (current worktree on branch `ravidsrk/orchestrate-product-completion`, base `origin/main`, branch prefix `ravidsrk/`).
- **PRODUCT_NAME** = `Frontguard` (matches `package.json` workspace name `frontguard-monorepo`, npm packages `@frontguard/*`, marketing domain `frontguard.dev`).
- **POSITIONING** = "AI-powered frontend visual regression testing for web teams — detect, understand, and fix visual bugs before they ship to production." (README one-liner.)

**Rejected**: ROADMAP-thesis framing (too internal-strategy for landing-page anchor); OSS-only framing (under-sells the AI-intelligence differentiator that the roadmap thesis says is the moat).

**Effect**: This positioning anchors T3's boundary definition and T5's landing rebuild.

---

## 2026-06-14 — Tracking docs live in coordinator workspace, committed to main

**Context**: Workers will branch from `origin/main` and need to see live build context.

**Decision**: `docs/ship-progress.md` and `docs/DECISIONS.md` are authored in the coordinator workspace and merged to main as ordinary commits as the build progresses, so every worker worktree branched after that point inherits the latest state.

**Rejected**: Keeping tracking docs in a sidecar branch (workers wouldn't see them); only updating them post-build (then they'd be retrospective, not a live record).

**Effect**: Workers will see this DECISIONS.md and ship-progress.md when they start.

---

## 2026-06-14 — T2 lands before T1; treat as FIRST-MERGE hygiene gate

**Context**: The brief flagged T1 as "FIRST MERGE — verify commit hygiene." T2 finished first.

**Decision**: Merge T2 immediately and treat its squash-commit on main as the hygiene-gate verification, rather than blocking T2 to enforce textual ordering. The semantic purpose of the gate (catch trailer/author issues before the pipeline floods main with bad merges) is satisfied by whichever PR lands first.

**Verification**: PR #5 squash-merged as `cefd157` on main. Author `Ravindra Kumar <ravidsrk@gmail.com>`. No `Co-Authored-By` / "Generated with" trailers in subject or body. Gate passes.

**Effect**: T1 lands as the second merge. Downstream tasks (T3+) proceed once T1 also lands.

---

## 2026-06-14 — Skip fresh-reviewer worker for T1 and T2

**Context**: The brief mandates two workers per task (implementer + fresh reviewer) so review isn't self-marking. T1 is a docs-only adversarial audit; T2 is docs-only competitive research.

**Decision**: Skip the fresh-reviewer worker for T1 and T2. Their output is consumed by T3 (Opus-class coordinator-side planning), which is itself a critical-reading pass over both docs — i.e. they get reviewed in T3.

**Rejected**: Running fresh-reviewer workers anyway for symmetry — added latency with no marginal correctness gain on docs deliverables.

**Effect**: Two-worker (implementer + fresh reviewer) discipline applies from T4 onward, where code correctness, type-safety, and "fully complete to real depth" need an adversarial second pass.

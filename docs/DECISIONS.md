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

# Archive

History only. Nothing here describes current behavior, and nothing here is kept up to date.
Counts, model names, plans and verdicts are as of the date in each file.
For current docs, start at [docs/README.md](../README.md).

A doc moves here when its value is a dated record of a past run, plan, audit, review or
research pass, and no code, test, workflow or web build reads it.

- Launch gate: `completion/` and `launch-verdict-2026-09-16/` hold run ledgers, evidence and verdicts.
- Plans and ledgers: `IMPLEMENTATION_PLAN.md`, `*-plan.md`, `*-progress.md`, `*-readiness.md`,
  `parity-spec.md`, `production-pending.md`, `arch-ops-actions.md`.
- Audits and reviews: `*-audit*.md`, `adversarial-*.md`.
- Early specs and inventories: `PRODUCT.md`, `TEST_PLAN.md`, `product-probe.md`,
  `old-product-inventory.md`, `design-extract.md`, `design-spec.md`.
- Research: `research/`, `research_notes/`, `reports/`.

The root `.ignore` keeps this directory out of ripgrep and fd. Use `rg --no-ignore` to search it.

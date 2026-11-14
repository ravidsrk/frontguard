# Documentation

Every maintained doc under `docs/`, one line each. User-facing docs are published at
[frontguard.dev/docs](https://frontguard.dev/docs) from `apps/web/src/lib/docs-content.ts`.
`scripts/test/repo-hygiene.test.ts` fails when a doc outside `archive/` is missing from this list.

## Orientation

- [ARCHITECTURE.md](ARCHITECTURE.md): package map, module tables and the design decisions behind them.
- [ROADMAP.md](ROADMAP.md): current scope, shipped post-launch work and what stays undeployed.
- [../CONTRIBUTING.md](../CONTRIBUTING.md): development setup, tests and the pull-request checklist.
- [../AGENTS.md](../AGENTS.md): verify and test commands for coding agents, and what not to edit.

## Decisions

- [../DECISIONS.md](../DECISIONS.md): coordinator logs for the design adoption, the 2026-06-19 adversarial review and the 2026-06-20 production close.
- [DECISIONS.md](DECISIONS.md): decision log for the June 2026 product-completion build and remediation kickoff.
- [decisions/294-hosted-review-ui.md](decisions/294-hosted-review-ui.md): hosted multi-reviewer UI design record and in-memory spike.
- [decisions/295-s3-baseline-storage.md](decisions/295-s3-baseline-storage.md): S3-compatible baseline storage design record and in-memory spike.
- [decisions/306-pr-scoped-approvals.md](decisions/306-pr-scoped-approvals.md): PR-scoped approvals and merge-base baseline selection.

## Behavior and policy

- [baselines.md](baselines.md): the `frontguard-baselines` orphan branch, its manifest and pruning.
- [judge-protocol.md](judge-protocol.md): the experimental advisory judge mode and its evaluation protocol.
- [telemetry.md](telemetry.md): opt-in anonymous telemetry, its event schema and how to turn it off.
- [retention.md](retention.md): what the CLI and pre-release cloud code store, and how deletion works.

## Operations

- [incident.md](incident.md): what to do when CI on `main` is red.
- [ops-actions.md](ops-actions.md): out-of-band actions the maintainer runs, such as registry pushes and deploys.

## Research and reviews

- [research.md](research.md): competitive landscape and pricing citations, linked from the website.
- [reviews/dependency-cleanup-2026-10-20.md](reviews/dependency-cleanup-2026-10-20.md): review of nine Dependabot PRs, with renderer-comparison evidence in JSON.
- [reviews/dependency-cleanup-followup-2026-10-20.md](reviews/dependency-cleanup-followup-2026-10-20.md): follow-up review of the next nine Dependabot PRs, with SQLite-upgrade evidence in JSON.
- [reviews/pr-comment-followup-2026-10-20.md](reviews/pr-comment-followup-2026-10-20.md): dispositions for 16 unresolved PR review comments, with accessibility-recipe evidence in JSON.

## Launch material

- [launch-announcement.md](launch-announcement.md): launch kit with the channel checklist.
- [launch/devto-article.md](launch/devto-article.md): Dev.to article draft. `scripts/test/launch-examples.test.ts` checks its code.
- [launch/reddit-posts.md](launch/reddit-posts.md): Reddit post drafts. `scripts/test/launch-examples.test.ts` checks its code.
- [launch/show-hn.md](launch/show-hn.md): Show HN post draft.
- [launch/twitter-thread.md](launch/twitter-thread.md): X thread draft.
- [launch-readiness.md](launch-readiness.md): June 2026 v0.2.0 punch list. Superseded, kept here because `CHANGELOG.md` links to it.

## Design

- [design-extract/README.md](design-extract/README.md): design-import reference pages and renders, which tests still scan.

## Archive

[archive/](archive/README.md) holds dated plans, progress logs, audits, adversarial reviews and research passes.
They are history, not current guidance, and `.ignore` keeps them out of ripgrep and fd results.

# Incident: `main` CI is red

This is the operator note for a failed CI workflow on `main`. It does not replace
`docs/completion/HUMAN_ACTIONS.md`.

## How you hear about it

Workflow [`.github/workflows/ci-failure-alert.yml`](../.github/workflows/ci-failure-alert.yml)
runs after every [CI](../.github/workflows/ci.yml) completion.

- A **failed push to `main`** opens one GitHub issue titled `main CI is red`
  (label `ci-red`). A second failure comments on that issue. It does not open another.
- A **later green push to `main`** comments and closes that issue.
- Pull-request failures do not open an issue. Cancelled runs do not either.

The issue body links here. There is no Slack or email destination until the owner
chooses one (Human Action H-03). GitHub issues are the channel because this
repository can prove them without a new secret.

To prove the path without breaking `main`:

```bash
gh workflow run "CI failure alert" --ref main -f drill=true
```

The drill opens `DRILL: CI failure alert` (label `ci-red-drill`) and closes it.

## What to do when the issue is open

1. Open the Actions URL in the issue. Fix the failing job or revert the merge.
   `main` stays the source of truth. Do not force-push.
2. A green CI run on `main` closes the issue. If it does not, the alert workflow
   itself failed. Re-run that workflow from the Actions tab.

## What this note does not yet prove

These launch-gate items are still owner actions. Do not treat them as done.

- **Canonical site.** `https://frontguard-web.ravidsrk.workers.dev` serves the
  current worker, including `/privacy`, `/terms`, and `/status`. `https://frontguard.dev`
  is a different deployment. Attaching the domain is Human Action H-07. Do not
  change DNS from an unattended run.
- **Worker rollback.** `wrangler rollback` has not been rehearsed here. The
  Cloudflare token available to the 2026-10-19 completion run could not list
  accounts. Human Action H-02.
- **D1 restore.** No scratch restore was performed. Human Action H-01.
  `packages/cloud-api/wrangler.toml` still has `database_id = "REPLACE_WITH_D1_DATABASE_ID"`.
  Do not deploy that worker to attach `api.frontguard.dev`.

## Ownership

One maintainer. GitHub: `ravidsrk`. Registry and Cloudflare credentials live
outside this repository. There is no second operator on record.

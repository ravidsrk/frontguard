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

## Canonical site

`frontguard.dev` and `www.frontguard.dev` are Workers custom domains on
`frontguard-web`. As of 2026-10-19 they serve the same SHA as
`https://frontguard-web.ravidsrk.workers.dev/.deploy-version`.
`docs.frontguard.dev` stays on Pages (`frontguard-docs.pages.dev`).

The routes in `apps/web/wrangler.jsonc` stay commented. The custom domains are
attached on the account and survive a script-only deploy. Do not point either
host back at `frontguard.pages.dev`.

## Roll back the web worker

Rehearsed on 2026-10-19 against a scratch Worker named
`frontguard-rollback-drill`, then deleted. Transcript:
`docs/completion/evidence/T-23-rollback.txt`. The rehearsal did not touch
`frontguard-web`.

From a checkout that contains `apps/web/wrangler.jsonc`, with the account id
set and Wrangler authenticated as the account (global key plus email, or a
token that can edit this Worker):

```bash
cd apps/web
wrangler rollback --name frontguard-web --message "incident: restore previous web version"
```

Wrangler prints the current version and the previous version and asks before
it shifts traffic. Confirm the version id is the one you want. Rollback does
not restore D1, KV, or R2.

Check `https://frontguard.dev/.deploy-version` afterwards. The next `Deploy Web`
run deploys its build before checking the live SHA, so it can replace the
version restored by the rollback. Do not rely on that check to preserve the
restored version.

## Restore a D1 database

Rehearsed on 2026-10-19 against scratch database `frontguard-restore-drill`
(created, restored, deleted). Transcript:
`docs/completion/evidence/T-22-d1-restore.txt`. There is no production D1.
`packages/cloud-api/wrangler.toml` still has
`database_id = "REPLACE_WITH_D1_DATABASE_ID"`. Do not deploy `cloud-api`, and
do not attach `api.frontguard.dev`, until that id is a real database you mean
to run.

Time Travel is already on for a `version: production` database. This account's
Workers Paid subscription is expired, so the documented window is 7 days
(Workers Free). Workers Paid would be 30 days.

```bash
wrangler d1 time-travel info YOUR_DATABASE --timestamp "2026-10-19T09:00:00Z"
wrangler d1 time-travel restore YOUR_DATABASE --bookmark BOOKMARK_FROM_INFO
```

Restore overwrites that database in place. The command prints
`previous_bookmark`. A second restore to that bookmark undoes the first.
`wrangler d1 execute --json` in Wrangler 4.151 did not print a bookmark; use
`wrangler d1 time-travel info` or the D1 time-travel bookmark API.

## Credentials

One maintainer (`ravidsrk`). Nothing in this repository is a live secret.

| Use | Where it lives |
|---|---|
| GitHub Deploy Web | repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Workers and D1 from a shell | `CLOUDFLARE_EMAIL` + `CLOUDFLARE_GLOBAL_API_KEY`, plus `CLOUDFLARE_ACCOUNT_ID`. Unset `CLOUDFLARE_API_TOKEN`. Wrangler treats `CLOUDFLARE_API_KEY` as a global key, and the zone token does not have that shape. |
| Zone DNS reads | `CLOUDFLARE_API_KEY` as a bearer token. It can list this zone and cannot manage Workers. |
| Registrar | Nameservers are already `emerson.ns.cloudflare.com` and `venus.ns.cloudflare.com`. The Namecheap API user is not the email address (error `1011102`). A registrar call is not required to move this site. |
| npm | long-lived `NPM_TOKEN` (H-05, not a launch gate) |

## Drill

On 2026-10-19, after this workflow landed on `main`, `workflow_dispatch` with
`drill=true` opened and closed issue #280. The run is
https://github.com/ravidsrk/frontguard/actions/runs/39229147720. A script-only
drill had already opened and closed issue #279 before the workflow was on
`main`.

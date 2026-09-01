# Data Retention and Privacy

This document records the storage, retention, and deletion behavior currently implemented by the local CLI and pre-release cloud code.

_Last updated: 2026-08-29._

## Local CLI

The CLI keeps these artifacts locally unless you separately send them elsewhere:

| Category | Stored where |
|---|---|
| Accepted baseline screenshots | `frontguard-baselines` Git orphan branch |
| Current screenshots, diffs, and HTML report | `frontguard-report/` by default |
| Monitoring history and temporary CLI state | `.frontguard/` |
| Route URLs and configuration | Your config and generated reports |

AI analysis sends the configured inputs to OpenAI or Anthropic using your API
key. Anonymous usage telemetry is disabled by default and is sent only after
explicit opt-in; see [telemetry.md](./telemetry.md). The local CLI does not
automatically upload screenshots to Frontguard Cloud.

### Delete local data

There is no `frontguard reset` command. Delete `frontguard-report/` and
`.frontguard/` to remove local reports and monitoring history. Accepted
screenshots live on the orphan branch; remove it locally with
`git branch -D frontguard-baselines` and, if it was pushed, remotely with
`git push origin --delete frontguard-baselines`.

## Pre-release cloud

Frontguard Cloud is not generally available and does not currently provide a
production retention or data-residency commitment. A deployed cloud runner
automatically stores run metadata and captured screenshots/diffs in its
configured database and object store. Team records can include raw member email
addresses or GitHub logins, and activity records can include raw targets and
metadata. The implementation does not perform the ingest-time PII redaction
previously described here.

### Implemented retention and deletion

- Plan-based pruning currently applies to monitor-run history only.
- General run history, screenshots, and team activity do not have automated
  time-based retention enforcement.
- `DELETE /v1/teams/:id` immediately attempts to delete team run blobs and then
  deletes team-scoped database records. There is no 30-day recovery window.
- Object deletion is best-effort. A failed object-store deletion does not block
  database deletion, so operators must monitor and reconcile failed purges.
- Dashboard export, delayed deletion, recovery, and region-pinning guarantees
  are not implemented.

Storage location and subprocessors depend on how an operator deploys the cloud
components. Do not use the pre-release cloud for regulated or production data
until the deployment has its own reviewed retention, deletion, residency,
backup, and incident-response controls.

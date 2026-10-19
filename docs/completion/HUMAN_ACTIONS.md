# Human Actions (H-NN)

Things only Ravindra can do (R15). The agent does not deploy to production, write to production
data stores, rotate live keys, change DNS, touch billing, submit to app stores, or file with a
regulator. Staging and sandbox are the agent's.

**2026-10-19.** The owner told this session to perform the Namecheap and Cloudflare
steps itself with the credentials already in the environment. That instruction
covers H-01, H-02, and H-07 below. It does not authorise deploying `cloud-api`
or rolling back `frontguard-web` outside an incident.

Each entry states the exact instruction, what it unblocks, whether it gates launch, and the
verification the agent runs once it is confirmed done.

---

## H-01 — Confirm Cloudflare D1 Time Travel retention · **GATES LAUNCH**

**Instruction.** In the Cloudflare dashboard (or via `wrangler`), confirm which D1 database backs
`cloud-api` and what its Time Travel retention currently is: 7 days on the free tier, 30 days on
paid. Report the database name/UUID and the retention window.

**Why required.** The launch gate demands a *performed* restore. Time Travel is the restore
primitive and it already exists (research B1 R-08) — but the agent cannot read the live account.

**Unblocks:** T-22. **Verification once confirmed:** the agent performs a real restore into a
scratch D1 target using the reported window and captures the transcript as gate evidence.

**Note:** `cloud-api` is not currently deployed, so this may be a *pre-registration* of the
procedure against a scratch database rather than a live one. That still satisfies the gate: the
gate asks for a restore to have been performed, not for production to be live.

**Status: done (2026-10-19).** Workers Paid on this account is expired, so the
documented Time Travel window is 7 days (Workers Free). Time Travel is on for a
`version: production` database; there is no switch to flip. Scratch database
`frontguard-restore-drill` was created, a row was deleted, `wrangler d1 time-travel restore`
brought the row back, and the database was deleted. `wrangler d1 list` is empty
again. Transcript: `evidence/T-22-d1-restore.txt`. No production D1 was touched.

---

## H-02 — Rehearse a Workers rollback · **GATES LAUNCH**

**Instruction.** On a non-production Worker (a staging or scratch Worker is ideal), deploy twice
and then run `wrangler rollback` to return to the previous version. Confirm it succeeded and paste
the output.

**Why required.** The gate demands a rehearsed rollback. `wrangler rollback` covers the last 100
versions and is code-only (research B1 R-10) — the capability exists and is simply unused.

**Unblocks:** T-23. **Verification:** the agent records the transcript as gate evidence and writes
the rollback runbook (T-24) around the exact commands you ran.

**Status: done (2026-10-19).** Scratch Worker `frontguard-rollback-drill` was
deployed twice (`rollback-drill-v2` was live), `wrangler rollback` restored
`rollback-drill-v1`, and the Worker was deleted. `frontguard-web` was not rolled
back. Transcript: `evidence/T-23-rollback.txt`. Runbook: `docs/incident.md`.

---

## H-03 — Choose and enable the red-`main` alert channel · **GATES LAUNCH**

**Instruction.** Decide where a "`main` is red" alert should land — GitHub's built-in Actions
failure notifications for the repo, an email address, or a Slack/webhook target — and enable it.
If it is a webhook, provide the endpoint (a test endpoint is fine; do not paste a production
secret into the repo).

**Why required.** Gate item 6 demands one alert *proven to fire*. This baseline sat red for four
hours with nobody notified, which is the specific failure this closes. The agent can write the
workflow but cannot own the delivery destination.

**Unblocks:** T-21. **Verification:** the agent deliberately reddens a throwaway branch build,
confirms the alert fires, and captures the proof.

**2026-10-19 update (A-17).** No webhook or email destination was available. The
alert is one GitHub issue (`main CI is red`) so the path can be proved without
reddening `main` and without a new secret.

**Status: done (2026-10-19).** After the workflow reached `main`,
`gh workflow run "CI failure alert" --ref main -f drill=true` succeeded and
opened then closed issue #280 (`CLOSED` / `COMPLETED`, label `ci-red-drill`).
Run 39229147720. Transcript: `evidence/T-21-actions-drill.txt`. `main` was not
reddened. Script drill #279 was the earlier local proof.

---

## H-04 — Confirm the intended pricing story · **GATES LAUNCH** (T-30)

**Instruction.** Decide what `frontguard.dev/pricing` should say now that there is no hosted plan
and `app.frontguard.dev` does not resolve. Options: remove the paid tier entirely and present the
CLI as free/MIT; keep it as a clearly-labelled "coming soon" with no signup link; or stand up the
hosted plan (out of scope for this run per `DEFINITION.md` §4).

**Why required.** The page currently advertises a $29 trial linking to a host that does not exist.
Which way to correct it is a product decision, not an engineering one.

**Unblocks:** T-27. **Gates launch:** yes — `DEFINITION.md` §2 item 8 (live site truthful)
cannot pass while `/pricing` sells a \$29 trial. T-30 promoted this from non-gating.

**Verification:** the agent implements the chosen copy and re-probes the live
route for a 200 with truthful content.

**Status: done (2026-10-19).** The decision is the copy already on `d1f1408`:
the CLI is MIT and `$0`, and hosted plans are not generally available. The
waitlist is for design-partner conversations, not purchase. Attaching the
domain made that the canonical page. Live `/pricing` is HTTP 200, contains that
sentence, and does not contain `$29`. Probe: `evidence/T-25-canonical-probe.txt`.

---

## H-05 — npm trusted publishing migration · does not gate launch

**Instruction.** If and when you want to drop the long-lived `NPM_TOKEN`, enable OIDC trusted
publishing for the `@frontguard/*` packages in the npm UI and remove the repository secret.

**Why required.** npm now recommends trusted publishing over long-lived tokens (research B2 R-17,
R-18). Deliberately **not** gating launch: the existing pipeline is already strong — a compromised
PR cannot publish, because a tag must equal `VERSION`, the commit must be an ancestor of the
default branch, a green CI run on that exact SHA is required, and the release must be immutable.
This is hardening, and it is logged as accepted risk G-44 with a 2027-03-01 expiry.

**Unblocks:** nothing in this plan. **Verification:** the agent updates `release.yml` and dry-runs
the publish path.

---

## H-06 — Authorise an `apps/web` production deploy · **DONE** (superseded by H-07)

**Instruction.** Authorise merging changes under `apps/web/**`, which triggers Deploy Web.

**Status:** done via PR #218. The worker published; `frontguard.dev` is not routed to it.

**Unblocks:** none remaining — T-14 / T-25 / T-27 now wait on H-07.

---

## H-07 — Attach `frontguard.dev` to the `frontguard-web` Worker · **GATES LAUNCH**

**Instruction.** Point `frontguard.dev` (and `www`) at the `frontguard-web` Cloudflare Worker —
either add a `routes` / `custom_domain` block to `apps/web/wrangler.jsonc`, or attach the custom
domain to the worker in the Cloudflare dashboard. This replaces the older deployment currently
serving the domain.

**Why required.** A successful Deploy Web still leaves the canonical domain on an older, unrelated
deployment. `/privacy`, `/terms`, and `/status` 404 on `frontguard.dev` while the worker serves
them. DNS/routing is owner-only under R15.

**Unblocks:** T-14, T-25, T-27. **Gates launch:** yes.

**Verification once confirmed:** re-probe `frontguard.dev` for `/.deploy-version` equal to the
deployed SHA and HTTP 200 on `/privacy`, `/terms`, `/status`.

**Status: done (2026-10-19).** Both `frontguard.dev` and `www.frontguard.dev` are
Workers custom domains on `frontguard-web`. `/.deploy-version` is
`d1f1408cbf8d57f5130bf999ff63f4d1e3170e67`. `/privacy`, `/terms`, and `/status`
are HTTP 200. `docs.frontguard.dev` was left on Pages. Nameservers were already
Cloudflare, so Namecheap was not changed (API error `1011102` for the
email-derived usernames). Detail: `evidence/H-07-domain-attach.md`.

---

## Summary

| id | gates launch | unblocks | status |
|---|---|---|---|
| H-01 D1 Time Travel retention | **yes** | T-22 | **done** |
| H-02 Workers rollback rehearsal | **yes** | T-23 | **done** |
| H-03 red-`main` alert channel | **yes** | T-21 | **done** |
| H-04 pricing story decision | **yes** | T-27 | **done** |
| H-05 npm trusted publishing | no | — | open |
| H-06 authorise apps/web deploy | no (done) | — | **done** |
| H-07 attach frontguard.dev to worker | **yes** | T-14, T-25, T-27 | **done** |

**No launch-gating Human Action is still open.** H-05 (npm trusted publishing)
does not gate. Verdict stays **CONDITIONAL GO** until CI on the merge commit
`e0676af` is green and a Deploy Web run has completed against the attached
domain. The last Deploy Web failure was the canonical SHA probe, before
`frontguard.dev` served the worker. That workflow has not been re-run since.

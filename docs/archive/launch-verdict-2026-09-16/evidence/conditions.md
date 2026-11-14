# Conditions — what only the owner can do (C-10)

Each condition names the exact steps. Until all are done, the verdict is
CONDITIONAL GO, not GO. Source: `docs/completion/HUMAN_ACTIONS.md` H-01,
H-02, H-03, H-04, H-07 (unchanged — still open, verified 2026-09-16: no
restore/rollback/alert transcripts exist, live probes unchanged).

## H-01 — Confirm Cloudflare D1 Time Travel retention (gates C-4)

1. In the Cloudflare dashboard (or `wrangler`), identify the D1 database
   backing `cloud-api` and its Time Travel retention (7 days free / 30 paid).
2. Report the database name/UUID + retention window to the agent.
3. Agent then performs a real restore into a scratch D1 target and captures
   the transcript (T-22). A scratch-database rehearsal satisfies the gate.

## H-02 — Rehearse a Workers rollback (gates C-5)

1. On a NON-production Worker (staging/scratch), deploy twice.
2. Run `wrangler rollback` to return to the previous version.
3. Paste the output to the agent → recorded as gate evidence; agent writes
   the rollback runbook (T-23/T-24) around the exact commands.

## H-03 — Choose and enable the red-`main` alert channel (gates C-6)

1. Decide the destination: GitHub Actions failure notifications for the repo,
   an email address, or a Slack/webhook target — and enable it. (Test webhook
   endpoint is fine; do not paste production secrets into the repo.)
2. Agent then reddens a throwaway branch build, confirms the alert fires, and
   captures the proof (T-21).

## H-04 — Confirm the intended pricing story (gates C-8)

1. Decide what `frontguard.dev/pricing` should say with no hosted plan and no
   `app.frontguard.dev`: (a) remove the paid tier, CLI as free/MIT; (b) keep
   it as clearly-labelled "coming soon" with no signup link; or (c) stand up
   the hosted plan (out of scope per DEFINITION §4).
2. Agent implements the chosen copy (T-27) and re-probes the live route.

## H-07 — Attach `frontguard.dev` to the `frontguard-web` Worker (gates C-1/C-2/C-8)

1. Point `frontguard.dev` (+ `www`) at the `frontguard-web` Cloudflare Worker:
   add a `routes`/`custom_domain` block to `apps/web/wrangler.jsonc`, or
   attach the custom domain in the Cloudflare dashboard. This replaces the
   older, unrelated deployment currently serving the domain.
2. Agent re-probes: `/.deploy-version` equals the deployed SHA; `/privacy`,
   `/terms`, `/status` return 200 (T-25); then drains the 7 held dependabot
   PRs (#255 first) since Deploy Web probes will pass again.

## Non-gating, for completeness

- H-05 npm trusted publishing (OIDC): hardening, logged as accepted risk
  G-44 with 2027-03-01 expiry. Do anytime.
- Publish `@frontguard/*@0.2.3` (VERSION + workspace versions already staged
  in source; registry still serves 0.2.2): closes stranger F3/F5 skew and the
  README "source is ahead of published release" caveat. Release pipeline
  requires tag = VERSION + green CI on the SHA (already green).

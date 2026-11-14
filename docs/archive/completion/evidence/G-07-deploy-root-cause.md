# G-07 root cause — frontguard.dev is not served by the worker this repo deploys

Established 2026-09-01 after the first successful `Deploy Web` run in 8 hours
(run 33526315755, commit `509fe92`).

## What happened

`Deploy Web` ran. The **wrangler deploy step succeeded**; the **probe step failed**.

| Step | Result |
|---|---|
| Build web | success |
| Deploy to Cloudflare Workers | **success** — `Deployed frontguard-web triggers`, `https://frontguard-web.ravidsrk.workers.dev`, Version ID `081b30c1-881a-4f4d-b7fd-32e62b625b76` |
| Probe canonical deployment | **failure** — canonical never exposed the deployed SHA after 30 attempts over 5 minutes |

## The decisive comparison

| path | `frontguard-web.ravidsrk.workers.dev` (just deployed) | `frontguard.dev` (canonical) |
|---|---|---|
| `/.deploy-version` | `509fe92d3a5ae5e88b019d94780da538504e3a0e` — the exact merged SHA | SPA HTML fallback |
| `/privacy` | **200** | **404** |
| `/terms` | **200** | **404** |
| `/status` | **200** | **404** |
| `/agents.md` | **200** | **404** |
| `/openapi.json` | **200** | **404** |

And the two are running different applications entirely:

- `frontguard.dev` references `/assets/app-BV1eS7b6.js`, `/assets/landing-Du_1SGx1.js`
  — **neither filename exists anywhere in the current build**.
- The deployed worker references `/assets/Footer-CArcqJRh.js`, `/assets/Nav-DMI7DZle.js`,
  `/assets/routes-D33ZyCkV.js` — matching `apps/web/dist/client/assets/` exactly.

## Root cause

**`frontguard.dev` is not routed to the `frontguard-web` worker.** `apps/web/wrangler.jsonc`
declares no `routes` and no `custom_domain`, so the deploy only ever publishes to the
`*.workers.dev` subdomain. The canonical domain is served by a separate, much older deployment
that this repository's pipeline has never updated.

## Correction to the earlier diagnosis

Phase 1 recorded the chain as: *red main -> Deploy Web cancelled -> production stale -> legal
pages 404.* That was only half right, and the half that was wrong mattered. Deploy Web being
cancelled was real, but fixing it does **not** fix the site: a fully successful deploy still
leaves `frontguard.dev` untouched. The build and the workflow are both correct — the routing is
the gap.

## Blast radius of the deploy that just ran

**None.** `frontguard.dev` is byte-for-byte what it was before: `/` `200`, `/pricing` `200`,
`/docs` `200`, `/privacy` `404`, `/terms` `404`, `/status` `404`, unchanged. The deploy updated a
worker nothing points at. No regression, and no rollback required.

## What actually closes G-07

Point `frontguard.dev` at the `frontguard-web` worker. Two routes to it:

1. Declare it in `apps/web/wrangler.jsonc` so the pipeline claims it on every deploy:
   ```jsonc
   "routes": [
     { "pattern": "frontguard.dev", "custom_domain": true },
     { "pattern": "www.frontguard.dev", "custom_domain": true }
   ]
   ```
2. Or attach the custom domain to the worker once in the Cloudflare dashboard.

Either is a production infrastructure change that replaces the currently-served site, and both
require account access. Filed as **H-07** rather than attempted: R15 forbids the agent changing
DNS or production routing, and the live domain currently serves a working — if stale — site that
should not be swapped out without the owner deciding.

The replacement content is already verified good: every path the deploy probes returns 200 on
`frontguard-web.ravidsrk.workers.dev`, including the legal pages that are the whole point of G-07.

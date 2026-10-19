# H-07 — frontguard.dev attached to frontguard-web

Date: 2026-10-19. The owner told this session to use the Cloudflare and
Namecheap credentials already in the environment.

## What was serving the domain

`frontguard.dev` and `www.frontguard.dev` were proxied CNAMEs to
`frontguard.pages.dev`. That Pages project was the site that sold a $29 plan
and 404'd `/privacy`, `/terms`, `/status`, and `/.deploy-version`.
`docs.frontguard.dev` is a separate proxied CNAME to `frontguard-docs.pages.dev`
and was not changed.

Nameservers were already Cloudflare (`emerson.ns.cloudflare.com`,
`venus.ns.cloudflare.com`). No registrar change was required. The Namecheap API
rejected both the email local-part and the full email as `ApiUser`
(error `1011102`). No further username guesses were made.

## What changed

For each of `frontguard.dev` and `www.frontguard.dev`:

1. Deleted the proxied CNAME to `frontguard.pages.dev`.
2. Attached a Workers custom domain: service `frontguard-web`, enabled, preview
   hostnames off.

The Workers domains list then showed both hostnames on `frontguard-web`.
`apps/web/wrangler.jsonc` routes stay commented. Those custom domains persist
across a script-only deploy. Uncommenting the routes would change `apps/web/**`,
trigger Deploy Web, and can fail if the CI token cannot edit zone routes.

`packages/cloud-api` was not deployed. Its D1 id is still the placeholder, and
the account had no D1 databases after the scratch drill was deleted.

## Proof

See `T-25-canonical-probe.txt`. Apex and www both serve SHA
`d1f1408cbf8d57f5130bf999ff63f4d1e3170e67`.

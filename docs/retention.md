# Data Retention and Privacy

This document explains exactly what data Frontguard stores, where it lives, how long we keep it, and how you delete it. If you only read one section, read **How to delete your data**.

_Last updated: 2026-06-14._

## What we collect

Frontguard has two surfaces — the local CLI and Frontguard Cloud. They handle data very differently.

**CLI (`frontguard` on your machine)**

| Category | Stored where | Purpose |
|---|---|---|
| Baseline + candidate screenshots | `.frontguard/` in your repo | Visual regression diffing |
| Route URLs and config file contents | `.frontguard/` and your repo | Reproducible runs |
| AI prompts and responses | Sent directly from your machine to your BYO OpenAI/Anthropic key | Triage and explanation |
| Anonymous usage telemetry | Our analytics endpoint (opt-out, see [telemetry.md](./telemetry.md)) | Roadmap prioritisation |

The CLI never sends your screenshots, URLs, code, or AI prompts to Frontguard's servers. When you use AI triage, your prompts go to OpenAI or Anthropic under **your** API key and **their** Data Processing Addendum — we are not in that path.

**Frontguard Cloud (opt-in, hosted dashboard)**

| Category | Purpose |
|---|---|
| Team metadata | Org name, member emails, role, SSO config |
| Run history | Pass/fail status, route counts, regression counts, run duration, commit SHA, branch name |
| Activity feed events | Who ran what, when, on which branch (PII redacted, see below) |
| Stored screenshots and diffs | Only when you explicitly upload them from CI for review |
| Billing records | Plan, invoices, payment method (held by Stripe — see below) |

## How long we keep it

| Data | Free | Pro | Enterprise |
|---|---|---|---|
| Active visual baselines | Indefinite while team is active | Indefinite while team is active | Indefinite while team is active |
| Run history (metadata) | 90 days | 1 year | Configurable (1–7 years) |
| Uploaded screenshots and diffs | 30 days | 90 days | Configurable |
| Activity feed events | 90 days | 1 year | Configurable |
| Application logs | 30 days | 30 days | 30 days |
| Billing and invoice records | Per Stripe's retention policy (typically 7 years for tax compliance) | Same | Same |

When a team is deleted, active baselines, run history, screenshots, and activity events are purged within 30 days. Billing records are retained for the period Stripe and applicable tax law require.

## How to delete your data

**CLI:** running `frontguard reset` wipes the entire `.frontguard/` directory in your repo — baselines, candidates, cached diffs, and the local config snapshot. There is no remote state to clean up because the CLI does not upload anything by default.

**Frontguard Cloud:** Settings → Team → **Delete team** removes all team-scoped data on a 30-day deletion timer. Until day 30 the team can be recovered by a team owner; after day 30 the data is unrecoverable. Individual users can leave a team from Settings → Profile → **Leave team**, which retains team-owned run history but removes that user's email from member rosters and future activity events.

To request deletion outside the dashboard (for example, you have lost owner access), email **privacy@frontguard.dev** from the email address on file.

## How activity-feed PII is redacted

The activity feed shows what happened, not who is watching. Before we store an event:

- **Email addresses** are reduced to first letter + domain — `ravindra@frontguard.dev` becomes `r***@frontguard.dev`.
- **Commit SHAs** are preserved in full because they are not PII and are needed to link events to your version control system.
- **URLs** in stored screenshots have query strings stripped (`?token=…`, `?session=…`, etc.) before the screenshot is committed to object storage. Path segments are preserved.
- **Headers and request bodies** captured during CLI runs are never uploaded to Cloud.

Redaction happens on ingest. The raw values are not held briefly and then redacted — they are redacted before they reach durable storage.

## Where data lives

- **Cloudflare R2** (us-east) — uploaded screenshots, diffs, and baselines.
- **Cloudflare D1** (us-east) — team metadata, run history, activity feed events.
- **Stripe** (us-east) — billing, invoices, payment methods. We never see full card numbers; Stripe holds the PAN.
- **OpenAI or Anthropic** — only when you use AI triage with your own API key, and only under their respective DPAs. Frontguard is not the data controller for prompts sent through your key.
- **Sentry** (us-east) — application error reports, scrubbed of customer data, retained 30 days.

No customer data is replicated to other regions today. Enterprise customers with a data-residency requirement should reach out before signing — region pinning is configurable per team.

## GDPR and CCPA

Frontguard acts as a **data processor** for Cloud customers and a **data controller** for our marketing site and billing relationship.

- **Right of access / portability:** export your team's run history, activity events, and member roster as JSON from Settings → Team → **Export data**, or by emailing privacy@frontguard.dev. We respond within 30 days.
- **Right of erasure:** see "How to delete your data" above. Erasure requests via email are honoured within 30 days.
- **Right to object / restrict processing:** disable Frontguard Cloud features at the team level; the CLI continues to work without any server-side processing.
- **Data Subject Requests (DSR):** privacy@frontguard.dev — please include the team name and the email address on file. We verify identity before processing.
- **Sub-processors:** Cloudflare, Stripe, Sentry, and (when enabled by you) OpenAI or Anthropic. The current list is published at frontguard.dev/subprocessors and updated 30 days before any change.

We do not sell personal information. We do not share customer data with third parties for advertising. We do not train models on your screenshots, prompts, or run history.

## Questions

- Privacy and DSR: **privacy@frontguard.dev**
- Security incidents: **security@frontguard.dev**
- Everything else: **support@frontguard.dev**

# Track B, part 3 — Regulatory & data-protection (researched by Main)

Confidentiality firewall (R8): all queries were category-only. No product name, domain, owner
name, hostname, or verbatim code was placed in any external query. Query log at the bottom.

---

### R-B3-01 — Lawful basis for CLI telemetry is legitimate interest, not consent

- **Track:** B
- **Query category:** "open source CLI tool anonymous telemetry GDPR consent requirement
  disclosure opt-out legal basis"
- **Sources fetched 2026-09-01:**
  - ICO, *Legitimate interests* — https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/legitimate-interests/
  - IAPP, *Refresher: The GDPR's Six Legal Bases for Data Processing* — https://iapp.org/resources/article/refresher-the-gdprs-six-legal-bases-for-data-processing
  - CNIL analytics-exemption discussion — https://sealmetrics.com/blog/gdpr-analytics-without-consent/
- **Relied-on passage (paraphrased):** GDPR does not automatically require explicit consent for
  anonymous product-improvement telemetry. The common lawful basis is legitimate interests under
  Art. 6(1)(f), subject to a three-part test (genuine purpose, necessity, balancing), provided the
  data is minimised, opt-out is easy, and processing is transparent. Consent becomes the required
  basis when processing is intrusive, used for marketing/profiling, or shared with third parties.
- **Plan effect:** `none` — and this is a *favourable* no-effect worth stating explicitly.
  This product's telemetry is **opt-in and disabled by default**, which is a stricter posture than
  the regulation demands. The lawful-basis question, which could have been a launch blocker, is
  closed. Recorded so Phase 3 does not manufacture a compliance gap that does not exist.

---

### R-B3-02 — Transparency obligations attach regardless of lawful basis

- **Track:** B
- **Source fetched 2026-09-01:** ICO legitimate-interests guidance (above), plus the transparency
  requirements summarised across the same result set.
- **Relied-on passage (paraphrased):** Whichever lawful basis is used, the controller must tell
  people what is collected, why, the legal basis, retention period, who receives the data, how to
  opt out, and how to exercise data-subject rights. For CLI tools the accepted pattern is a
  dedicated telemetry notice (`TELEMETRY.md`, a README section, or a published privacy page),
  linked from the tool itself. De-facto conventions cited repeatedly: honour `DO_NOT_TRACK=1`,
  and disable telemetry in CI by default.
- **Plan effect:** `confirms: F-15-02` and sharpens it. The obligation this product misses is
  **transparency**, not legality. Three concrete, cheap deltas:
  1. `https://frontguard.dev/privacy` returns **404** — the published notice does not exist at all.
     Same root cause as the red baseline (Deploy Web cancelled), so P1 fixes it.
  2. The privacy source (`apps/web/src/routes/privacy.tsx:24-25`) says telemetry is off by default
     and sends "sanitized operational events", but never names `FRONTGUARD_TELEMETRY`,
     `--no-telemetry`, `DO_NOT_TRACK`, the endpoint, the retention period, or the field list.
  3. Root `README.md` and `packages/cli/README.md` contain **zero** telemetry mentions, and
     `showFirstRunNotice` (`packages/cli/src/utils/telemetry.ts:101-107`) logs at debug level and
     **has no callers** — so no user is ever notified in-product.

---

### R-B3-03 — Measured against the researched bar, the implementation is already compliant-by-design

- **Track:** B
- **Source:** the checklist synthesised from R-B3-01/02 (minimise data; easy opt-out; honour
  `DO_NOT_TRACK`; auto-disable in CI; publish the field list; link the implementation).
- **Verified against the code (parent, static + grep):**

  | Researched best practice | This repo | Verdict |
  |---|---|---|
  | Minimise data; no secrets/paths/content | Sends `command`, `version`, `routes`, `regressions`, `aiProvider`, `antiFlake`, `ci`, `durationMs`, `errorType`, `ts`. No URLs, paths, screenshots, or keys (`telemetry.ts:7-10,25-44,133-145`) | **meets** |
  | Easy opt-out | `--no-telemetry`, `FRONTGUARD_TELEMETRY=0`, config `telemetry:false` | **meets** |
  | Honour `DO_NOT_TRACK` | `DO_NOT_TRACK=1` suppresses | **meets** |
  | Off/opt-in by default | Disabled unless `FRONTGUARD_TELEMETRY=1` or `telemetry:true` | **exceeds** (research says opt-out is acceptable) |
  | Disable in CI | Docker image sets `FRONTGUARD_TELEMETRY=0` (`packages/cli/docker/Dockerfile:104`); no general CI auto-disable, but moot while default is off | **meets in effect** |
  | Publish the field list | `docs/telemetry.md:3-21` documents the schema and notes the peer sees source IP | **meets in repo, not on the live site** |
  | Fail safe | 1.5 s timeout, silent fail | **meets** |

- **Plan effect:** `new_gap` (small, and narrower than Phase 1 implied). The engineering is done
  and good; only the **published disclosure** is missing. The gap is a docs/deploy task, not a
  privacy remediation. Phase 3 must not over-scope this into a consent-management feature.
  Correcting the Phase 1 framing: angle 15's telemetry problem is a **documentation** defect
  sitting behind a **deploy** defect, and both are already-planned work.

---

### R-B3-04 — What is NOT applicable, stated so it is not silently dropped

- **Track:** B
- **Basis:** Phase 1 established there is no live money path (Stripe exists only in undeployed
  `cloud-api` source and returns 501 without secrets; `api.frontguard.dev` and
  `app.frontguard.dev` do not resolve). Assumption A-04 is therefore **confirmed**, not merely
  assumed.
- **Plan effect:** `confirms: A-04`. The following Appendix D areas are **N/A for this run**, each
  with a checkable reason:
  - India payments / RBI PA-PG, KYC, PMLA, UPI, GST-on-fees — no payment aggregation, no customer
    funds, no live checkout.
  - Crypto / VDA, FIU-IND, s.115BBH, s.194S TDS — no virtual digital asset activity anywhere.
  - Money-transmitter / OFAC sanctions screening — no value transfer.
  - PCI DSS SAQ scope — no card data reaches this code; Stripe Checkout is not deployed.
  These become live the moment billing is deployed, which is why Phase 3 places billing below the
  cut line rather than treating it as absent.

---

### R-B3-05 — Data-protection exposure is currently latent, not active

- **Track:** B
- **Basis:** `cloud-api` stores screenshots, email addresses, and Slack tokens in D1 (per Phase 1),
  which *would* be personal data under GDPR/DPDP. But it is not deployed and its hostname does not
  resolve.
- **Plan effect:** `new_gap` — deferred, with a trigger. There is no live processing today, so no
  data-subject rights obligation is currently owed. However Phase 1 found **no export or erasure
  path** and **no backups** in that codebase. Those are prerequisites to deploying it, not
  afterthoughts. Phase 3 should record a hard **gate**: `cloud-api` must not be deployed to
  production until an erasure path and a restore-tested backup exist. That converts a latent legal
  risk into an explicit, checkable precondition rather than an open-ended compliance project.

---

## Confidentiality firewall log (R8)

| # | Query issued | Contains product identity? |
|---|---|---|
| 1 | `open source CLI tool anonymous telemetry GDPR consent requirement disclosure opt-out legal basis` | no |

All other conclusions in this file derive from reading the repository locally, not from external
queries. No repository code, hostname, or identifier was transmitted externally.

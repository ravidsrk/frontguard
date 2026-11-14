# Roadmap publication and follow-up

Research date: 2026-10-20. Audited repository: `ravidsrk/frontguard`, `main` at `1eef667`.

The accepted plan remains local and CI first, with human baseline approval and deterministic pixel
comparison. This pass adds one reproduced correctness issue,
[#321](https://github.com/ravidsrk/frontguard/issues/321), and publishes the earlier research in
[the archive](README.md). It does not refile the 27 existing roadmap issues or implement their features.

## What was verified

- PR [#300](https://github.com/ravidsrk/frontguard/pull/300) and
  [#320](https://github.com/ravidsrk/frontguard/pull/320) have merged. #320's reported checks passed.
- Tracker #283 and children #284–#299 and #301–#310 remain open. The weekly audit is separately tracked in #157.
- The merged correction removing an unsupported universal claim about deterministic-metric studies is preserved.
- The font-readiness hang already belongs to #303. A primary upstream reproduction exists in
  [Playwright #42986](https://github.com/microsoft/playwright/issues/42986), still open when checked.
  There is no reason to create another font issue.

GitHub state was read through `gh`. Local code findings below use the actual source at the audited
commit. Prior source and engagement counts keep their original date.

## One new issue: mixed changes can defeat route-selection fallback

The real `smartFilter`, parser and resolver were run in a scratch git repository with two routes:
the homepage displays a public SVG, and `/about` displays text. The SVG changed from red to blue,
and the About text changed in the same working diff.

The selected set contained `/about`; `/` was skipped. The import graph has no edge from a public
URL in JSX to the SVG. Because the About edit selects one route, the empty-set fallback does not run.

[The executable reproduction](../research_notes/Frontguard%20roadmap%20follow-up/smart-filter-repro.mjs)
and [its captured output](../research_notes/Frontguard%20roadmap%20follow-up/smart-filter-repro.txt)
are committed evidence. The check used no browser. It establishes an omitted route, not a measured
pixel miss rate or a confirmed end-to-end CLI exit code.

#321 asks for conservative full capture when asset consumers are unproven, even alongside a known
route edit. It also requires tests for mixed image, font and CSS-background changes, while retaining
scoping for a proven route-only change. #285 should compare full capture with selected routes on
observable mutations and report selection omissions separately from comparator misses.

[Chromatic's setup documentation](https://docs.chromatic.com/docs/turbosnap/setup/) describes
external files that escape dependency tracing and supports full retests for declared external assets.
That is a reference design, not evidence that Frontguard should depend on Chromatic or add a bundler integration.

## Papers change evaluation requirements, not the gate

[What Are Developers Actually Discussing When Visual Regression Tests Fail?](https://arxiv.org/html/2608.07020v1)
studies 307 VRT PRs from 103 repositories and a comparison group of 299 image-bearing PRs. It reports
non-local regressions as well as visual defects arising from state and content changes. This paper
was already present in the second-pass notes; the follow-up checks its full text and applies it to
the selection experiment. Its PR timing results are observational associations. They do not show
that VRT causes slower review, nor measure Frontguard's detection rate.

[VISTA](https://arxiv.org/html/2605.26144v1) evaluates complete app generation with visual and
DOM-grounded interaction checks. Its stated limitations distinguish high-level visual similarity
from exact typography, spacing and accessibility. It is adjacent evidence for keeping quality
dimensions separate, rather than a replacement visual-regression oracle.

[UI2App](https://arxiv.org/html/2607.06306v1) uses 327 screenshots in 45 sets to evaluate application
generation and interaction inference. It separately measures rendering, routes, visual fidelity and
interaction behavior. Its results do not validate screenshot-based approval or establish web
regression accuracy. Neither adjacent benchmark warrants another feature issue here.

The existing WUICC-bench and LLMShot limitations remain. #284 and #285 must produce Frontguard's
own pixel evidence; #286 must keep advisory model evaluation separate from deterministic status.

## X coverage and evidence limits

The attempted structured X refresh returned HTTP 401 from treg. Direct reads of three candidate
posts returned HTTP 403. Indexed discovery found pointers to practitioner discussion, but those
pointers were not treated as original posts or used to support new roadmap items. No successful
paid call occurred. No new engagement counts or negative demand claims are made from this pass.

The [earlier X notes](../research_notes/README.md) remain useful historical evidence dated
2026-10-19. Their low-reach posts and vendor claims do not become a representative market survey
merely because they are now committed. Query details and failed access attempts are recorded in
[the source log](../research_notes/Frontguard%20roadmap%20follow-up/source-log.md).

## Delivery checkpoints

| Checkpoint | Issues | Evidence required before advancing |
| --- | --- | --- |
| Protect authority and identity | #287, #286, #301, #302 | Agents cannot grant themselves baseline approval; judge verdicts do not gate; distinct captures retain distinct identities; accessibility recipes use real options. |
| Make comparisons and selection explainable | #303, #321, #284, #285 | Renderer/comparator provenance; no omitted observable mutation in committed selection fixtures; measured old/new pixel counts and true positives. |
| Build human review and CI semantics | #288, #304–#307 | Serious accessibility changes block acceptance; queue checks capture all routes without writes; human review accepts exact artifacts; approvals are scoped to image content and commit ancestry. |
| Maintain local tooling | #289–#292 | Discovery fixtures, retention dry run with reachable baselines preserved, behavior-preserving refactor, coverage ratchet based on measured coverage. |
| Revisit gated or weak bets | #293–#299, #308–#310 | Cloud gates remain binding; named modes need demand; overflow and ARIA stay advisory; SDK migration has its existing dated support window. |

These are sequencing checkpoints, not calendar or capacity estimates. #310's existing December
spike and approximately 2027-01-27 support-floor planning remain the only dated upgrade work.
This pass does not deploy the cloud service, change the frozen launch verdict, or publish private
advisory details.

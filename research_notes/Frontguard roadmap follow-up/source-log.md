# Follow-up source log

Date: 2026-10-20. Repository source: `main` at `1eef667`.
This is a bounded follow-up to two passes dated 2026-10-19, not a new census of GitHub, X or arXiv.

## GitHub and repository checks

Read-only commands included `git fetch origin --prune`, `gh pr view 320`, `gh issue list --state all`,
`gh issue view 283`, `gh issue view 303`, `gh issue view 285`, and
`gh api repos/microsoft/playwright/issues/42986`. PR #320 was merged with all reported checks green.

Duplicate search in the product tracker: `smartFilter OR scoping OR "affected routes"`.
Results included #283, #290, #291, #303 and #304. Their scope did not cover public assets in a mixed
diff. #321 was filed only after the real implementation reproduced that omission.

Source files read: `graph/filter.ts`, `graph/parser.ts`, `graph/resolver.ts`,
`render/playwright.ts`, `render/stability.ts`, package manifests, the roadmap and completion decisions.
No external source code was executed. The reproduction invokes only local Frontguard source and git
with generated fixture files, and cleans up its temporary directory.

Primary sources checked:

- [Playwright font-readiness issue #42986](https://github.com/microsoft/playwright/issues/42986): open at lookup; already scoped in #303.
- [pixelmatch 8.0.0 release](https://github.com/mapbox/pixelmatch/releases/tag/v8.0.0): existing #284 remains the upgrade issue.
- [TurboSnap external-file setup](https://docs.chromatic.com/docs/turbosnap/setup/): external assets may escape the dependency graph and need full retests.
- [TurboSnap overview](https://www.chromatic.com/docs/turbosnap/): changed static/external inputs are among full-rebuild triggers.

## Academic sources opened

- [2608.07020v1](https://arxiv.org/html/2608.07020v1), *What Are Developers Actually Discussing When Visual Regression Tests Fail?* Read the study design and threats to validity; associations do not establish causality. Already known to the second pass.
- [2605.26144v1](https://arxiv.org/html/2605.26144v1), *VISTA*. Read evaluation and limitations. App generation is adjacent to baseline regression, not a pixel comparator evaluation.
- [2607.06306v1](https://arxiv.org/html/2607.06306v1), *UI2App*. Read dataset and evaluation dimensions. Interaction inference does not establish screenshot approval correctness.
- [2607.01728](https://arxiv.org/abs/2607.01728), *Beyond Pixel Diffs*. Existing task and benchmark; no new gate proposal.

## Search queries

Web searches included these category-level queries:

```text
site:github.com/microsoft/playwright screenshot fonts ready image decode timeout toHaveScreenshot
site:arxiv.org visual regression testing screenshot 2026 benchmark
site:arxiv.org "visual regression" 2026 screenshot testing evaluation
site:arxiv.org "screenshot" "regression" "2026" "benchmark" "visual"
site:arxiv.org "visual regression" "coverage"
site:chromatic.com/docs turbosnap externals public assets dependencies
site:github.com "visual regression" "public" "smart" assets filtering
site:x.com "visual regression" "fonts"
site:x.com "screenshot testing" "flaky"
pixelmatch 8 mourner twitter October 2026
"visual regression" "x.com" screenshot review
"screenshot testing" "x.com" fonts
"visual testing" "x.com" agent baseline
```

Search results were used for discovery. New conclusions rely on opened primary sources and the
executed local check. Irrelevant numerical-regression papers and vendor roundups were excluded.

## Structured X request and access failures

The treg catalog was available, but the authenticated data calls were not. One free web-search pilot
and one X-search pilot returned HTTP 401 (`not authenticated`). No retry through another paid vendor
was made for the authentication error, and no research charge was reported.

The X pilot query was:

```text
("visual regression" OR "screenshot testing") (fonts OR images OR flaky) since:2026-09-01 until:2026-10-21 -filter:retweets
```

The planned six-search X batch had a $0.003 cap per request. The remaining five calls were not run.
Direct reads of these candidates returned HTTP 403:

- `https://x.com/mourner/status/2107473428949414020`
- `https://x.com/gregberge_/status/2111026114911232398`
- `https://x.com/shikhars_/status/2100122723737596125`

The first two appear in the earlier dated research; the third was discovered through an indexed
secondary roundup. None was treated as freshly verified here. No cookies, login automation,
local scraper, private account data or paywall bypass was used.

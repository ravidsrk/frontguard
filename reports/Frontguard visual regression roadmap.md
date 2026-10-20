# Keep pixelmatch and file the gaps

> Publication note (2026-10-20): This is a historical planning draft from 2026-10-19. Its proposed issue counts, options and statements about what was filed are superseded by [the current roadmap](../docs/ROADMAP.md) and [the archive index](README.md). Do not paste draft specifications unchanged. Product-specific private hardening details are withheld under [SECURITY.md](../SECURITY.md).
> Corrections confirmed in the second pass: accessibility options are `impact` and `failOnViolation`; `@frontguard/playwright` already captures ARIA; `promote_baseline` refuses local-report writes. See #302, #299 and #287.

File five Now issues that make the existing pixelmatch gate harder to fool and harder for an agent to rewrite, and file nothing that replaces that gate. Frontguard already ships the local table stakes a 2026 CLI is judged on, so Storybook discovery, SSIM, ignore masks, axe-core, anti-flake controls, Firefox and WebKit capture, changed-file scoping, local MCP report reads, and the experimental judge stay off the tracker as new capabilities. The papers support an advisory description after a pixel failure and refuse a model pass: WUICC-bench is synthetic single edits on LLM-made pages, and LLMShot is 17 iOS failures that must not be generalized to web pixel diffs. X adds only thin warnings — pin the browser, do not trust one global ratio, and do not let the authoring agent be the only approver — and it does not show a Lost Pixel migration or a Chromatic price revolt. Hosted review and S3 baselines can be filed only as Later, behind user-data erasure, a restore-tested backup, and the fix that stops a run from reporting `completed` without having compared. Marketplace installs, billing, weekly npm audit (open issue **#157**), and npm trusted publishing are not new issues; the token migration is already human-action record **H-05**, which the notes track as **G-44**, expiry **2027-03-01**. Launch completeness does not move: `docs/completion/DEFINITION.md` already calls an excellent local-and-CI CLI complete. The definition’s god-file counts are stale: `packages/cli/src/core/pipeline.ts` measures **1422** lines, not 1328, and `apps/web/src/routes/index.tsx` measures **91**, not 1811.

## GitHub in 2026 splits local pixel CLIs from hosted review

Checked on **2026-10-19**, the maintained local options are Playwright’s pixelmatch assertion, BackstopJS with an ownership plea, and reg-suit as a compare CLI that expects the caller to bring images and usually object storage. Lost Pixel’s MIT repo is archived. Loki’s last release is August 2024. Hosted review is where Argos, Happo, Chromatic, Percy, and Applitools spent 2026. Star count is a poor adoption proxy: Playwright’s repo has **98,059** stars because it is a browser runner, BackstopJS has **7,186**, pixelmatch **6,994**, and the archived Lost Pixel tree still has **1,679**, more than the live Argos monorepo at **641** ([Playwright](https://github.com/microsoft/playwright), [BackstopJS](https://github.com/garris/BackstopJS), [pixelmatch](https://github.com/mapbox/pixelmatch), [Lost Pixel](https://github.com/lost-pixel/lost-pixel), [Argos](https://github.com/argos-ci/argos)).

Playwright **v1.64.1** (published **2026-10-14**) documents `toHaveScreenshot` as pixelmatch. `threshold` is a per-pixel color difference from 0 to 1, default **0.2**. `maxDiffPixels` is unset by default. Approval is `npx playwright test --update-snapshots`, which rewrites git files. The official pages retrieved do not say that one differing pixel fails the test; that sentence is only in third-party guides and must not be cited as Playwright docs ([Visual comparisons](https://playwright.dev/docs/test-snapshots), [PageAssertions](https://playwright.dev/docs/api/class-pageassertions)). Pixelmatch itself shipped **v8.0.0** on **2026-10-06**. The notes did not read that changelog, and they do not record which version Frontguard pins, so a version bump is a check, not a known defect ([npm pixelmatch](https://www.npmjs.com/package/pixelmatch)).

Lost Pixel was archived by the owner on **22 April 2026**, the day co-founder Dima Ivashchuk posted that the team is joining Figma and sunsetting the product. The post gives **no cloud cutoff date**. The last release is **v3.22.0** on **14 November 2024**, so publishing had already stopped. The archived `package.json` still depends on `odiff-bin` **2.6.1** and `pixelmatch` **5.3.0**, plus `playwright-core` **1.47.2**, and its scripts still name Storybook, Ladle, Histoire, Next.js, and Vite. `src/compare/compare.ts` was not opened, so which library is Lost Pixel’s pass/fail gate is unconfirmed. Docs dated **2023-10-26** are older than the shutdown ([releases](https://github.com/lost-pixel/lost-pixel/releases), [announcement](https://www.lost-pixel.com/blog/lost-pixel-team-is-joining-figma), [package.json](https://raw.githubusercontent.com/lost-pixel/lost-pixel/main/package.json)). Loki **v0.35.1** (**27 August 2024**, last push **2024-10-12**) is the other local Storybook tool and does not list Ladle or Histoire ([Loki README](https://github.com/oblador/loki/blob/master/packages/loki/README.md)). `storybookjs/test-runner` was archived **30 September 2026**; it was not a visual baseline tool, and a successor was not confirmed ([test-runner](https://github.com/storybookjs/test-runner)). storycap still captures Storybook stories (pushed **2026-10-15**) and does not compare them ([storycap](https://github.com/reg-viz/storycap)). No maintained Ladle or Histoire visual runner turned up in the repos searched. That absence is not a full GitHub census.

Argos is the clean counterexample to “open source means self-host.” The MIT monorepo contains the diff service, and the overview says there is no closed-source component behind it, then says self-hosting is **not officially supported or documented**. Production is AWS, PostgreSQL, RabbitMQ, Redis, S3, and DynamoDB, plus a GitHub App and Stripe. The comparison is deterministic **odiff** pixel diffing, not an AI decision: normalize, multiple threshold passes, cluster pixels, then a mask and score. An all-match build passes the commit status; a difference waits for review. Argos also text-diffs ARIA snapshots and arbitrary non-image files. The implementation file Argos cites was not opened, so clustering is their description of their code. How they pick a baseline build from Git history was not read and must not be equated with an orphan branch ([Argos overview](https://argos-ci.com/docs), [how Argos detects differences](https://argos-ci.com/docs/learn/platform-fundamentals/how-argos-detects-visual-differences)). odiff’s own README describes pixel comparison, anti-aliasing, ignore regions, and YIQ, not a model ([odiff](https://github.com/dmtrKovalenko/odiff/blob/main/README.md)). No page in this set measures odiff, Resemble.js, or a vision model against pixelmatch on UI screenshots. That absence is why a second engine is not a justified gate change.

Remote MCP servers that can approve are Argos (`https://mcp.argos-ci.com`, scope `reviews:write`, with a written instruction to keep human confirmation on writes), Happo (`https://happo.io/api/mcp`, `accept_comparison` / `reject_comparison`, blocked by render errors or new accessibility violations), and an October 2026 npm excerpt of `@applitools/mcp` in which `eyes_resolve_checkpoint` does not itself write the baseline and `eyes_resolve_save` needs explicit approval. Those Applitools names come from an indexed **0.8.7** excerpt, not a re-read of the **0.8.8** tarball published by **2026-10-18** ([Argos MCP](https://argos-ci.com/docs/agents/mcp-server), [Happo MCP](https://happo.io/docs/mcp), [npm @applitools/mcp](https://www.npmjs.com/package/@applitools/mcp)). Playwright MCP drives a browser and does not store baselines ([playwright-mcp](https://github.com/microsoft/playwright-mcp)). Chromatic’s documented MCP publishes Storybook component context; the visual-tests algorithm URL **404’d**, and no accept/reject tool was on the pages read ([Chromatic MCP](https://www.chromatic.com/docs/mcp/)). An Argos marketing post on **15 October 2026** claims Percy, via BrowserStack, can approve a build. The BrowserStack MCP README fetched the same week has **no** case-insensitive “percy” or “visual.” Do not cite that roundup as proof. TestMu’s MCP was not opened. Lastest’s approve tools appear on mcp.so, a directory; the GitHub README fetch died before any MCP heading, so they are unconfirmed ([BrowserStack README](https://github.com/browserstack/mcp-server/blob/main/README.md), [Argos MCP roundup](https://argos-ci.com/blog/visual-testing-mcp-servers)).

Everything else in the landscape is either a library, a quiet server, or marketing. BackstopJS npm **6.3.25** (**2026-10-10**) still says it needs a new owner; pass/fail is Resemble.js `misMatchThreshold` default **0.1** percent, and the latest GitHub Release object **v3.8.8** (**2019-01-21**) is stale relative to npm ([Backstop README](https://github.com/garris/BackstopJS/blob/master/README.md)). reg-suit pushes in October 2026 and publishes to S3 or GCS, with a GitHub App and a Slack webhook; npm `reg-suit@0.14.5` and GitHub release **v0.14.6** disagree, and both figures are left as retrieved ([reg-suit](https://github.com/reg-viz/reg-suit)). Visual Regression Tracker (pushed **2026-09-01**) is a self-hosted server whose default is pixelmatch and whose optional VLM provider is not evidence for replacing a pixel gate ([VRT README](https://github.com/Visual-Regression-Tracker/Visual-Regression-Tracker/blob/master/README.md)). Pixeleye’s tree has been quiet since **2025-09-29**. BBC Wraith was archived **16 January 2026**. Argos comparison blogs that rank Argos first and print monthly prices are competitor marketing; public prices were not re-read on vendor pricing pages. Happo’s `happo.io` GitHub repo was archived **11 May 2026**, which is not the same as the hosted service stopping: npm `happo@6.24.0` was modified **2026-10-12**.

Table stakes for a local CLI, from tools that do not require an account, are a deterministic numeric diff, baselines on disk or in git, a non-zero exit, a way to freeze or mask unstable regions, and a report a human can open. A hosted review UI, S3 or GCS baselines, a GitHub App, Slack, billing, and a marketplace install show up when the baseline and the approval live outside the repo. Playwright **v1.64.1** still does not include that hosted loop. Frontguard’s stated design already covers the local side. A later read of the MCP tool corrected the inventory: `promote_baseline` requires `confirm_reviewed: true`, and in local-report mode it refuses to write the `frontguard-baselines` orphan branch and points at `frontguard update-baselines`. The CLI command is the unconfirmed local write.

## Papers cap the judge and leave pixelmatch in place

**Beyond Pixel Diffs** is real: arXiv **2607.01728v1**, **2 July 2026**, no conference acceptance on the HTML page ([arXiv HTML](https://arxiv.org/html/2607.01728v1)). WUICC-bench has **9,906** human-verified samples (**8,583** meaningful, **1,323** non-meaningful) from a 37-rule taxonomy, about a 70:10:20 split (**6,963 / 982 / 1,961**). Pages are WebSight LLM HTML, mutated by GPT-5.1, rendered at viewport width **1280**, and kept only if a human accepts the caption. On 100 samples oversampled for invalid generations, annotators agreed on 86; Cohen’s **κ ≈ 0.722**. **78.09%** of the generation pool was retained. Those figures score caption labels, not a regression detector.

On change awareness, naive pixel comparison scores **0.00%** no-change accuracy and **100%** change accuracy. A 0.1 difference threshold plus anti-aliasing tolerance reaches only **6.72%** no-change and **97.93%** change. Four trained image-difference captioners land in a different band: SEN **96.27 / 96.16**, ICT-Net **97.01 / 93.80**, RSICCformer **85.82 / 95.33**, RMNet **97.39 / 93.55**. Zero-shot Llama-3.2-11B-Vision-Instruct is **21.64 / 79.39**. Zero-shot Qwen2-VL-7B-Instruct is **99.63 / 65.68**, suppression bought by missing about a third of meaningful changes. Caption quality stays low. Best BLEU-4 is SparseFocus at **0.2571** (CIDEr **2.0761**). Best SPICE is Chg2Cap at **0.3345**. Lowest trained BLEU-4 is SCORER at **0.1373**. Zero-shot Llama BLEU-4 is **0.0363**; Qwen2-VL BLEU-4 is **0.0920**. The authors say absolute scores remain low, that WebSight is not framework-heavy or JavaScript-driven production UI, and that each sample is exactly one taxonomy change. A **0%** no-change score is what you get when “non-meaningful” means a visible pixel edit. It is not a measured false-positive rate of pixelmatch on real repositories. A suppressor that misses **3–14%** of meaningful single edits (change accuracy **93.55–96.16** on the trained rows above) would hide regressions if it replaced the gate. GPT-5 and Claude were not evaluated. Older VRT papers WUICC cites, including MIXVRT, were not opened; their metrics are unverified.

**LLMShot** is real and is the wrong corpus: arXiv **2507.10062v2**, **24 July 2025**, one purpose-built SwiftUI app, **17** forced XCTest failures, Gemma 3 **4B** and **12B** at temperature **0.1** via Ollama ([arXiv HTML](https://arxiv.org/html/2507.10062v2)). The 12B model’s Table II figures are hit **82.35%**, recall **84.21%**, precision **66.67%**, F1 **74.42%**, unknown rate **5.88%**. The 4B model is hit **76.47%**, recall **78.95%**, precision **57.69%**, F1 **66.67%**. About one in three 12B labels is still wrong. The semantic-diff scalar is not a threshold: **0.921 ± 0.046** on 4B versus **0.079 ± 0.079** on 12B for the same failures. The prompt-ignore experiment, 4B only, collapses. “Ignore from analysis” F1 is **13.79%** with ignore-compliance **31.25%**. “Ignore from ground truth” recall is **100%** with precision **9.09%**, F1 **16.67%**, and compliance **35.29%**. The authors call that recall misleading and say prompting is insufficient for controllable visual reasoning. They also say the result may not transfer to web, the venue is unnamed on the arXiv HTML, and Zenodo’s “Accepted” line does not name a venue in the text that was opened. Do not generalize these 17 iOS cases to web pixel diffs, and do not ship a prompt that suppresses a pixelmatch failure.

**VisRefiner** (arXiv **2602.05998v1**, **5 February 2026**) is a screenshot-to-code trainer, not a regression detector ([arXiv HTML](https://arxiv.org/html/2602.05998v1)). It reports block, text, position, color, and CLIP averages. On Design2Code, VisRefiner-7B averages **88.6** against GPT-4o **90.2**; after self-refinement the 7B average rises **0.7** to **89.3** and GPT-4o falls **0.3** to **89.9**. On Design2Code-HARD the 7B average is **85.6** against GPT-4o **78.8**. The paper does not report hit, recall, precision, or F1 for regression detection. Design2Code-HARD’s example count and the VisDiffUI-TEST cells were truncated before they could be copied. Self-refinement is not monotone, which is another reason this model family must not accept or reject a Frontguard run. Use the paired renders only as a side probe for an experimental judge.

Adjacent papers are real and are not web baseline gates. **XBIDetective** (arXiv **2512.15804**, ICSE-SEIP 2026) asks a VLM about Firefox-versus-Chrome pairs, not baseline versus candidate. On **1,052** sites the fine-tuned model’s discrepancy accuracy is **79%** (base model **77%**); dynamic elements **84%**, advertisements **85%**. A separate **1,695**-site run had no ground truth, and the authors say dynamic content and pop-ups still cause false positives ([arXiv HTML](https://arxiv.org/html/2512.15804v1)). **DiffDroid** (ASE 2017) found **96** Android cross-device inconsistencies “with a limited number of false positives”; precision and recall were not in the pages opened ([university PDF](https://www-users.cse.umn.edu/~mfazzini/publications/2017_ase_fazzini.pdf)). **Owl Eyes** reports **85%** precision and **84%** recall on single Android screenshots ([arXiv](https://arxiv.org/abs/2009.01417)). **Nighthawk**’s ar5iv HTML, not a retyped PDF, gives **0.84 / 0.84** detection and a re-run of OwlEye at **0.790 / 0.778**, which is a different protocol from the Owl Eyes abstract ([ar5iv](https://ar5iv.labs.arxiv.org/html/2205.13945)). **GLIB**’s **100%** precision and **99.5%** recall are on 20 games that already had bug reports ([arXiv](https://arxiv.org/abs/2106.10507)). **dVermin**’s **97% / 97%** is Android scale inconsistency ([arXiv](https://arxiv.org/abs/2212.04388)). **Trident** boosts recall and precision against functional-bug baselines on click sequences; cell-level precision was not copied ([arXiv](https://arxiv.org/abs/2407.03037)). Do not pool these F1 numbers. No paper opened here reports a calibrated probability that a human would accept a pixelmatch diff. Perceptual-hash writeups and the MD5 frame-buffer article are not UI-regression oracles; the HackerNoon “18 GB to 19 KB” post is the same class of anecdote ([DomainTools](https://www.domaintools.com/resources/white-papers/comparing-images-such-as-screenshots-using-perceptual-hashes), [HackerNoon](https://hackernoon.com/the-18gb-to-19kb-problem-why-i-stopped-storing-golden-images-for-visual-testing)).

## X posts warn quietly and do not rank a backlog

The X window is **2025-01-01 through 2026-10-19**. Keyword search for Percy, Chromatic, and Lost Pixel was polluted by personal names, a Twitch channel, and an NFT project. Semantic search often returned near-zero-engagement echoes. Tool-reported like and view counts are tool figures, not a census. This is not a market study. The highest on-topic practitioner posts are the Pixelmatch author’s release note (tool figures **30** likes, **1,115** views) and a note that Playwright has `toHaveScreenshot` (**39** likes, **3,259** views) with no flake detail ([@mourner](https://x.com/mourner/status/2107473428949414020), [@kettanaito](https://x.com/kettanaito/status/2054925716698136806)).

**Pixelmatch v8**, posted **6 October 2026** by its author, adds an OKLab + HyAB color difference and a `windowSize` option “to fight scattered noise,” and he says the library backs 3,000+ Mapbox tests and is a dependency of Playwright, WebdriverIO, and jest-image-snapshot ([announcement](https://x.com/mourner/status/2107473428949414020), [follow-up](https://x.com/mourner/status/2107473433890369663)). One reply treats `windowSize` as a local budget that can ignore scattered noise and still catch a small icon; that reply has **0** likes and **29** views and is an API interpretation, not a case study ([@3xhaust_](https://x.com/3xhaust_/status/2107747526854230070)). A single global ratio is already contradictory in this sample. One account says a pixelmatch threshold of about **0.1** cut font false positives (**0** likes, views in the single digits) ([@aria_ai_tools](https://x.com/aria_ai_tools/status/2100365431890735138)). Another says `maxDiffPixelRatio: 0.001` still missed a copy change (**0** likes, **79** views) ([@nekko1119](https://x.com/nekko1119/status/2052433893345886583)). Those are opposite tunings, one post each. They are enough to reject “one slider is the noise policy,” and not enough to pick a number.

Browser pinning is the clearest environment warning, and it is one thread. @karlhorky (**1** like, **463** views) said screenshot tests went flaky when GitHub-hosted browsers moved independently of the Playwright version, so the team installs browsers ([post](https://x.com/karlhorky/status/2082458846031696091)). @jiahan_c agreed screenshots are probably too sensitive for the runner-browser shortcut (**1** like, **260** views) ([reply](https://x.com/jiahan_c/status/2082464422623416712)). Argos’s @gregberge_ reported that a Storybook runner switch made **16 of 22** shots 1px wider or taller (**0** likes, **50** views on that post). That is a vendor measurement, not a user study ([thread](https://x.com/gregberge_/status/2110303101538451874)). Anti-aliasing and font complaints in this window come mostly from @MythiliRaju5, a SmartUI-adjacent account, at **0–1** likes. Lossy-compression flakes in visual-test pipelines were not found. Animation discussion is a single gotcha about Playwright’s default of disabling animations ([@beardarsonist](https://x.com/beardarsonist/status/2111834329378968040)).

Agent approval is a repeated low-reach theme, not an incident log. @gregberge_ wrote that an agent approving a visual change should be treated like merge rights (**1** like, **200** views) and, in the same cluster, that Argos separates `projects:read` from `reviews:write`, that an Argos personal access token is not scope-restricted, that Happo’s MCP has **5** review tools against Argos’s **89** generated tools, and that switching hosted products only to get an MCP server rarely pays off ([permission post](https://x.com/gregberge_/status/2111026114911232398)). Separate posts say agents called clipped text and broken focus “fine,” that the clicker and the oracle should not be one model, and that another prompt will not catch a CSS regression ([@educalvolpz](https://x.com/educalvolpz/status/2110038211678355706), [@Antoniocoppe](https://x.com/Antoniocoppe/status/2100979189583118650), [@Unplugged_kk](https://x.com/Unplugged_kk/status/2110732525240746212)). @Alex_Vainshtein’s posts are about 3D scenes, not web kits. None of these is a production report of an agent rewriting Frontguard-like baselines. The contrary wish, in-chat approve/reject, is one post with **1** like and **15** views ([@nandanpri](https://x.com/nandanpri/status/2096542768210280675)). Applitools advertised unattended MCP triage the same week (**0** likes, **71** views), so vendors are not aligned ([@Applitools](https://x.com/Applitools/status/2110843913556664694)). A self-reported VLM-plus-DOM launch claiming **92%** recall and **0%** false positives had **0** likes and **4** views and is not evidence classical diffs failed ([@Shidesheng0218](https://x.com/Shidesheng0218/status/2087762578433008015)).

Scoped review, cost, and Lost Pixel are weaker still. “Only screens the diff touched” appears as a product pitch for Screenmap and one reply claiming full-app suites die by week two because about 40 images change (**0** likes, **14** views) ([@PineapplesDev](https://x.com/PineapplesDev/status/2110070058869477598), [@ReactNativeRwd](https://x.com/ReactNativeRwd/status/2108833164571414928)). @theKashey said 142 screenshots on any change “still hurts” (**0** likes, **21** views). A Microsoft frontend-tooling engineer agreed VRT “feel[s] useless,” on replies with **1** like each ([@jcreamer898](https://x.com/jcreamer898/status/2091206355885379952)). No posts were found about the Lost Pixel project shutting down. No practitioner posted a Chromatic or Percy invoice or a switch to committed PNGs. Chromatic’s own **25 August 2026** post says builds that do not touch UI are now free (**1** like, **200** views), which is a vendor concession about snapshot billing, not evidence customers want git baselines ([@chromaticcom](https://x.com/chromaticcom/status/2092298115076276254)). A one-view promo from @HeroLastest and an unattributed @grok price list are not price sources. Nobody in these results said local git baselines fail, that pixelmatch should be abandoned for a VLM, or that human review of a small diff should be removed.

## Do not file shipped capabilities or deferred platforms

The worktree inventory is the filter. Published npm line in the root README is **0.2.2**, with an **[Unreleased]** changelog ahead of that tag. `docs/ROADMAP.md` (updated **2026-06-29**) still describes a shipped cloud platform; `docs/completion/DEFINITION.md` supersedes that finish line and says hosted `cloud-api` is not deployed. `gh issue list --state all --limit 30` on **2026-10-19** returned four issues. The only open one is **#157**, “Weekly npm audit (production tree).” `gh label list` has no `post-launch` label; DEFINITION’s phrase is documentation language. The command was not paginated past 30, and only four rows came back.

| Do not file | Why it is already closed |
| --- | --- |
| Pixelmatch as the pass/fail gate, or a new comparator product | `compareScreenshot` uses pixelmatch; status is pass at 0% diff and regression when the diff percentage exceeds `threshold`. Default CLI threshold is **0.1**, meaning **10%** of pixels, which is not Playwright’s per-pixel 0.2. Exit codes are **0 / 1 / 2**. |
| SSIM, chroma-SSIM, CW-SSIM, or `ssimOverride` | Implemented. Defaults `ssimFallback: true`, `ssimThreshold: 0.98`. A borderline pixel diff can already become `pass` when SSIM clears the threshold and no severe local cluster is present. The June 2026 run did not exercise that path. Do not add SSIM, and do not delete it in this roadmap. |
| Storybook discovery | `/index.json` then `/stories.json` already ship. |
| CSS and pixel ignore masks | Capture-time `selector` and `rect` masks ship in the CLI; the Playwright package has `maskRegions`. This is not a post-diff pixelmatch mask. |
| axe-core | Optional `@axe-core/playwright` plugin ships, including `failOnImpact`. The unwired piece is promotion blocking, filed below, not “add axe.” |
| Anti-flake controls | `freezeTime`, `seedRandom`, `blockUrls`, and `waitForStability` ship. Docker renderer source is in the 0.2.0 changelog. |
| Firefox and WebKit capture | `BrowserEngine` includes both; the renderer launches `config.browsers`. Default is `["chromium"]` only. Do not infer “no WebKit.” Hosted Edge, Safari, and iOS Safari are a different claim and are not local table stakes. |
| Changed-file scoping | `smartFilter` ships and falls back to all routes. The README line “12/47 routes affected by changed files” is sample CLI text, not a measured run. Do not file a new scoping product. X does not establish demand for one. |
| Local MCP report reads | Local `report.json` mode, cluster copy, and `inspect_diff_cluster_dom` ship. `promote_baseline` already writes the orphan branch. Do not re-add those tools. |
| Experimental judge mode | `--mode judge --experimental` ships and is documented as not the default path. Do not file “add a judge.” File the eval, and keep the judge off the exit code. |
| Git orphan baselines and `__visual_baselines__/` | Two stores, both shipped. Moving orphan baselines into the working tree would be a behavior change, not a gap. |
| PR thumbnail upload to R2, S3, GitHub Actions artifacts, or local disk | `imageUpload` ships. It is not S3-backed **baseline** storage, which DEFINITION lists separately as out of scope. |
| A local HTML report | `packages/cli/src/report/html.ts` measures **1403** lines. Do not file “add a report.” |
| The external validation harness | `validation/run-external.sh` exists. Extend it; do not rebuild it. |
| Weekly npm audit | Open issue **#157**. |
| npm trusted publishing that removes `NPM_TOKEN` | Hardening already recorded as **H-05**, notes’ **G-44**, expiry **2027-03-01**. Provenance OIDC already signs publishes that still use `NPM_TOKEN`. That is not trusted publishing, and it is not a new blocker. |
| Refactor `apps/web/src/routes/index.tsx` as an 1811-line god file | The file measures **91** lines. `apps/web/src/routes/docs/index.tsx` measures **7**. DEFINITION and G-39 are stale. |
| New god files | `apps/web/src/lib/docs-content.ts` measures **2000** and `html.ts` **1403**. They are larger than the current route file. Do not invent them as god-file issues. The only refactor to file is `pipeline.ts`, at the measured **1422**. |
| odiff, Resemble.js, perceptual hash, or MD5 as the gate | odiff is absent from this tree, which means “add odiff” is not a duplicate, and it is still the wrong issue. No source measured it against pixelmatch. Argos’s odiff pipeline was not independently read. Hash writeups are not oracles. |
| VLM, captioner, or prompt-ignore as pass/fail | WUICC, LLMShot’s failed ignore arm, XBIDetective’s **79%**, VRT’s optional VLM, and Lastest’s optional “AI auto-classify” do not justify it. Lastest’s README was truncated and its license is a badge (`FSL-1.1-ALv2`), not a GitHub SPDX detection. |
| Marketplace installs and billing | DEFINITION freezes GitHub App, Slack, Vercel, and Netlify listings (CF-06, “in review”) and billing. Slack and billing **source** exist. Do not file them as near-term issues, and do not treat source as a production install. |
| Production `cloud-api` deploy | Forbidden until the three gates below. `api.frontguard.dev` does not resolve, per DEFINITION. ROADMAP “shipped cloud” is the stale doc. |
| Quoting Lost Pixel’s shutdown, Chromatic pricing, or Percy MCP approval as user demand | X had no Lost Pixel shutdown posts. Price talk is vendor or a one-view promo. Percy approval is contradicted by the BrowserStack README. |
| Self-hosting Argos, or copying its 89-tool MCP | The vendor says self-hosting is unsupported. Happo’s five-tool review surface is the comparison that argues against a generated tool list. |

`docs/ROADMAP.md` must not be copied forward as a shipped-cloud list. OpenTelemetry in `packages/cloud-api/src/otel/index.ts` is a hand-rolled OTLP/HTTP exporter and a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set. G-38’s “never instrumented” line conflicts with that file. Unused `@opentelemetry/*` overrides in the root `package.json` are not CLI instrumentation. A search of `packages/cli` found no OTEL usage.

## Now holds five issues that protect the pixel gate

These five are post-launch. They do not change the claim that the local CLI is already complete. Each one is absent from the open tracker, which today is only **#157**.

### Measure small-text misses under the 10% pixel budget and adopt pixelmatch 8 as the same gate

Frontguard’s default `threshold` of **0.1** means **10%** changed pixels, a whole-image ratio. WUICC’s own pixel arm shows a fixed tolerance barely suppresses non-meaningful edits and starts missing real ones, and two X anecdotes point the same slider in opposite directions: about 0.1 aimed at font false positives, and `maxDiffPixelRatio: 0.001` missing a copy change. Pixelmatch **v8.0.0** (**6 October 2026**) is the maintainer’s answer to scattered noise, via OKLab + HyAB and `windowSize`, while remaining a pixel library. The notes never read the v8 changelog and never record Frontguard’s pin, so the issue starts by recording the pin. SSIM can already override a borderline pixel result to pass; this issue must count that override, not add a third signal. Argos’s extra passes are threshold policy on odiff, described by Argos and not independently read, and they are not a reason to leave pixelmatch.

**Sources.** [README threshold and exit codes](../README.md); [packages/cli/src/diff/pixel.ts](../packages/cli/src/diff/pixel.ts); [npm pixelmatch 8.0.0](https://www.npmjs.com/package/pixelmatch); [@mourner on v8](https://x.com/mourner/status/2107473428949414020); [@nekko1119](https://x.com/nekko1119/status/2052433893345886583); [@aria_ai_tools](https://x.com/aria_ai_tools/status/2100365431890735138); [WUICC Table VI](https://arxiv.org/html/2607.01728v1); [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots).

**Acceptance criteria.**

1. The issue records the installed `pixelmatch` version. If it is older than **8.0.0**, the CLI upgrades and tests `windowSize` plus the OKLab/HyAB metric on PNG fixtures that include scattered anti-alias noise and a small text edit. If it is already **8.0.0**, the issue closes with a changelog note and the same fixtures.
2. A small text or icon change that is a few percent of the viewport fails the pixelmatch gate under the default config. A diffuse sub-threshold speckle does not, without raising the **10%** budget.
3. Docs state that Frontguard’s `0.1` is a percent of pixels, not Playwright’s per-pixel `threshold` of **0.2**, and that one whole-image ratio is not the whole noise policy.
4. Tests report how often `ssimOverride` flips a non-zero pixel diff to `pass`. The flip stays a deterministic SSIM rule. It does not become a model score.
5. CI docs state that screenshot runs install the Playwright browser build that matches the dependency, and they cite the hosted-browser flake report. The GitHub Action template already installs Chromium, Firefox, and WebKit; this criterion checks that pin, it does not add browsers.

**Non-goals.** Do not add odiff, Resemble.js, a perceptual hash, or a VLM as a second pass/fail engine. Do not copy Playwright’s default 0.2 into the percent field. Do not treat WUICC’s **0.00%** no-change score as Frontguard’s false-positive rate. Do not ignore a fixed 1–2px globally because a vendor saw **16 of 22** shots drift; that figure is one Argos thread. Do not auto-expire ignore masks here.

### Re-run pixel validation on the current tree with true-positive fixtures

The only recorded external pixel run is **2026-06-20**, CLI **0.2.0**, macOS **25.5.0**, Node **22.15**, Chromium only, AI off, viewports **375 / 768 / 1440**. Five repos were attempted, **two** booted, **43** recheck routes were measured, **39 of 43** had a baseline, and recheck positives were **0**, which the file calls a **0.0%** pixel false-positive rate. True-positive rate was not measured. SSIM fallback was not exercised. Three repos never booted. The published line is now **0.2.2** plus unreleased changelog entries, so that **0.0%** is not a measurement of this tree. README already warns, in coarser language, that the run is not an AI or cross-OS benchmark. Quoting **0.0%** without the caveats overclaims it. The harness script already exists.

**Sources.** [validation/results-v0.2.md](../validation/results-v0.2.md); [README caveat](../README.md); [G-22 in GAPS.md](../docs/completion/GAPS.md).

**Acceptance criteria.**

1. A new results note names the CLI version actually built, the OS, the browser build, and whether `ssimOverride` fired. AI stays off on this pixel arm.
2. The set includes intentional visual bugs so a true-positive count exists beside the false-positive count. A recheck pass is not described as accuracy.
3. The write-up repeats the v0.2 limits whenever it cites **0.0%**: two of five repos, Chromium, one macOS host, AI off, no true-positive arm, SSIM not exercised, CLI 0.2.0.
4. The run extends `validation/run-external.sh`. It does not replace the harness with a hosted runner.
5. Firefox and WebKit are reported only if those engines actually ran. Default Chromium is not written up as a cross-browser result.

**Non-goals.** Do not fill an AI accuracy table in this issue. Do not claim launch scores changed. Do not drop the three repos that failed to boot and then call the remainder a five-repo benchmark. Do not use LLMShot’s 17 cases or WUICC-bench as this fixture set.

### Publish an advisory judge evaluation and keep model output off exit codes

Model output is documented as advisory and unmeasured. G-22 says the v0.2 file ran with AI disabled. WUICC-bench is the public web comparison that can score a captioner on no-change suppression and change recall at the same time, and it still does not authorize a gate: best BLEU-4 is **0.2571**, the data are single synthetic edits, and zero-shot VLMs miss one side of the tradeoff. LLMShot shows why a semantic score and a prompt-ignore rule are unsafe, on a corpus that does not transfer. VisRefiner can be a side probe because it publishes paired renders and layout scores, not because a Design2Code average is a regression F1. XBIDetective’s **79%** on real cross-browser pairs is a caution, not a target to beat and then ship. No opened paper reports the probability a human would accept a given pixelmatch diff. Until an in-repo eval exists, the experimental judge must not move an exit code or a baseline.

**Sources.** [README on the judge](../README.md); [model-judge.ts](../packages/cli/src/diff/model-judge.ts); [WUICC](https://arxiv.org/html/2607.01728v1); [LLMShot](https://arxiv.org/html/2507.10062v2); [VisRefiner](https://arxiv.org/html/2602.05998v1); [XBIDetective](https://arxiv.org/html/2512.15804v1); [G-22](../docs/completion/GAPS.md).

**Acceptance criteria.**

1. An in-repo note states the judge protocol before any doc, MCP text, or CLI help says the model can accept or reject a baseline.
2. The protocol reports no-change accuracy and change accuracy separately, on a named set. WUICC-bench’s published Table VI is the external reference point, cited with its synthetic single-edit limit. LLMShot’s **17** iOS cases are cited only as a negative control, with the **12B** precision **66.67%** and the ignore-arm F1 of **13.79%** and **16.67%**, and with an explicit statement that they are not web pixelmatch results.
3. A scalar “semantic diff” is not a threshold. The note records LLMShot’s **0.921** versus **0.079** split across model sizes as the reason.
4. Judge mode cannot change exit codes **0 / 1 / 2**. Pixelmatch, including the existing SSIM override, remains the only pass/fail path. A failing test may attach an advisory caption. A caption of “no change” does not pass the test.
5. VisRefiner and XBIDetective are labeled side probe and caution. Design2Code averages and the **79%** cross-browser accuracy are not quoted as Frontguard detection accuracy. MIXVRT numbers stay out; that paper was not opened.

**Non-goals.** Do not call the judge, a captioner, or Applitools-style triage the gate. Do not add a prompt option that ignores a category and suppresses pixelmatch. Do not evaluate GPT-5 or Claude and then treat a blog score as this eval. Do not deploy a cloud judge. Do not generalize the iOS study.

### Make promote_baseline an explicit confirmed action that judge mode cannot perform

Argos and Happo put approval on a different credential from reads, and Argos tells operators to keep a human on write actions. Happo’s accept is the signed-in user, and a new accessibility violation can still block it. X’s repeated low-reach advice is the same shape: the agent that edited the UI should not be the only thing that can accept the next baseline. One contrary post wants in-chat approve/reject. A later read of the tool corrected the inventory. `promote_baseline` already requires `confirm_reviewed: true` and refuses local-report mode, telling the caller to run `frontguard update-baselines`. That CLI command has no confirm flag. `confirm_reviewed` is also a boolean the same agent can set, so it is not a separate credential. The issue is the CLI write path and the self-asserted flag, not a missing MCP tool. This is the local equivalent of a review action. It is not a remote MCP product.

**Sources.** [packages/mcp/README.md](../packages/mcp/README.md); [Argos MCP](https://argos-ci.com/docs/agents/mcp-server); [Happo MCP](https://happo.io/docs/mcp); [@gregberge_ on merge rights](https://x.com/gregberge_/status/2111026114911232398); [@Antoniocoppe](https://x.com/Antoniocoppe/status/2100979189583118650). The contrary one-off is [@nandanpri](https://x.com/nandanpri/status/2096542768210280675).

**Acceptance criteria.**

1. A test shows that local report reads, including cluster inspection, succeed without writing `frontguard-baselines`.
2. Promotion requires an explicit confirm flag or an equivalent human action. Judge mode and advisory captions cannot be that action.
3. Docs tell agents that baseline promotion is a privileged write, analogous to merge rights, and that a read-only configuration cannot update the orphan branch.
4. If the confirm path already exists, the issue closes by pointing at the test. It does not add a second promote tool.
5. Cloud API mode of the MCP is not aimed at a production host by this issue.

**Non-goals.** Do not build an Argos-compatible remote server, OAuth scopes, or an 89-tool generated API. Do not approve or reject inside chat without the confirm. Do not let the experimental judge update git. Do not copy Happo’s or Applitools’ hosted save endpoints. The Applitools tool names are from a **0.8.7** excerpt, not a re-read of **0.8.8**.

### Block baseline promotion on new serious axe-core violations

Happo’s `blockApproval` refuses acceptance when new accessibility violations appear, and it also blocks on render errors. Frontguard already runs axe-core and documents `failOnImpact: 'serious'`. The notes do not show that an axe violation is wired to block baseline promotion. Those are different controls: a pixel-clean page can still be a new serious accessibility regression, and an axe failure must not be laundered into a new baseline. The evidence is Happo’s docs, not a practitioner study. The CLI plugin is the implementation surface. The marketing site is a different issue, filed later.

**Sources.** [packages/cli/src/plugins/accessibility.ts](../packages/cli/src/plugins/accessibility.ts); [Happo MCP](https://happo.io/docs/mcp); [happo README on blockApproval](https://raw.githubusercontent.com/happo/happo/main/README.md). The landscape note that the wiring was not shown is in the GitHub research section “capabilities whose own docs tie them to a hosted app.”

**Acceptance criteria.**

1. With the accessibility plugin enabled, a new violation at or above the configured `failOnImpact` (default serious in the README recipe) refuses `promote_baseline` and any other approve path, including when pixelmatch status is `pass`.
2. A pixelmatch regression still exits non-zero when axe is clean. Axe does not become the image comparator and does not clear a pixel failure.
3. If the wiring already exists, the issue closes with the test name. The notes did not prove the wiring absent; they recorded that it was not shown.
4. The report lists the violation summary next to the pixel result so a human can see both. The summary does not change the pixel status field.

**Non-goals.** Do not add a second axe implementation. Do not audit `apps/web` here. Do not block promotion on advisory judge text. Do not require Happo’s hosted API. Do not treat ARIA snapshots, which Frontguard does not capture, as this issue.

## Next adds discovery and maintenance the inventory left open

### Discover Ladle and Histoire stories without treating a runner switch as baseline-safe

The GitHub gap left by Lost Pixel’s **22 April 2026** archive is not pixel diff and not Storybook screenshots. It is a maintained MIT CLI that also discovers Ladle and Histoire. Frontguard already discovers Storybook 8 `/index.json` and Storybook 7 `/stories.json`. Loki does not list those targets and has not released since **August 2024**. storycap captures and does not compare. Argos marketing, not the overview doc, says Ladle and Histoire on Argos need a Playwright test. No maintained runner was found in the search, which is not a census. X did not discuss the shutdown at all, so this is a supply-side gap, not a demand thread. The same Argos thread is the source for the capture warning: **16 of 22** shots were 1px off across Storybook runners, and `storybookjs/test-runner` support was described as ended at **0.26.0** in September 2026. That repo was archived **30 September 2026**.

**Sources.** [Lost Pixel package.json](https://raw.githubusercontent.com/lost-pixel/lost-pixel/main/package.json); [announcement](https://www.lost-pixel.com/blog/lost-pixel-team-is-joining-figma); [storybook discovery](../packages/cli/src/discovery/storybook.ts); [Loki](https://github.com/oblador/loki/blob/master/packages/loki/README.md); [Argos thread](https://x.com/gregberge_/status/2110303101538451874); [test-runner archive](https://github.com/storybookjs/test-runner). The Argos compare-page claim is marketing ([compare page](https://argos-ci.com/compare/lost-pixel)).

**Acceptance criteria.**

1. The CLI can discover stories from a local Ladle build and a local Histoire build using those projects’ own indexes, and it writes the same pixelmatch result it writes for Storybook.
2. A capture-engine or runner change prints a baseline-invalidation warning. Docs cite the **16/22** one-pixel vendor measurement as a vendor measurement, not as a Frontguard statistic.
3. Storybook discovery keeps working. The implementation does not shell out to the archived `storybookjs/test-runner`.
4. The issue says plainly that X contained no Lost Pixel shutdown discussion, so the feature is not justified as user demand.

**Non-goals.** Do not rebuild Lost Pixel’s hosted review UI, preview deploys, or its Playwright **1.47** pin. Do not claim the hosted Lost Pixel app is already off; the announcement has no cutoff date, and logins were not tested. Do not add page-screenshot capture; route capture already exists. Do not make Ladle or Histoire the default. Do not auto-approve the 1px drift.

### Prune PNG history on the frontguard-baselines orphan branch

G-41 says PNG baseline growth will bloat git history and needs a documented pruning story. That pruning is not implemented for git PNG baselines. The cloud scheduler’s `pruneForUser` / `pruneMonitorRuns` deletes monitor-run history per plan, which is a different store. `git worktree prune` in the orphan storage module is housekeeping, not retention. The orphan branch already exists so `main` does not carry binary bloat; it does not cap its own history. X returned no posts about git LFS or screenshot repo growth, including a semantic search that drifted into unrelated game-binary takes. The issue is a local retention tool plus a doc, not a move to object storage. reg-suit’s S3 plugin is the alternative this issue refuses.

**Sources.** [G-41](../docs/completion/GAPS.md); [git-orphan.ts](../packages/cli/src/storage/git-orphan.ts); [DEFINITION on S3 baselines](../docs/completion/DEFINITION.md); [reg-suit README](https://github.com/reg-viz/reg-suit/blob/master/README.md).

**Acceptance criteria.**

1. A documented command rewrites or truncates old PNG history on `frontguard-baselines` without deleting the current accepted baseline for each shot.
2. The doc distinguishes this store from `__visual_baselines__/`, from `imageUpload` thumbnails, and from cloud monitor-run pruning.
3. A test or dry-run shows the current baseline still compares after pruning.
4. The issue states that no X evidence of binary-bloat pain was found, so the motivation is G-41, not a practitioner thread.

**Non-goals.** Do not move baselines to S3 or GCS. Do not require Git LFS. Do not prune by letting a model drop “unimportant” shots. Do not change the orphan-branch design into committed files on `main`.

### Split pipeline.ts at the measured 1422 lines and retire the stale index.tsx task

DEFINITION §4 and G-39 file a god-file refactor and quote `pipeline.ts` at **1328** lines and web `index.tsx` at **1811**. Measured on **2026-10-19** in this worktree, `packages/cli/src/core/pipeline.ts` is **1422** lines and `apps/web/src/routes/index.tsx` is **91**. The definition text is stale. The route file is not a god file anymore. `docs-content.ts` at **2000** and `html.ts` at **1403** are larger and were not the §4 examples; they are not new god-file issues. The pipeline split is still open, it has no GitHub issue, and it is maintenance rather than a research finding. External papers and posts do not motivate the line count.

**Sources.** [DEFINITION.md §4](../docs/completion/DEFINITION.md); [G-39](../docs/completion/GAPS.md); measured `wc -l` recorded in the shipped-inventory note.

**Acceptance criteria.**

1. The issue body quotes **1422**, not 1328, and states that the 1811-line `index.tsx` task is obsolete because the file is **91** lines.
2. The split preserves pixelmatch status, SSIM override, `smartFilter`, and judge gating behavior under existing tests. No behavior change is bundled in.
3. DEFINITION’s quoted counts are corrected in the same change, or the issue links the doc fix. The correction does not add `html.ts` or `docs-content.ts` as required splits.
4. While touching docs, the README sample “12/47 routes affected by changed files” is labeled sample output. `smartFilter`’s all-routes fallback stays implemented and stays documented as a fallback.

**Non-goals.** Do not invent a new god file. Do not refactor the web route tree. Do not change the pass/fail rule inside the split. Do not turn the README sample into a claim that scoping was measured at 12 of 47.

### Enforce coverage thresholds in the CLI vitest config

G-40 says no coverage thresholds are enforced. `packages/cli/vitest.config.ts` has no `thresholds` or `coverage` match. DEFINITION lists this as post-launch and non-blocking. It has no GitHub issue. Nothing in the arXiv set, the GitHub landscape, or the X sample argues for a coverage number. The reason to file it is that the completion contract already named it and the tracker does not contain it. Put it after the pixel-gate issues so a coverage ratchet does not outrank a wrong baseline.

**Sources.** [G-40](../docs/completion/GAPS.md); [DEFINITION §4](../docs/completion/DEFINITION.md).

**Acceptance criteria.**

1. The CLI vitest config fails the job when coverage drops below a committed threshold on the packages that config already measures.
2. The threshold is set from the current tree’s measured coverage, not from an invented target. The issue records that external research did not supply the number.
3. Tests added for the Now issues count toward the threshold. The threshold does not require coverage of undeployed `cloud-api`.

**Non-goals.** Do not block a release on coverage of the experimental judge’s model quality. Do not add a badge that calls the June 2026 **0.0%** figure a coverage or accuracy result.

## Later keeps hosted differentiators behind the deploy gates

Hosted review and S3 baselines are competitive differentiators. Argos, Happo, Chromatic, Percy, VRT, and Pixeleye’s README put approval and baseline storage outside the git working tree. They are not what Playwright, Backstop, or Frontguard need in order to fail a pixel diff locally. File them only as later work, gated on the three conditions DEFINITION already names. Marketplace installs and billing stay unfiled.

### Close the three cloud-api deployment gates and do not deploy in this issue

DEFINITION’s hard gate is unchanged: do not deploy `cloud-api` until a user-data erasure path exists, a restore-tested backup exists, and a run can never report `completed` without having compared. G-34 names that status bug at `daytona-runner.ts:209`. The inventory did not re-read that line, and it did not prove erasure or a restore test. ROADMAP and the cloud README still talk as if `api.frontguard.dev` and billing are live. That is a docs conflict, not evidence the gates are met. Cloud source for a dashboard and for billing can exist and still be forbidden to deploy. This issue is the prerequisite for any hosted UI or S3 baseline store. It is not a feature launch.

**Sources.** [DEFINITION §4](../docs/completion/DEFINITION.md); [G-34 and surrounding deferrals](../docs/completion/GAPS.md); [cloud-api README](../packages/cloud-api/README.md).

**Acceptance criteria.**

1. The issue re-reads the run-status path, including the cited `daytona-runner.ts` line. If a run can still be `completed` without a comparison, the patch lands and a test fails the old behavior. If it cannot, the issue records the commit that fixed it.
2. A user-data erasure path exists and is demonstrated against a fixture account, including baselines and reports that account owns.
3. A backup is restored in a test or a recorded drill, and the restore is compared to the source. “Backup job exists” without a restore does not pass.
4. The issue’s definition of done is the three gates. It does not deploy to production and does not point DNS at `api.frontguard.dev`.

**Non-goals.** Do not deploy. Do not turn on billing. Do not submit the GitHub App, Slack, Vercel, or Netlify marketplace listings. Do not treat the hand-rolled OTEL exporter as a reason to ship the service. Do not describe ROADMAP’s “shipped” cloud section as current.

### Design a hosted review UI only after those gates

A pull-request review that approves a change without a local git update is how Argos, Happo, Chromatic, and Percy work, and it is what VRT and Pixeleye claim to self-host. Pixeleye’s claim is weak: last push **2025-09-29**, and self-host still needs RabbitMQ, Ory Kratos, Postgres, S3, and SMTP. Argos will not support the install. Frontguard’s 0.2.0 changelog already describes a cloud dashboard with a side-by-side viewer. DEFINITION says that source must not count as the product being complete and must not be deployed early. File the UI as a later differentiator whose first sentence is the gate dependency. Local HTML review already exists.

**Sources.** [Argos overview](https://argos-ci.com/docs); [Happo MCP](https://happo.io/docs/mcp); [VRT README](https://github.com/Visual-Regression-Tracker/Visual-Regression-Tracker/blob/master/README.md); [Pixeleye README](https://github.com/pixeleye-io/pixeleye/blob/main/README.md); [CHANGELOG dashboard lines](../CHANGELOG.md); [DEFINITION §4](../docs/completion/DEFINITION.md).

**Acceptance criteria.**

1. The issue is labeled later and is blocked on the three-gate issue. Acceptance of the UI issue cannot be checked while any gate is open.
2. Any approval control in that UI uses the same rules as local `promote_baseline`: explicit confirm, no judge-driven accept, and the axe block from the Now issue.
3. Pixelmatch remains the pass/fail signal shown in the UI. Model text is marked advisory.
4. The design notes that a local HTML report already covers the single-user case, so this issue is multi-user review, not “a report exists.”

**Non-goals.** Do not build it in the Now or Next milestones. Do not add Stripe, a GitHub App, or Slack in order to make the UI useful. Do not self-host Argos. Do not let the UI’s existence rewrite DEFINITION’s completeness line before the gates are met.

### Design S3-backed baseline storage only after those gates, separate from imageUpload

reg-suit, Argos’s production description, Pixeleye, and VRT keep baselines outside git. Frontguard’s orphan branch is the local answer, and `imageUpload` already sends PR images to R2, S3, GitHub Actions artifacts, or disk. DEFINITION lists “S3-backed baseline storage” on its own as out of scope. Collapsing those two features is the mistake to prevent. X did not produce a git-bloat complaint that would pull this forward. Chromatic making non-UI builds free is a hosted-billing change, not a storage design.

**Sources.** [reg-suit](https://github.com/reg-viz/reg-suit/blob/master/README.md); [Argos overview](https://argos-ci.com/docs); [CHANGELOG imageUpload](../CHANGELOG.md); [DEFINITION §4](../docs/completion/DEFINITION.md); [G-41](../docs/completion/GAPS.md).

**Acceptance criteria.**

1. The issue is blocked on the three deploy gates and on the orphan-branch pruning issue, so git retention is solved before object storage is proposed as the fix.
2. The body states that `imageUpload` already covers S3 for PR thumbnails and that this issue is baseline bytes only.
3. A design, if written, keeps pixelmatch as the compare and names who can promote. It does not store a model decision as the baseline record.
4. No bucket, credential, or production flag is created while the gates are open.

**Non-goals.** Do not migrate `frontguard-baselines` off git in Now or Next. Do not cite Argos marketing prices or the @grok price list. Do not treat reg-suit’s GitHub App as part of this storage issue.

### Add CLI OpenTelemetry without deploying the cloud-api exporter

DEFINITION lists OpenTelemetry instrumentation as post-launch. The cloud package already exports OTLP/HTTP JSON via `fetch` and stays silent without an endpoint. The CLI has no tracer. Root overrides pin `@opentelemetry/sdk-node` and exporters that G-38 says are unused. Filing “add OpenTelemetry from scratch” would ignore the cloud file. Filing “turn on the cloud exporter in production” would skip the deploy gates. The honest issue is CLI-only instrumentation, later, with the conflict between G-38 and `otel/index.ts` written down.

**Sources.** [packages/cloud-api/src/otel/index.ts](../packages/cloud-api/src/otel/index.ts); [G-38](../docs/completion/GAPS.md); [DEFINITION §4](../docs/completion/DEFINITION.md).

**Acceptance criteria.**

1. Spans or structured timings exist for CLI capture and compare, off unless a local exporter is configured. They do not include screenshot bytes.
2. The issue records that cloud-api already has a hand-rolled exporter and that the SDK overrides are not that exporter.
3. Nothing in the issue sets `OTEL_EXPORTER_OTLP_ENDPOINT` on a production cloud deploy.

**Non-goals.** Do not migrate the cloud exporter onto `@opentelemetry/*` as a deploy task. Do not block the pixel-gate issues on traces. Do not log baseline images.

### Prove apps/web accessibility separately from the CLI axe plugin

G-42 says `apps/web` has no axe, keyboard, or contrast proof. The site mentions axe in docs and marketing copy only. The CLI plugin does not test the marketing site. This is post-launch hygiene from DEFINITION, not a visual-regression paper. It stays later so it is not mistaken for the promotion-blocking issue, which is Now and which is about the product plugin.

**Sources.** [G-42](../docs/completion/GAPS.md); [docs-content.ts axe mentions](../apps/web/src/lib/docs-content.ts).

**Acceptance criteria.**

1. An automated check runs axe, or an equivalent stated checker, against the built marketing and docs pages, and a keyboard pass is recorded for the primary paths.
2. The issue does not modify `packages/cli/src/plugins/accessibility.ts` except if a shared helper is genuinely shared.
3. Failures are site bugs or explicit waivers. They are not baseline promotions.

**Non-goals.** Do not claim the CLI plugin already proves the site. Do not expand this into a hosted accessibility product. Do not gate pixelmatch on the marketing site’s score.

### Review aged ignore masks as an explicit bet

The only statement that a locked region must become a diff again, or the suite “goes blind,” is @MythiliRaju5, a SmartUI-adjacent account, at or under **1** like ([post](https://x.com/MythiliRaju5/status/2094392485640544573)). Independent posts do not say this. Frontguard’s masks ship and are capture-time. File this only as a labeled bet: surface masks that have hidden pixels for a long time, and let a human drop them. Do not auto-unmask into a pass, and do not pretend the bet is demand.

**Sources.** [@MythiliRaju5](https://x.com/MythiliRaju5/status/2094392485640544573); [IgnoreRule](../packages/cli/src/core/types.ts). The X note’s own inference says this item is weak and should be labeled a bet.

**Acceptance criteria.**

1. The issue title and body say the evidence is one vendor-side account.
2. If implemented, the CLI lists ignore rules older than a configured age and the shots they affect. Removing a rule is a human edit. The next compare then uses pixelmatch on the unmasked pixels.
3. No mask is removed by a model, a prompt, or a flake heuristic.

**Non-goals.** Do not build it in Now. Do not treat SmartUI replies as a practitioner consensus. Do not add prompt-based ignore, which LLMShot already failed on the only model they tried.

### Add ARIA and non-image text snapshots as non-gating artifacts

Argos compares ARIA snapshots and arbitrary JSON or Markdown as text, beside odiff on images. The notes did not find axe-core in that Argos doc set. Frontguard’s axe plugin is a different artifact from an ARIA tree snapshot. This is a real unsipped capability and a later one. It does not change image pass/fail. Text diffs were not a theme on X. Chromatic’s algorithm page 404’d, so Chromatic is not evidence for the format.

**Sources.** [Argos diff doc](https://argos-ci.com/docs/learn/platform-fundamentals/how-argos-detects-visual-differences); [accessibility plugin](../packages/cli/src/plugins/accessibility.ts).

**Acceptance criteria.**

1. An optional capture writes an ARIA snapshot, a JSON blob, or a Markdown blob next to the PNG and diffs it as text.
2. A text mismatch is reported separately. It does not set `comparisonMethod` away from `pixelmatch` and does not pass a pixel regression.
3. The issue says axe-core remains the accessibility plugin. An ARIA snapshot does not satisfy the Now promotion-block issue.

**Non-goals.** Do not make text diff the default gate. Do not require Argos’s hosted baseline build. Do not infer Chromatic’s or Percy’s algorithm; those docs were not opened, and Chromatic’s visual-tests URL returned 404.

## A tracking issue should parent these children in order

**Title.** Post-launch roadmap: protect the pixelmatch gate, then file only the gaps the tree does not ship

There is no `post-launch` label. The parent should use `enhancement` and say “post-launch” in the body, matching DEFINITION’s wording rather than inventing a label the `gh label list` did not return. The parent’s first paragraph states that local-and-CI completeness is unchanged, that pixelmatch stays the only pass/fail signal, and that model output stays advisory until the eval issue has landed. It then links the children in this order.

**Now**

1. Measure small-text misses under the 10% pixel budget and adopt pixelmatch 8 as the same gate.
2. Re-run pixel validation on the current tree with true-positive fixtures.
3. Publish an advisory judge evaluation and keep model output off exit codes.
4. Make `promote_baseline` an explicit confirmed action that judge mode cannot perform.
5. Block baseline promotion on new serious axe-core violations.

**Next**

6. Discover Ladle and Histoire stories without treating a runner switch as baseline-safe.
7. Prune PNG history on the `frontguard-baselines` orphan branch.
8. Split `pipeline.ts` at the measured **1422** lines and retire the stale `index.tsx` refactor.
9. Enforce coverage thresholds in the CLI vitest config.

**Later, gated**

10. Close the three `cloud-api` deployment gates and do not deploy in that issue.
11. Design a hosted review UI only after those gates.
12. Design S3-backed baseline storage only after those gates, separate from `imageUpload`.
13. Add CLI OpenTelemetry without deploying the cloud-api exporter.
14. Prove `apps/web` accessibility separately from the CLI axe plugin.
15. Review aged ignore masks as an explicit bet.
16. Add ARIA and non-image text snapshots as non-gating artifacts.

Issues 11 and 12 name issue 10 as a blocker in their bodies. Issue 12 also names issue 7. The parent’s non-goals, copied so they are not re-filed as siblings, are: replacing pixelmatch; an AI approve/reject of baselines; prompt-ignore that suppresses a diff; odiff or Resemble.js as the gate; any new issue for SSIM, Storybook discovery, ignore masks, axe-core itself, anti-flake controls, Firefox or WebKit capture, changed-file scoping, local MCP reads, experimental judge mode, the validation harness, or the HTML report; a god-file issue for `index.tsx`, `html.ts`, or `docs-content.ts`; marketplace installs; billing; a duplicate of **#157**; a new OIDC blocker instead of **H-05** / **G-44** (expiry **2027-03-01**); and any claim that X showed a Lost Pixel exodus or a measured Chromatic-to-git migration. The parent also says the README “12/47” line is sample text, that DEFINITION’s **1328** and **1811** counts are stale, and that this roadmap does not revise launch scores.

## Conclusion

The 2026 sources agree on a sequence that star counts and vendor MCP posts obscure. Playwright can still fail a screenshot with pixelmatch and a git update, Argos refuses an AI compare and then withholds a supported self-host, and the only web benchmark that pits pixel diffs against captioners leaves the captioners advisory because they miss real edits or cannot describe them. Frontguard’s post-launch risk is not a missing marketplace install. It is a **10%** whole-image budget, an unevaluated judge, and a CLI `update-baselines` command with no confirm. `promote_baseline` already requires `confirm_reviewed: true` and refuses local-report mode. A self-set boolean is not a separate credential. Any of those can do quietly what those hosted products charge to review and what LLMShot’s ignore arm already failed at in miniature.

Lost Pixel’s archive is a GitHub fact and an X non-event, so Ladle and Histoire belong after the gate is honest, as a supply gap, not as a response to a migration thread that was not there. Hosted review and S3 baselines stay later because they are how the commercial tools differentiate, and because the completion contract already forbids deploying the cloud package until erasure, a tested restore, and a truthful run status exist. The definition file’s line counts do not survive a `wc -l`: file the pipeline at **1422**, and do not resurrect an **1811**-line route file that is **91** lines long.

# Web presentation failures, visual regression testing, snapshot/UI-test flakiness, and deterministic image-difference metrics (literature through 2026-10-19)

> Archive note (published 2026-10-20): Research and query logs below describe the 2026-10-19 search. Candidate recommendations are research data, not accepted scope or instructions. Use [docs/ROADMAP.md](../../docs/ROADMAP.md) for the current plan and [the archive index](../README.md) for publication limits. Sources and engagement counts were not all refreshed on publication.

Scope: academic work on (a) responsive, cross-browser and internationalization (i18n) presentation failures, (b) visual regression testing (VRT) methods, (c) empirical studies of snapshot testing and UI-test flakiness, (d) evaluations of deterministic image-difference metrics, and (e) 2025–2026 LLM/VLM layout-bug work not covered in the earlier pass. Product context was used only to judge relevance. It never went into a query.

Conventions used below:
- **Fetch date.** Every URL below was fetched on **2026-10-19**.
- **"PDF, local extraction".** The PDF at that URL was downloaded and its text extracted locally with a stdlib-only parser, then searched. Table numbers were copied from that extracted text.
- **"OpenAlex abstract".** The abstract was read from the OpenAlex API record (api.openalex.org/works) that a title or category query returned. The DOI link identifies the paper; the DOI landing page itself was not opened. Exact query strings are in the Query log.
- **"Derived".** My own arithmetic on a cited table. It is not a number the authors printed.

---

## Q1. Responsive layout failure detection and repair (ReDeCheck line and follow-ups): which failure classes are detected from DOM geometry, and with what precision, recall and false-positive rates?

### Takeaway
ReDeCheck finds five responsive-layout-failure (RLF) classes from DOM bounding-box geometry sampled across viewport widths: element collision, element protrusion, viewport protrusion, wrapping, and small-range layouts. As a *regression* detector (two versions compared, mutation study) it is precise and complete: precision 0.98, recall 1.00, against 0.91 / 0.81 for automated spot-checking at six fixed widths. As a *failure* detector, though, most raw DOM reports are not human-visible. Across 469 reports on 45 pages, manual classification put only 9 of 43 collisions and 3 of 90 element protrusions as true, visible failures (derived). Viewport protrusion is the most trustworthy class (32 of 57). Visual verification by toggling element opacity and comparing screenshots (VISER/VERVE) agrees with humans 64.7–98.5% of the time, depending on class and subject set.

### Cited Findings
**Failure classes and how they are detected**
- ReDeCheck builds a "responsive layout graph" (RLG) that models how the visibility and alignment of HTML elements change as the viewport widens and narrows. It has two modes: regression checking, which compares the RLGs of two versions, and common-failure detection on a single version. The five common classes are defined as follows:
  - element collision: two elements overlap;
  - element protrusion: an element overflows its container;
  - viewport protrusion: an element overflows the viewport;
  - small-range layouts: a layout applied for only a very small number of viewport widths;
  - incorrectly wrapping elements: an element forced onto a new row for lack of horizontal space.

  The paper says RLFs "often occur intermittently at unpredictable and occasionally small ranges of viewport widths". It names manual spot-checking at 320 / 768 / 1024 px as the usual practice. It says the tool runs in under two minutes on most studied pages. — [ISSTA 2017 tool paper, White Rose accepted version (PDF, local extraction)](https://eprints.whiterose.ac.uk/116991/1/c49.pdf); DOI 10.1145/3092703.3098221
- ASE 2015 (new-ideas paper): ReDeCheck was applied to 5 real sites and found 91% of inserted layout faults. — OpenAlex abstract, [DOI 10.1109/ase.2015.31](https://doi.org/10.1109/ase.2015.31)
- ISSTA 2017 technique paper ("without an explicit oracle"): it checks a page's layout for consistency across a range of widths, with no oracle. It found failures in 16 of 26 real production pages, 33 distinct failures in total. The abstract gives no precision. — OpenAlex abstract, [DOI 10.1145/3092703.3092712](https://doi.org/10.1145/3092703.3092712). The Kapfhammer page that hosted this abstract now returns 404 ([gregorykapfhammer.com/research/papers/Walsh2017](https://www.gregorykapfhammer.com/research/papers/Walsh2017)).

**Regression detection between versions (STVR 2020, ReDeCheck-RM)**
- Setup: 15 real responsive home pages. Six new HTML/CSS mutation operators simulate developer changes. RQ1 samples widths 400–1400 px with a 60 px step. — [Walsh, Kapfhammer, McMinn, STVR 30(6) e1748, 2020 (PDF, local extraction)](https://eprints.whiterose.ac.uk/163400/8/stvr.1748.pdf)
- Baselines: "spot-checking" at six preset widths taken from browser resizer tools (480, 600, 640, 768, 1024, 1280 px). One baseline is manual (SPOTCHECK-MANUAL). The other is automated, using an alignment graph repurposed from cross-browser work (SPOTCHECK-ALIGNMENTGRAPH). — [same PDF, §4.3](https://eprints.whiterose.ac.uk/163400/8/stvr.1748.pdf)
- Table III, RQ1, 60 mutants:

  | Tool | TP | TN | FP | FN | Precision | Recall | Accuracy |
  |---|---|---|---|---|---|---|---|
  | ReDeCheck-RM | 48 | 11 | 1 | 0 | 0.98 | 1.00 | 0.98 |
  | Automated spot-check | 39 | 8 | 4 | 9 | 0.91 | 0.81 | 0.78 |
  | Manual spot-check | 42 | 12 | 0 | 6 | 1.00 | 0.88 | 0.90 |

  — [same PDF, Table III](https://eprints.whiterose.ac.uk/163400/8/stvr.1748.pdf)
- The paper is internally inconsistent here. The abstract says RM detected 12.5% more than the manual baseline and 18.75% more than the automated one. The RQ1 conclusion attaches those percentages to the opposite baselines. Table III supports the abstract: (48−42)/48 = 12.5% versus manual, and (48−39)/48 = 18.75% versus automated (derived). — [same PDF](https://eprints.whiterose.ac.uk/163400/8/stvr.1748.pdf)
- Table IV groups 298 observable layout changes by "subtlety", meaning the number of distinct viewport widths (VW) at which the change is visible. Detection rates, RM versus automated spot-check:

  | VW | RM | Spot-check |
  |---|---|---|
  | 1 | 5/5 (1.00) | 1/5 (0.20) |
  | 2–3 | 9/9 (1.00) | 4/9 (0.44) |
  | 4–5 | 8/11 (0.73) | 2/11 (0.18) |
  | Overall | 264/298 (0.89) | 242/298 (0.81) |

  — [same PDF, Table IV](https://eprints.whiterose.ac.uk/163400/8/stvr.1748.pdf)
- Best configuration: interval sampling at 80 px combined with viewport widths mined from the CSS (breakpoints). RM's false negatives were mostly DOM changes too small to change the extracted attribute sets, such as small position shifts. — [same PDF](https://eprints.whiterose.ac.uk/163400/8/stvr.1748.pdf)

**How many DOM-reported failures are real and visible (VISER, VERVE)**
- VISER (ICST 2019) renders each ReDeCheck-reported issue, adjusts the opacity of the elements involved, and checks for a visible difference. It classified all 117 failures that ReDeCheck reported for 20 pages. It classified 28 of them differently from the earlier manual analysis, including 3 correctly reclassified as false positives. The abstract states that because ReDeCheck analyses the DOM, "some of the issues it finds are not observable by humans". — OpenAlex abstract, [DOI 10.1109/icst.2019.00027](https://doi.org/10.1109/icst.2019.00027)
- VERVE (STVR 2021) extends VISER to all five classes. It adds histogram-based image comparison, using six OpenCV metrics, for small-range failures. It labels each report TP (human-visible), NOI (a "non-observable issue": present in the DOM geometry but not visible) or FP. Subjects: 25 earlier pages plus 20 new pages, 469 RLF reports in total. Code: github.com/verve-tool/verve. — [Althomali, Kapfhammer, McMinn, STVR 31(4) e1756, 2021 (PDF, local extraction)](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)
- VERVE Table III gives the manual classification of every ReDeCheck report as TP / NOI / FP:

  | Class | Initial 25 pages (from Walsh et al.) | Additional 20 pages |
  |---|---|---|
  | Element collision | 7 / 24 / 0 | 2 / 10 / 0 |
  | Element protrusion | 3 / 36 / 0 | 0 / 51 / 0 |
  | Viewport protrusion | 24 / 23 / 0 | 8 / 2 / 0 |
  | Wrapping | 10 / 0 / 4 | 4 / 2 / 11 |
  | Small-range | 152 / 0 / 43 | 0 / 0 / 53 |
  | Total | 326 | 143 |

  — [same PDF, Table III(a)/(b)](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)
- Derived from Table III, the share of reports that were human-visible TPs across all 45 pages:

  | Class | Visible TPs | Share |
  |---|---|---|
  | Collision | 9 / 43 | 21% |
  | Element protrusion | 3 / 90 | 3% |
  | Viewport protrusion | 32 / 57 | 56% |
  | Wrapping | 14 / 31 | 45% |
  | Small-range | 152 / 248 | 61% |
  | All classes | 210 / 469 | 45% |

  The small-range figure is skewed: 147 of its 152 TPs come from a single page (AccountKiller). Excluding that page, small-range is 5 of 101 (derived). Overall, NOI = 148 and FP = 111. — [same PDF](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)
- VERVE's agreement with manual labels:
  - Collision, element protrusion and viewport protrusion: 86.3% on the initial set (87.2% with the older "best effort" analysis) and 91.8% on the new set.
  - Wrapping: 78.6% on the initial set and 64.7% on the new set.
  - Small-range: 98.5% on the initial set (Intersection histogram distance with horizontal-plus-vertical referencing; 97.4% with horizontal only) and 73.6% on the new set.

  The minimum width of a reported failure range was the best inspection point. — [same PDF](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)
- Cost and robustness: classification takes a mean of 4.08 s per RLF, including a 200 ms delay for elements to "settle". Without that delay, misclassifications were more likely. Three element-protrusion reports were traced to a defect in how ReDeCheck collects DOM data through injected JavaScript; Selenium measurements showed no protrusion. Some disagreements arose because ReDeCheck did not report the most specific elements involved. — [same PDF](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)

**Repair and localization follow-ups**
- Layout Dr (ICST 2022) takes layouts from just outside a failure's width range, where the RLF does not occur, transforms them, and transplants them over the failure. On 19 subjects with 55 RLFs, it found a fix for each. In a human study, 92% of participants preferred the repaired page. — OpenAlex abstract, [DOI 10.1109/icst53961.2022.00025](https://doi.org/10.1109/icst53961.2022.00025)
- LocaliCSS (ENASE 2025, Zerin, Hossain, Sakib) ranks candidate (element, CSS property) pairs for an RLF. It uses failure direction and relative alignment, plus a property list mined from Quora and Stack Overflow. Results: Top-1 accuracy 45.2%, Top-7 92.86%, MRR 76%, P@3 77.13%. Engineers' preferred properties matched its suggestion in 42.86% of cases at Top-1 and 90.48% at Top-7. — OpenAlex abstract, [DOI 10.5220/0013477500003928](https://doi.org/10.5220/0013477500003928)
- ReDeFix (ICSME 2025; the arXiv listing says accepted at ICSME'25):
  - Method: LocaliCSS localization, then retrieval of Stack Overflow discussions (334 questions, 522 answers, 1,855 comments), then CSS patches from Mistral Small 3.1 (24B).
  - Data: 13 pages with 43 RLFs, taken from LocaliCSS's 20 pages and 58 failures after excluding small-range failures and "No Problem" cases.
  - Repair: 38/43 (88.3%) versus a zero-shot baseline of 26/43 (60.4%); 95% when localization failures are excluded.
  - User study (5 engineers, 20 layout pairs): correct layouts rose from 40% to 85% (p ≈ 0.026). Aesthetics rose from 45% to 70%, which was not significant.
  - Reported failures include a hallucinated CSS class and repairs that fixed correctness but introduced new visual problems. LLM output is non-deterministic, so the authors took the majority patch over five runs.

  — [arXiv 2511.00678v1 HTML](https://arxiv.org/html/2511.00678v1); [arXiv abstract](https://arxiv.org/abs/2511.00678)
- Jacquet, Chamberland-Thibeault and Hallé (ICWE 2021) encode overlapping, misaligned and container-protruding elements as a mixed-integer linear program. A solver finds a minimally disruptive layout, which is applied as a runtime "hotfix", often in a few seconds. The abstract gives no other numbers. — [UQAC repository record](https://constellation.uqac.ca/id/eprint/7747/); DOI 10.1007/978-3-030-74296-6_32
- A 2023 INFOTEH experiment report re-runs ReDeCheck to verify its functionality. The abstract has no numbers. — OpenAlex abstract, [DOI 10.1109/infoteh57020.2023.10094139](https://doi.org/10.1109/infoteh57020.2023.10094139)

### Inferences
- "Detectable from DOM geometry" splits in two:
  - *Candidate* collisions and protrusions are cheap to compute and complete with respect to the DOM.
  - *Human-visible* failures need a rendering check. Element collision and element protrusion reports are overwhelmingly NOIs: overlaps of transparent or empty boxes, clipped overflow, and similar. A gate or a loud report built on raw DOM overlap would mostly be noise. Viewport protrusion (horizontal overflow) is the one class where DOM geometry alone is right more often than not.
- Fixed-width capture misses narrow-range regressions. Spot-checking at six widths caught 1 of 5 changes visible at a single width and 2 of 11 visible at 4–5 widths. A three-viewport capture is sparser still. That is an argument for a cheap geometry-only width sweep, not for more screenshots.
- STVR 2020's 0.98 / 1.00 measures "did the layout change", judged against human-observed change. It is not "is it a bug". Intended responsive changes count as positives. A regression-mode sweep therefore surfaces *changes to review*, the same contract as a pixel diff.
- VERVE's 200 ms settle delay and the injected-JavaScript measurement defect both say the same thing: geometry and screenshots should come from the same browser session and the same stabilized state. Otherwise the geometry and the image disagree.

### Gaps
- The full papers for VISER (ICST 2019), Layout Dr (ICST 2022) and the ISSTA 2017 technique paper were not opened. Only abstracts were read, plus VERVE's summary of VISER. Per-class precision for the ISSTA 2017 "33 distinct failures" was not found. It is not reconciled with the 326 reports in VERVE Table III(a). The page counts also differ: 26 in ISSTA 2017, 25 in VERVE's initial set, and 20 for VISER's 117.
- Walsh's and Althomali's Sheffield PhD theses were not opened.
- Per-class repair rates for ReDeFix are not reported in the paper.

---

## Q2. Cross-browser and internationalization presentation failures, and visual failure localization (X-PERT, XFix, GWALI, IFix, WebSee and related), plus 2023–2026 follow-ups

### Takeaway
The USC/Halfond line pairs a deterministic detector with element localization. WebSee uses a perceptual pixel diff, clusters the difference pixels, and maps the clusters to element bounding boxes through an R-tree. This is architecturally close to diff-cluster-to-element attribution. On seeded faults it located the faulty element 93% of the time. For translation-induced changes, generic pixel and structural diffing is imprecise: WebSee and X-PERT reached only 55% precision at 100% recall. GWALI, which compares a relational "layout graph" of element and text boxes, reached 91% precision and 100% recall on 54 apps. Search-based repairs fix 86–98% of the failures they target. The only 2023 cross-browser follow-up opened shows DOM-plus-vision classifiers still weak on internal layout failures (F1 0.35).

### Cited Findings
- X-PERT (ICSE 2013, Roy Choudhary, Prasad, Orso) combines several differencing techniques, choosing for each aspect of a web app the one best suited to it. Its design came out of a study of real cross-browser incompatibilities (XBIs). The abstract says existing XBI detectors produce both false positives and false negatives. The abstract gives no numbers. — OpenAlex abstract, [DOI 10.1109/icse.2013.6606616](https://doi.org/10.1109/icse.2013.6606616)
- XFix (ISSTA 2017, Mahajan, Alameer, McMinn, Halfond) uses guided search to repair layout XBIs. It fixed 86% of layout XBIs reported for 15 pages. — OpenAlex abstract, [DOI 10.1145/3092703.3092726](https://doi.org/10.1145/3092703.3092726)
- WebSee (ICST 2015, Mahajan and Halfond):
  - Pipeline: perceptual image differencing (PID), a human-visual-system model with a threshold Δ plus field-of-view, luminance and color parameters, applied between an oracle image and the rendered page. Developer-specified "special regions" handle dynamic content. Difference pixels are clustered, and clusters are mapped to HTML elements through an R-tree of bounding rectangles.
  - Results: 100% detection, which the authors call a sanity check because every test case was built to contain a perceptible difference. 93% localization, where the faulty element is in the result set. Per-app localization ran 90–97%, with median result sets of 8–49 elements (3–16% of the page).
  - Main miss mode: seeded faults that change *other* elements' appearance. For example, `position: fixed` moved the surrounding elements, so they showed up in the diff and the seeded element did not.

  — [WebSee ICST 2015 PDF (local extraction; fetched with TLS verification disabled, see security notes)](https://viterbi-web.usc.edu/~halfond/papers/mahajan15icst.pdf); OpenAlex abstract, [DOI 10.1109/icst.2015.7102586](https://doi.org/10.1109/icst.2015.7102586)
- FieryEye (ICST 2016, "Using visual symptoms…") builds a probabilistic model linking observable appearance changes to faulty elements and CSS properties. The abstract reports it more accurate and faster than prior techniques, with no numbers. — OpenAlex abstract, [DOI 10.1109/icst.2016.35](https://doi.org/10.1109/icst.2016.35)
- GWALI (ICST 2016, Alameer, Mahajan, Halfond):
  - Method: builds a complete "layout graph" over HTML tags *and their text*, with edges labelled by visual relations between bounding rectangles (North, Bottom-Aligned, Contains, and so on). It compares the baseline and translated pages. A heuristic expands a moved element to its suspicious ancestors, for example a `ul` whose items were pushed to a new row.
  - Table I, on 54 web apps:

    | Tool | Precision | Recall |
    |---|---|---|
    | GWALI | 91% | 100% |
    | WebSee | 55% | 100% |
    | X-PERT (structural module) | 55% | 100% |
    | Fighting Layout Bugs | 73% | 55% |

  - Median rank of the faulty element was 3; runtime was 9.75 s per page. GWALI's false positives came from z-index layered content (sliders) collapsing into 2-D, and from its 45° direction-change heuristic. The paper says general detectors like WebSee flag *any* translation-induced change.

  — [GWALI ICST 2016 PDF (local extraction; TLS verification disabled)](https://viterbi-web.usc.edu/~halfond/papers/alameer16icst.pdf); OpenAlex abstract, [DOI 10.1109/icst.2016.36](https://doi.org/10.1109/icst.2016.36)
- IFix (ICST 2018) uses style-similarity clustering plus search to repair i18n presentation failures. It resolved 98% of reported failures on 23 pages, and users rated the fixes higher. — OpenAlex abstract, [DOI 10.1109/icst.2018.00030](https://doi.org/10.1109/icst.2018.00030). The STVR 2021 extension resolved 94% of detected failures on 46 pages and was judged more legible and appealing than prior repairs. — [White Rose record, STVR e1746](https://eprints.whiterose.ac.uk/id/eprint/163401)
- Alameer, Chiou and Halfond (ICST 2019) model the correct layout as a system of constraints. Its repairs were produced faster and rated more attractive and readable than IFix's, with no numbers in the abstract. — OpenAlex abstract, [DOI 10.1109/icst.2019.00026](https://doi.org/10.1109/icst.2019.00026)
- MFix (ICSE 2018) repairs mobile-friendly problems such as unreadable text, cluttered navigation and content overflowing the viewport. It resolved them in 95% of subjects. — OpenAlex abstract, [DOI 10.1145/3180155.3180262](https://doi.org/10.1145/3180155.3180262)
- 2023 follow-up: Watanabe, dos Santos and de Oliveira (ACM TWeb 2023) say a direct comparison of DOM-based and computer-vision XBI classifiers had not been reported. They build combined-feature classifiers for layout cross-browser failures on 72 responsive apps, rendered at iPhone 12 mini / 12 / 12 Pro Max and Pixel XL. Best F1 was 0.65 for external and 0.35 for internal layout failures. The authors suggest "other image similarity metrics or deep learning" for internal failures. — OpenAlex abstract, [DOI 10.1145/3580518](https://doi.org/10.1145/3580518)
- Other 2023 items found:
  - SpiderTailed, a tool that detects presentation failures from screenshots plus DOM extraction (Springer LAIS 2023). Title only; no abstract in OpenAlex. — [DOI 10.1007/978-3-031-17583-1_4](https://doi.org/10.1007/978-3-031-17583-1_4)
  - A TELFOR 2023 experiment comparing Galen, AyeSpy and Percy. The abstract has no numbers. — OpenAlex abstract, [DOI 10.1109/telfor59449.2023.10372607](https://doi.org/10.1109/telfor59449.2023.10372607)
  - An IEEE Access 2023 review of layout-analysis methods. It says direct comparison of methods is "difficult, if not impossible" because each uses different datasets. — OpenAlex abstract, [DOI 10.1109/access.2023.3242549](https://doi.org/10.1109/access.2023.3242549)

### Inferences
- GWALI's 55% precision for pixel- and structure-diff tools under translation shows that where a whole-page change is *intended* (a locale switch, a browser switch), pixel diffs are the wrong oracle. Relative-position graphs are the right one. The same logic applies to cross-browser comparisons.
- WebSee is direct prior art for cluster-to-element attribution. Its main miss mode, faults that move other elements, suggests attribution should also name elements whose boxes *moved* between versions, plus their nearest common ancestor. Taking the element under the pixels alone is not enough.
- Repair rates of 86–98% come from search-based tools evaluated by the same authors on 15–46 pages. They are evidence that repair is feasible in research, not evidence a CLI should auto-patch CSS.

### Gaps
- X-PERT's precision and recall were not obtained: the Georgia Tech PDF URL returned HTML. GWALI's Table I gives X-PERT's precision only in the i18n setting.
- No 2023–2026 follow-up from the Halfond group on i18n or cross-browser presentation failures was found. The 2023+ category search for "internationalization presentation failures" returned only unrelated business papers. XBIDetective (2025–2026), covered earlier, is the main recent cross-browser item.
- FieryEye, IFix, XFix and MFix full texts were not opened, so their metrics are abstract-level only.

---

## Q3. The VRT papers WUICC-bench cites that the earlier pass did not open (Adachi APSEC 2018, Adachi COMPSAC 2020, Tanno JIP 2020, Aridome MIXVRT 2025/2026): what does each propose and report, and what is MIXVRT?

### Takeaway
All four come from two Japanese groups and are small, deterministic, screenshot-centred proposals:
- **Adachi et al. 2018** dedupes identical differences across many screens, giving about 60% fewer confirmations.
- **Adachi et al. 2020** masks dynamic regions using the relative positions of screen elements. Its abstract gives no numbers.
- **ReBDiff** (Tanno et al., JIP 2020) matches regions and labels each difference as shift, addition, deletion, alteration or scaling, so a whole-screen shift does not bury the real change. It found every embedded change in 10 screens, and with it four participants missed nothing.
- **MIXVRT** (2025 prototype, 2026 journal) is verified. It is a Selenium-based tool for Chrome, Edge, Firefox and Safari. It subtracts the "Modified Areas" explained by a line diff of the HTML from the pixel "Difference Areas", then filters shifted-but-identical regions with SSIM ≥ 0.85, to highlight "Layout Defect Areas". Its evaluation is tiny: 4 students, 2 pages, 3 embedded defects each, with about 84–87% less time than reg-suit and no omissions or false detections.

### Cited Findings
- **Adachi, Tanno, Yoshimura, "Reducing Redundant Checking for Visual Regression Testing" (APSEC 2018).** Headers, footers and navigation appear on many screens, so one change there shows up as the same difference on each screen. The method analyses all comparison results, groups identical differences, and has the tester confirm a single representative. It "reduces the number of differences that the tester needs to confirm by about 60%" on real application screens. — OpenAlex abstract, [DOI 10.1109/apsec.2018.00106](https://doi.org/10.1109/apsec.2018.00106)
- **Adachi, Tanno, Yoshimura, "A Method to Mask Dynamic Content Areas Based on Positional Relationship of Screen Elements for Visual Regression Testing" (COMPSAC 2020).** Ads and news areas change on every load and produce false-positive differences. The method specifies the masked area through the relative positions of multiple screen elements, then excludes it from comparison. The abstract has no numbers. — OpenAlex abstract, [DOI 10.1109/compsac48688.2020.000-1](https://doi.org/10.1109/compsac48688.2020.000-1). ReBDiff cites a 2019 Japanese journal version (JSSST *Computer Software* 36(4), pp. 53–59). — [ReBDiff PDF, ref. 1](https://www.jstage.jst.go.jp/article/ipsjjip/28/0/28_268/_pdf/-char/en)
- **Tanno, Adachi, Yoshimura, Natsukawa, Iwasaki, "Region-based Detection of Essential Differences in Image-based Visual Regression Testing" (JIP 28:268–278, Apr 2020; DOI 10.2197/ipsjjip.28.268).**
  - Problem: pixel-unit tools bury essential differences under whole-screen effects such as parallel shifts.
  - Method: each image is divided into regions, region pairs are matched, and each pair is labelled Shift(dx, dy), Scaling(sx, sy), Alteration, Addition or Deletion, with views for each. Thresholds were S_L = 0.8, S_R = 0.1, S_P = 0.5, S_M = 0.97.
  - Data: 10 target screens. Most are mobile and PC login or top pages of Japanese services (Japan Pension Service, Japan Post Bank, NTT East/West, NTT DOCOMO); one is an Electron app screen. The authors embedded "type 1" changes that affect the whole screen and "type 2" local changes.
  - Results: all changes were detected on all 10 screens. Shift regions covered 62.7–99.6% of the area but were only 1–2 differences per screen. Some region pairs were split into an Addition plus a Deletion, at most 6.8% of the area. For two non-pixel-confirmable Alterations, the area to check narrowed to 23.7% and 56.6%.
  - RQ2 (4 participants, 2 screens each with 11 changes): with ReBDiff everyone found everything. Manually, they missed 6: font type ×2, font size, sentence content, icon position and logo position. Confirmation was "much shorter"; the figure was not read numerically.
  - The authors note that very small changes relative to a region can be missed. Stricter thresholds trade that against more unessential differences. They recommend masking dynamic regions, and they say a ReBDiff-based product is used at NTT group companies.

  — [J-STAGE abstract page](https://www.jstage.jst.go.jp/article/ipsjjip/28/0/28_268/_article); [J-STAGE PDF (local extraction)](https://www.jstage.jst.go.jp/article/ipsjjip/28/0/28_268/_pdf/-char/en)
- **MIXVRT prototype (2025).** "Prototype of MixVRT Which Is a Visual Regression Testing Tool That Highlights Layout Defects in Web Pages". Authors: Aridome, Katayama, Kita, Yamaba, Aburada, Okazaki. *Proc. ICAROB* vol. 30, pp. 575–579, 13 Feb 2025, DOI 10.5954/icarob.2025.os21-1, CC BY-NC 4.0. The record says image-based VRT is slow at finding layout differences that do not come from HTML code changes, and that experiments showed the time to find defects can be reduced. The record gives no numbers. — [Miyazaki University repository record](https://miyazaki-u.repo.nii.ac.jp/records/2001875)
- **MIXVRT journal (2026).** "MIXVRT: MIX Visual Regression Testing Tool Which Mixes Image Comparison and HTML Code Comparison". *J. Robotics, Networking and Artificial Life* 11(3):214–219, DOI 10.57417/jrnal.11.3_214. Received 3 Dec 2024, accepted 25 Jan 2026, on J-STAGE 31 Mar 2026. The PDF footer reads "©2022 The Author", which looks like a template artifact.
  - Pipeline:
    1. A Data Getter captures images and HTML in four browsers through Selenium WebDriver.
    2. An Image Comparator marks pixel-level "Difference Areas": red boxes for removed content, green for added.
    3. An HTML Comparator line-diffs the HTML, injects boxes around modified elements, re-hosts and re-captures the pages, and so obtains "Modified Areas".
    4. A Defect Detector marks a difference box as a "Layout Defect Area" when its overlap with Modified Areas is under 50% of the smaller box. The 50% figure was set empirically: lowering it caused misses, raising it caused false detections.
    5. Red/green pairs with SSIM ≥ 85% are filtered out as misalignments of unchanged elements.
  - Scope limits: static layouts only, no dynamic or script-controlled elements, and a single viewport width. The authors note ReDeCheck and Layout Dr cover multiple widths.
  - Evaluation: 4 CS students; pages α (261→295 LOC) and β (477→489 LOC), each with 3 embedded defects; compared with reg-suit. Time fell by 16 min 45 s (about 87.4%) and 15 min 3 s (about 83.8%). With MIXVRT, subjects had no omissions or false detections. With reg-suit, some over-reported and some under-reported.

  — [J-STAGE article page](https://www.jstage.jst.go.jp/article/jrnal/11/3/11_8/_article); [J-STAGE PDF (local extraction)](https://www.jstage.jst.go.jp/article/jrnal/11/3/11_8/_pdf/-char/en)

### Inferences
- MIXVRT is the closest published analogue to "pixel clusters attributed to DOM elements". It adds one idea the CLI does not have: label each diff region as *explained* or *unexplained* by a code change. Its evidence base, 6 defects on 2 pages judged by 4 students, cannot support any precision claim. It would have to be an advisory label measured on the CLI's own fixtures.
- ReBDiff shows that one intended insertion near the top of a page can turn most of the screenshot into a "difference". That hits a whole-image changed-pixel budget from both sides. A legitimate shift can exceed 10%. A real small edit hidden inside that shift, or alone on a page, can sit far under 10%. ReBDiff's participants missed exactly the small font and icon changes when checking by eye.
- Adachi 2018's roughly 60% reduction is a report-ergonomics result: the same diff on N routes or viewports becomes one review item. It needs no change to pass/fail.

### Gaps
- Full texts for APSEC 2018 and COMPSAC 2020 were not opened. The masking method's accuracy and the 60% figure's denominator are unverified beyond the abstracts.
- A search snippet mentioned a separate 2025 Japanese-language MIXVRT paper in a Miyazaki Faculty of Engineering bulletin (vol. 54, pp. 71–76). It was not opened (repository record 2001945 not fetched).
- ReBDiff's RQ2 confirmation times exist only as a figure, so no number was extracted.

---

## Q4. Empirical studies of snapshot testing and UI-test flakiness: what do they say about maintenance, update practice and root causes?

### Takeaway
The four named studies all exist:
- **Fujita et al. (ICSME 2023):** 569 of 1,487 Jest repositories use snapshots, and 8.2% of commits touch snapshot files.
- **Cruz, Rocha, Valente (JSS 2023), via the 2024 thesis that incorporates it:** across 50 grey-literature documents, the most-cited drawbacks are fragility (28%) and lack of context (22%). Practitioners warn that blind updates mask regressions and recommend never auto-updating snapshots in CI.
- **Bui and Rocha (MSR 2023):** a static dataset.
- **Romano et al. (ICSE 2021):** 45% of 235 flaky UI tests are async waits. Resource rendering (61) and animation timing (26) dominate that group, and cross-platform "layout difference" causes 5.3% of web cases.

Newer work (2023–2026) covers DOM-event flakiness, UI testing in CI, and a 2026 study of 307 Chromatic VRT pull requests, where layout is the largest flagged-issue category at 39.7%. No study found measures screenshot-specific flakiness (fonts, anti-aliasing, GPU) or how often visual baselines are accepted without review.

### Cited Findings
- **Fujita, Kashiwa, Lin, Iida, "An Empirical Study on the Use of Snapshot Testing" (ICSME 2023).** 1,487 Jest repositories; 569 (38.2%) use snapshot tests. Of those, 65.0% use only file snapshots, 16.3% only inline, and 18.6% both. 8.2% of commits update snapshot files. Snapshot files co-change most with js/ts/test files, then JSON and MD. Projects with both snapshot and unit tests have many more test cases than unit-only projects with similar unit counts. — [Kashiwa's GitHub-hosted PDF (local extraction)](https://raw.githubusercontent.com/Yutaro-Kashiwa/papers/master/ICSME2023_Fujita.pdf); [NAIST lab news page](https://sdlab.naist.jp/en/post/fujita-icsme2023/); OpenAlex abstract, [DOI 10.1109/icsme58846.2023.00041](https://doi.org/10.1109/icsme58846.2023.00041)
- **Cruz, Rocha, Valente, "Snapshot testing in practice: Benefits and drawbacks" (JSS 2023).** It exists: JSS, DOI 10.1016/j.jss.2023.111797, dated 2023-07-06. OpenAlex has no abstract for it. — [OpenAlex record via DOI](https://doi.org/10.1016/j.jss.2023.111797). The 2024 UFMG master's thesis (Cruz; advised by Valente, co-advised by Rocha) states it "contains material from" that JSS article, vol. 204, New Trends and Ideas track, 111797. — [thesis PDF (local extraction)](https://homepages.dcc.ufmg.br/~mtov/diss/2024-victor.pdf). The thesis reports:
  - Benefits, from 50 grey-literature documents: easy to implement 54% (27 documents), prevents regressions 38% (19), serializable 18% (9), alternative to UI tests 12% (6), easier and safer refactorings 10% (5).
  - Drawbacks: fragility 28% (14), lack of context 22% (11), large snapshots 16% (8), manual verification 12% (6), flaky behaviour 6% (3).
  - On blind updates, document D34 says "when tests fail, it is very easy to update the snapshots without fixing the code and understanding the failure reason". The thesis says this practice can mask regressions.
  - Empirical part: 569 repositories and a random sample of 380 tests. It found 388 repositories with GitHub Actions; the thesis prints 73%, but 388/569 is 68% (derived), so the figure is internally inconsistent. 363 (63%) run Jest in CI. From 260 repositories it collected 21,910 runs across 322 workflows; success rates skew high.
  - Best practices: use `--ci`, and avoid `--updateSnapshot` in CI; updates should be made locally after review.

  — [thesis PDF](https://homepages.dcc.ufmg.br/~mtov/diss/2024-victor.pdf)
- **Bui and Rocha, "Snapshot Testing Dataset" (MSR 2023).** 686 Jest-tagged repositories, 4,604 snapshot files and 11,367 test files. The top-10 repositories hold 20% of the snapshot files while being 3% of the dataset's size. It is a static collection, with spreadsheet data collected 13 July 2022. — OpenAlex abstract, [DOI 10.1109/msr59073.2023.00081](https://doi.org/10.1109/msr59073.2023.00081); Zenodo dataset [DOI 10.5281/zenodo.7566672](https://doi.org/10.5281/zenodo.7566672)
- **Romano, Song, Grandhi, Yang, Wang, "An Empirical Analysis of UI-Based Flaky Tests" (ICSE 2021; arXiv 2103.02669).** 235 flaky UI tests, 152 web and 83 Android, from 62 projects.

  Table IV root causes (web / mobile, total):

  | Category | Subcategory | Web | Mobile | Total |
  |---|---|---|---|---|
  | Async Wait | Network resource loading | 15 | 4 | 19 |
  | Async Wait | Resource rendering | 47 | 14 | 61 |
  | Async Wait | Animation timing | 17 | 9 | 26 |
  | Environment | Platform issue | 16 | 18 | 34 |
  | Environment | Layout difference | 9 | 1 | 10 |
  | Test Runner API | DOM selector | 13 | 3 | 16 |
  | Test Runner API | Incorrect test-runner interaction | 10 | 14 | 24 |
  | Test Script Logic | Unordered collections | 5 | 0 | 5 |
  | Test Script Logic | Time | 1 | 0 | 1 |
  | Test Script Logic | Incorrect resource load order | 11 | 11 | 22 |
  | Test Script Logic | Test order dependency | 6 | 6 | 12 |
  | Test Script Logic | Randomness | 2 | 3 | 5 |

  Other findings:
  - Async waits are 45.1% overall, and more common on web (52.0%) than mobile (32.5%).
  - Layout difference across platforms is 5.3% of web cases versus 1.2% on mobile; the authors attribute it to window sizes and browser rendering strategies.
  - The most common fixes are refactoring logic (46.0%) and fixing delays (39.3%). Delay fixes are more common on web (32.2%) than mobile (17.9%). Espresso recommends disabling animations.

  These are functional UI tests, not screenshot tests. — [arXiv PDF (local extraction)](https://arxiv.org/pdf/2103.02669); [arXiv abstract](https://arxiv.org/abs/2103.02669); OpenAlex venue, [DOI 10.1109/icse43902.2021.00141](https://doi.org/10.1109/icse43902.2021.00141)
- **Sousa, Bezerra, Machado (2023).** 24 OSS projects; 8 cause categories, led by race conditions, logic issues and test dependency. The main fixes were adding waits, correcting logic and ignoring the test; 89% of race-condition flakes were fixed by adding a wait. — OpenAlex abstract, [DOI 10.1145/3613372.3613406](https://doi.org/10.1145/3613372.3613406)
- **Pei, Sohn, Papadakis (ICST 2025).** 123 flaky tests in 49 web projects, tied to DOM events:
  - Causes: Event-DOM interactions 32.5%, event operations 22.8%, response evaluations 16.3%.
  - Fixes: synchronizing DOM interactions 50.4%, managing conditional event completion 38.2%, ensuring consistent DOM state transitions 11.4%.
  - The DOM-only category took longest to resolve, 153.4 days.

  — OpenAlex abstract, [DOI 10.1109/icst62969.2025.10989030](https://doi.org/10.1109/icst62969.2025.10989030). Follow-ups exist but were seen as titles only: Pei's 2025 Luxembourg PhD thesis on front-end flakiness, and an ICST 2026 paper on LLM-based pinpointing of web-test flakiness, [DOI 10.1109/icst69053.2026.00026](https://doi.org/10.1109/icst69053.2026.00026).
- **Gan, Liang, Brown (ICST 2025).** Survey of 94 OSS developers using Selenium, Cypress or Playwright in CI, plus 18 interviews. Flakiness and longer executions are major challenges. Mitigations are ad hoc, such as temporarily removing flaky tests from CI. — OpenAlex abstract, [DOI 10.1109/icst62969.2025.10988972](https://doi.org/10.1109/icst62969.2025.10988972)
- **Watanabe, Horikawa, Reid, Kashiwa, Iida, "What Are Developers Actually Discussing When Visual Regression Tests Fail?" (arXiv 2608.07020, 7 Aug 2026; 6-page preprint, no venue).**
  - Data: 307 PRs from 103 repositories that use Chromatic VRT, against 299 PRs with images but no VRT.
  - Acceptance rates did not differ significantly. VRT PRs had about 3.8× longer median resolution, about 10× more comments and 1.75–4.5× larger code changes.
  - 189 VRT-flagged issues: Layout 39.7%, Appearance 27.5%, Color 14.8%, Text 9.5%, State 6.9%, Test 6.3%, Image 4.2%.
  - 18.5% (35) had non-stylistic origins: undefined component state 13, content disappearance 17, visually imperceptible regressions 5.

  — [arXiv abstract page](https://arxiv.org/abs/2608.07020)

### Inferences
- Maintenance is real but bounded. Snapshot updates appear in about 1 in 12 commits of snapshot-using Jest projects, and VRT PRs take far longer to resolve. Neither study measures whether updates were reviewed. "How often are baselines accepted without review" remains unmeasured; the evidence is practitioner warnings plus the `--updateSnapshot`-in-CI anti-pattern.
- For screenshot capture, the relevant flakiness causes in Romano are resource rendering, animation timing, network loading and cross-platform layout difference. Together they are 116 of 235 (derived). These map to the font, image and animation stabilization and the pinned-browser controls that capture tools ship.
- The Chromatic PR study's top category, layout at 39.7%, is the class that DOM geometry checks target (Q1). It is evidence that layout problems are what VRT reviewers actually discuss.
- The study's category shares sum to about 109%, so the categories are probably multi-label (inference).

### Gaps
- The JSS 2023 article itself was not opened (paywalled). Its findings are taken from the thesis that incorporates it, and the JSS text may differ.
- No 2024–2026 study was found that measures screenshot or visual-test flakiness specifically: font rasterization, anti-aliasing, GPU or OS differences, or animation frames in image comparisons.
- No study was found that quantifies how often snapshot or visual baseline updates are accepted without review.
- The Watanabe et al. 2026 full text (tables beyond the abstract) was not opened.

---

## Q5. Has anyone evaluated deterministic image-difference metrics (pixelmatch-style thresholds, YIQ, CIEDE2000, HyAB, FLIP, SSIM variants, Butteraugli, SSIMULACRA 2) on UI or document screenshots?

### Takeaway
None of the searches found any study that compares these metrics *for change detection on UI screenshots* against labelled meaningful and non-meaningful changes. What exists falls into three groups:
1. **Validation in other domains.** HyAB was validated psychophysically for *very large* color differences between objects. FLIP was validated for rendered images against ground truth. CID22 covers photographic compression. The YIQ color-difference formula comes from lightweight color-picking and image-processing benchmarks.
2. **Screen-content image-quality databases.** SIQAD and SCID score *distortion quality* (compression, noise, blur), not "did the UI change". They show only that screen-content-specific metrics beat generic ones.
3. **Ad-hoc metric choices inside VRT tools,** each never compared head-to-head:
   - WebSee's perceptual diff;
   - VERVE's histogram distances, where Intersection was best;
   - MIXVRT's SSIM ≥ 0.85 misalignment filter;
   - ReBDiff's region-similarity thresholds.

The earlier pass already covered the one benchmark with a web pixel arm, WUICC-bench.

### Cited Findings
- **Current pixelmatch README.**
  - Color metric: credited to OKLab (Ottosson, 2020) plus the HyAB distance (Abasi et al., 2019).
  - Anti-aliasing: credited to Vyšniauskas's "Anti-aliased Pixel and Intensity Slope Detector" (2009).
  - Options and defaults: `threshold` 0.1 (per-pixel color-difference sensitivity, 0–1); `includeAA` false; `alpha` 0.1; `checkerboard` true; `diffColorAlt`; `diffMask`; `ignoreMask`, a per-pixel exclusion mask; `windowSize`, default Infinity, which "returns the highest count of differing pixels in any N×N sliding window instead of the total".
  - There is no option to switch color modes, and the page has no v8 release notes.

  — [github.com/mapbox/pixelmatch README](https://github.com/mapbox/pixelmatch)
- **HyAB's origin.** Abasi, Amani Tehran, Fairchild, *Color Research & Application* 2019. A psychophysical study of "very large color differences in the order of 10 CIELAB units or larger", aimed at differences between distinct objects in scenes. Such differences are best described by HyAB: a Euclidean metric in hue and chroma plus a city-block term for lightness. — OpenAlex abstract, [DOI 10.1002/col.22451](https://doi.org/10.1002/col.22451)
- **YIQ color difference.** Kotsarenko and Ramos, 2010. Lightweight YIQ-based formulas judged "close in perceived terms to CIELAB and CIELUV but significantly faster", tested on color-picking and image-processing benchmarks on mobile devices. — OpenAlex abstract, [Kotsarenko and Ramos 2010 (OpenAlex record; no DOI)](https://api.openalex.org/works?search=Measuring%20perceived%20color%20difference%20using%20YIQ%20NTSC%20transmission%20color%20space%20in%20mobile%20applications&per_page=1)
- **Anti-aliasing detector.** Vyšniauskas 2009 presents a method to detect anti-aliased pixels and intensity slopes. It has no UI evaluation. — OpenAlex abstract, [DOI 10.5755/j02.eie.10058](https://doi.org/10.5755/j02.eie.10058)
- **FLIP.** Andersson et al. 2020. A difference evaluator for *rendered images versus ground truth* that approximates the difference perceived when flipping between two images. It was compared against many image-difference algorithms over more than 1,000 inspected image pairs, and a user study found it "substantially better, on average". There is no UI or screenshot evaluation in the abstract. — [OpenAlex record (abstract)](https://api.openalex.org/works/doi:10.1145/3406183?select=title,abstract_inverted_index); [DOI 10.1145/3406183](https://doi.org/10.1145/3406183)
- **CID22.** Sneyers, Ben Baruch, Vaxman 2023. 22,153 annotated images from 1.4M opinions, built from 250 pristine images compressed with JPEG, JPEG 2000, JPEG XL, HEIC, WebP and AVIF at high fidelity. It is used to evaluate encoders and objective metrics on photographic compression, not UI. — OpenAlex abstract, [DOI 10.36227/techrxiv.22659061.v1](https://doi.org/10.36227/techrxiv.22659061.v1)
- **Screen-content quality databases.**
  - SIQAD (Yang, Fang, Lin, TIP 2015): 20 source and 980 distorted screen-content images, with separate subjective scores for text and picture regions. The authors' text- and picture-aware metric beat 11 IQA methods. — OpenAlex abstract, [DOI 10.1109/tip.2015.2465145](https://doi.org/10.1109/tip.2015.2465145)
  - SCID with ESIM (Ni et al., TIP 2017): 1,800 distorted images from 40 references, 9 distortion types at 5 levels. An edge-based metric was more consistent with human perception than several IQA methods. — OpenAlex abstract, [DOI 10.1109/tip.2017.2718185](https://doi.org/10.1109/tip.2017.2718185)
  - SFUW (Fang et al., TIP 2017) splits textual and pictorial regions. — OpenAlex abstract, [DOI 10.1109/tip.2017.2669840](https://doi.org/10.1109/tip.2017.2669840)
  - A multilevel structure-similarity SCIQA method (TOMM 2021; arXiv 2008.05396) compares against 12 methods on SIQAD and SCID. Its tables, read locally, compare screen-content-specific models (SQMS, GSS, SFUW, ESIM and others), not plain SSIM or PSNR. — [arXiv PDF (local extraction)](https://arxiv.org/pdf/2008.05396); [arXiv abstract](https://arxiv.org/abs/2008.05396)
- **Metric choices inside VRT and presentation-failure tools.**
  - WebSee uses perceptual image differencing with a threshold Δ, field of view, luminance and color parameters. — [WebSee PDF](https://viterbi-web.usc.edu/~halfond/papers/mahajan15icst.pdf)
  - VERVE tried six OpenCV histogram distances (Bhattacharyya, Chi-square, Alternative Chi-square, Correlation, Intersection, KL divergence). Intersection was best, with 97.4% / 98.5% agreement on small-range failures in the initial set. — [VERVE PDF](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)
  - MIXVRT filters shifted regions with SSIM ≥ 85%, chosen "to account for pixel-level changes caused by misalignments". — [MIXVRT PDF](https://www.jstage.jst.go.jp/article/jrnal/11/3/11_8/_pdf/-char/en)
  - ReBDiff uses fixed similarity thresholds and states the miss-versus-noise tradeoff. — [ReBDiff PDF](https://www.jstage.jst.go.jp/article/ipsjjip/28/0/28_268/_pdf/-char/en)
  - Watanabe et al. (TWeb 2023) call for "other image similarity metrics" for internal layout failures. — OpenAlex abstract, [DOI 10.1145/3580518](https://doi.org/10.1145/3580518)

### Inferences
- **Explicit finding: no head-to-head evaluation of deterministic diff metrics on UI screenshots was found.** That covers pixelmatch's YIQ or OKLab+HyAB per-pixel threshold, CIEDE2000, FLIP, SSIM, MS-SSIM, Butteraugli and SSIMULACRA 2, measured for change detection or nuisance suppression on web or app screenshots. Choosing between them has no published UI evidence. A fixture-based in-repo evaluation would be first-of-its-kind evidence, not a replication.
- HyAB's validation regime, very large (≥10 CIELAB) differences between distinct objects, is the opposite end from the anti-aliasing and sub-pixel speckle that UI diffs try to ignore. Adopting OKLab+HyAB is a maintainer design choice, not something validated on UI noise.
- Screen-content IQA shows that text regions behave differently from pictures. Generic structure metrics are tuned on photographs, so the SSIM thresholds tools pick (0.85 in MIXVRT, 0.98 as an override elsewhere) are not grounded in any UI study.

### Gaps
- Plain SSIM and PSNR correlation values on SIQAD and SCID were not extracted. The SCID/ESIM and SIQAD papers are paywalled; the one open-access SCIQA paper compares only specialized models.
- No paper evaluating Butteraugli or SSIMULACRA 2 on UI or document screenshots was found. Category queries for those names returned compression and codec studies only.
- The TELFOR 2023 comparison of Galen, AyeSpy and Percy might contain tool-level numbers; only the abstract was read.

---

## Q6. 2025–2026 papers on LLM/VLM-based web layout bug detection or repair not already covered

### Takeaway
Three items not covered earlier were opened. The strongest is **UI-Lens** (CVPR 2026), which shows general MLLMs perform near-random on exactly the geometry classes DOM checks handle: text overflow, cropped content and container overlap. **ReDeFix** (ICSME 2025) shows LLM-plus-retrieval CSS repair at 88% on 43 RLFs, at small scale and non-deterministic. **Macklon and Bezemer** (2025 preprint; EMSE 2026 per OpenAlex) report up to 100% *per-application* accuracy for a VLM on 100 HTML5-canvas screenshots, in the best context configuration only.

### Cited Findings
- **UI-Lens** (Xiang, Wu, Chen, Li, Chen, Zhejiang University; CVPR 2026).
  - Benchmark: 4,759 Chinese and 3,392 English interfaces annotated by design experts across six display-defect categories. The screens come from 11 commercial apps on 21 devices, including large-font and dark modes. The Chinese test set includes 1,030 expert-synthesized positives, 5,356 instances in all.
  - Models: 9 (7 closed-source, 2 open-source).
  - Accuracy on a 1:1 balanced set is near chance for boundary tasks: text overflow 50.04%, cropped content 54.07%, container overlap 54.14%.
  - Task-average F1: text overflow 22.19%, container overlap 33.75%, sequential-interface semantic consistency 11.44%.
  - The best models (Seed1.6-Vision, Gemini-2.5-Pro) reach about 64–66% model-average F1. Prompting strategies moved F1 by only a few points.

  — [CVF open-access PDF (downloaded, local extraction)](https://openaccess.thecvf.com/content/CVPR2026/papers/Xiang_UI-Lens_Assessing_General_MLLMs_Potential_to_Automate_UI_Display_Quality_CVPR_2026_paper.pdf). The CVF HTML page returned 403. A search-engine summary described "4,759 pages" and "10 models (8 closed, 2 open)". It conflicts with the PDF read here; the PDF figures are used.
- **ReDeFix** (ICSME 2025): see Q1 for 38/43 (88.3%) against 26/43 zero-shot, the 5-engineer study, non-determinism and the hallucinated class. — [arXiv 2511.00678v1](https://arxiv.org/html/2511.00678v1)
- **Macklon and Bezemer, "Exploring the Capabilities of Vision-Language Models to Detect Visual Bugs in HTML5 <canvas> Applications"** (arXiv 2501.09236 v1, 16 Jan 2025, submitted to EMSE). Data: 80 bug-injected screenshots of four types (Layout, Rendering, Appearance, State) plus 20 bug-free screenshots from 20 canvas apps. With README, bug-type descriptions and a bug-free screenshot as context, one VLM (unnamed in the abstract) reaches "up to 100% per-application accuracy". The abstract gives no baseline. — [arXiv abstract](https://arxiv.org/abs/2501.09236). OpenAlex lists an EMSE 2026 version (2026-07-16) by Macklon, Boucher and Bezemer, [DOI 10.1007/s10664-026-10906-3](https://doi.org/10.1007/s10664-026-10906-3). It was not opened.

### Inferences
- UI-Lens is the strongest public evidence that VLM judges should not be used for overflow, overlap or cropping. These are the classes where DOM geometry plus a pixel verification step (VISER/VERVE style) is deterministic and cheap. It supports routing such classes to rule-based checks and keeping any model output advisory.
- ReDeFix and the canvas study are small, single-group evaluations. Neither supports a gate or an auto-fix in a CI tool.

### Gaps
- Seen only in search-result snippets and not opened:
  - a 2026 preprint on multi-window or foldable GUI defects with multimodal reasoning (arXiv 2604.19081; the snippet claims 10.00% false-positive and 11.11% false-negative rates on 40 apps);
  - Minuku (ASE 2025 industry track, mobile display issues);
  - a 2024 study of MLLMs for non-crash functional bugs (arXiv 2407.19053; the snippet claims a 49% detection rate);
  - an ICSME 2024 paper "Leveraging Large Vision-Language Model for Better Automatic Web GUI Testing", which from its title is about test generation rather than layout bugs.

  None of these figures are verified.
- The arXiv API was rate-limited (HTTP 429) for the 2025–2026 category sweep, so arXiv coverage relies on web search and OpenAlex. Some 2026 arXiv-only preprints may be missed.

---

## Roadmap implications

These are scoped for a local-first, pixelmatch-gated CLI that already captures at 375 / 768 / 1440 px, clusters diff pixels, attributes clusters to DOM boxes and runs axe-core in the same pass. None of them changes the pass/fail gate.

1. **NEW: advisory viewport-protrusion (horizontal overflow) check per captured viewport.**
   - What: in the existing render pass, record `document.scrollingElement.scrollWidth > innerWidth`. List visible elements whose border box extends past the viewport's right edge and that are not clipped by an `overflow: hidden/clip` ancestor. Report selector, overflow in px and viewport.
   - Contract: report-only, never an exit-code input.
   - Evidence: viewport protrusion is the only DOM-reported class where most reports were human-visible, 32 of 57 across 45 pages (derived, [VERVE Table III](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)). ReDeCheck defines the class ([ISSTA 2017 tool paper](https://eprints.whiterose.ac.uk/116991/1/c49.pdf)). MLLMs are near-random on overflow and cropping ([UI-Lens](https://openaccess.thecvf.com/content/CVPR2026/papers/Xiang_UI-Lens_Assessing_General_MLLMs_Potential_to_Automate_UI_Display_Quality_CVPR_2026_paper.pdf)). Layout is the top category in VRT PR discussions, 39.7% ([arXiv 2608.07020](https://arxiv.org/abs/2608.07020)).
   - Acceptance: fixtures with real visible overflow and with clipped or transparent overflow. Precision is published per fixture set.
2. **NEW, with an explicit do-not-build: element-collision and element-protrusion candidates appear only after pixel verification.**
   - Do not surface raw DOM overlap or container-protrusion lists. Only 9 of 43 collisions and 3 of 90 protrusions were visible; the rest were non-observable or false positives (derived, [VERVE Table III](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)).
   - If built, use the VISER/VERVE technique: re-render with the suspect element's opacity set to 0 and pixel-diff the overlap rectangle, using the existing diff engine. Report only when pixels change. That technique agreed with humans 86.3–91.8% of the time ([VERVE](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf); [VISER abstract](https://doi.org/10.1109/icst.2019.00027)).
   - Budget: about 4 s per verification in VERVE, so cap verifications per page and keep the mode opt-in. Take geometry and screenshots from the same settled browser state; VERVE needed a 200 ms settle delay and found a measurement defect when geometry came through injected JavaScript.
3. **NEW (Later, opt-in): geometry-only width sweep between the configured viewports.**
   - What: sample DOM boxes, with no screenshots, every 60–80 px plus at CSS media-query breakpoints. Compare relative-alignment relationships between baseline and current, and report the width ranges where they changed.
   - Evidence: against spot-checks at six fixed widths, ReDeCheck-RM had precision 0.98 / recall 1.00 versus 0.91 / 0.81. It caught 5 of 5 changes visible at only one width, versus 1 of 5. The best configuration was 80 px intervals plus CSS breakpoints ([STVR 2020, Tables III–IV](https://eprints.whiterose.ac.uk/163400/8/stvr.1748.pdf)). The tool ran in under two minutes on most pages ([tool paper](https://eprints.whiterose.ac.uk/116991/1/c49.pdf)).
   - Caveats: the oracle is "observable layout change", not "bug", so this produces review items. It needs a stored geometry baseline in JSON next to the PNG baselines.
4. **Do-not-build: small-range-layout warnings.** All 53 small-range reports on 20 new pages were manually classified as false positives. 147 of the 152 true positives in the original set came from one page. VERVE's classifier fell to 73.6% agreement on new subjects ([VERVE](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)).
5. **NEW: shift-aware diff summary (report-only).**
   - What: when a large diff region is explained by a uniform translation (dx, dy) of content, for example an inserted banner, report "content below y shifted by N px". Show the residual clusters after compensating as the items to review.
   - Evidence: ReBDiff collapses shifts covering 62.7–99.6% of the screen into 1–2 differences, and testers checking by eye missed font-type, font-size and icon-position changes ([ReBDiff](https://www.jstage.jst.go.jp/article/ipsjjip/28/0/28_268/_pdf/-char/en)). MIXVRT filters shifted-identical regions with SSIM ≥ 0.85 ([MIXVRT](https://www.jstage.jst.go.jp/article/jrnal/11/3/11_8/_pdf/-char/en)).
   - Contract: never turns a failure into a pass. Both sources are small (10 screens; 2 pages).
6. **NEW: dedupe identical diff clusters across routes and viewports into one review item.** Key on a hash of the cropped diff region plus the attributed selector. Evidence: about 60% fewer confirmations ([Adachi APSEC 2018 abstract](https://doi.org/10.1109/apsec.2018.00106)). Report-level only.
7. **NEW, a scoped refinement of the ALREADY-SHIPPED cluster-to-DOM attribution.**
   - (a) Also attribute a cluster to elements whose layout box moved between baseline and current, plus their nearest common ancestor. WebSee's 93% localization missed mainly faults that move *other* elements, such as `position: fixed` ([WebSee](https://viterbi-web.usc.edu/~halfond/papers/mahajan15icst.pdf)). GWALI expands to suspicious ancestors ([GWALI](https://viterbi-web.usc.edu/~halfond/papers/alameer16icst.pdf)).
   - (b) Optionally label each cluster "explained" (overlaps an element whose DOM or computed style changed) or "unexplained" (possible collateral regression). MIXVRT uses a 50% overlap rule ([MIXVRT](https://www.jstage.jst.go.jp/article/jrnal/11/3/11_8/_pdf/-char/en)).
   - Advisory only. MIXVRT's evidence is 6 defects on 2 pages.
8. **EVIDENCE-FOR-EXISTING-ITEM: "small-text misses under the 10% budget and pixelmatch 8 (OKLab/HyAB, windowSize)".**
   - The current pixelmatch README documents OKLab+HyAB, Vyšniauskas anti-aliasing detection, `windowSize` (the maximum differing-pixel count in any N×N window, default Infinity) and `ignoreMask` ([README](https://github.com/mapbox/pixelmatch)).
   - HyAB was validated only for *very large* color differences ([Abasi et al. 2019](https://doi.org/10.1002/col.22451)).
   - No UI-screenshot evaluation of any of these metrics exists (Q5), so the item's fixtures would be the first evidence. Include both nuisance cases (anti-aliasing speckle, font hinting) and small meaningful edits (font type and size, icon position; [ReBDiff RQ2](https://www.jstage.jst.go.jp/article/ipsjjip/28/0/28_268/_pdf/-char/en)).
   - A whole-image ratio is attacked from both sides. Intended shifts inflate it (ReBDiff), and small real edits sit far below 10%.
9. **EVIDENCE-FOR-EXISTING-ITEM: "pixel validation with true-positive fixtures".** Reuse the STVR 2020 method: HTML/CSS mutation operators, an "observable change" oracle, precision, recall and accuracy, and recall bucketed by how many viewports show the change ([STVR 2020](https://eprints.whiterose.ac.uk/163400/8/stvr.1748.pdf)). WebSee's seeded visual-property faults, which detect 100% by construction, warn that seeded fixtures should include faults that move neighbours ([WebSee](https://viterbi-web.usc.edu/~halfond/papers/mahajan15icst.pdf)).
10. **EVIDENCE-FOR-EXISTING-ITEM: "advisory judge evaluation".** Add UI-Lens's result to the judge's negative evidence: near-random accuracy on overflow, cropping and overlap, and F1 of 22–34% on overflow and overlap ([UI-Lens](https://openaccess.thecvf.com/content/CVPR2026/papers/Xiang_UI-Lens_Assessing_General_MLLMs_Potential_to_Automate_UI_Display_Quality_CVPR_2026_paper.pdf)). Geometry classes should be routed to items 1–2, not the judge. The canvas study's "up to 100% per-application" is a best-configuration figure on 100 screenshots and does not transfer ([arXiv 2501.09236](https://arxiv.org/abs/2501.09236)).
11. **Do-not-build: LLM CSS auto-repair or VLM layout gating in the CLI.** ReDeFix covers 43 RLFs on 13 pages, is non-deterministic, hallucinated a class, and introduced new visual problems ([arXiv 2511.00678](https://arxiv.org/html/2511.00678v1)). Search-based repairs (XFix, IFix, MFix, Layout Dr) are research prototypes evaluated by their own authors on 15–46 pages.
12. **Do-not-build: cross-locale or cross-browser *pixel* comparison as a gate.** For translation-induced change, pixel and structural diffs had 55% precision; relational layout graphs had 91% ([GWALI Table I](https://viterbi-web.usc.edu/~halfond/papers/alameer16icst.pdf)). DOM-plus-vision cross-browser classifiers reached F1 0.35 on internal layout failures ([TWeb 2023](https://doi.org/10.1145/3580518)). **NEW (Later, conditional):** if locale variants are ever captured, compare them with a GWALI-style relational graph of element and text boxes, report-only. GWALI ran in 9.75 s per page.
13. **ALREADY-SHIPPED: anti-flake controls (font, image and animation stabilization; pinned browser). Evidence only, no new item.** Resource rendering (61), animation timing (26), network loading (19) and cross-platform layout difference (10; 5.3% of web cases) are the screenshot-relevant flaky-UI causes among 235 ([Romano et al.](https://arxiv.org/pdf/2103.02669)). VERVE's 200 ms settle delay mattered ([VERVE](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)).
14. **EVIDENCE-FOR-EXISTING-ITEM: the existing report's "make promote_baseline an explicit confirmed action" item.**
    - Practitioners warn that blind updates mask regressions, and the recommended practice is never to auto-update snapshots in CI ([Cruz thesis incorporating JSS 2023](https://homepages.dcc.ufmg.br/~mtov/diss/2024-victor.pdf)).
    - 8.2% of commits in snapshot-using Jest projects update snapshot files ([Fujita et al.](https://raw.githubusercontent.com/Yutaro-Kashiwa/papers/master/ICSME2023_Fujita.pdf)).
    - VRT PRs take about 3.8× longer to resolve, with about 10× more comments ([arXiv 2608.07020](https://arxiv.org/abs/2608.07020)).
    - No study measures the unreviewed-acceptance rate, so the CLI should not claim one.

---

## Query log

All queries are verbatim. None contains the product name, domain, owner, internal file names or code. The fetch and search date for all of them is 2026-10-19.

### Web search (WebSearch tool)
1. `ReDeCheck responsive layout failures Walsh McMinn Kapfhammer`
2. `Althomali Kapfhammer McMinn responsive layout repair`
3. `MIXVRT visual regression testing Aridome`
4. `Adachi visual regression testing masking dynamic areas COMPSAC 2020`
5. `Tanno visual regression testing essential differences Journal of Information Processing`
6. `"Snapshot testing in practice" Cruz Rocha Valente`
7. `vision language model web UI layout bug detection 2026 arXiv`
8. `LLM repair CSS layout failures web pages 2026`
9. `multimodal LLM GUI display issue detection empirical study 2025`

### Semantic Scholar Graph API (`/graph/v1/paper/search?query=…`; all returned HTTP 429, so no data was used)
- `Automated+layout+failure+detection+for+responsive+web+pages+without+an+explicit+oracle`
- `Automatic+visual+verification+of+layout+failures+in+responsively+designed+web+pages`
- `Automated+repair+of+responsive+web+page+layouts`
- `Detection+and+Localization+of+HTML+Presentation+Failures+Using+Computer+Vision-Based+Techniques`
- `Detecting+and+Localizing+Internationalization+Presentation+Failures+in+Web+Applications`
- `Automated+repair+of+internationalization+presentation+failures+in+web+pages+style+similarity+clustering`
- `Automated+Repair+of+Layout+Cross+Browser+Issues+using+Search-Based+Techniques`
- `X-PERT+accurate+identification+of+cross-browser+issues+in+web+applications`
- Connectivity test: `ReDeCheck` (limit=1, 429)

### OpenAlex API (`https://api.openalex.org/works`)
Title mode means `filter=title.search:<string>`. Search mode means `search=<string>`. The `select` parameter listed bibliographic fields plus `abstract_inverted_index`.
- Connectivity test: `search=ReDeCheck&per_page=1`
- Title mode, per_page=2:
  - `Automated layout failure detection for responsive web pages without an explicit oracle`
  - `Automatic detection of potential layout faults following changes to responsive web pages`
  - `Automatic visual verification of layout failures in responsively designed web pages`
  - `Automated repair of responsive web page layouts`
  - `Detection and localization of HTML presentation failures using computer vision-based techniques`
  - `Using visual symptoms for debugging presentation failures in web applications`
  - `Detecting and localizing internationalization presentation failures in web applications`
  - `Automated repair of internationalization presentation failures in web pages using style similarity clustering and search-based techniques`
  - `Automated repair of layout cross browser issues using search-based techniques`
  - `X-PERT: accurate identification of cross-browser issues in web applications`
  - `Automated repair of mobile friendly problems in web pages`
- Title mode, per_page=3:
  - `An empirical study on the use of snapshot testing`
  - `Snapshot testing in practice: benefits and drawbacks`
  - `Snapshot testing dataset`
  - `An empirical analysis of UI-based flaky tests`
  - `Masking dynamic content areas based on positional relationship of screen elements for visual regression testing`
  - `redundant checking visual regression testing`
  - `LocaliCSS`
  - `Efficiently repairing internationalization presentation failures by solving layout constraints`
  - `Layout cross-browser failure classification for mobile responsive design web applications`
- Search mode, per_page=12, `filter=from_publication_date:2023-01-01`:
  - `responsive layout failures`
  - `web presentation failures`
  - `cross-browser inconsistencies detection`
  - `internationalization presentation failures`
  - `visual regression testing`
  - `snapshot testing`
  - `flaky UI tests`
  - `screenshot testing flakiness`
  - `visual bugs web pages large language model`
  - `GUI display issues multimodal large language model`
  - `web layout bugs vision language model`
- Title mode, per_page=1. Two of these returned HTTP 400 because of commas in the filter and were re-run in search mode:
  - `A Heuristic Approach to Localize CSS Properties for Responsive Layout Failures`
  - `Automatic Testing of the Correctness of a Website Layout using the Layout Graph`
  - `SpiderTailed: A Tool for Detecting Presentation Failures Using Screenshots and DOM Extraction`
  - `Finding HTML presentation failures using tools based on image comparison techniques`
  - `Methods for Automatic Web Page Layout Testing and Analysis: A Review`
  - `Exploring the capabilities of vision-language models to detect visual bugs in HTML5 canvas applications`
  - `An Empirical Study of Web Flaky Tests: Understanding and Unveiling DOM Event Interaction Challenges`
  - `Challenges, Strategies, and Impacts: A Qualitative Study on UI Testing in CI/CD Processes` (400)
  - `Flaky Tests in UI: Understanding Causes and Applying Correction Strategies`
  - `Understanding, Localizing, and Repairing Flakiness in Web Front-End Testing` (400)
  - `SPOTIT: an oracle approach to support visual regression testing for native Android applications`
  - `Layout Cross-Browser Failure Classification for Mobile Responsive Design Web Applications`
- Search mode, per_page=8:
  - `qualitative study UI testing CI/CD GitHub developers perspectives`
  - `Understanding Localizing and Repairing Flakiness in Web Front-End Testing`
  - `screen content image quality assessment full-reference`
  - `image similarity metrics GUI testing comparison`
  - `image comparison visual regression testing evaluation metrics`
  - `perceptual image difference metric evaluation`
  - `FLIP difference evaluator alternating images`
  - `HyAB color difference large differences`
  - `SSIMULACRA 2`
  - `Butteraugli`
  - `screenshot comparison web page similarity metric evaluation`
  - `document image quality assessment structural similarity text`
- Search mode, per_page=1:
  - `Perceptual Quality Assessment of Screen Content Images`
  - `ESIM: Edge Similarity for Screen Content Image Quality Assessment`
  - `Distance metrics for very large color differences`
  - `CID22: Large-Scale Subjective Quality Assessment for High Fidelity Image Compression`
  - `Challenges, Strategies, and Impacts: A Qualitative Study on UI Testing in CI/CD Processes from GitHub Developers' Perspectives`
  - `Measuring perceived color difference using YIQ NTSC transmission color space in mobile applications`
  - `Anti-aliased pixel and intensity slope detector`
- Direct record: `works/doi:10.1145/3406183?select=title,abstract_inverted_index`

### arXiv API (`https://export.arxiv.org/api/query?search_query=…`, sorted by submittedDate; rate-limited with HTTP 429, job stopped, no results used)
- Test: `all:"snapshot testing"` (429)
- `all:"visual bugs" AND all:web`
- `all:"responsive" AND all:"layout" AND all:LLM`
- `all:"display issues" AND all:GUI`
- `all:"cross-browser"`
- `all:"visual regression"`
- `all:"snapshot testing"`
- `all:"presentation failures"`
- `all:"layout bugs"`
- `all:"UI" AND all:"visual defects" AND all:"vision-language"`
- `all:"web" AND all:"layout" AND all:"repair" AND all:"multimodal"`

### Pages and files fetched (no search terms)
- WebFetch:
  - cs.allegheny.edu/sites/gkapfham/research/papers/Walsh2017 (redirected, then 404 on gregorykapfhammer.com)
  - eprints.whiterose.ac.uk/163400/8/stvr.1748.pdf
  - eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf
  - eprints.whiterose.ac.uk/116991/1/c49.pdf
  - arxiv.org/abs/2511.00678 and arxiv.org/html/2511.00678v1
  - jstage.jst.go.jp/article/ipsjjip/28/0/28_268/_article and its `_pdf`
  - arxiv.org/abs/2608.07020
  - doi.org/10.57417/jrnal.11.3_214, then jstage.jst.go.jp/article/jrnal/11/3/11_8/_article and its `_pdf`
  - miyazaki-u.repo.nii.ac.jp/records/2001875
  - viterbi-web.usc.edu/~halfond/publications.html (TLS error)
  - arxiv.org/abs/2103.02669, arxiv.org/abs/2501.09236, arxiv.org/abs/2008.05396
  - openaccess.thecvf.com UI-Lens HTML (403)
  - eprints.whiterose.ac.uk/id/eprint/163401
  - constellation.uqac.ca/id/eprint/7747/
  - sdlab.naist.jp/en/post/fujita-icsme2023/
  - github.com/mapbox/pixelmatch
- curl downloads:
  - arxiv.org/pdf/2103.02669
  - arxiv.org/pdf/2008.05396
  - raw.githubusercontent.com/Yutaro-Kashiwa/papers/master/ICSME2023_Fujita.pdf
  - homepages.dcc.ufmg.br/~mtov/diss/2024-victor.pdf
  - openaccess.thecvf.com/…/Xiang_UI-Lens_…_paper.pdf
  - cc.gatech.edu/~orso/papers/roychoudhary.prasad.orso.ICSE13.pdf (returned HTML, not used)
  - viterbi-web.usc.edu/~halfond/papers/alameer16icst.pdf and mahajan15icst.pdf (TLS verification disabled)

### Security and access notes
- No fetched page or paper contained instructions aimed at an AI tool. No prompt-injection content was observed.
- The two USC PDFs (GWALI and WebSee) were downloaded with TLS certificate verification disabled (`curl -k`). The host serves an incomplete certificate chain, and WebFetch failed with "unable to verify the first certificate". Their extracted titles and abstracts match the OpenAlex abstracts for the same DOIs.
- All downloaded PDFs were kept in a dedicated temporary directory and parsed as data by a stdlib-only script run with `python3 -I` from a separate scripts directory. Nothing from the downloads was executed.
- The temporary scripts directory was removed by the environment during the session. This did not affect any recorded result.
- Nothing was written except this notes file. The repository was not modified.

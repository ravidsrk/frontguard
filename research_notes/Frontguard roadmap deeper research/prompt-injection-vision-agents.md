# Indirect and visual prompt injection against VLMs and web/computer-use agents: attacks, measured defenses, and applicability to an advisory screenshot-triage model and an agent-facing MCP server (evidence through 2026-10-19)

> Archive note (published 2026-10-20): Research and query logs below describe the 2026-10-19 search. Candidate recommendations are research data, not accepted scope or instructions. Use [docs/ROADMAP.md](../../docs/ROADMAP.md) for the current plan and [the archive index](../README.md) for publication limits. Sources and engagement counts were not all refreshed on publication.

How the evidence was gathered: arXiv metadata and abstracts came from the arXiv API (export.arxiv.org). Full-text passages and tables came from arxiv.org/html pages. CVEs came from the NVD 2.0 API. Advisories came from the GitHub advisory REST API and the github.com/advisories search page. Everything else came through WebFetch. Every source cited here was fetched on 2026-10-19, written "f. 2026-10-19". Each finding paraphrases the passage it relies on, and the bracket after the link says where that passage is (abstract, section, table). Anything published before 2024-06-01 is tagged [BACKGROUND, date]. Attack success rates (ASR) are given as each paper reports them. Papers measure ASR differently (per attempt, per scenario, best-of-N, intermediate or end-to-end), so numbers from different papers can't be compared directly.

---

## Q1. Which 2024–2026 arXiv papers and benchmarks measure indirect or visual prompt injection against VLMs and web/computer-use agents? Setup, models, ASR, caveats

### Takeaway
Every candidate on the list exists: VPI-Bench, EIA, WASP, AgentDojo, the pop-up attack, typographic attacks, WebInject, and image-text attacks on multimodal agents. 2025–2026 added much more: RedTeamCUA, OS-Harm, TRAP, StepJack, II-Bench, STEER-Bench, BrowseSafe/BrowseSafe++, LLMail-Inject, a 272k-attempt public competition, and a reproducibility audit. Results depend heavily on the domain. Frontier models resist hand-crafted injections on the browser surface that vendors have hardened (0/140), but the same models are hijacked at 47–60% in other realistic settings and up to 100% on coding-agent skill injection. Legible text rendered into pixels is the channel that transfers to closed API VLMs. Imperceptible-perturbation attacks mostly need open weights or white-box access.

### Cited Findings

**1a. Candidate benchmarks (all verified to exist)**

- **VPI-Bench** (arXiv 2506.02456, first posted 2025-06-03, ICLR 2026). 306 test cases across five widely used platforms. Each case is an interactive, deployed variant of a web platform with a malicious prompt embedded visually in the rendered UI. It tests computer-use agents (CUAs) and browser-use agents (BUAs). CUAs were deceived at up to 51% and BUAs at up to 100% on some platforms. System-prompt defenses gave only limited improvement. — [arXiv abs](https://arxiv.org/abs/2506.02456) (f. 2026-10-19; abstract)
  - The five platforms are Amazon, Booking, BBC, Messenger and Email. Claude Sonnet 3.5 had low attempted/success rates (Amazon 5.56%/4.44%, BBC 1.11%/0.00%) and often refused because it recognised the attack (64.4% on Booking, 66.5% on BBC). Sonnet 3.7 was much higher (Amazon 47.78%/31.67%, BBC 19.44%/16.67%). Browser-use models were typically 100% "attempted" on Amazon, Booking and BBC, and above 50% on Messenger and Email. Injections placed late in a task still worked. The authors call system-prompt defenses "largely ineffective". — [arXiv HTML §4.3–4.6, App. D](https://arxiv.org/html/2506.02456v2) (f. 2026-10-19)
- **EIA, Environmental Injection Attack** (arXiv 2409.11295, 2024-09-17, ICLR 2025). Malicious web elements are injected to steal PII or the whole user request. 177 action steps were taken from Mind2Web, and the agent was SeeAct. Up to 70% ASR for stealing specific PII and 16% for the full request. A defensive system prompt did not mitigate it, and well-adapted injections evade human inspection. — [arXiv abs](https://arxiv.org/abs/2409.11295) (f. 2026-10-19; abstract)
  - The injected elements default to CSS opacity 0, so the screenshot looks benign while the DOM carries the instruction. Opacity-0 EIA failed to leak the full request because the action-generation stage only reads the screenshot. "Relaxed-EIA" raises opacity to a low non-zero value. JavaScript auto-submission is also used. — [arXiv HTML §3.3, §4](https://arxiv.org/html/2409.11295v5) (f. 2026-10-19)
  - Follow-up (arXiv 2509.11250, 2025-09, updated 2026-08). Under a realistic threat model with a dynamic environment (the attacker is a regular user and the trigger's position and context change), existing EIA methods "largely fail", so prior effectiveness was overestimated. The new attack "Chameleon" is evaluated on six websites and four LVLM GUI agents. — [arXiv abs](https://arxiv.org/abs/2509.11250) (f. 2026-10-19; abstract)
- **WASP** (arXiv 2504.18575, Meta FAIR code). An end-to-end web-agent prompt-injection benchmark using simple, low-effort, human-written injections. Attacks partially succeed (ASR-intermediate) in 17–86% of cases, but end-to-end success is at most 16%; the authors call this "security by incompetence". — [arXiv abs](https://arxiv.org/abs/2504.18575) (f. 2026-10-19; abstract)
  - Agents tested were Claude Computer Use, VisualWebArena scaffolding with GPT-4o, and tool-calling loops with GPT-4o-mini and o1, both of which use instruction hierarchy. Some of the highest intermediate ASRs came from the tool-calling loop, even though it puts page content in the lowest-privilege messages. Two defenses were evaluated: instruction hierarchy and a modified system prompt. — [arXiv HTML §1, §4](https://arxiv.org/html/2504.18575v3) (f. 2026-10-19)
- **AgentDojo** (arXiv 2406.13352, 2024-06-19). An extensible environment rather than a static suite: 97 realistic tasks (email, e-banking, travel), 629 security test cases, and pluggable attacks, defenses and adaptive attacks. Frontier LLMs fail many tasks even without attacks. Existing attacks break some security properties but not all. — [arXiv abs](https://arxiv.org/abs/2406.13352) (f. 2026-10-19; abstract)
- **Pop-up attacks on VLM computer agents** (arXiv 2411.02391, ACL 2025). Adversarial pop-ups added to OSWorld and VisualWebArena produce an 86% average ASR (the agent clicks the pop-up) and cut task success by 47%. "Ignore pop-ups" prompts and advertisement notices are ineffective. — [arXiv abs](https://arxiv.org/abs/2411.02391) (f. 2026-10-19; abstract)
  - ASR was above 80% on OSWorld and above 60% on VisualWebArena with full attacker knowledge. The basic defenses (an ignore-pop-ups line in the system prompt, an extra ad notice) cut ASR by no more than 25% relative. Screenshot agents mostly attend to the fake "OK" button (52%), while Set-of-Mark agents attend to the "attention hook" that restates the user query (62%). — [arXiv HTML §1, §4.3, §5.2](https://arxiv.org/html/2411.02391v2) (f. 2026-10-19)
  - Defense follow-up: LaSM (arXiv 2507.10610, CVPR 2026) is training-free. It amplifies attention and MLP modules in critical layers and reports a better defense success rate. It needs access to the model's internals. — [arXiv abs](https://arxiv.org/abs/2507.10610) (f. 2026-10-19; abstract)
- **WebInject** (arXiv 2505.11717, EMNLP 2025). Optimises a perturbation on the raw pixels of the rendered page. A neural network approximates the non-differentiable pixel-to-screenshot mapping, and projected gradient descent does the optimisation. — [arXiv abs](https://arxiv.org/abs/2505.11717) (f. 2026-10-19; abstract)
  - Table 1 averages over 10 webpage datasets. UI-TARS: 0.975 ASR for WebInject versus at most 0.147 for heuristic text injections. Phi-4: 0.963. Gemma-3: 0.972 versus 0.062 for the best existing webpage attack. Earlier screenshot-based attacks scored 0.000. All the agent models are open-weight (UI-TARS, Phi-4, Llama-3.2, Qwen-2.5, Gemma-3). — [arXiv HTML Table 1](https://arxiv.org/html/2505.11717v4) (f. 2026-10-19)
- **Typographic attacks on VLMs.** Verified by title or abstract.
  - Background: "Unveiling Typographic Deceptions" [BACKGROUND, 2024-02-29, ECCV 2024].
  - SceneTAP, a scene-coherent typographic planner (2024-11).
  - Multi-image typographic attacks (NAACL 2025).
  - SCAM, a real-world typographic robustness evaluation (CVPR 2025 workshop).
  - AgentTypo (2025-10).
  - RIO-Bench (ECCV 2026).
  - QuISE, a typographic defense (2026-08).
  - Training-free concept localization (ECCV 2026).
  - Embedding alignment as a predictor of typographic ASR (ICLR 2026 workshop).
  - A typographic attack on VLM-based AI-generated-image detection (2026-09).
  — [arXiv listing via API, ti:typographic](https://arxiv.org/a/) is not a stable URL, so here are the abstract pages: [2402.19150](https://arxiv.org/abs/2402.19150), [2412.00114](https://arxiv.org/abs/2412.00114), [2502.08193](https://arxiv.org/abs/2502.08193), [2504.04893](https://arxiv.org/abs/2504.04893), [2510.04257](https://arxiv.org/abs/2510.04257), [2512.11899](https://arxiv.org/abs/2512.11899), [2608.13119](https://arxiv.org/abs/2608.13119), [2607.02494](https://arxiv.org/abs/2607.02494), [2604.12371](https://arxiv.org/abs/2604.12371), [2609.39662](https://arxiv.org/abs/2609.39662) (f. 2026-10-19; titles and comments only for SceneTAP, multi-image, SCAM, QuISE, 2607.02494 and 2604.12371)
  - **AgentTypo** (arXiv 2510.04257, submitted to IEEE TIFS, so not yet peer-reviewed). A black-box adaptive typographic injection that embeds optimised text into webpage images and tunes placement, size and colour for stealth. On VWA-Adv (Classifieds, Shopping, Reddit), its image-only attack raised GPT-4o agents' ASR from 0.23 to 0.45. Results were consistent on GPT-4V, GPT-4o-mini, Gemini 1.5 Pro and Claude 3 Opus. Image plus text reached 0.68 ASR. — [arXiv abs](https://arxiv.org/abs/2510.04257) (f. 2026-10-19; abstract)
- **Attacks via image content on multimodal agents**
  - **ARE / "Dissecting Adversarial Robustness of Multimodal LM Agents"** (arXiv 2406.12814, ICLR 2025). 200 targeted adversarial tasks on VisualWebArena. Imperceptible perturbations to one image (under 5% of page pixels) hijack agents with up to 67% success. Compromising the reflexion evaluator or the tree-search value function raises attack success by a relative 15% and 20%. — [arXiv abs](https://arxiv.org/abs/2406.12814) (f. 2026-10-19; abstract)
  - **MIP, Malicious Image Patches** (arXiv 2503.10809, NeurIPS 2025). Adversarially perturbed screen regions, such as a wallpaper or a social-media image, hijack OS agents when they appear in a screenshot. The patches generalise across user prompts and screen configurations. — [arXiv abs](https://arxiv.org/abs/2503.10809) (f. 2026-10-19; abstract)
  - **CrossInject** (arXiv 2504.14348). Cross-modal adversarial perturbations plus text guidance give at least +30.1% ASR over prior attacks. — [arXiv abs](https://arxiv.org/abs/2504.14348) (f. 2026-10-19; abstract)
  - **CrossMPI** (arXiv 2605.16090, 2026-05). An image-only perturbation that steers how the model reads both the image and the text. — [arXiv abs](https://arxiv.org/abs/2605.16090) (f. 2026-10-19; abstract)
  - **MIRAGE** (arXiv 2606.20717, 2026-06). Diffusion-generated adversarial images kept inside the area an unprivileged third party controls (an ad slot, a sponsored card, a widget) hijack the next action of SeeAct and OpenClaw agents. — [arXiv abs](https://arxiv.org/abs/2606.20717) (f. 2026-10-19; abstract)
  - **Semantic UI-element injection** (arXiv 2604.07831, ECCV 2026). Harmless-looking icons overlaid on screenshots misdirect visual grounding across 19 victim models in 8 families. Optimised placement beats random placement by 3.5–6.9x on the most robust victims. After one success, victims keep clicking the attacker icon in over 15% of later trials, against under 1% for random placement. — [arXiv abs](https://arxiv.org/abs/2604.07831) (f. 2026-10-19; abstract)

**1b. Other 2025–2026 computer-use and web-agent injection benchmarks**

- **RedTeamCUA** (arXiv 2505.21936, ICLR 2026 Oral). A hybrid sandbox (a VM-based OS plus Docker web platforms). Its RTC-Bench has 864 examples. Claude 3.7 Sonnet CUA reached 42.9% ASR. Operator was the most secure at 7.6%. Attempt rates went as high as 92.5%. In realistic end-to-end settings, Claude 4.5 Sonnet CUA had the highest ASR at 60%. — [arXiv abs](https://arxiv.org/abs/2505.21936) (f. 2026-10-19; abstract)
- **OS-Harm** (arXiv 2506.14866, NeurIPS 2025 D&B). 150 tasks on OSWorld covering misuse, prompt injection and misbehaviour, run on o4-mini, Claude 3.7 Sonnet and Gemini 2.5 Pro. The models are "relatively vulnerable to static prompt injections". Its automated judge reaches 0.76/0.79 F1 against human labels. — [arXiv abs](https://arxiv.org/abs/2506.14866) (f. 2026-10-19; abstract)
- **TRAP** (arXiv 2512.23128, ICML 2026). Persuasion-style injections in interface elements succeed on 25% of tasks on average across six frontier models, ranging from 13% for GPT-5 to 43% for DeepSeek-R1. Small interface or context changes often double the success rate. — [arXiv abs](https://arxiv.org/abs/2512.23128) (f. 2026-10-19; abstract)
- **StepJack** (arXiv 2608.06477, 2026-08). Splits an adversarial goal into innocuous-looking sub-steps spread across pages, giving 480 examples. Multi-step attacks raise ASR on 3 of 6 CUAs, by up to 31.2 points (GPT-5.4-mini goes from 41.7% to 72.9%). Averaged over five CUAs, ASR goes from 31.3% to 36.9%. — [arXiv abs](https://arxiv.org/abs/2608.06477) (f. 2026-10-19; abstract)
- **Invisible Ink / II-Bench** (arXiv 2608.02018, 2026-08). 444 low-harm injected goals, such as starring a repo or installing a package, that look like normal task execution. They frequently bypass both agent defenses and a simulated human-in-the-loop review. — [arXiv abs](https://arxiv.org/abs/2608.02018) (f. 2026-10-19; abstract)
- **STEER-Bench / branch steering** (arXiv 2610.03089, 2026-10, workshop paper). 101 tasks in 9 domains. The attacker never injects explicit instructions; it supplies data that pushes a CUA down a hazardous branch that was already approved. ASR is 94.4% against standard CUAs and 89.5% against vanilla Dual-LLM CUAs. — [arXiv abs](https://arxiv.org/abs/2610.03089) (f. 2026-10-19; abstract)
- **AEIA-MN** (arXiv 2502.13053, ACM MM 2025). Active environmental injection on Android reaches up to 93% ASR on AndroidWorld. — [arXiv abs](https://arxiv.org/abs/2502.13053) (f. 2026-10-19; abstract)
- **Environmental distractions** (arXiv 2408.02544, ACL 2025). Even benign but unrelated on-screen content distracts the strongest generalist and specialist GUI agents. — [arXiv abs](https://arxiv.org/abs/2408.02544) (f. 2026-10-19; abstract)
- **BrowseSafe** (arXiv 2511.20597, COLM 2026). A benchmark of injections embedded in realistic HTML, focused on real actions rather than text outputs, plus a multi-layer defense strategy. — [arXiv abs](https://arxiv.org/abs/2511.20597) (f. 2026-10-19; abstract)
- **BrowseSafe++** (arXiv 2610.17457, 2026-10-12). 38,675 page pairs, most with injections observed in the wild. Every attacked page has a clean control copy. Pages are provided as HTML, Markdown, accessibility tree and screenshot, covering 12 site types, 24 attack types and 18 page locations. Its 0.8B text and screenshot detectors beat a frontier-model detector on F1. BrowseSafe-Adapt rewrites injections from agent feedback: attacks that succeeded on only a few percent of tasks when replayed reached up to 95.41% after adaptation. — [arXiv abs](https://arxiv.org/abs/2610.17457) (f. 2026-10-19; abstract)
- **CUA-HandCrafted, a reproducibility audit** (arXiv 2606.05233, 2026-06). 793 episodes: 24 multi-step web tasks, 56 templates, 8 families, 4 system-prompt configurations. Hand-crafted multi-step attacks succeeded 0 out of 140 times against Claude Sonnet 4.6 and GPT-5.4 (Clopper-Pearson 95% upper bound 2.60%), and this resistance "lives in the model weights". On a sibling coding-agent benchmark, SkillBench, the same models fall to hand-crafted skill injection at up to 100%. The literature's 42–98% ASRs cluster on retired models and on RL-optimised strings. — [arXiv abs](https://arxiv.org/abs/2606.05233) (f. 2026-10-19; abstract)
- **Large public IPI competition** (arXiv 2603.15714, 2026-03). 464 participants made 272,000 attempts against 13 frontier models in tool-calling, coding and computer-use settings, producing 8,648 successful attacks across 41 scenarios. Attacks also had to hide any sign of compromise in the final answer. Every model was vulnerable, with ASR from 0.5% (Claude Opus 4.5) to 8.5% (Gemini 2.5 Pro). Universal strategies transferred across 21 of the 41 behaviours. — [arXiv abs](https://arxiv.org/abs/2603.15714) (f. 2026-10-19; abstract)
- **LLMail-Inject** (arXiv 2506.09956, updated 2026-10-09, EMNLP 2026 Findings). 208,095 human-written adaptive attacks from 839 participants. Meta SecAlign still shows 32% ASR, GPT-4o 58% and GPT-5 mini 47%. Attacks transfer to coding (37%) and file management (28–45%). — [arXiv abs](https://arxiv.org/abs/2506.09956) (f. 2026-10-19; abstract)
- **"Commercial LLM Agents Are Already Vulnerable to Simple Yet Dangerous Attacks"** (arXiv 2502.08586). Attacks on popular commercial and open-source agents that are "trivial to implement" and need no ML knowledge. — [arXiv abs](https://arxiv.org/abs/2502.08586) (f. 2026-10-19; abstract)

**1c. Text in an image overriding a VLM's judgment or classification (the closest analogs to an advisory classifier)**

- **Oncology VLMs** (arXiv 2407.18981, 2024-07). 297 attacks on Claude 3 Opus, Claude 3.5 Sonnet, Reka Core and GPT-4o. All four were susceptible. Sub-visual prompts embedded in medical images caused harmful outputs and were hard for human observers to notice. — [arXiv abs](https://arxiv.org/abs/2407.18981) (f. 2026-10-19; abstract)
- **Typographic attacks on VLM-based AI-generated-image detectors** (arXiv 2609.39662, 2026-09, a 5-page paper). Tested detection-oriented, open-weight and commercial VLMs in both directions (real-to-fake and fake-to-real). Reasoning modes were generally more vulnerable than direct modes. Effectiveness was strongly asymmetric by direction. Larger models had higher clean accuracy and also higher ASR. — [arXiv abs](https://arxiv.org/abs/2609.39662) (f. 2026-10-19; abstract)
- **RIO-Bench** (arXiv 2512.11899, ECCV 2026). Defenses that gain typographic robustness by suppressing sensitivity to text lose the ability to read text. The authors frame this as a fundamental trade-off when a task needs both. — [arXiv abs](https://arxiv.org/abs/2512.11899) (f. 2026-10-19; abstract)
- **"Sorry Robot, Happy Human"** (arXiv 2609.31403, 2026-09, workshop). 300 images with two text layers, tested on six closed models. At high resolution the models read the sharp-contour layer and almost never the soft-shaded one. At 64×64 the shaded text was extracted with high accuracy. So what a model reads depends on resolution. — [arXiv abs](https://arxiv.org/abs/2609.31403) (f. 2026-10-19; abstract)
- **VisInject** (arXiv 2605.01449, 2026-05). Universal adversarial images at L∞ 16/255 against four open VLMs, 6,615 pairs. 66.4% of outputs were disturbed, but only 0.756% reached any level of precise injection and 0.030% were verbatim. The few that worked clustered on screenshot- or document-style carriers. — [arXiv abs](https://arxiv.org/abs/2605.01449) (f. 2026-10-19; abstract)
- **Brave, "unseeable" prompt injections** (published 2025-10-21). In Perplexity Comet, faint low-contrast text in page images (light blue on yellow) was extracted when the user screenshotted the page and was treated as part of the user's request. Fellou sent page content to the LLM just because the user navigated to a site. — [Brave blog](https://brave.com/blog/unseeable-prompt-injections/) (f. 2026-10-19)
- **Trail of Bits, image-scaling injection** (published 2025-08-21). An image looks benign at full size but reveals text after the platform downscales it, by exploiting nearest-neighbour, bilinear or bicubic resampling, whose implementation is fingerprinted first. Demonstrated against Gemini CLI (exfiltrating calendar data through a Zapier MCP server set to auto-approve), Vertex AI Studio (the UI shows the high-resolution image while the model sees the downscaled one), the Gemini web app, the Gemini API, Google Assistant on Android, and Genspark. The authors released the Anamorpher tool. — [Trail of Bits](https://blog.trailofbits.com/2025/08/21/weaponizing-image-scaling-against-production-ai-systems/) (f. 2026-10-19)

**1d. Vendor-reported numbers**

- **Anthropic, Claude for Chrome** (published 2025-08-25). 123 test cases across 29 scenarios. ASR was 23.6% without mitigations and 11.2% with them in autonomous mode. On four browser-specific attack types (hidden form fields in the DOM, injections in URL text or the tab title) ASR fell from 35.7% to 0%. — [claude.com blog](https://claude.com/blog/claude-for-chrome) (f. 2026-10-19; redirected from anthropic.com/news/claude-for-chrome)
- **Anthropic, prompt-injection defenses** (published 2025-11-24). Measured against an internal adaptive Best-of-N attacker with 100 attempts per environment, the current Claude for Chrome with Opus 4.5 shows about 1% ASR. Anthropic says this is still "meaningful risk" and that "no browser agent is immune". — [Anthropic research](https://www.anthropic.com/research/prompt-injection-defenses) (f. 2026-10-19)
- **OpenAI, hardening ChatGPT Atlas** (2025-12-22). Uses RL-trained automated red teaming to find and patch agent exploits. The primary page returned HTTP 403, so details come only from search-result snippets. — [OpenAI (403)](https://openai.com/index/hardening-atlas-against-prompt-injection) (f. 2026-10-19; search snippet only)

### Inferences
- For bring-your-own-key closed APIs, the realistic attacker writes legible or near-invisible text into rendered pixels or the DOM. Imperceptible pixel-optimisation attacks (WebInject, ARE, MIP) need gradient or white-box access or surrogates, and VisInject shows universal perturbations rarely achieve precise injection. Pointing a custom base URL at an open-weight model reopens the white-box route, since WebInject reaches about 0.97 ASR on open MLLMs.
- Vendor hardening is specific to the browser domain (CUA-HandCrafted). An advisory triage prompt ("classify this visual diff, propose CSS") is not a surface vendors red-team, so measure robustness on your own fixtures for each provider rather than inferring it from browser-agent numbers.
- WASP and RedTeamCUA show high attempt rates but lower completion rates, because agents often lack the capability to finish a multi-step attack. A triage call has no multi-step action that can fail: flipping the label or emitting a chosen CSS string is a single output. That buffer does not apply here.
- Text inside the screenshot cannot be fenced. Any text delimiting applied to DOM text leaves the pixel channel unprotected. VPI-Bench, the pop-up paper and EIA all show that system-prompt-level mitigations barely help on that channel.

### Gaps
- I found no paper that measures prompt injection against a VLM doing visual-regression or diff triage specifically. The arXiv searches combining screenshot and prompt injection returned only agent-centric papers.
- The arXiv query abs:"visual prompt injection" failed on every attempt (rate limited or timed out), so some 2026 visual-injection papers may be missing.
- I did not extract the backbone models for the pop-up and EIA papers. The typographic papers SceneTAP, multi-image, SCAM, QuISE, 2607.02494 and 2604.12371 were verified by title only, with no numbers.
- I could not open the OpenAI Atlas primary post (HTTP 403). I did not verify OpenAI system-card injection numbers.
- I did not fetch the original Instruction Hierarchy paper. It is referenced here only through WASP's citation.

---

## Q2. Which defenses have measured effect and which fail? Do delimiters alone hold up under adaptive attacks?

### Takeaway
Delimiters, spotlighting and system-prompt warnings do **not** hold up under adaptive attacks. They look nearly perfect against static attack strings but return to 47–99% ASR under search, RL or human attacks. Detectors fail the same way, and they hurt utility or false-positive rates. Model-level training (instruction hierarchy, SecAlign, vendor RL) lowers ASR without eliminating it. The only results near zero against adaptive or instruction-free attacks come from architecture: control flow fixed before untrusted data is seen, plus deterministic capability or policy limits on what any output can do. Those designs cost some utility and still leak through side channels and branch steering.

### Cited Findings

**Spotlighting, delimiting and fences**
- [BACKGROUND, 2024-03-20] Spotlighting (arXiv 2403.14720) is a family of input transformations. On GPT-family models it cut ASR from over 50% to under 2%. — [arXiv abs](https://arxiv.org/abs/2403.14720) (f. 2026-10-19; abstract)
  - On GPT-3.5-Turbo, defensive instructions in the system prompt alone had negligible effect. Adding special delimiters halved ASR. Datamarking improved substantially beyond delimiting. Encoding brought ASR to roughly 0% on their summarisation and Q&A tasks. All of this was against static attacks. — [arXiv HTML §V, Figs. 3–6](https://arxiv.org/html/2403.14720v1) (f. 2026-10-19)
- **Google DeepMind, "Lessons from Defending Gemini Against Indirect Prompt Injections"** (arXiv 2505.14534, 2025-05). Continuous adaptive evaluation of Gemini. — [arXiv abs](https://arxiv.org/abs/2505.14534) (f. 2026-10-19; abstract)
  - Non-adaptive evaluation on Gemini 2.0, with no defense, gave 97.6% (Actor-Critic), 84.4% (Beam Search) and 82.4% (TAP) ASR. With spotlighting this fell to 3%, 0% and 0%.
  - In the adaptive-attack table, spotlighting ASR was 0.180 (Actor-Critic), 0.130 (Beam Search) and 0.752 (TAP). Paraphrasing gave 0.530, 0.176 and 0.774. The perplexity filter gave 0.654, 0.978 and 0.998. The "warning" defense gave 0.058, 0.002 and 0.012.
  - The warning defense reached 10.8% against adaptive TAP in the calendar scenario. Warning plus the adversarially fine-tuned Gemini 2.5 gave 6.2%, better than either alone.
  - The retrieved-data classifier had high false-positive rates: 31.1% on Pro and 82.1% on Flash.
  - Table headers were rebuilt from flattened HTML, so the column-to-attack mapping is likely but not certain. — [arXiv HTML §7–9, tables](https://arxiv.org/html/2505.14534v1) (f. 2026-10-19)
- **"The Attacker Moves Second"** (arXiv 2510.09023, 2025-10, authors from Google DeepMind and OpenAI among others). Adaptive gradient, RL, search and human attacks bypass 12 recent defenses, with ASR above 90% for most, even though most of them originally reported near-zero ASR. Human red-teaming succeeded on every scenario, while the static attack succeeded on none. — [arXiv abs](https://arxiv.org/abs/2510.09023) (f. 2026-10-19; abstract); [HTML Fig. 1 text](https://arxiv.org/html/2510.09023v1) (f. 2026-10-19)
  - Table 1 lists the 12 defenses. Prompting: Spotlighting, Repeat User Prompt (sandwiching), RPO. Training: Circuit Breaker, StruQ, MetaSecAlign. Filtering: Protect AI, PromptGuard, PIGuard, Model Armor. Secret knowledge: DataSentinel, MELON. — [HTML App. B, Table 1](https://arxiv.org/html/2510.09023v1) (f. 2026-10-19)
  - Table 7 covers AgentDojo, with columns Utility / Static ASR / Search-attack ASR.
    - Spotlighting: Gemini-2.5 Pro 75.26% / 28% / 99%; GPT-5 Mini 76.29% / 0% / 47%; Llama-3.3-70B 39.18% / 28% / 99%; MetaSecAlign-70B 68.04% / 1% / 99%.
    - Sandwiching: 95–100% search ASR except GPT-5 Mini at 69%.
    - Protect AI: 90–94% search ASR, with utility dropping to 28.87–42.27%.
    - PIGuard: 49–71% search ASR, with utility 30.93–53.61%.
    - PromptGuard: 75–99% search ASR.
    - No defense: 75–100%.
    - Humans produced 265 successful attacks against Spotlighting and 178 against Sandwiching. — [HTML App. G, Table 7; §5](https://arxiv.org/html/2510.09023v1) (f. 2026-10-19)
  - Human competition, one AgentDojo Slack task pair each:
    - Spotlighting raised per-attempt ASR for gemini-2.5-flash (28.8% to 43.7%), command-a-reasoning (20.5% to 32.8%) and gemini-2.5-flash-thinking (10.7% to 21.4%). It lowered it for grok-4 (10.9% to 2.7%).
    - PromptGuard raised gemini-2.5-flash from 9.3% to 23.8%.
    - MELON cut gemini-2.5-pro-thinking from 11.1% to 0.4%. — [HTML App. E, Tables 2–5](https://arxiv.org/html/2510.09023v1) (f. 2026-10-19)
- **"Adaptive Attacks Break Defenses Against IPI on LLM Agents"** (arXiv 2503.00061, NAACL 2025 Findings). Bypassed all eight defenses tested, consistently above 50% ASR. — [arXiv abs](https://arxiv.org/abs/2503.00061) (f. 2026-10-19; abstract)
- **LLMail-Inject defenses.** The layers were Spotlighting, a text classifier (Prompt Shield-style), an LLM judge and TaskTracker (an activation probe), plus "all combined".
  - Attacks against the LLM judge were least successful. The text classifier let the most through.
  - Stacking all defenses gave 99.8% recall, and no Phase-2 submission beat GPT-4o-mini with all defenses stacked, but stacking raised the false-positive rate to 10%.
  - Almost nothing succeeded against Phi-3 spotlighting, possibly because the model couldn't process the complex formatting (a utility artifact, not robustness). — [arXiv HTML results](https://arxiv.org/html/2506.09956v2) (f. 2026-10-19)
- **Fence and role-boundary forgery in the wild**
  - **GHSA-g5f9-3xfg-p9mf / CVE-2026-61732** (Decepticon, published 2026-09-24, critical). Web-crawl output was wrapped into LLM messages without neutralising ChatML special-token literals. Under bring-your-own-key OpenAI-compatible endpoints (vLLM, SGLang, Ollama, LM Studio, TGI) those literals parse into real role-boundary tokens, forging an authoritative operator turn and leading to command execution. vLLM declined to fix this on 2026-04-21 as "out of scope for the inference layer", so the fix belongs in the application. OpenClaw fixed an analogous issue on 2026-04-22 with a sanitiser applied before wrapping tool output. — [GHSA](https://github.com/advisories/GHSA-g5f9-3xfg-p9mf) (f. 2026-10-19)
  - **GHSA-hmq2-7hp6-7crh / CVE-2026-107717** (Banks, 2026-10-08). Every rendered prompt line that parses as chat-message JSON was promoted to a message, so attacker data could become a privileged `system` message. — [GHSA](https://github.com/advisories/GHSA-hmq2-7hp6-7crh) (f. 2026-10-19)
  - **Agent Data Injection** (arXiv 2607.05120, 2026-07). Attackers inject malicious data disguised as trusted metadata or as tool-call and response formats. This easily bypasses existing IPI defenses. Demonstrated arbitrary-click attacks on Claude in Chrome, Antigravity and Nanobrowser, and RCE or supply-chain attacks on Claude Code, Codex and Gemini CLI. — [arXiv abs](https://arxiv.org/abs/2607.05120) (f. 2026-10-19; abstract)
  - **Formal runtime verification on AgentDojo and STAC** (arXiv 2610.09793, CCS 2026 workshop). Generic obligations flag 70.1% of successful AgentDojo attacks but also fire on 29.3% of benign runs. A single planted line defeats a naive provenance check on 94–99% of runs. Binding provenance to the lookup that produced it closes that gap. — [arXiv abs](https://arxiv.org/abs/2610.09793) (f. 2026-10-19; abstract)

**System-prompt warnings in visual agents (conflicting evidence)**
- They are weak in visual and web-agent settings. VPI-Bench calls them "limited" and "largely ineffective". In the pop-up paper they cut ASR by no more than 25% relative. In EIA they did not counter the attack. — [VPI-Bench](https://arxiv.org/abs/2506.02456), [Pop-ups HTML](https://arxiv.org/html/2411.02391v2), [EIA](https://arxiv.org/abs/2409.11295) (f. 2026-10-19). This **conflicts with** Gemini's text-only exfiltration setting, where the warning defense held at 0.2–5.8% adaptive ASR. — [Gemini HTML](https://arxiv.org/html/2505.14534v1) (f. 2026-10-19)

**Instruction hierarchy and adversarial training**
- **IH-Challenge** (arXiv 2603.10521, 2026-03). RL fine-tuning of GPT-5-Mini raised average IH robustness across 16 benchmarks from 84.1% to 94.1% and cut unsafe behaviour from 6.6% to 0.7%. It "saturates" an internal static agentic prompt-injection evaluation, with minimal capability loss. The dataset is released. — [arXiv abs](https://arxiv.org/abs/2603.10521) (f. 2026-10-19; abstract)
- **"Seeing Through Conflicts"** (arXiv 2609.22234, 2026-09). Text-only IH training only partly transfers to multimodal attacks. It fails when the model has to decode, reconstruct or reason over instructions spread across modalities. Training on images, and especially on mixed modalities, does better and generalises to real images and web-agent safety tasks. — [arXiv abs](https://arxiv.org/abs/2609.22234) (f. 2026-10-19; abstract)
- **Meta-SecAlign** (arXiv 2507.02735). Keeps utility close to undefended models and beats SecAlign on static and GCG attacks across AgentDojo, InjecAgent, WASP and SEP. It still allows 32% ASR on LLMail-Inject, and 96–99% search-attack ASR in "Attacker Moves Second". — [Meta-SecAlign abs](https://arxiv.org/abs/2507.02735), [LLMail-Inject abs](https://arxiv.org/abs/2506.09956), [AMS Table 7](https://arxiv.org/html/2510.09023v1) (f. 2026-10-19)
- **WASP.** Models that use instruction hierarchy (GPT-4o-mini, o1) were still hijacked, with some of the highest intermediate ASRs in the tool-calling loop. — [WASP HTML](https://arxiv.org/html/2504.18575v3) (f. 2026-10-19)
- **Vendor layered defense (Anthropic).** RL training on simulated web content containing injections, classifiers that scan all untrusted content entering the context (including hidden text, manipulated images and deceptive UI), and human red teaming, giving about 1% best-of-N ASR. — [Anthropic research](https://www.anthropic.com/research/prompt-injection-defenses) (f. 2026-10-19). Claude for Chrome also adds site permissions, confirmations before high-risk actions and blocked site categories. — [claude.com](https://claude.com/blog/claude-for-chrome) (f. 2026-10-19)

**Detectors and guard models**
- **WAInjectBench** (arXiv 2510.01354). Text and image detectors catch attacks that use explicit instructions or visible perturbations with moderate to high accuracy. They "largely fail" against attacks that omit explicit instructions or use imperceptible perturbations. — [arXiv abs](https://arxiv.org/abs/2510.01354) (f. 2026-10-19; abstract)
- **Screenshot detectors**
  - SnapGuard (arXiv 2604.25562): F1 0.75, 8x faster than prompting GPT-4o. — [abs](https://arxiv.org/abs/2604.25562)
  - WebAgentGuard (arXiv 2604.12284). — [abs](https://arxiv.org/abs/2604.12284)
  - WARD (arXiv 2605.15030): reports near-perfect out-of-distribution recall and robustness to guard-targeted attacks; these are the authors' own claims. — [abs](https://arxiv.org/abs/2605.15030)
  - WebSentinel (arXiv 2602.03792). — [abs](https://arxiv.org/abs/2602.03792)
  - (all f. 2026-10-19; abstracts)
  - BrowseSafe-Adapt shows adapted attacks reaching 95.41% (see Q1). — [abs](https://arxiv.org/abs/2610.17457) (f. 2026-10-19)
- **DeAction** (arXiv 2602.08995, ICML 2026). A guardrail that checks actions before execution. It cut ASR by more than 90% in online adversarial evaluation without hurting task success. — [arXiv abs](https://arxiv.org/abs/2602.08995) (f. 2026-10-19; abstract)
- **Rennervate** (arXiv 2512.08417, NDSS 2026). Detects and sanitises injections at token level from attention features, and reports robustness to adaptive adversaries. It needs model internals. — [arXiv abs](https://arxiv.org/abs/2512.08417) (f. 2026-10-19; abstract)
- **Hidden-state probes** (arXiv 2606.22864). On Qwen2.5-VL-7B and Mind2Web, a clean-vs-attack AUC of 0.998 is not by itself evidence that the probe detects malicious content. Nuisance-matched controls are needed. — [arXiv abs](https://arxiv.org/abs/2606.22864) (f. 2026-10-19; abstract)
- **Production detector bypass, GHSA-4r3p-w3mc-5v34 / CVE-2026-60086** (PraisonAI, 2026-10-08). The opt-in injection defense only blocked when three or more detector families fired at once, so realistic single- or double-vector injections passed through. — [GHSA](https://github.com/advisories/GHSA-4r3p-w3mc-5v34) (f. 2026-10-19)

**Architecture-level designs**
- **CaMeL, "Defeating Prompt Injections by Design"** (arXiv 2503.18813). Control and data flow are taken from the trusted query, so untrusted data "can never impact the program flow". Capabilities and security policies block exfiltration. It solves 77% of AgentDojo tasks with provable security, against 84% undefended. — [arXiv abs](https://arxiv.org/abs/2503.18813) (f. 2026-10-19; abstract)
  - Caveats: ASR without policies is "not zero". It is vulnerable to side channels, including one bit leaked through attacker-triggered exceptions and a timing channel. — [arXiv HTML §6–7](https://arxiv.org/html/2503.18813v2) (f. 2026-10-19)
- **"Design Patterns for Securing LLM Agents against Prompt Injections"** (arXiv 2506.08837). Patterns with provable resistance, at a utility cost: Action-Selector, Plan-Then-Execute, LLM Map-Reduce, Dual LLM, Code-Then-Execute and Context-Minimization. — [arXiv abs](https://arxiv.org/abs/2506.08837) (f. 2026-10-19; abstract)
  - Action-Selector maps a request to predefined tool calls. Under Plan-Then-Execute, an injection cannot force a tool outside the plan but can still change tool inputs. Map-Reduce processes each untrusted document in isolation. In Dual LLM, the privileged LLM handles quarantined results only by reference. — [arXiv HTML §3](https://arxiv.org/html/2506.08837v3) (f. 2026-10-19)
- **Visual and computer-use architectures**
  - NOVA / CaMeL-for-CUAs (arXiv 2601.09923) uses single-shot branching plans and keeps up to 57% of frontier performance on OSWorld. It is still exposed to branch steering. — [abs](https://arxiv.org/abs/2601.09923)
  - COBRA (arXiv 2610.03089) combines trusted branching plans with ahead-of-time capability constraints on parameters and destinations, giving 0% ASR on STEER-Bench with 97% benign utility. — [abs](https://arxiv.org/abs/2610.03089)
  - SA-CUA (arXiv 2610.18508) derives deterministic trust boundaries from the accessibility tree and adds an endorsement channel, keeping 0% ASR with more utility than CaMeL-CUA. — [abs](https://arxiv.org/abs/2610.18508)
  - Prismata (arXiv 2607.08147) uses contextual least privilege with redaction and capability restriction. — [abs](https://arxiv.org/abs/2607.08147)
  - Untrusted Content Masking (arXiv 2607.05277) uses DOM structure to redact untrusted regions before the agent sees them. — [abs](https://arxiv.org/abs/2607.05277)
  - "Web Agents Should Adopt Plan-Then-Execute" (arXiv 2605.14290) finds every WebArena task compatible with plan-then-execute and 80% completable with a purely programmatic plan. — [abs](https://arxiv.org/abs/2605.14290)
  - (all f. 2026-10-19; abstracts)

### Inferences
- **Delimiters alone do not hold.** Three independent groups (Google DeepMind's Gemini report, the 12-defense adaptive study, and the human competition in that study) show spotlighting dropping to near-zero static ASR and returning to 47–99% adaptive ASR, sometimes making things worse for a given model. The separate failure mode is structural forgery of fences or roles (Decepticon, Banks, ADI, planted provenance lines). So the markers themselves must be sanitised, including chat-template special tokens when a custom or self-hosted endpoint is used.
- Detectors trade utility or false positives for recall, and adaptive attackers beat them. They work as telemetry or as one stacked layer. They are not a boundary.
- Defenses whose effect holds up all rely on **deterministic controls outside the model**: a fixed control flow, capability limits on what outputs can do, and verified side effects. A triage pipeline where pass/fail comes only from a pixel diff is already the most extreme form of "action selector": the model selects nothing that matters to control flow.

### Gaps
- I found no adaptive-attack evaluation of spotlighting or delimiters on **image** inputs. All the delimiter evidence is from text. The effect on pixel-borne instructions is inferred, since a fence can't wrap pixels.
- I did not find measured results for datamarking or encoding under adaptive attack, only for spotlighting variants in the Gemini report and the 12-defense study.
- Microsoft MSRC's defense-in-depth write-up and Google's layered-defense blog were not fetched.

---

## Q3. Product-specific applicability

Product-specific analysis is withheld under SECURITY.md and remains in private tracking. Public evaluation and approval requirements are tracked in #286 and #287.

## Q4. 2025–2026 incidents, CVEs and GHSAs involving prompt injection in AI code-review bots, CI-integrated AI actions, QA/testing agents or MCP servers; applicable OWASP entries

### Takeaway
2026 is the year prompt injection in CI and code review became mainstream. Cross-vendor disclosures include Comment and Control (Claude Code Security Review, Gemini CLI Action, Copilot Agent), GitLost (GitHub Agentic Workflows) and PromptPwnd. GHSAs and CVEs now exist for claude-code-action, Gemini CLI/run-gemini-cli, Claude Code and Copilot CLI, along with dozens of MCP servers where injection is the stated attack precondition. NVD records whose descriptions contain the exact phrase "prompt injection" grew from 18 in 2024 to 34 in 2025 and 95 in 2026 so far. Vendor disclosure is uneven: some cross-vendor CI exploits got no CVE or advisory.

### Cited Findings

**CI and code-review agents**
- **Comment and Control.** Disclosed 2026-04-15 by Aonan Guan, Zhengyu Liu and Gavin Zhong; CSA note published 2026-04-17.
  - Affected Anthropic's Claude Code Security Review, Google's Gemini CLI Action and GitHub's Copilot Agent.
  - Instructions were placed in PR titles, issue bodies and comments.
  - Exposed API keys, GitHub tokens, and a Copilot API token and nonce, which were posted back through GitHub comments or API calls with no external server involved.
  - Copilot's runtime protections were partly bypassed by hiding the payload in HTML comments.
  - Bounties were $100 (Anthropic), $1,337 (Google) and $500 (Microsoft). Anthropic rated it 9.3 and then 9.4. None of the vendors assigned a CVE or published an advisory. — [CSA research note](https://labs.cloudsecurityalliance.org/research/csa-research-note-comment-control-github-prompt-injection-20/) (f. 2026-10-19)
- **GitLost** (Noma Labs; The Register, 2026-07-07). An attacker with no access opens an issue in an org's public repo. GitHub Agentic Workflows (Claude or Copilot) then read a private repo's README and post it publicly. The proposed fix was documentation, which hadn't been published at the time. Noma and the article say the issue can't be fully fixed in code. — [The Register](https://www.theregister.com/a/5267924) (f. 2026-10-19)
- **PromptPwnd** (Aikido, around December 2025). Issue, PR or commit text injected into the prompts of Gemini CLI, Claude Code Actions, Codex Actions and GitHub AI Inference workflows that had powerful tokens. Google fixed its own Gemini CLI workflow within four days. — [CSO Online via search snippet](https://csoonline.com/article/4101751/ai-in-ci-cd-pipelines-can-be-tricked-into-behaving-badly-2.html) (f. 2026-10-19; search snippets only; the primary Aikido post was not fetched and the "Fortune 500" claim is unverified)
- **CamoLeak** (Legit Security; published 2025-10-08, updated 2026-02-12, fixed 2025-08-14, CVSS 9.6). See A7. The CSA note refers to it as CVE-2025-59145, which I did not verify in NVD. — [Legit Security](https://www.legitsecurity.com/blog/camoleak-critical-github-copilot-vulnerability-leaks-private-source-code), [CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-comment-control-github-prompt-injection-20/) (f. 2026-10-19)
- **GHSA-8q5r-mmjf-575q / CVE-2026-47751** (anthropics/claude-code-action below 1.0.74; GHSA 2026-06-10, medium; CVSS v4 5.3 in NVD). A malicious `.mcp.json` in a PR led to RCE on the runner and secret exfiltration. — [GHSA](https://github.com/advisories/GHSA-8q5r-mmjf-575q), [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-47751) (f. 2026-10-19)
- **GHSA-wpqr-6v78-jr5g / CVE-2026-12537** (@google/gemini-cli below 0.39.1 and run-gemini-cli below 0.1.22; 2026-04-24, critical). Folder trust in headless mode and allowlist bypasses under `--yolo`. — [GHSA](https://github.com/advisories/GHSA-wpqr-6v78-jr5g) (f. 2026-10-19)
- **CVE-2026-54316** (Claude Code 0.2.54 to 2.1.163; 2026-06-23). huggingface.co was pre-approved for WebFetch, so injected content could open a covert exfiltration channel through download counters. — [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-54316) (f. 2026-10-19)
- **GHSA-phf6-hm3h-x8qp** (broadinstitute/cromwell, 2025-05-28, critical). GitHub Actions secrets exfiltrated through `issue_comment`. This is a CI injection class, not necessarily an LLM. — [GHSA](https://github.com/advisories/GHSA-phf6-hm3h-x8qp) (f. 2026-10-19; listing only)

**Coding agents and IDEs, where injection is the precondition** (from NVD descriptions, f. 2026-10-19)
- Copilot CLI: crafted bash parameter expansion bypassed the read-only check. — [CVE-2026-29783](https://nvd.nist.gov/vuln/detail/CVE-2026-29783)
- Codex macOS app: rendering Markdown remote images allowed exfiltration. — [CVE-2026-14898](https://nvd.nist.gov/vuln/detail/CVE-2026-14898)
- Eclipse Theia:
  - Markdown image exfiltration. — [CVE-2026-22551](https://nvd.nist.gov/vuln/detail/CVE-2026-22551)
  - Adversarial file and directory names treated as prompt content. — [CVE-2026-44688](https://nvd.nist.gov/vuln/detail/CVE-2026-44688)
  - Auto-loaded `.prompts` templates overriding system prompts. — [CVE-2026-46580](https://nvd.nist.gov/vuln/detail/CVE-2026-46580)
- Cursor:
  - Mermaid image exfiltration. — [CVE-2025-54132](https://nvd.nist.gov/vuln/detail/CVE-2025-54132), [CVE-2025-61589](https://nvd.nist.gov/vuln/detail/CVE-2025-61589)
  - Writing the MCP config file without approval. — [CVE-2025-54135](https://nvd.nist.gov/vuln/detail/CVE-2025-54135)
  - Case and path quirks in protected-file checks. — [CVE-2025-59944](https://nvd.nist.gov/vuln/detail/CVE-2025-59944), [CVE-2025-64108](https://nvd.nist.gov/vuln/detail/CVE-2025-64108)
  - Instructions on a visited website combined with an allowlist bypass. — [CVE-2026-31854](https://nvd.nist.gov/vuln/detail/CVE-2026-31854)
  - Sandbox escape by writing `.git` config. — [CVE-2026-26268](https://nvd.nist.gov/vuln/detail/CVE-2026-26268)
- Windsurf: attacker HTML caused MCP config modification. — [CVE-2026-30615](https://nvd.nist.gov/vuln/detail/CVE-2026-30615)

**MCP servers** (from NVD and GHSA, f. 2026-10-19)
- Context7 poisoned instructions: [CVE-2026-75130](https://nvd.nist.gov/vuln/detail/CVE-2026-75130).
- Kong Konnect MCP, indirect injection leading to unintended API requests: [CVE-2026-13341](https://nvd.nist.gov/vuln/detail/CVE-2026-13341).
- Ansible Lightspeed MCP path traversal through injection: [CVE-2026-44192](https://nvd.nist.gov/vuln/detail/CVE-2026-44192).
- browse-mcp: [CVE-2026-55557](https://nvd.nist.gov/vuln/detail/CVE-2026-55557).
- Trinity, agent keys performing human-only operations: [CVE-2026-108756](https://nvd.nist.gov/vuln/detail/CVE-2026-108756).
- WeKnora, tool-name collision letting a malicious remote MCP server hijack tools: [CVE-2026-30856](https://nvd.nist.gov/vuln/detail/CVE-2026-30856).
- Amazon MQ MCP, credentials obtained through injection: [CVE-2026-18655](https://nvd.nist.gov/vuln/detail/CVE-2026-18655).
- github.com/advisories search results also list many 2026 MCP advisories, for example MCP Atlassian arbitrary file read, DBHub DNS rebinding, and mcp-gitlab safety-control bypasses. — [GHSA search](https://github.com/advisories?query=prompt+injection) (f. 2026-10-19; listing titles)
- Client posture study (arXiv 2603.21642, 2026-03). Seven MCP clients (Claude Desktop, Claude Code, Cursor, Cline, Continue, Gemini CLI, Langflow) differ widely. Claude Desktop has strong guardrails. Cursor is highly susceptible to cross-tool poisoning and hidden parameters. — [arXiv abs](https://arxiv.org/abs/2603.21642) (f. 2026-10-19; abstract)

**Counts.** The NVD 2.0 API returned 149 CVEs whose description contains the exact phrase "prompt injection". By publication year: 2023: 2, 2024: 18, 2025: 34, 2026 through 2026-10-19: 95. — [NVD API query](https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=prompt%20injection&keywordExactMatch) (f. 2026-10-19). The GHSA REST filter `cwes=1427` (CWE-1427, improper neutralisation of LLM prompt input) returned 0 reviewed advisories, so CWE tagging is not a reliable way to find these advisories. — GitHub REST `/advisories?cwes=1427` (f. 2026-10-19)

**OWASP**
- **LLM01:2025 Prompt Injection.** Covers direct and indirect injection, including input invisible to humans, and warns about cross-modal attacks that hide instructions in images.
  - Mitigations:
    - constrain behaviour
    - define and validate output formats with deterministic code
    - filter inputs and outputs
    - least privilege, with privileged functions handled in code
    - human approval for high-risk actions
    - segregate and clearly label untrusted content
    - adversarial testing
  - Scenarios include #7 (multimodal hidden prompt), #6 (a résumé with split payloads that produces a positive recommendation, which is classification manipulation) and #2 (hidden webpage instructions leading to exfiltration). The sidebar lists LLM05 Improper Output Handling and LLM06 Excessive Agency. — [OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) (f. 2026-10-19)
- **OWASP Top 10 for Agentic Applications 2026** (released 2025-12-09). — [OWASP resource page](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) (f. 2026-10-19; the page only has a download link). Entry names from BleepingComputer, a secondary source:
  - ASI01 Agent Goal Hijack
  - ASI02 Tool Misuse & Exploitation (example: the Amazon Q extension poisoned by a malicious PR with destructive AWS CLI instructions)
  - ASI03 Identity & Privilege Abuse
  - ASI04 Supply Chain Vulnerabilities (examples: a malicious MCP package and an npm impersonation)
  - ASI05 Unexpected Code Execution (example: command-injection RCEs in Claude Desktop extensions triggered by hidden instructions in web search results)
  - ASI06 Memory & Context Poisoning
  - ASI07 Insecure Inter-Agent Communication
  - ASI08 Cascading Failures
  - ASI09 Human-Agent Trust Exploitation
  - ASI10 Rogue Agents
  — [BleepingComputer](https://www.bleepingcomputer.com/news/security/the-real-world-attacks-behind-owasp-agentic-ai-top-10/) (f. 2026-10-19)

### Inferences
- Across incidents, the same root causes repeat:
  1. Attacker-authored repo or issue content is concatenated into an agent's prompt.
  2. The agent runs with secrets or write tokens.
  3. Output channels (comments, Markdown images, allowlisted hosts) carry data out.
  4. Config is loaded from the attacker's branch.
- For the product, the OWASP entries that apply are:
  - LLM01, LLM05 and LLM06.
  - ASI01 for the fix generator and the coding agent.
  - ASI02 for promote and verify misuse.
  - ASI03, since a self-asserted confirm flag stands in for a human-only privilege.
  - ASI07, since PR comments and MCP outputs become inputs to other agents.
  - ASI09, since reviewers trust "expected" labels.
- Uneven vendor disclosure (Comment and Control had no CVE) means advisory feeds will under-report this class. A tool that sits in CI should not depend on upstream CVEs to learn about risks in its own integration.

### Gaps
- The primary write-ups for Aikido PromptPwnd and Guan's Comment and Control were not fetched; I used the CSA note as a second-hand primary.
- SecurityWeek's article on a "critical vulnerability in GitHub Agentic Workflows" returned 403, so I could not identify a specific GHSA or CVE for it.
- A search snippet mentioned a Microsoft-reported issue in the Claude Code GitHub Action, patched in May; I did not verify it.
- I found no CVE or GHSA for a dedicated QA or visual-testing agent, or for a visual-regression AI feature.
- The CamoLeak CVE ID was not verified in NVD.

---

## Q5. Is there a published evaluation protocol that adds injection test cases to an LLM-judge or classifier evaluation?

### Takeaway
Yes, several, and they can be combined into an injection-fixture suite for an advisory judge.
- Meta's CyberSecEval 3 has a visual prompt-injection benchmark: a system prompt, user text and an image, with a judge LLM and a per-case judge question, and results grouped by technique, risk category and direct versus indirect injection.
- BrowseSafe++ pairs each attacked page with a clean twin and provides several views, including screenshots.
- AgentDojo reports utility, utility under attack, and targeted ASR.
- VisInject separates "the output was disturbed" from "the attacker's target was emitted".
- The judge-specific work (JudgeDeceiver [BACKGROUND], RobustJudge, StableJudge, LLM-as-a-judge injection, relevance-judgment injection, LongPIBench with a code-review scenario) shows judges can be hijacked and argues for adaptive and out-of-distribution attack variants.

### Cited Findings
- **CyberSecEval 3 visual prompt injection** (Meta PurpleLlama). Each test case is a system prompt, user text and a user image. A separate judge LLM uses the case's judge question to decide whether the injection succeeded. Cases can be run N times to account for randomness. Results are grouped by injection technique, risk category (security-violating or logic-violating) and injection type (direct or indirect). The dataset is on Hugging Face as `facebook/cyberseceval3-visual-prompt-injection`. — [PurpleLlama CybersecurityBenchmarks README](https://github.com/meta-llama/PurpleLlama/blob/main/CybersecurityBenchmarks/README.md) (f. 2026-10-19 via GitHub contents API); paper: [CyberSecEval 3, arXiv 2408.01605](https://arxiv.org/abs/2408.01605) (f. 2026-10-19; abstract)
- **BrowseSafe++.** Each attacked page has a clean control copy and a user task with an expected answer, in four views including a screenshot. Adaptive revision raised success from a few percent to 95.41%. — [arXiv abs](https://arxiv.org/abs/2610.17457) (f. 2026-10-19)
- **AgentDojo.** An extensible framework with tasks, security test cases, and pluggable attacks, defenses and adaptive attacks. — [arXiv abs](https://arxiv.org/abs/2406.13352) (f. 2026-10-19). Its Table 7 usage (utility, static ASR, adaptive ASR, queries to first success) is shown in [AMS HTML](https://arxiv.org/html/2510.09023v1) (f. 2026-10-19).
- **VisInject's dual-axis protocol.** A deterministic Ratcliff-Obershelp drift score measures influence, and an ordinal judge scale measures precise injection. The judge was calibrated against a second model (Cohen's κ = 0.77). A SHA-256 cache of all inputs ships with the paper so others can re-derive the numbers exactly. — [arXiv abs](https://arxiv.org/abs/2605.01449) (f. 2026-10-19)
- **Reporting conventions**
  - Report Clopper-Pearson upper bounds when there are zero successes (0/140 gives a 2.60% upper bound). Release the optimised strings so results can be reproduced. — [2606.05233](https://arxiv.org/abs/2606.05233)
  - Report false-positive rate alongside recall; stacking defenses raised FPR to 10%. — [LLMail-Inject HTML](https://arxiv.org/html/2506.09956v2)
  - Use nuisance-matched controls for probes. — [2606.22864](https://arxiv.org/abs/2606.22864)
  - (f. 2026-10-19)
- **Attacks on judges**
  - [BACKGROUND, 2024-03-26, CCS] JudgeDeceiver optimises an injected sequence so an LLM judge picks the attacker's candidate. Known-answer, perplexity and windowed-perplexity detection were insufficient. — [arXiv abs](https://arxiv.org/abs/2403.17710) (f. 2026-10-19)
  - GCG-optimised suffixes against LLM judges: the Comparative Undermining Attack exceeds 30% ASR on 3B open models, and the Justification Manipulation Attack also works. — [2505.13348](https://arxiv.org/abs/2505.13348) (f. 2026-10-19)
  - RobustJudge: 15 attacks, 8 defenses, 13 models, pointwise and pairwise. Judges remain susceptible, a combined attack is strongest and transfers best, and no defense dominates. — [2506.09443](https://arxiv.org/abs/2506.09443) (f. 2026-10-19)
  - StableJudge (2026-10): score-hijacking injection; a 0.13B "Sentry" that localises and sanitises spans before scoring, evaluated on held-out and out-of-distribution attack variants. — [2610.16814](https://arxiv.org/abs/2610.16814) (f. 2026-10-19)
  - Multilingual injections inflate LLM relevance scores and evade defenses, and adapted variants bypass modified defenses. — [2607.10080](https://arxiv.org/abs/2607.10080) (f. 2026-10-19)
  - Hidden prompts in PDFs mislead LLMs even on trivial multiple-choice and true/false questions. — [2508.13214](https://arxiv.org/abs/2508.13214) (f. 2026-10-19)
  - LongPIBench (EMNLP 2026 Findings) covers peer review, résumé screening, **code review** and email. Simple heuristic injections bypass state-of-the-art defenses in long contexts. — [2608.28411](https://arxiv.org/abs/2608.28411) (f. 2026-10-19)
  - Real-world AI peer-review injection: 18 arXiv manuscripts in July 2025 hid commands asking for a positive review, using white or microscopic text. — [2507.06185](https://arxiv.org/abs/2507.06185) (f. 2026-10-19). Presentation-only revisions reached 75.1% ASR and +1.21/10 mean score gain against three AI reviewers. — [2606.13044](https://arxiv.org/abs/2606.13044) (f. 2026-10-19)
- **Classifier direction matters.** Typographic attacks on VLM detectors show strong asymmetry between the two directions, and reasoning modes are more vulnerable. — [2609.39662](https://arxiv.org/abs/2609.39662) (f. 2026-10-19)

### Inferences
Below is a sketch of injection fixtures for the already-filed advisory-judge evaluation. The fixture categories come from the cited attack families. Their effect on a triage model has not been measured.
- **Paired design**, following BrowseSafe++. Every attacked fixture has a clean twin with the identical underlying diff.
- **Families:**
  - visible "intentional change" text
  - faint low-contrast text (Brave)
  - text that appears only after downscaling (Trail of Bits)
  - DOM-only hidden text at opacity 0, off-screen or in aria attributes (EIA, Anthropic)
  - fence-lookalike and chat-template special-token strings in DOM text (Decepticon, Banks)
  - instruction-free "looks like a redesign" cues (STEER-Bench, ADI, presentation-only)
  - pop-up or modal overlays (the pop-up paper)
  - payloads aimed at the fix generator (requests for remote `url()` or `@import`, or for hiding regions)
  - payloads aimed at the PR comment (HTML comments, Markdown images)
  - payloads split across baseline, current and diff, or across image and DOM (OWASP Scenario #6, StepJack)
- **Metrics:**
  - label-flip rate against the clean twin, in **both** directions (regression to expected, and expected to regression)
  - rate at which the attacker's target text is emitted
  - fix-policy violations
  - output-handling violations
  - false-positive or behaviour change on clean twins
  - an exit-code invariance assertion, which is deterministic and should be 100%
  - Clopper-Pearson bounds on all rates
- **Adaptive tier:** a small best-of-N mutation loop per release, plus per-provider runs, since vendor hardening is domain-specific (AMS, 2606.05233).

### Gaps
- I found no published injection protocol for **visual-diff** or regression-classification judges specifically. CyberSecEval 3's visual prompt-injection benchmark is the closest image-based protocol.
- I did not open the CyberSecEval 3 visual prompt-injection dataset card, so its size and the composition of its techniques were not extracted.

---

## Roadmap implications

Product-specific recommendations are withheld under SECURITY.md. For public scope, use #286 (advisory evaluation) and #287 (human approval authority), and consult docs/ROADMAP.md for the accepted plan. The literature and third-party disclosures above are public research, not claims of reproduced vulnerabilities in Frontguard.

## Query log

All queries are category-level. None contained the product's name, domain, owner or org, internal file names, or code.

### WebSearch queries (verbatim)
1. `Anthropic prompt injection browser use mitigations attack success rate`
2. `OWASP Top 10 for Agentic Applications 2026 agent goal hijack`
3. `prompt injection GitHub Actions AI agent workflow vulnerability disclosure`
4. `OpenAI Atlas hardening prompt injection automated red teaming reinforcement learning`
5. `"Comment and Control" prompt injection Claude Code Security Review Gemini CLI Copilot secrets`
6. `Aikido PromptPwnd GitHub Actions GitLab CI AI agents prompt injection`
7. `Aonan Guan "Comment and Control" blog prompt injection CI secrets`
8. `OWASP agentic top 10 ASI05 unexpected code execution ASI09 human-agent trust exploitation list`

### arXiv API `search_query` strings (verbatim; https://export.arxiv.org/api/query)
- `ti:"VPI-Bench"`. The first attempt over http returned an empty body; it was retried over https.
- `ti:"Environmental Injection Attack"`
- `ti:WASP AND abs:"prompt injection"`
- `ti:AgentDojo`
- `ti:"Pop-ups" AND ti:agents`
- `ti:WebInject`
- `ti:"Defeating Prompt Injections by Design"`
- `ti:"Design Patterns for Securing LLM Agents"`
- `ti:Spotlighting AND abs:"prompt injection"`
- `ti:"Attacker Moves Second"`
- `ti:"Adaptive Attacks Break Defenses"`
- `ti:"Defending Gemini"`
- `ti:"LLMail-Inject"`
- `ti:"Malicious Image Patches"`
- `ti:"Dissecting Adversarial Robustness of Multimodal"`
- `ti:AdvWeb` (0 results)
- `ti:AdvAgent`
- `ti:RedTeamCUA`
- `ti:"OS-Harm"`
- `ti:"prompt injection" AND ti:oncology`
- `ti:JudgeDeceiver` (0 results)
- `ti:MCPTox`
- `ti:"Fine-Print"` (irrelevant results only)
- `ti:"Environmental Distractions"`
- `ti:"Meta SecAlign"`
- `ti:"Commercial LLM Agents"`
- `ti:"Cross-Modal Prompt Injection"`
- `ti:BrowseSafe`
- `ti:"peer review" AND abs:"prompt injection"`
- `ti:CyberSecEval`
- `ti:typographic` (sorted by submittedDate, descending)
- `ti:"instruction hierarchy"` (sorted). The first attempt timed out and a second was rate-limited; the third succeeded.
- `abs:"visual prompt injection"` (sorted). Failed on every attempt (HTTP 503, "Rate exceeded", timeouts); **no results obtained**.
- `abs:"computer-use" AND abs:"prompt injection"` (sorted; rate-limited once, then succeeded)
- `abs:"web agents" AND abs:"prompt injection"` (sorted; rate-limited once, then succeeded)
- `abs:"tool poisoning"` (sorted; rate-limited once, then succeeded)
- `abs:"LLM-as-a-judge" AND abs:"prompt injection"` (sorted; rate-limited once, then succeeded)
- `abs:screenshot AND abs:"prompt injection"` (sorted; rate-limited once, then succeeded)
- `abs:"code review" AND abs:"prompt injection"` (sorted; rate-limited once, then succeeded)
- `abs:"GitHub Actions" AND abs:"prompt injection"` (sorted). Rate-limited and not retried; **no results obtained**.
- `ti:"Cannot Reliably Judge"`
- `id_list` metadata lookups, which are not searches:
  - Batch 1: 2601.09923, 2603.15714, 2606.22864, 2606.05233, 2608.06477, 2608.02018, 2610.03089, 2610.18508, 2607.08147, 2607.05277, 2606.20717, 2605.15030, 2605.14290, 2604.25562, 2602.09222, 2602.03792, 2512.23128, 2510.01354, 2510.04257, 2512.11899
  - Batch 2: 2609.39662, 2609.31403, 2605.01449, 2604.07831, 2609.22234, 2603.10521, 2610.16814, 2505.13348, 2403.17710, 2607.10080, 2508.13214, 2603.21642, 2601.17548, 2512.08290, 2604.07536, 2608.28411, 2607.05120, 2606.13044, 2507.06185, 2604.12284, 2512.08417, 2408.01605, 2602.08995

### NVD and GitHub advisory queries (verbatim parameters)
- NVD 2.0 API: `keywordSearch=prompt injection`, `keywordExactMatch`, `resultsPerPage=2000`. Run twice; the first run failed on a local parser error.
- NVD 2.0 API `cveId=` lookups: CVE-2026-44688, CVE-2026-108756, CVE-2026-55557, CVE-2026-14898, CVE-2026-29783, CVE-2026-75130, CVE-2026-11371, CVE-2026-47751, CVE-2026-54316.
- GitHub REST `GET /advisories` with `cwes=1427`, `per_page=100`, paginated (0 results).
- GitHub REST `GET /advisories` with `ecosystem=actions`, `per_page=100`, paginated, then filtered locally by the regex `prompt|LLM|AI agent|Claude|Gemini|Copilot|Codex|model|agent`.
- GitHub REST `GET /advisories/{id}`: GHSA-8q5r-mmjf-575q, GHSA-wpqr-6v78-jr5g, GHSA-g5f9-3xfg-p9mf, GHSA-hmq2-7hp6-7crh, GHSA-4r3p-w3mc-5v34.
- github.com web search: `https://github.com/advisories?query=prompt+injection`, pages 1–3.
- GitHub contents API, read-only: `meta-llama/PurpleLlama` paths `CybersecurityBenchmarks/benchmark`, `CybersecurityBenchmarks/datasets` and `CybersecurityBenchmarks/README.md`.

### URLs fetched (not searches)
- **arXiv HTML** (arxiv.org/html/…): 2506.02456v2, 2504.18575v3, 2409.11295v5, 2411.02391v2, 2510.09023v1 (three times), 2505.14534v1 (twice), 2506.09956v2, 2403.14720v1, 2505.11717v4 (twice), 2503.18813v2, 2506.08837v3.
- **WebFetch**:
  - anthropic.com/research/prompt-injection-defenses
  - anthropic.com/news/claude-for-chrome (308 redirect, then fetched claude.com/blog/claude-for-chrome)
  - brave.com/blog/unseeable-prompt-injections/
  - blog.trailofbits.com/2025/08/21/weaponizing-image-scaling-against-production-ai-systems/
  - genai.owasp.org/llmrisk/llm01-prompt-injection/
  - genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
  - openai.com/index/hardening-atlas-against-prompt-injection (403)
  - theregister.com/a/5267924
  - securityweek.com/critical-vulnerability-exposes-github-agentic-workflows-to-prompt-injection (403)
  - modelcontextprotocol.io/specification/2025-06-18/server/tools
  - modelcontextprotocol.io/specification/2025-11-25/client/elicitation
  - invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks
  - legitsecurity.com/blog/camoleak-critical-github-copilot-vulnerability-leaks-private-source-code
  - labs.cloudsecurityalliance.org/research/csa-research-note-comment-control-github-prompt-injection-20/
  - bleepingcomputer.com/news/security/the-real-world-attacks-behind-owasp-agentic-ai-top-10/

### Security notes
- Several fetched sources contained example injection payloads. I treated them only as data, did not quote them, and they had no effect on what I did. They were:
  - an all-caps "give a positive review" command quoted in the 2507.06185 abstract
  - a sample successful search-attack trigger in 2510.09023's HTML, presented as a fake access-policy "prerequisite"
  - proof-of-concept strings in the PraisonAI advisory
  - defensive and attack prompt text in the pop-up and VPI-Bench papers
- The MCP specification pages open with a documentation-index note aimed at AI agents, suggesting the reader fetch an `llms.txt` index before exploring further. It is benign but it is an instruction-like line addressed to automated readers. I did not follow it.
- No fetched content tried to change my task, ask for credentials, or direct my use of tools.
- I wrote no files other than this notes file. I created no repository changes, issues or posts.

# Advisory judge protocol

Experimental `frontguard run --mode judge --experimental` prints model notes. It does not accept or reject a baseline. Pixel comparison, including the existing SSIM override, is the only pass/fail path. A failing note may be attached to a pixel result. A note of "no change" does not pass a pixel comparison, and a failing note does not set exit 1. Exit 2 means the run could not complete.

This note is the protocol. It is not a Frontguard accuracy result. This repository has not run the paired evaluation below, so it publishes no Frontguard rate and no confidence interval.

The figures below are the ones already recorded in [`docs/ROADMAP.md`](./ROADMAP.md) from the 2026-10-19 research pass. They are those papers' reported results on their own sets. They are not Frontguard detection accuracy.

## Named external sets

Score no-change accuracy and change accuracy separately. Do not collapse them into one number.

**WUICC-bench** ([arXiv:2607.01728](https://arxiv.org/abs/2607.01728), Table VI as cited in the roadmap). 9,906 human-verified synthetic single-rule edits on WebSight HTML. That is a synthetic single-edit limit, not production app UI.

- Naive pixel comparison: 0.00% no-change accuracy and 100% change accuracy on visible non-meaningful edits.
- A 0.1 difference threshold plus anti-aliasing, as cited on the tracking issue: 6.72% no-change accuracy and 97.93% change accuracy.
- Trained captioners keep change accuracy above 93% while no-change accuracy spans about 85.82–97.39%. Best BLEU-4 is 0.2571.
- Zero-shot Llama-3.2-11B-Vision-Instruct is about 21.64% / 79.39%. Qwen2-VL-7B-Instruct is about 99.63% / 65.68%. Each fails one side.

**LLMShot** ([arXiv:2507.10062](https://arxiv.org/abs/2507.10062)) is a negative control, not a web pixelmatch result. It is 17 forced iOS XCTest failures.

- Gemma 3 12B: precision 66.67%, F1 74.42%.
- The 4B prompt-ignore arm: F1 13.79% (ignore-from-analysis) and 16.67% (ignore-from-ground-truth).
- Do not generalize this iOS study to web pixel diffs. Do not ship a prompt that suppresses a pixelmatch failure.

A scalar "semantic diff" is not a threshold. LLMShot's semantic-diff scalar is about 0.921 on the 4B model and about 0.079 on the 12B model for the same failures. The split across model sizes is why a single cutoff cannot be a gate.

## Side probes, not detection accuracy

- **VisRefiner** ([arXiv:2602.05998](https://arxiv.org/abs/2602.05998)) is a side probe. Its Design2Code layout averages are not regression precision or recall, and they are not Frontguard detection accuracy.
- **XBIDetective** ([arXiv:2512.15804](https://arxiv.org/abs/2512.15804)) is a caution. Its 79% discrepancy accuracy is on Firefox-versus-Chrome pairs, not baseline-versus-candidate, and it is not Frontguard detection accuracy.
- **UI-Lens** (CVPR 2026) is negative evidence for using a general multimodal model as a display-quality judge. The roadmap records nine models near chance on text overflow (50.04%), cropped content (54.07%), and container overlap (54.14%). Those class scores are not a Frontguard pass rate.

## How a future Frontguard eval would be scored

Do not treat a blog score or a frontier-model demo as this eval.

1. Build paired fixtures: a clean pair with no meaningful UI change, and an attacked pair that hides an instruction in the page or the image. Keep the pixel diff ground truth independent of the model.
2. Run the judge in both directions. Report no-change accuracy on the clean pairs and change accuracy on the attacked and edited pairs. Publish the set name, the count, and the denominator.
3. When a run exists, report a Clopper-Pearson interval for each rate. Do not publish an interval for a run this repository has not executed.
4. Keep UI-Lens failure classes (overflow, crop, overlap) as cases the model is not assumed to catch. A miss there does not flip a pixelmatch result.
5. Injection text in the page must not change the exit code. The pixel gate stays in control.

## Horizontal overflow fixtures

`validation/fixtures/overflow` is the set for the deterministic horizontal-overflow check. This repository has not run the advisory judge on that set, so it publishes no Frontguard judge accuracy for overflow, cropping, or overlap. UI-Lens remains the external negative evidence: nine models scored 50.04% on text overflow, 54.07% on cropped content, and 54.14% on container overlap. Those figures are not a Frontguard rate. The geometry check's precision on that set is in [`validation/results-overflow.md`](../validation/results-overflow.md). A judge note does not change the pixel exit code.

## What this mode must not do

- It must not be described as accepting or rejecting a baseline.
- It must not add a prompt option that ignores a category and suppresses pixelmatch.
- It must not call a captioner or a hosted visual-AI triage the gate.
- It must not deploy a cloud judge.

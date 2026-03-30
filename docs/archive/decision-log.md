# Decision Audit Trail

Extracted from PLAN.md — decisions made during the v0.1 autoplan review process.

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO-0C | Ship Approach A (full product) + add B (Playwright plugin) | P1+P6 | Product is built, ship it. Plugin is low-effort addition. | C (production monitoring) — different audience, defer |
| 2 | CEO-0C | TASTE: Subagent argues B or C should be primary | — | Surfaced at gate | — |
| 3 | CEO-S1 | Fix SSIM crash (unguarded computeSSIM) | P5 | Explicit error handling > silent crash. 1 line fix. | — |
| 4 | CEO-S2 | Flag cloud API persistence as blocker for paid tier | P3 | In-memory Map is fine for demo, not for $29/mo | — |
| 5 | CEO-S6 | Flag pipeline.ts test gap | P1 | 790 LOC orchestrator with 0 direct tests is a risk | — |
| 6 | Design | Fix accessibility P0 items (toggles, contrast, ARIA) | P1 | WCAG AA failure is a legal and ethical requirement | — |
| 7 | Design | Add 768px/1024px dashboard breakpoints | P1 | Single breakpoint at 640px leaves tablet unusable | — |
| 8 | Design | Unify card bg/border colors across pages | P5 | Explicit consistency > subtle drift | — |
| 9 | Design | TASTE: Primary button color (blue vs white) | — | Surfaced at gate | — |
| 10 | Eng | Delete one of two cloud API implementations | P4+P5 | DRY. Two divergent impls will drift. Keep deployed one. | — |
| 11 | Eng | Fix XSS in cloud report script tag | P5 | JSON.stringify for JS context. 1 line fix. | — |
| 12 | Eng | Add auth to deployed cloud API | P1 | Zero auth on mutating endpoints = public write access | — |
| 13 | Eng | Add LRU cap to in-memory Map | P3 | Pragmatic fix: max 1000 runs, evict oldest | — |
| 14 | Eng | Fix threshold unit documentation | P5 | Explicit convention prevents contributor bugs | — |
| 15 | Eng | TASTE: Pipeline test strategy (unit vs E2E-only) | — | Surfaced at gate | — |
| 16 | Eng | TASTE: Ship CLI first, delay cloud launch | — | Surfaced at gate | — |

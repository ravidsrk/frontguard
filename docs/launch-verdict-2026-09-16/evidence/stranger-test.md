# C-7 evidence — stranger test 2026-09-16

Agent: isolated subagent `stranger-test-c7` (worktree-isolated, base 947f619,
parent changes excluded). No repo context; fresh shallow clone to
/tmp/stranger-20260916/frontguard-readonly for README only; published
`@frontguard/cli@0.2.2` via `npx -p` (never repo source); isolated
PLAYWRIGHT_BROWSERS_PATH; throwaway git repo + 3-route static app.

## Verdict: PASS — first successful comparison at 157s of 900s budget

Clock: 13:24:03 UTC (epoch 1789565043) → STEP7 end 13:26:40 UTC (1789565200).

| Step | README ref | Duration | Exit | Elapsed |
|---|---|---|---|---|
| S1 browser install | L58 | 22s | 0 | 22s |
| S2 init --yes | L64 | 0s | 0 | 30s |
| S3 doctor | L65 | 1s | 0 | 52s |
| S4 git add+commit | L69 | 0s | 0 | 61s |
| S5 app start (+30s setsid retry, H1 harness) | L72-76 | ~31s | ok | 134s |
| S6 update-baselines | L81 | 4s | 0 | 146s |
| S7 run (first comparison) | L82 | 2s | 0, 9/9 match | **157s — budget stop** |
| S8 run after SMALL css change | — | 3s | 0 (missed, expected 1) | 172s |
| S8b run after LARGE css change | — | 3s | 1, 6 regressions | 201s |

743s spare. Transcript (durable copy): `stranger-transcript.txt` in this
directory (574 lines; original at /tmp/stranger-20260916/transcript.txt).

## Independent corroboration (second route, by driver)

- Transcript line count 574 ✓; STEP7 shows `All pages match baselines`, 9/9,
  exit 0 (lines 244-285) ✓; S8 exit 0 miss (line 336) ✓; S8b `REGRESSIONS (6)`,
  exit 1 (lines 388-421) ✓.
- Epoch arithmetic: 1789565200 - 1789565043 = 157s ✓.
- F1 corroborated: generated config `routes: ['/','/about','/contact']`
  (line 125) vs app routes / /about /pricing; `/contact -> 404` (line 205)
  baselined silently, reported ✓✓✓ in all three runs.
- F3/F5 corroborated as 0.2.2-vs-source skew: transcript shows 0.2.2 init
  "On first run, Frontguard captures baselines" and doctor "created
  automatically on your first run"; current source (`init.ts:384-403`,
  `doctor.ts:326-329`) already says update-baselines → run. Both close on
  0.2.3 publish, no code change needed.
- F9 nuance: `images/` empty on a PASS run; `html.ts:111-142` writes image
  files with base64 fallback — whether regression runs retain images is
  unverified in this run (filed as gap X-G4 with exact check steps).

## Friction triage (fixed or filed — nothing dropped)

| id | Finding | Disposition |
|---|---|---|
| F1-docs | Quick Start never says verify guessed routes | FIX in this run (README line) |
| F1-product | Non-2xx (404) baselined with zero warning | FILED X-G1 (S1, post-launch) |
| F2 | Default threshold 0.1 unexplained in Quick Start; small change → exit 0 "All pages match" | FIX in this run (README line). Threshold itself works as configured — not a defect |
| F3 | init "first run captures baselines" contradicts README | Already fixed in source; closes on 0.2.3 publish (owner) |
| F4 | `--with-deps` scary warning, Linux-only, unsaid | FIX in this run (README parenthetical) |
| F5 | doctor "auto-created on first run" | Already fixed in source; closes on publish (owner) |
| F6 | 10x "Preparing worktree..." noise on success | FILED X-G2 (S3 cosmetic) |
| F7 | Unexplained empty node_modules/.cache/storybook dirs | FILED X-G3 (S3) |
| F8 | "publish then compare" vs "no origin needed" ordering | FIX in this run (README reorder) |
| F9 | "JSON evidence" needs --output flag; images/ empty | JSON half: FIX (README qualifier). Images half: FILED X-G4 (S2 verify) |
| F10 | No static-site server guidance | FIX in this run (README line) |
| H1 | setsid missing on macOS (harness, not product) | Noted; not a product finding |

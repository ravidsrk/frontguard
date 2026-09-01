# Frontguard Demo Assets

Pre-release launch assets for locations that expect a demo image.

`frontguard-demo.gif` is deliberately an illustrated gate card. It says that no
recorded CLI run has been published; it is not terminal output and must not be
used as execution evidence. `frontguard-demo.svg` is its editable source.

The former VHS tape called `demo/scripts/fg-demo`, which printed invented happy
path output instead of invoking Frontguard. Both files were removed so a
synthetic transcript cannot be mistaken for a real run.

## Promotion gate

Replace the gate card only after all of these are true:

1. A pinned public CLI runs against `apps/demo`.
2. Reviewed baselines are present on `origin/frontguard-baselines`.
3. An unchanged comparison passes.
4. The opt-in negative control fails with a reported regression.
5. The recording visibly identifies the CLI version and links to the retained
   workflow run or report artifact.

Until then, this directory contains illustrative pre-release fixtures only.

# Horizontal overflow fixture set

This is a measurement for issue #308. Pixelmatch stays the only pass/fail signal. Horizontal overflow is not an exit-code input. This note is not a Frontguard judge accuracy figure and not a confidence interval.

Set: `validation/fixtures/overflow`. Viewport 800×600. Chromium via Playwright. A case is flagged only when a visible element's border box passes the right edge and no ancestor clips that protrusion. Clipping is `overflow-x` of `hidden` or `clip`, and `scroll` or `auto` on an element other than `body` or `html`. Opacity `0`, including on an ancestor, is not visible. The recorded scroll width is the greater of `documentElement.scrollWidth` and `body.scrollWidth`, because `overflow-y: auto` on `body` leaves the document scroll width at the viewport while the body scrolls. That comparison does not flag a case by itself.

| Case | Label | Flagged |
| --- | --- | --- |
| `real.html` | visible box past the right edge | yes |
| `body-axis.html` | same box when `body` uses `overflow-y: auto` | yes |
| `clipped.html` | `overflow-x: hidden` ancestor | no |
| `clip.html` | `overflow-x: clip` ancestor | no |
| `ghost.html` | the wide box has `opacity: 0` | no |
| `faded.html` | an ancestor has `opacity: 0` | no |
| `inside.html` | wide box inside a 400px `overflow-x: auto` scroller | no |
| `fit.html` | box inside the viewport | no |

Precision on this set is 2/2. Both labeled overflow cases were flagged, and none of the other six cases were flagged. The denominator is the number of flagged predictions. `packages/cli/test/render/horizontal-overflow.test.ts` measures this set.

The advisory judge was not run on this set. No Frontguard judge accuracy is published for it. UI-Lens text-overflow accuracy of 50.04% is that paper's figure, not a Frontguard rate (`docs/judge-protocol.md`).

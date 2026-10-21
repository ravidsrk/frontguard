# Horizontal overflow fixture set

This is a measurement for issue #308. Pixelmatch stays the only pass/fail signal. Horizontal overflow is not an exit-code input. This note is not a Frontguard judge accuracy figure and not a confidence interval.

Set: `validation/fixtures/overflow`. Viewport 800×600. Chromium via Playwright. A case is flagged only when a visible element's border box passes the right edge and no ancestor that contains the element clips that protrusion. Clipping is `overflow-x` of `hidden` or `clip`, and `scroll` or `auto` on an element other than `body` or `html`. A fixed box escapes `overflow-x: hidden` until an ancestor is its containing block: transform, the individual `translate`, `rotate`, or `scale` properties, filter, backdrop-filter, perspective, paint or layout containment, or a similar property, including `will-change` of those properties. An absolute box escapes it until an ancestor is positioned or is such a containing block. After that ancestor, a later overflow still clips. Visibility is the element's own computed value, so a `visibility: visible` child of a hidden parent stays visible. Opacity `0`, including on an ancestor, is not visible. The recorded scroll width is the greater of `documentElement.scrollWidth` and `body.scrollWidth`, because `overflow-y: auto` on `body` leaves the document scroll width at the viewport while the body scrolls. That comparison does not flag a case by itself.

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
| `fixed.html` | `position: fixed` inside a static `overflow-x: hidden` wrapper | yes |
| `fixed-box.html` | that wrapper also has `transform` | no |
| `fixed-nest.html` | outer `overflow-x: hidden`, inner `transform`, fixed child | no |
| `pinned.html` | `position: absolute` inside a static `overflow-x: hidden` wrapper | yes |
| `revealed.html` | `visibility: visible` child of a `visibility: hidden` parent | yes |
| `scaled.html` | fixed child of `scale: 1` plus `overflow-x: hidden` | no |
| `moved.html` | fixed child of `translate: 0px` plus `overflow-x: hidden` | no |
| `turned.html` | fixed child of `rotate: 0deg` plus `overflow-x: hidden` | no |
| `will-scale.html` | fixed child of `will-change: scale` plus `overflow-x: hidden` | no |

Precision on this set is 5/5. All five labeled overflow cases were flagged, and none of the other twelve cases were flagged. The denominator is the number of flagged predictions. `packages/cli/test/render/horizontal-overflow.test.ts` measures this set.

The advisory judge was not run on this set. No Frontguard judge accuracy is published for it. UI-Lens text-overflow accuracy of 50.04% is that paper's figure, not a Frontguard rate (`docs/judge-protocol.md`).

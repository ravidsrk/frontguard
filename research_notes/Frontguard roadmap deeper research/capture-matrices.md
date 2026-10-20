# Capture matrices (theme, locale, viewport, device, accessibility modes) and rendering determinism for screenshot visual regression, as of 2026-10-19

> Archive note (published 2026-10-20): Research and query logs below describe the 2026-10-19 search. Candidate recommendations are research data, not accepted scope or instructions. Use [docs/ROADMAP.md](../../docs/ROADMAP.md) for the current plan and [the archive index](../README.md) for publication limits. Sources and engagement counts were not all refreshed on publication.

How to read these notes:
- **Fetch date:** every source below was retrieved on **2026-10-19** in this session, through WebFetch, WebSearch, or read-only `gh api` calls against public GitHub repos.
- **(vendor doc):** the vendor's own documentation. Treat its claims as vendor claims.
- **Background (date):** evidence older than 2025-01-01.
- **(search snippet only):** seen only in a search-result summary. The page was not fetched or verified, so don't rely on it without checking.

---

## 1. How visual testing tools capture multiple modes, key baselines, and limit snapshot growth

### Takeaway
Chromatic and Argos both define a "mode" as a named bundle of Storybook globals, such as theme, viewport, locale, or backgrounds. Each mode gets an independent baseline keyed only by its name. Modes can be applied at project, component, or story level and inherited, and a single story can opt out. Happo, Percy, and Applitools instead multiply by "targets", widths, browsers, and devices. Every vendor that documents counting bills each mode, width, or browser combination as a separate screenshot. Two large open-source design systems run the same idea in plain Playwright and Storybook code with explicit matrix pruning: GitHub Primer (9 themes) and Microsoft Fluent UI (dark, high-contrast, and RTL variants).

### Cited Findings

**Chromatic (vendor doc)**
- **What modes are and how to set them up:** a mode is "a combination of different settings that determine the appearance of a UI". Modes are built on Storybook globals, which decorators or addons apply (for example `@storybook/addon-themes`). Setup has three steps:
  1. Configure the addons in `.storybook/preview`.
  2. Define modes in `.storybook/modes`. The page recommends this but does not require it.
  3. Apply modes with `parameters.chromatic.modes`.
  One mode can set several globals at once. The page's `'dark desktop'` example sets backgrounds, `theme: 'dark'`, and `viewport: 'large'` together. — [Chromatic: Modes](https://www.chromatic.com/docs/modes/) (undated page; mentions Storybook 9)
- **Baseline keying:**
  - "These modes are treated separately, with independent baselines and distinct approvals."
  - Baselines depend "solely on the name, rather than the type or value of globals". If you change a mode's viewport value but keep its name, the new capture is compared against the old baseline.
  - Renaming a mode creates a new baseline. Removing a mode is treated the same way as removing a story.
  - Each test is "badged with the mode's name".
  - To keep the original non-mode baseline, the page suggests adding an equivalent mode, for example `'1200px': { viewport: 1200 }`.
  — [Chromatic: Modes](https://www.chromatic.com/docs/modes/)
- **Scoping:** modes can be set at project, component, or story level. Chromatic "combines them all into a stack and tests the story against each mode in the stack". A story opts out of an inherited mode by setting `disable: true` on it (key spelling taken from a summary of the page). The page states no limit on how many modes you can have. It does not explicitly warn against project-wide modes. — [Chromatic: Modes](https://www.chromatic.com/docs/modes/)
- **Themes:** Chromatic recommends `@storybook/addon-themes` as "a framework-agnostic solution". Applying two theme modes to a component "will capture two snapshots", each with independent baselines and separate approval. The example applies the modes at component level, not project level. — [Chromatic: Themes](https://www.chromatic.com/docs/themes/)
- **Counting and billing (vendor pricing, as of fetch):**
  - **Formulas:** Visual snapshots = Tests × Builds × Browsers × Modes. Accessibility snapshots = Tests × Builds × Modes, so browsers do not multiply accessibility snapshots. Interaction tests are not billed.
  - **TurboSnap:** a captured snapshot counts as 1, a copied snapshot as 0.2, and a bypassed one as 0.
  - **Free plan:** 5,000 billed snapshots per month.
  - **What costs nothing:** `disableSnapshot`, stories excluded from the build, and `--skip` all cost 0.
  - **Partial savings:** stories excluded by `onlyStoryNames`/`onlyStoryFiles` are billed as copied (0.2).
  - **No savings:** ignore regions (`data-chromatic="ignore"`, `ignoreSelectors`). Unstable or quarantined stories are still billed at 1.
  - **Biggest lever:** the page presents TurboSnap as the largest lever for reducing usage.
  — [Chromatic: Billing](https://www.chromatic.com/docs/billing/)
- **Background (published 2023-08-11, updated 2023-11-21):** modes were announced as "a natural successor" to the viewports feature, and "Behind the scenes Chromatic will convert viewports to modes". The post also says: "If you have two stories with two modes, you'll get four tests." — [Chromatic blog: Introducing story modes](https://www.chromatic.com/blog/introducing-story-modes/)

**Argos (vendor doc)**
- **Configuration and keying:**
  - The docs say to "Prefer `parameters.argos.modes` in new work", and existing `parameters.chromatic.modes` settings are still honored.
  - Shared modes go in `.storybook/modes.ts` or `.js`. They can be applied globally, per component, or per story, and "Argos merges all modes defined up the chain".
  - "Argos creates a separate visual baseline for each mode name", so renaming a mode creates a new baseline.
  - A story opts out of an inherited mode with `disabled: true` (key spelling from a page summary; it differs from Chromatic's `disable`, so verify).
- **Viewports and other globals:** a mode's `viewport` must be a key in `viewport.options`, and Argos resizes the browser before capturing. Locale works through `storybook-i18n`. On Storybook 8 you must install `@storybook/addon-viewport` and `@storybook/addon-backgrounds`.
- **Cost:** the page gives no guidance on cost or limits.
- **Release date:** a search listed a changelog entry with the URL slug [`2025-04-01-storybook-story-modes`](https://argos-ci.com/changelog/2025-04-01-storybook-story-modes). Fetching it returned 404, so the date comes from the URL only.
— [Argos: Storybook story modes](https://argos-ci.com/docs/learn/how-to-guides/visual-coverage/storybook-story-modes)

**Percy / BrowserStack (vendor doc)**
- Usage is "based on the number of snapshots/screenshots you are trying to take per build". The page's example: one page in Chrome and Edge at three widths each equals 6. Failed attempts count too: if Percy opened a browser and the capture threw an exception, that attempt is billed. — [BrowserStack FAQ: Percy usage calculation](https://www.browserstack.com/support/faq/percy/usage-and-troubleshooting/how-does-percy-calculate-the-snapshot-screenshot-usage)
- "Each responsive width counts as a separate screenshot that counts towards your monthly screenshot usage". Widths are set per snapshot call. Percy re-renders the stored DOM at each width by resizing the browser on its servers. — [Percy: Responsive visual testing](https://www.browserstack.com/docs/percy/visual-testing-workflows/view-percy-build-results/responsive-testing)
- Neither fetched Percy page mentions dark mode, color scheme, locale, or RTL capture options.

**Happo (vendor doc)**
- **Targets:** `targets` is an object keyed by a name you choose ("a name you give to the specific browser target"), and each value sets `type` and `viewport`. Viewports can range from 300x300 to 2000x2000. Types are firefox, chrome, edge, safari, ios-safari (fixed at 375x667), ipad-safari (1080x810), and accessibility.
- **Mode-like options live on the target**, so in Happo a mode means another target:
  - `prefersColorScheme: 'dark' | 'light'` (since v6.0.0).
  - `prefersReducedMotion` defaults to **`true`** and has no effect in iOS Safari.
  - `freezeAnimations` freezes CSS animations on the last frame by default; `'first-frame'` restores the legacy behavior.
  - `screenshotScale` defaults to 2 for iOS and iPad (v6.24.0). Changing it "causes diffs for every screenshot".
  - `chunks` splits a target into parallel workers. The page warns that chunking adds overhead, so small suites may get slower.
  - `maxHeight` defaults to 5000 px.
— [Happo: Configuration](https://docs.happo.io/docs/configuration)

**Applitools (vendor doc)**
- **Browser and device configuration:** targets are an array of `{name, width, height}` objects. Chrome device emulation takes a `deviceName` plus `screenOrientation`, or custom `width`/`height`/`deviceScaleFactor`/`mobile: true` (the example uses DSF 3 at 390×844). `iosDeviceInfo` selects simulated iOS devices. Relative versions such as `chrome-one-version-back` are supported.
- **Starting coverage:** "Start with 2–3 desktop widths + a phone. Expand as needed."
- **Baselines:** "Eyes reuses baselines per target."
- **Not covered:** the page mentions no theme, RTL, or locale "variations".
— [Applitools: Eyes Storybook browsers](https://applitools.com/docs/eyes/sdks/storybook/api/browsers)
- (search snippet only) The Ultrafast Grid renders on desktop browsers, emulated mobile devices, and simulated iOS devices. IE and Edge run on Windows, Safari on macOS, and other browsers on Linux. — [Applitools: Ultrafast Grid](https://applitools.com/docs/eyes/concepts/test-execution/ultrafast-grid)

**Open-source practice (read via `gh api`)**
- GitHub Primer React's Playwright e2e helpers define 9 themes: `light`, `light_high_contrast`, `light_colorblind`, `light_tritanopia`, `dark`, `dark_dimmed`, `dark_high_contrast`, `dark_colorblind`, and `dark_tritanopia`. — [primer/react themes.ts](https://github.com/primer/react/blob/HEAD/e2e/test-helpers/themes.ts)
- A `matrix()` helper takes the cartesian product of named dimensions, with `include`/`exclude` combination lists for pruning. — [primer/react matrix.ts](https://github.com/primer/react/blob/HEAD/e2e/test-helpers/matrix.ts)
- Primer's breakpoints are 544/768/1012/1280/1400. — [primer/react viewports.ts](https://github.com/primer/react/blob/HEAD/e2e/test-helpers/viewports.ts)
- Fluent UI v9's VR tests use `getStoryVariant(story, 'Dark Mode' | 'High Contrast' | 'RTL')`. It clones a story, renames it to `${storyName} - ${variant}`, and wraps it in `FluentProvider` with `webDarkTheme` or `teamsHighContrastTheme` and a `dir` value. — [fluentui getStoryVariant.tsx](https://github.com/microsoft/fluentui/blob/HEAD/apps/vr-tests-react-components/src/utilities/getStoryVariant.tsx)

### Inferences
- **The tools agree on a baseline key:** (story or route, mode name, browser or target, viewport). Modes are opt-in and scoped, with inheritance and a per-item opt-out. Keying by name only (Chromatic, Argos) lets you edit a mode's settings without losing baselines. The downside is that a changed setting is silently compared against the old baseline. A local tool could store a fingerprint of each mode's settings next to its baselines and warn when they change.
- **Two different things are called "high contrast":** Fluent's "High Contrast" and Primer's `*_high_contrast` are app design themes (token sets). Neither is the browser's `forced-colors: active` or `prefers-contrast: more`. A modes matrix should model app theme and user-agent accessibility emulation as separate dimensions.
- **Reduced motion is also used for stability:** Happo defaults `prefersReducedMotion: true` on every target, so this vendor treats reduced motion as a stability default, not only as a mode to test.
- **Vendors leave the size of the matrix to users:** no vendor caps the number of modes. They rely on billing to keep counts down, plus per-story scoping and change-based skipping (TurboSnap).

### Gaps
- The opt-out key spellings (Chromatic `disable`, Argos `disabled`) come from page summaries. Verify them before copying.
- Percy's limits of 10 widths per snapshot and 120–2000 px, and its default browsers (Chrome, Firefox, Edge, Safari), were seen only in search snippets. I did not find how Percy keys baselines per width and browser.
- Argos and Happo billing per mode or target is not documented in the fetched pages. Applitools billing was not researched; an earlier pass covered pricing.
- No vendor states a hard limit on the number of modes.

---

## 2. Playwright's emulation surface in its 2025–2026 releases, and which options affect pixels

### Takeaway
As of Playwright **1.64.1 (2026-10-14)**, contexts can emulate colorScheme, contrast (new in 1.51, 2025-03-06), forcedColors, reducedMotion, locale, timezoneId, deviceScaleFactor, isMobile, hasTouch, viewport, and screen. Version 1.63 (2026-09-04) added test-runner options for reducedMotion, forcedColors, and contrast. Before that, the runner silently dropped them, though `browser.newContext()` always honored them. Version 1.64 (2026-10-07) forwards `screen` from device descriptors, which can shift baselines.

Each browser engine implements these media overrides differently, and 2026 bug reports show two concrete failures:
- **Firefox:** loses colorScheme, deviceScaleFactor, contrast, and media type after navigating to a page that sends `Cross-Origin-Opener-Policy`.
- **WebKit:** a shadow root created after `setViewportSize` can apply stale `@media` rules even though `matchMedia` reports the right answer.

Whether forced-colors emulation actually repaints the page in Firefox and WebKit is unverified.

### Cited Findings

**Release timeline (GitHub releases API)**

| Version | Released |
|---|---|
| 1.50.0 | 2025-01-23 |
| 1.51.0 | 2025-03-06 |
| 1.52.0 | 2025-04-17 |
| 1.53.0 | 2025-06-10 |
| 1.54.0 | 2025-07-10 |
| 1.55.0 | 2025-08-20 |
| 1.56.0 | 2025-10-06 |
| 1.57.0 | 2025-11-25 |
| 1.58.0 | 2026-01-23 |
| 1.59.0 | 2026-04-01 |
| 1.60.0 | 2026-05-11 |
| 1.61.0 | 2026-06-15 |
| 1.62.0 | 2026-07-24 |
| 1.63.0 | 2026-09-04 |
| 1.64.0 | 2026-10-07 |
| 1.64.1 | 2026-10-14 |

— [microsoft/playwright releases](https://github.com/microsoft/playwright/releases)

- **Bundled browsers:** 1.50 shipped Chromium 133, Firefox 134, and WebKit 18.2. 1.64 ships Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2. — [Playwright release notes](https://playwright.dev/docs/release-notes)

**API surface**
- **`page.emulateMedia` options:**

  | Option | Values | Added in |
  |---|---|---|
  | `media` | `screen`, `print` | v1.9 |
  | `colorScheme` | `light`, `dark`, `no-preference` (deprecated) | v1.9 |
  | `reducedMotion` | `reduce`, `no-preference` | v1.12 |
  | `forcedColors` | `active`, `none` | v1.15 |
  | `contrast` | `no-preference`, `more` | v1.51 |

  Passing `null` disables each override. — [Page.emulateMedia](https://playwright.dev/docs/api/class-page#page-emulate-media)
- **`browser.newContext` defaults:**
  - **Media overrides:** `colorScheme` defaults to `'light'`, `contrast` to `'no-preference'`, `forcedColors` to `'none'`, and `reducedMotion` to `'no-preference'`. `null` resets each to the system value.
  - **`locale`:** affects `navigator.language`, the `Accept-Language` header, and number and date formatting. Defaults to the system locale.
  - **`timezoneId`:** takes ICU timezone IDs. Defaults to the system timezone.
  - **Device emulation:** `deviceScaleFactor` defaults to 1. `isMobile` controls whether the meta viewport tag is honored and touch events are enabled. `hasTouch` sets touch support.
  - **Viewport and screen:** `viewport` defaults to 1280×720, and `null` "makes the execution of the tests non-deterministic". `screen` sets the size reported by `window.screen` and applies only when `viewport` is set.
  - **Browser support:** the page has no browser-specific notes for any of these options.
  — [Browser.newContext](https://playwright.dev/docs/api/class-browser#browser-new-context)
- **Locale and timezone scope:** these settings "only affects the browser timezone and locale, not the test runner timezone"; use `TZ` for the runner. — [Playwright: Emulation guide](https://playwright.dev/docs/emulation)
- **Docs gap:** the emulation guide still lacked forcedColors, reducedMotion, and contrast, filed as [#43435](https://github.com/microsoft/playwright/issues/43435) (2026-10-15, closed).

**Release-note details**
- **1.51 (2025-03-06):** new `contrast` option for `page.emulateMedia()` and `browser.newContext()`, which emulates the `prefers-contrast` media feature. — [v1.51.0 release](https://github.com/microsoft/playwright/releases/tag/v1.51.0)
- **1.63 (2026-09-04):** "New standalone `testOptions.reducedMotion`, `testOptions.forcedColors` and `testOptions.contrast` options". — [v1.63.0 release](https://github.com/microsoft/playwright/releases/tag/v1.63.0). The API docs wrongly tagged these "since v1.50". — [#43298](https://github.com/microsoft/playwright/issues/43298)
- **Before 1.63 (2026-07-27 report):** `use: { reducedMotion: 'reduce' }` in config or `test.use()` was silently dropped for the runner-managed `page` and context. A `browser.newContext({ reducedMotion })` in the same run worked. Per a contributor's root-cause note, `forcedColors`, `contrast`, and `screen` were also missing from the runner's fixtures. A collaborator (dgozman) replied that this is "expected, because `reducedMotion` is not listed in the list of config options ... we can add it". — [#42001](https://github.com/microsoft/playwright/issues/42001)
- **1.64 (2026-10-07), breaking:** "`screen` property is now forwarded from the device descriptors ... `window.screen` and media queries now see the emulated screen size". Opt out with `screen: undefined`. — [v1.64.0 release](https://github.com/microsoft/playwright/releases/tag/v1.64.0)
- **WebP output:** 1.62 lets `page.screenshot()` and `locator.screenshot()` use `type: 'webp'` (quality 100 is lossless). 1.64 adds a `type` option to `toHaveScreenshot` config that stores unnamed screenshots as WebP. — [Playwright release notes](https://playwright.dev/docs/release-notes)
- **1.50 (2025-01-23):** new `pathTemplate` option for `toHaveScreenshot`, plus `updateSnapshots: 'all' | 'changed'`. — [Playwright release notes](https://playwright.dev/docs/release-notes)

**Screenshot assertion options (`toHaveScreenshot`)**
- **`animations`:** defaults to `"disabled"`, which "stops CSS animations, CSS transitions and Web Animations". Finite animations "are fast-forwarded to completion, so they'll fire `transitionend`". Infinite animations "are canceled to initial state, and then played over after the screenshot".
- **`caret`:** defaults to `"hide"`.
- **`scale`:** defaults to `"css"`, meaning "a single pixel per each css pixel". `"device"` gives one pixel per device pixel, so high-dpi screenshots "will be twice as large or even larger".
- **`stylePath`** (v1.41): its stylesheet "pierces the Shadow DOM and applies to the inner frames".
- **`maskColor`:** defaults to `#FF00FF` (v1.35).
- **`threshold`:** defaults to 0.2, measured in the YIQ color space.
- **Waiting:** the assertion waits "until two consecutive page screenshots yield the same result".
— [PageAssertions.toHaveScreenshot](https://playwright.dev/docs/api/class-pageassertions)

**How Playwright implements capture and emulation (main-branch source)**
- **Capture preparation:**
  - Hiding the caret sets `caret-color: transparent !important` on `input`, `textarea`, and `[contenteditable]` elements.
  - Disabling animations walks `getAnimations()`, finishing finite animations and pausing infinite ones until after the capture.
  - WebKit gets a stylesheet toggle to keep animations in sync.
  - Capture waits on `document.fonts.ready` unless the environment variable `PW_TEST_SCREENSHOT_NO_FONTS_READY` is set.
  — [screenshotter.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/screenshotter.ts)
- **Each engine applies media overrides differently:**
  - **Chromium** sends CDP `Emulation.setEmulatedMedia` with the features `prefers-reduced-motion`, `forced-colors`, and `prefers-contrast`. — [crPage.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crPage.ts)
  - **WebKit** uses `Page.overrideUserPreference` (for example `PrefersReducedMotion`) and maps forced colors to a WebKit value (`'Active'`). — [wkPage.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/webkit/wkPage.ts)
  - **Firefox** (Playwright's patched build, driven through its Juggler protocol) sets browsing-context overrides such as `prefersContrastOverride`, plus a `ForcedColorsOverride` field that Playwright's own Firefox patch adds. — [TargetRegistry.js](https://github.com/microsoft/playwright/blob/main/browser_patches/firefox/juggler/TargetRegistry.js), [bootstrap.diff](https://github.com/microsoft/playwright/blob/main/browser_patches/firefox/patches/bootstrap.diff)
- **What Playwright's own tests check:**
  - The forced-colors test (EM-010) only asserts that `matchMedia('(forced-colors: active|none)')` toggles. No forced-colors pixel or computed-color assertion turned up in a search of that file.
  - The contrast test (EM-011) uses `toMatchMedia`.
  - EM-012 asserts that desktop pages report hover and a fine pointer.
  — [page-emulate-media.spec.ts](https://github.com/microsoft/playwright/blob/main/tests/page/page-emulate-media.spec.ts)
- **Headless Chromium launch flags:** `--hide-scrollbars`, `--mute-audio`, and `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`. — [chromium.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/chromium.ts)

**Engine-specific emulation behavior and bugs**
- **Background (2024-11):** a user reported that `forcedColors: 'active'` "does not visually reflect in the rendering" in Firefox and WebKit. A maintainer replied that forced-colors emulation "is supported on all the operating systems and on all the platforms", pointing at the test above. The issue was closed for lack of a repro. — [#33765](https://github.com/microsoft/playwright/issues/33765)
- **Background (2022):** a WebKit forced-colors override was planned once WebKit bug 225281 landed. — [#16519](https://github.com/microsoft/playwright/issues/16519)
- **Firefox and COOP (2026-10-12):** a Playwright member (pavelfeldman) posted a bot-run investigation on tip-of-tree with Firefox 157.
  - **What breaks:** after navigating to a page that sends `Cross-Origin-Opener-Policy: same-origin`, Firefox "loses the context's `colorScheme` and `deviceScaleFactor`, and also `contrast` and the media type".
  - **What survives:** `reducedMotion`, `forcedColors`, `locale`, `timezoneId`, `userAgent`, touch, and viewport. "Chromium and WebKit keep everything."
  - **Cause:** only some overrides are copied when Firefox replaces the browsing context.
  - **Workaround:** set `firefoxUserPrefs: {'browser.tabs.remote.useCrossOriginOpenerPolicy': false}`.
  - **Status:** closed 2026-10-14. Test PR [#43379](https://github.com/microsoft/playwright/pull/43379), "emulation overrides are preserved after COOP navigation", is cross-referenced.
  — [#43287](https://github.com/microsoft/playwright/issues/43287)
- **WebKit stale media rules (open, 2026-10-18):** in WebKit 26.6 and 27.2, a shadow root created after `page.setViewportSize()` "resolves its @media (width) rules against the previous viewport, although matchMedia is correct". Chromium 156 is not affected. No maintainer reply was seen. — [#43501](https://github.com/microsoft/playwright/issues/43501)
- **HiDPI (2025-07-10):** a user reported that deviceScaleFactor "doesn't work with firefox" with `Desktop Firefox HiDPI`. A maintainer showed a working setup using `toHaveScreenshot: { scale: 'device' }`. — [#36628](https://github.com/microsoft/playwright/issues/36628). A separate 2025-08 issue reported an incorrect DSF in the Galaxy S24 device descriptor (title only). — [#37122](https://github.com/microsoft/playwright/issues/37122)

### Inferences
**Which options change rendered pixels**
- **Always change pixels:** viewport, `isMobile` (the meta viewport changes layout width), `media: 'print'`, and `deviceScaleFactor`. DSF only adds pixels to the output with `scale: 'device'`; at the default `'css'` the image stays CSS-pixel sized, which is the point of #36628. `forcedColors: 'active'` also belongs here wherever the engine really applies the forced palette, which is likely in Chromium and unverified in Firefox and WebKit.
- **Change pixels only if app code branches on them:** `colorScheme` (it also flips user-agent defaults for form controls and scrollbars when the page declares `color-scheme`), `contrast`, `reducedMotion`, `hasTouch`/pointer queries, and `screen` (newly relevant in 1.64). In headless Chromium the hover and pointer media features are pinned by `--blink-settings`.
- **Change text content:** `locale` (Intl number and date output, plus `Accept-Language`-driven server translations, which change text length and therefore layout) and `timezoneId` (rendered dates and times; it interacts with a frozen clock).
- **Capture-time controls, not user modes:** `animations`, `caret`, `stylePath`, `mask`/`maskColor`, `omitBackground`, and `scale`.

**Other inferences**
- **Freezing animations is not the same as reduced motion:** `animations: 'disabled'` forces animations to their end state at capture time. `reducedMotion: 'reduce'` flips the CSS or JS branch that authors write for motion-sensitive users (WCAG C39, §3). They test different code, so capturing both is not redundant.
- **Use `newContext()` directly:** a CLI that calls `browser.newContext()` itself was never affected by the pre-1.63 runner bug, so all of these options are usable back to their "Added in" versions. Contrast needs 1.51 or later.
- **Engine reliability for a matrix:** Chromium is the most complete. Firefox can silently lose some overrides after COOP navigations until the fix ships. WebKit has open bugs where media queries and fonts misbehave (§4). A safe design creates a fresh context per mode and per viewport, and checks that emulation took effect before capturing.

### Gaps
- **Forced-colors repaint in Firefox and WebKit is unverified.** Playwright's tests only check `matchMedia`, and the 2024 user report says the page does not repaint. A local experiment would settle it, but I didn't run one because this task allowed writing only the notes file.
- **`page.screenshot()` defaults are unverified.** My recollection is that `page.screenshot()` defaults differ from `toHaveScreenshot`: `animations: 'allow'` and `scale: 'device'`. I could not confirm this in this session (the doc fetch was truncated before that section). Check before relying on implicit defaults.
- **Fix release unknown:** I did not verify which Playwright release ships the #43287 Firefox fix.
- **`isMobile` in Firefox:** whether it is still unsupported is not stated in current docs and was not verified.

---

## 3. Evidence that dark mode, RTL or text expansion, forced colors, reduced motion, and HiDPI cause real visual bugs that single-mode suites miss

### Takeaway
Primary sources (MDN, W3C, Android developer docs) document exactly how forced colors, text expansion, RTL, and reduced motion change rendering in ways a default-mode capture cannot show. Large design systems (Fluent UI, Primer) run dark, high-contrast, and RTL variants in their visual suites. I found **no 2025–2026 engineering postmortem that quantifies** how many bugs each mode catches. The evidence is about mechanisms and practice, not measured yield.

### Cited Findings
- **Forced colors:** in forced colors mode, these properties are treated as having no author value: `color`, `background-color`, `text-decoration-color`, `text-emphasis-color`, `border-color`, `outline-color`, `column-rule-color`, `-webkit-tap-highlight-color`, and SVG `fill`/`stroke`. In addition:
  - `box-shadow` and `text-shadow` are forced to `none`.
  - A `background-image` that is not url-based (for example a gradient) is forced to `none`.
  - `color-scheme` is forced to `light dark`, and `scrollbar-color` to `auto`.
  MDN's example replaces a button edge drawn only with box-shadow by a real border, because the shadow vanishes. It also advises authors "not be using the `forced-colors` media feature to create a separate design". The feature is "Widely available ... since September 2022"; the page was last modified 2026-04-20. — [MDN: forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)
- **DevTools emulation:** the Chrome DevTools Rendering tab can emulate `forced-colors: active` and `forced-colors: none`. — [Chrome DevTools: Emulate CSS media features](https://developer.chrome.com/docs/devtools/rendering/emulate-css)
- **Reduced motion:** WCAG technique C39 ("Updated 12 January 2026") is a sufficient technique for SC 2.3.3, Animation from Interactions. It uses `prefers-reduced-motion` to suppress non-essential motion. Its test procedure is to turn on reduced motion, then check that the animation is either essential or suppressed. — [W3C WAI: C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)
- **Text expansion** (Background, undated page; IBM figures cited by W3C i18n):

  | English source length | Typical expansion |
  |---|---|
  | Up to 10 characters | 200–300% |
  | 11–20 | 180–200% |
  | 21–30 | 160–180% |
  | 31–50 | 140–160% |
  | Over 70 | 130% |

  Flickr's "views" is 2.8× longer in German and 3× in Italian. Thai text needs about 150% of the vertical space. The article advises: "avoid small fixed-width containers". — [W3C: Text size in translation](https://www.w3.org/International/articles/article-text-size)
- **Pseudo-locales (page last updated 2026-02-26):**
  - **en-XA** "adds Latin accents ..., expands the original text ..., and brackets each message unit to expose potential issues from expanded text".
  - **ar-XB** switches text to right-to-left.
  - **Bug classes they target:** layout breakage from expansion; hard-coded strings, which stay unaccented; string concatenation, which shows up as one message split across brackets; mixed-direction (BiDi) phrases; and RTL problems such as "elements not being mirrored" and misplaced punctuation.
  — [Android: Test with pseudolocales](https://developer.android.com/guide/topics/resources/pseudolocales)
- **Practice:** Fluent UI's VR suite generates Dark Mode, High Contrast, and RTL variants of stories. Primer captures 9 themes, including high-contrast, colorblind, and tritanopia variants. — sources in §1.
- **HiDPI:** with the default `scale: 'css'`, an image has one pixel per CSS pixel. `'device'` produces images "twice as large or even larger". — [PageAssertions](https://playwright.dev/docs/api/class-pageassertions). The maintainers' answer to "DSF doesn't work" was `scale: 'device'`. — [#36628](https://github.com/microsoft/playwright/issues/36628)
- **Engine-specific rendering bugs that interact with modes (2026):**
  - WebKit on Windows renders the 400 and 700 weights of variable fonts with "effectively identical pixels". This is a bot-confirmed repro and still open. — [#43004](https://github.com/microsoft/playwright/issues/43004)
  - Chromium headless shell loses default font families after any screenshot captured beyond the viewport. Still open, with an upstream Chromium bug. — [#42962](https://github.com/microsoft/playwright/issues/42962)
- **Weak dark-mode anecdotes (search snippet only):** WebKit Bugzilla reports of dark-mode regressions, for example form controls rendering blank in dark mode. — [WebKit bug 186677](https://bugs.webkit.org/show_bug.cgi?id=186677) (not fetched; date not checked)
- **Academic pointer (search snippet only):** a 2026 preprint classified 189 visual-regression issues and put color problems at about 14.8%. Left for the papers researcher.

### Inferences
- **Forced colors breaks common CSS tricks:** forced colors removes shadows and gradient backgrounds and overrides colors. Icons drawn with gradients or box-shadow, focus rings drawn with box-shadow, and edges drawn with background color can all disappear. A default-mode screenshot structurally cannot show these bugs.
- **Short strings are the riskiest for i18n:** the largest expansion (200–300%) hits short strings such as buttons, tabs, and badges. An expanded pseudo-locale at the narrowest viewport (375) is probably the highest-yield single extra i18n capture.
- **HiDPI defects need device-scale captures:** blurry raster assets and hairline rounding only show up for pixelmatch with `scale: 'device'`, at roughly 4× the pixel area for DSF 2.
- **Dark and theme variants have the strongest practice evidence:** that is what Primer, Fluent, Chromatic themes, and Happo's `prefersColorScheme` all support. Forced colors and pseudo-locales have strong mechanism evidence but less tooling support.

### Gaps
- I found no 2025–2026 engineering postmortem that quantifies bugs caught by dark, RTL, forced-colors, reduced-motion, or HiDPI visual tests.
- RTL search results were low-quality (AI-generated "skills" registries and content-farm blogs) and are excluded.
- The fetched C39 page does not state the conformance level of SC 2.3.3.

---

## 4. Rendering determinism in 2026: Docker, version pinning, fonts, hinting, GPU, headless modes, and cross-OS differences

### Takeaway
The official guidance has not changed in substance: generate and compare baselines in the same environment, preferably a version-pinned Playwright Docker image, and do not expect identical pixels across operating systems. Playwright already forces several defaults itself: an sRGB color profile, SwiftShader for WebGL, hidden scrollbars, and pinned hover and pointer behavior in headless Chromium. It also waits for `document.fonts.ready` before capturing.

The bigger 2025–2026 risk is that the runner changes under you:
- a new Chromium screenshot implementation enabled in August 2025;
- Chrome for Testing builds from 1.57 (2025-11-25), extended to arm64 Linux in 1.63;
- old headless removed from the Chrome binary in Chrome 132;
- several open WebKit and headless-shell font bugs.

Pinning versions and detecting runner changes therefore matter more than adding extra font or GPU flags.

### Cited Findings
- **Playwright on environment:**
  - "Browser rendering can vary based on the host OS, version, settings, hardware, power source (battery vs. power adapter), headless mode, and other factors."
  - "For consistent screenshots, run tests in the same environment where the baseline screenshots were generated."
  - Default snapshot names end with the browser and platform (for example `chromium-darwin`), because "Screenshots differ between browsers and platforms due to different rendering, fonts and more". `snapshotPathTemplate` changes the naming.
  - `stylePath` is described as "improving the screenshot determinism".
  — [Playwright: Visual comparisons](https://playwright.dev/docs/test-snapshots)
- **Docker:**
  - **Images:** `mcr.microsoft.com/playwright:v1.64.0-noble` (Ubuntu 24.04), `-jammy` (22.04), and `-resolute` (Ubuntu 26.04).
  - **Pinning:** "It is recommended to always pin your Docker image to a specific version if possible". On a version mismatch, "Playwright will be unable to locate browser executables".
  - **Run flags:** `--init` is recommended. `--ipc=host` "is recommended when using Chromium", which can otherwise "run out of memory and crash".
  - **Users:** running as root is fine for trusted tests. For untrusted content, use `pwuser` with the seccomp profile.
  - **Unsupported:** Alpine and other musl-based distributions.
  - **Intended use:** the image is "intended to be used for testing and development purposes only".
  - **Remote mode:** run `npx -y playwright@1.64.0 run-server --port 3000 --host 0.0.0.0` in the container, and connect from the host with `PW_TEST_CONNECT_WS_ENDPOINT` or `browserType.connect()`. "Ensure the Playwright version in your tests matches the version running in the Docker container." Use `--add-host=hostmachine:host-gateway` to reach services on the host.
  - **Not covered:** the page does not discuss which fonts the images include. Its devcontainer example is still on v1.57.0.
  — [Playwright: Docker](https://playwright.dev/docs/docker)
- **Headless modes and engines:**
  - Playwright ships "a separate chromium headless shell", which is the default when running headless.
  - "You can opt into the new headless mode by using `'chromium'` channel".
  - Install flags: `--only-shell` and `--no-shell`.
  - New headless "is the real Chrome browser, and is thus more authentic" (Playwright quoting Chrome's docs).
  - Playwright's WebKit is built from WebKit main, and "for the closest-to-Safari experience you should run WebKit on mac".
  — [Playwright: Browsers](https://playwright.dev/docs/browsers)
- **Chrome for Testing:**
  - 1.57 (2025-11-25): "Playwright switches from Chromium, to using Chrome for Testing builds. Both headed and headless browsers are subject to this ... We're expecting no functional changes". Arm64 Linux stayed on Chromium. — [v1.57.0 release](https://github.com/microsoft/playwright/releases/tag/v1.57.0)
  - 1.63 (2026-09-04): arm64 Linux now also downloads the Chrome for Testing build. — [v1.63.0 release](https://github.com/microsoft/playwright/releases/tag/v1.63.0)
  - OS support changes: 1.61 added Ubuntu 26.04, 1.62 dropped Debian 11, and 1.63 dropped Ubuntu 20.04. — [Playwright release notes](https://playwright.dev/docs/release-notes)
- **Chrome headless history:**
  - Background (2024-10-23, effective from Chrome 132): "the old Headless mode will be removed in Chrome 132". After that, `--headless=old` prints an error. Users should migrate to `chrome-headless-shell` or to new headless. — [Chrome blog: Removing --headless=old](https://developer.chrome.com/blog/removing-headless-old-from-chrome)
  - Background (undated page that references Chrome 120): `chrome-headless-shell` is the old headless mode as a standalone binary. It is a lightweight wrapper around Chromium's `//content` module with fewer dependencies. New headless is "more authentic, reliable". The shell suits "automated screenshotting or web scraping", while new headless suits "high-accuracy end-to-end web app testing". — [Chrome blog: chrome-headless-shell](https://developer.chrome.com/blog/chrome-headless-shell)
- **Playwright's default Chromium flags (main-branch source):**
  - Always on: `--force-color-profile=srgb`.
  - `--enable-features=CDPScreenshotNewSurface`, unless the environment variable `PLAYWRIGHT_LEGACY_SCREENSHOT` is set.
  - Disabled features include `PaintHolding`.
  - `--enable-unsafe-swiftshader` is always added, citing Chromium issue 40277080.
  - Headless adds `--hide-scrollbars`, `--mute-audio`, and the hover/pointer `--blink-settings`.
  — [chromiumSwitches.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/chromiumSwitches.ts), [chromium.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/chromium.ts)
- **How those flags changed (commit history of chromiumSwitches.ts):**
  - "try the new CDPScreenshotNewSurface feature on cr-tot" (PR #36092, 2025-05-28).
  - "enable new screenshots implementation in Chromium" ([PR #37201](https://github.com/microsoft/playwright/pull/37201), merged 2025-08-27). It references [#33330](https://github.com/microsoft/playwright/issues/33330): screenshots hung on focus-emulated pages with new headless.
  - "'fix' range control on linux headless shell" ([PR #38592](https://github.com/microsoft/playwright/pull/38592), merged 2025-12-17).
  — [commit history](https://github.com/microsoft/playwright/commits/main/packages/playwright-core/src/server/chromium/chromiumSwitches.ts)
- **GPU and SwiftShader:**
  - Automatic fallback to SwiftShader-backed WebGL "has been deprecated". "WebGL context creation will soon fail instead of falling back to SwiftShader".
  - `--enable-unsafe-swiftshader` opts in, but "is not intended for running untrusted content". For WebGL the switches are `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`.
  - "Chromium and other browsers do not guarantee WebGL availability".
  — [Chromium docs: SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)
  - (search snippet only) The blink-dev "Intent to Remove: SwiftShader Fallback" was posted in February 2025. — [blink-dev thread](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ)
- **Fonts, maintainer view (2026-05-20):** on a glyph that rendered inconsistently in CI, a collaborator (dgozman) said: "This is most likely related to fonts. Either your environment does not always have the same fonts, or the fonts are not loaded by the time you take the screenshot ... `toHaveScreenshot()` ... aims to solve issues like that". Later he called it "a browser-specific rendering issue ... unlikely we can do anything on Playwright side". The user worked around it by switching to a different glyph. — [#40922](https://github.com/microsoft/playwright/issues/40922)
- **Fonts, WebKit hang (open):** a Playwright member (yury-s, 2026-10-05) traced a WebKit regression to WebKit commit 312933@main (WebKit bug 312121).
  - **Trigger:** an `@font-face` whose `local()` font isn't installed, followed by a `url()` source, and not used by any text (for example because of `unicode-range`).
  - **Effect:** the face stays "loading", `document.fonts.ready` never resolves, and `page.screenshot()` waits forever.
  - **When:** the Playwright bot bisected it to the WebKit roll from r2291 to r2293, in the 1.61 alpha builds.
  — [#42986](https://github.com/microsoft/playwright/issues/42986)
- **Fonts, headless shell (open):** on 1.63 with Chromium 153's headless shell, "default font families are lost after any screenshot captured beyond the viewport". Upstream Chromium issue 574315013 (dgozman, 2026-10-16). — [#42962](https://github.com/microsoft/playwright/issues/42962)
- **WebKit performance regression:** Linux WebKit r2370 (shipped in 1.64.0 and 1.64.1) rendered pages with `backdrop-filter` at about 0 fps on 2 CPUs. r2369 and r2373+ were fine (title; closed 2026-10-15). — [#43426](https://github.com/microsoft/playwright/issues/43426)
- **Background (2022), cross-OS:** "There's not much you can do to get the same screenshots between OSes. You can use a container to run your visual tests" (dgozman). — [#18240](https://github.com/microsoft/playwright/issues/18240)
- **Background (2023), font flags and macOS:** aslushnikov suggested trying `--font-render-hinting=none`, `--disable-skia-runtime-opts`, `--disable-font-subpixel-positioning`, and `--disable-lcd-text`. He found a 1px text offset between two Macs with the same specs. He noted that display DPI matters on Mac even when headless, and said "it is relatively hard to build an exact host environment for browser tests on MacOS ... I'd recommend running tests inside a docker container". — [#20097](https://github.com/microsoft/playwright/issues/20097)
- **No "capture as-is" mode (2026-05):** a user asked for a screenshot API that doesn't wait for stability or fonts. A Playwright member (yury-s) pointed to video recording or screencast frames instead. — [#41532](https://github.com/microsoft/playwright/issues/41532)

### Inferences
- **Font flags are not official guidance:** none of the 2023 hinting and anti-aliasing flags appear in Playwright's 2026 default switches. They remain a troubleshooting suggestion, and adding them would change every baseline.
- **Baselines shifted in 2025–2026 with no user config change:**
  - the new Chromium screenshot surface, merged 2025-08-27 (by date, first shipped in 1.56.0 on 2025-10-06);
  - the 1.57 switch to Chrome for Testing;
  - the 1.64 `screen` forwarding.
  Runner-change detection should therefore record at least: Playwright version, browser build, headless mode, the legacy-screenshot environment variable, the image tag or digest, and OS/arch.
- **Switching headless mode means re-baselining:** Playwright's default headless shell is the mode Chrome itself positions for screenshotting. Moving to new headless (`channel: 'chromium'`) changes the baseline.
- **Firefox and WebKit are best-effort lanes:** they carry more open 2026 rendering and emulation defects (fonts, media queries in shadow DOM, COOP, performance regressions) than Chromium.

### Gaps
- I found no official 2025–2026 document listing concrete macOS vs Linux vs Windows rendering differences, such as font rasterizers. There are only the general Playwright statement and maintainer comments.
- Which fonts the official Docker images include is not documented on the Docker page.
- Whether the new Chromium screenshot surface changes pixel output compared with the legacy path is undocumented; PR #37201 has no description.
- I did not inspect which flag PR #38592 added.

---

## 5. Pseudo-localization tooling usable during visual capture

### Takeaway
An MIT-licensed, actively maintained library (`pseudo-localization`, v3.x, 2025 releases, last push 2026-09-24) can pseudo-localize a live page with accented, expanded text or with bidirectional text, and it keeps up with DOM changes. That makes it practical to inject at capture time. Android documents the en-XA / ar-XB pseudo-locale pattern. I found **no visual-testing vendor with built-in pseudo-localization**, only an in-house Storybook decorator at Mozilla Thunderbird (unverified).

### Cited Findings
- **Repository:** `tryggvigy/pseudo-localization`, MIT license, 141 stars, last push 2026-09-24. GitHub releases: v3.0.4 (2025-02-23), and v3.0.1 and v3.1.1 (both 2025-02-24). — [GitHub: tryggvigy/pseudo-localization](https://github.com/tryggvigy/pseudo-localization)
- **README:**
  - `pseudo-localization/dom` will "Automatically localize the entire page or parts of the DOM".
  - `PseudoLocalizeDom.start()` "Pseudo-localizes the page and watches for DOM changes" and returns a stop function. "Changes to the DOM trigger pseudo-localization in real time".
  - Strategies: `accented` ("Expands text and replaces Latin letters with accented Unicode counterparts") and `bidi`.
  - `blacklistedNodeNames` defaults to `['STYLE']`.
  - Also offers a string function (`pseudoLocalizeString`) and a CLI with `--strategy`.
  - Its stated motivation includes "Text Overflow – Translations are often longer than the original text".
  — [README](https://github.com/tryggvigy/pseudo-localization)
- (search snippet only) jsDelivr hosts a README for `pseudo-localization@3.1.2`, which may be newer than the latest GitHub release. — [jsDelivr](https://cdn.jsdelivr.net/npm/pseudo-localization@3.1.2/README.md)
- (search snippet only; the fetch returned 503) Mozilla Thunderbird's Storybook has an in-house `withPseudoLocalization` decorator. It offers default, accented, and bidi strategies and sets `dir` on the story root. — [searchfox](https://asuth.searchfox.org/comm-central/source/mail/components/storybook/.storybook/addon-fluent/withPseudoLocalization.mjs)
- Android's en-XA and ar-XB pseudo-locales and the bug classes they target are covered in §3. — [Android: pseudolocales](https://developer.android.com/guide/topics/resources/pseudolocales)
- None of the fetched vendor pages mention pseudo-localization: Chromatic modes and themes, Argos story modes, Happo configuration, Percy responsive testing, and Applitools browsers. Chromatic and Argos handle locale only through Storybook globals (Argos via `storybook-i18n`).

### Inferences
- **Injecting it from a Playwright CLI:** load the library's DOM module with `page.addInitScript` or `page.addScriptTag`, then call `start({ strategy })`. For bidi, also set `document.documentElement.dir = 'rtl'`.
- **Risk:** frameworks that re-render text, or that compare server and client text during hydration, may conflict with the rewrite. Starting it after hydration, once the page is stable, is safer. This is unverified.
- **Locale emulation is not pseudo-localization:** Playwright's `locale` changes only `navigator.language`, `Accept-Language`, and Intl formatting. App strings won't expand unless the app serves translations for that locale. The two are separate mode dimensions.

### Gaps
- I found no commercial visual tool with native pseudo-localization, though the search was not exhaustive (Storybook addon registry, npm).
- The library's behavior inside Shadow DOM and iframes was not verified.

---

## 6. How snapshot counts multiply with matrices, and vendor advice for bounding counts and CI time

### Takeaway
Counts multiply linearly in every documented tool: tests × builds × browsers × modes in Chromatic, and pages × widths × browsers in Percy, where failed attempts also count. The documented levers are:
- change-based skipping (Chromatic TurboSnap);
- scoping modes to components or stories, with per-story opt-out (Chromatic, Argos);
- starting small (Applitools: "2–3 desktop widths + a phone");
- parallel chunking (Happo, with an overhead warning);
- explicit include/exclude pruning in open-source practice (Primer).

No vendor imposes mode limits.

### Cited Findings
- **Chromatic:**
  - Visual snapshots = Tests × Builds × Browsers × Modes, and accessibility snapshots = Tests × Builds × Modes.
  - TurboSnap: copied snapshots are billed at 0.2 and bypassed ones at 0.
  - `disableSnapshot` and story exclusion cost 0. Ignore regions save nothing.
  — [Chromatic: Billing](https://www.chromatic.com/docs/billing/)
  - "Two stories with two modes" gives four tests. — [Chromatic blog, Background 2023](https://www.chromatic.com/blog/introducing-story-modes/)
- **Percy:** one page × 2 browsers × 3 widths = 6. "Each responsive width counts as a separate screenshot", and failed attempts count. — [Percy FAQ](https://www.browserstack.com/support/faq/percy/usage-and-troubleshooting/how-does-percy-calculate-the-snapshot-screenshot-usage); [Percy responsive](https://www.browserstack.com/docs/percy/visual-testing-workflows/view-percy-build-results/responsive-testing)
- **Applitools:** "Start with 2–3 desktop widths + a phone. Expand as needed." — [Applitools](https://applitools.com/docs/eyes/sdks/storybook/api/browsers)
- **Happo:** `chunks` runs a target's work in parallel. Parallelism "isn't guaranteed", and chunking adds overhead for small suites. `chunks: 1` disables it. — [Happo](https://docs.happo.io/docs/configuration)
- **Playwright:** with multiple projects, the "project name will be used instead of `chromium`" in snapshot file names, so each project is its own baseline set. — [Playwright: Visual comparisons](https://playwright.dev/docs/test-snapshots)
- **Primer:** `matrix()` with `include`/`exclude` prunes the cartesian product of dimensions. — [primer/react matrix.ts](https://github.com/primer/react/blob/HEAD/e2e/test-helpers/matrix.ts)

### Inferences
- **Worked example** (arithmetic for 40 routes at 375/768/1440 in Chromium only):

  | Configuration | Captures |
  |---|---|
  | Today | 40 × 3 = 120 |
  | Plus a full dark mode | 240 |
  | Plus forced colors at 375 only | 280 |
  | Plus an expanded pseudo-locale at 375 only | 320 |
  | All of the above, with Firefox and WebKit also enabled | 960 |

  A DSF-2 HiDPI mode with `scale: 'device'` at one viewport adds 40 captures, each about 4× the pixels.
- **Cost grows with pixels:** pixelmatch time and baseline storage on the orphan branch grow roughly linearly with total pixels. Pruning by mode × viewport, rather than taking the full product, is the main control.
- **Change-based scoping matters most for PRs:** TurboSnap-style scoping is the documented largest lever. The tool's existing `smartFilter` changed-file scoping is the analogue. Running extra modes only on changed routes in PRs, and the full matrix on main or nightly, would extend it.

### Gaps
- No vendor publishes CI time per mode or a recommended maximum number of modes.
- I found no published guidance on whether to capture all modes at all viewports, beyond scoping and "start small".

---

## Roadmap implications

Tags:
- **NEW:** not on the current roadmap.
- **EVIDENCE-FOR-EXISTING-ITEM:** supports an item already on the roadmap.
- **ALREADY-SHIPPED:** the capability exists today; the evidence confirms or refines it.

I tagged these against `docs/ROADMAP.md` at HEAD (read-only check).

1. **NEW — Named modes and a matrix captured in one run, starting with light + dark.**
   - **Configuration:** a named mode bundles context options, for example `modes: { light: { colorScheme: 'light' }, dark: { colorScheme: 'dark' } }`. Modes are applied globally, per route, or per story, are inherited, and can be turned off per item.
   - **Defaults:** the default mode keeps today's baseline paths, so turning the feature on causes no baseline churn.
   - **Isolation:** each mode gets a fresh `BrowserContext`.
   - **Evidence:** Chromatic modes and themes, Argos story modes, Happo targets, Primer themes, and Fluent variants (§1). This extends the shipped single `colorScheme` value; the current inability to capture both schemes in one run is the gap.
2. **NEW — A settings fingerprint stored with each mode's baselines, with a warning when it changes.** Chromatic and Argos key baselines "solely on the name", so an edited mode is silently compared against old baselines (§1). This is cheap, and it fits the pixelmatch-only gate because it warns rather than changing pass/fail.
3. **NEW — Expose per-mode context options:** `locale`, `timezoneId`, `reducedMotion`, `forcedColors`, `contrast` (Playwright 1.51 or later), and `deviceScaleFactor`.
   - **How:** pass them straight to `browser.newContext()`, which worked even when the test runner silently dropped `reducedMotion` before 1.63 (#42001).
   - **Pairing:** pair `timezoneId` with the shipped `freezeTime`, because date strings depend on both. The emulation guide notes that the runner's timezone is separate (`TZ`).
   - **Evidence:** §2.
4. **NEW — Check emulation before each capture.** Probe `matchMedia` for color scheme, contrast, forced colors, and reduced motion, plus `devicePixelRatio`, `navigator.language`, and the resolved Intl time zone.
   - **On mismatch:** fail with the tool-error exit code, not as a pixel diff.
   - **Evidence:** Firefox silently loses colorScheme, DSF, contrast, and media after COOP navigations (#43287). Before 1.63 the runner silently dropped reducedMotion (#42001).
   - **Caveat:** in WebKit, styles can be stale while `matchMedia` is correct (#43501). Prefer a new context per viewport over calling `setViewportSize` repeatedly, at least for WebKit.
5. **NEW — Forced-colors and `prefers-contrast: more` modes, supported on Chromium first.** Mark them experimental on Firefox and WebKit until someone verifies that the page actually repaints. Default them to one viewport.
   - **Evidence:** MDN lists the properties forced colors overrides (§3). Playwright's tests only assert `matchMedia` (EM-010). A 2024 report of no repaint in Firefox and WebKit was never resolved (#33765).
6. **NEW — A HiDPI mode: `deviceScaleFactor: 2` captured with `scale: 'device'`.**
   - **Guardrails:** document the roughly 4× pixel and storage cost, recommend a single viewport, and probe DSF before capture (item 4).
   - **Evidence:** the `scale` docs and #36628 (`'css'` hides DSF), plus the Firefox DSF loss in #43287.
7. **NEW — A reduced-motion mode, kept separate from freezing animations at capture time.**
   - **Why it's separate:** Playwright's `animations: 'disabled'` fast-forwards or cancels animations at capture time. `prefers-reduced-motion` exercises the author's reduced-motion CSS or JS (WCAG C39).
   - **Defaults:** offer it as an opt-in mode or as a global determinism setting. Happo defaults it on, but flipping the default here would re-baseline everyone.
8. **NEW (experimental) — A pseudo-locale mode.**
   - **How:** inject the MIT `pseudo-localization` DOM module. Use `accented` for text expansion, and `bidi` together with `dir="rtl"`. Capture at the narrowest viewport by default.
   - **Evidence:** Android pseudo-locale guidance, the W3C expansion table, and the library README (§3, §5).
   - **Status:** no vendor offers this, so it would be a differentiator, but its yield is unproven. Hydration conflicts are a risk; start it after the page is stable.
9. **NEW — Matrix pruning and a projected count before running.**
   - **Pruning:** support `include`/`exclude` combinations, as in Primer's `matrix()`, and per-mode viewport subsets.
   - **Projection:** print the projected capture count and pixel budget before a run, or offer a dry-run that only counts.
   - **Evidence:** linear multiplication (Chromatic formula, Percy FAQ), "start with 2–3 widths + a phone" (Applitools), and per-story scoping (Chromatic, Argos).
10. **ALREADY-SHIPPED, with a small NEW extension — change-based scoping.** The shipped `smartFilter` changed-file scoping is the local counterpart of TurboSnap, which Chromatic documents as its largest lever. Extension: in PR runs, apply extra modes only to changed routes, and run the full matrix on main or nightly.
11. **EVIDENCE-FOR-EXISTING-ITEM #289 ("warn when the capture runner changes").**
    - **What to record** in each baseline set's metadata: Playwright version, browser name and build (Chrome for Testing or Chromium), headless shell vs new headless channel, `PLAYWRIGHT_LEGACY_SCREENSHOT`, the Docker image tag or digest, and OS/arch. Warn when any of them changes.
    - **Evidence of runner changes that shifted output in 2025–2026:** the new Chromium screenshot surface (PR #37201, merged 2025-08-27), the switch to Chrome for Testing (1.57), arm64 Linux on Chrome for Testing (1.63), the `screen` descriptor change (1.64), the removal of old headless in Chrome 132, and the WebKit regressions #42986 and #43426.
12. **ALREADY-SHIPPED, plus an optional NEW extension — the pinned linux/amd64 Docker renderer.**
    - **Confirmation:** it matches Playwright's guidance to pin image tags and match Playwright versions, and maintainers' advice to use containers for cross-OS consistency (#18240, #20097). Check that the renderer uses `--init` and `--ipc=host` and avoids Alpine.
    - **Extension:** a "remote renderer" option that runs Playwright `run-server` inside the pinned container and connects from the host CLI. Developers on macOS and Windows would then get Linux-identical renders without running the whole CLI in Docker (Docker docs, remote connection section).
13. **DO-NOT-BUILD by default — font hinting and anti-aliasing flags** (`--font-render-hinting=none`, `--disable-lcd-text`, `--disable-font-subpixel-positioning`, `--disable-skia-runtime-opts`). These were a 2023 maintainer troubleshooting suggestion (#20097). They are absent from Playwright's 2026 defaults and would re-baseline everyone. Container pinning is the officially recommended route. At most, allow passing launch args through.
14. **DO-NOT-BUILD — sharing baselines across operating systems** (macOS locally vs Linux in CI). Maintainers say pixel-identical cross-OS output isn't achievable (#18240), and Playwright suffixes snapshots by platform. Keep baselines Docker-only, as shipped.
15. **DO-NOT-BUILD — GPU rendering or WebGL determinism guarantees in CI.** Chromium is deprecating the SwiftShader WebGL fallback and "do[es] not guarantee WebGL availability". Playwright already forces `--enable-unsafe-swiftshader`. Recommend the shipped ignore masks for canvas and WebGL areas.
16. **NEW (small) — Font robustness.**
    - Use a capture timeout with a clear diagnostic when `document.fonts.ready` hangs. WebKit on Linux can hang forever (#42986).
    - Document that Playwright already waits for fonts. The `PW_TEST_SCREENSHOT_NO_FONTS_READY` escape hatch exists only in source, so treat it as fragile.
    - Recommend bundled web fonts over system default families. In Chromium headless shell, default families can be lost after a capture beyond the viewport (#42962). This matters for full-page captures.
17. **EVIDENCE-FOR-EXISTING-ITEM #290 (prune PNG history on the orphan branch).** Matrices multiply stored baselines linearly, and a DSF-2 device-scale capture is about 4× the pixels. Playwright 1.62/1.64 can emit lossless WebP (quality 100), a candidate storage format. Because pixelmatch compares decoded RGBA, any lossless format preserves the gate; the size benefit is unmeasured.
18. **ALREADY-SHIPPED (confirmed) — stability and determinism controls.** The shipped `waitForStability` consecutive-frame convergence matches `toHaveScreenshot`'s rule of waiting for "two consecutive page screenshots" to match. `freezeTime` and `seedRandom` cover clock and randomness. **NEW, small, may already be done:** pass capture options explicitly (`animations: 'disabled'`, `caret: 'hide'`, an explicit `scale`) rather than relying on API defaults. `page.screenshot()` defaults may differ from `toHaveScreenshot` (Gap in §2).

---

## Query log

**WebSearch queries (verbatim, in order):**
1. `Percy snapshot widths browsers screenshot count`
2. `Happo targets configuration docs`
3. `Argos visual testing Storybook modes`
4. `Applitools Ultrafast Grid browsers devices configuration docs`
5. `old headless mode removed from Chrome binary chrome-headless-shell`
6. `pseudo-localization Storybook addon`
7. `dark mode visual regression bugs caught screenshots`
8. `DevTools emulate forced-colors media feature Chrome rendering`
9. `SwiftShader WebGL fallback deprecation Chrome headless`
10. `RTL layout bugs visual regression testing right-to-left`
11. `Chromatic modes apply selectively snapshots cost viewports themes locales`

**GitHub search queries (`gh search`, verbatim):**
1. `gh search issues --repo microsoft/playwright "forcedColors"`
2. `gh search issues --repo microsoft/playwright "forced-colors"`
3. `gh search issues --repo microsoft/playwright "font-render-hinting"`
4. `gh search issues --repo microsoft/playwright "screenshot different linux mac"` (0 results)
5. `gh search issues --repo microsoft/playwright "toHaveScreenshot font rendering" --created ">=2025-01-01"` (0 results)
6. `gh search issues --repo microsoft/playwright "screenshot anti-aliasing gpu"` (0 results)
7. `gh search issues --repo microsoft/playwright "headless shell screenshot difference" --created ">=2025-01-01"` (0 results)
8. `gh search issues --repo microsoft/playwright "screenshot macOS linux"` (0 results)
9. `gh search issues --repo microsoft/playwright "deviceScaleFactor screenshot"` (0 results)
10. `gh search code "fonts.ready" --repo microsoft/playwright`
11. `gh search code "toHaveScreenshot themes" --repo primer/react` (0 results)
12. `gh search code "getStoryVariant HIGH_CONTRAST" --repo microsoft/fluentui` (0 results)
13. `gh search issues --repo microsoft/playwright "fonts" --created ">=2025-06-01"`
14. `gh search code "forcedColors" --repo microsoft/playwright`
15. `gh search issues --repo microsoft/playwright "deviceScaleFactor" --created ">=2025-01-01"`

**Direct lookups (not searches):**
- **WebFetch, successful:**
  - chromatic.com/docs/modes/, chromatic.com/docs/billing/, chromatic.com/docs/themes/, chromatic.com/blog/introducing-story-modes/
  - argos-ci.com/docs/learn/how-to-guides/visual-coverage/storybook-story-modes
  - browserstack.com Percy FAQ (usage calculation) and Percy responsive-testing page
  - docs.happo.io/docs/configuration
  - applitools.com/docs/eyes/sdks/storybook/api/browsers
  - playwright.dev: class-page (emulateMedia), class-browser (newContext), release-notes, test-snapshots, class-pageassertions, docker, browsers, emulation
  - developer.chrome.com: blog/chrome-headless-shell and blog/removing-headless-old-from-chrome
  - chromium.googlesource.com docs/gpu/swiftshader.md
  - developer.mozilla.org forced-colors
  - w3.org WCAG C39 and the text-size article
  - developer.android.com pseudolocales
- **WebFetch, failed:** argos-ci.com/docs/storybook-story-modes (404), argos-ci.com/changelog/2025-04-01-storybook-story-modes (404), the searchfox Thunderbird decorator (503). The Percy build-results URL redirected and was re-fetched at its new location.
- **`gh api` reads (public repos):**
  - Playwright releases list and the v1.51.0, v1.57.0, v1.63.0, and v1.64.0 release bodies.
  - Playwright issues and comments: 33765, 43287 (plus timeline), 43298, 42001, 40922, 16519, 18240, 20097, 34521, 33330, 42962, 42986, 43501, 43004, 41532, 36628.
  - Playwright PRs 37201 and 38592; commit history of chromiumSwitches.ts.
  - Playwright files: chromiumSwitches.ts, chromium.ts, screenshotter.ts, crPage.ts, wkPage.ts, juggler TargetRegistry.js and PageHandler.js, firefox bootstrap.diff, tests/page/page-emulate-media.spec.ts.
  - tryggvigy/pseudo-localization metadata, releases, and README.
  - microsoft/fluentui `apps/vr-tests-react-components/src/utilities/` listing and getStoryVariant.tsx.
  - primer/react `e2e/test-helpers/` listing and themes.ts, matrix.ts, viewports.ts.
- **Local, read-only, no outbound traffic:** `git show --stat HEAD` and `grep` on `docs/ROADMAP.md`, to tag the roadmap implications.

**Confidentiality check:** no query included the product name, its domain, the owner or org name, internal file names, or product code. All queries named only categories or public projects and vendors (Playwright, Chromatic, Percy, Happo, Argos, Applitools, Chrome, Primer, Fluent UI, pseudo-localization).

**Security note:** no fetched page, README, issue, or search result tried to instruct an AI tool. Several Playwright issue comments are automated "Playwright bot" analyses, sometimes posted through a maintainer's account (#43287 says "the Playwright bot looked into this on my behalf"). I treated them as data and labeled them where relied on. Search results from AI-generated "skills" registries and content-farm blogs (tessl.io, qaskills.sh, skills.sh, openskillindex.com) were treated as low-quality and not relied on.

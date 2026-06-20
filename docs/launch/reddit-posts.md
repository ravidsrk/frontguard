# Reddit Posts

> Each post leads with value and discloses affiliation. Engage in the comments;
> don't drop-and-run. Space posts across 2–3 days.

---

## r/webdev

**Title:** How we cut visual-regression false positives (the 40% of red runs that aren't real bugs)

**Body:**

If you've ever added visual regression tests and then muted the channel they post
to, this is for you. The killer isn't detection — pixel diffing has been solved for
years — it's that ~40% of failures are noise: font anti-aliasing, dynamic content,
lazy images, sub-pixel jitter. Once a red run "usually means nothing," people stop
looking.

A few things that actually helped us, regardless of tooling: (1) render each page
more than once and only trust diffs that repeat — most flake is single-frame; (2)
classify *what* changed, not *how many pixels* — "button lost its background" is
actionable, "47px changed" isn't; (3) stop committing baseline PNGs to main (they
bloat history forever) — we moved ours to a git orphan branch.

I ended up building these ideas into an open-source CLI tool called Frontguard
(MIT, Playwright-native, uses a vision model with your own API key to classify
diffs). Repo's here if useful: https://github.com/ravidsrk/frontguard — but mostly
curious how others are taming false positives. What's worked for you?

---

## r/reactjs

**Title:** Visual testing React apps without Storybook — testing real routes instead of isolated components

**Body:**

Most visual testing advice for React assumes Storybook. That's great for a design
system, but a lot of bugs only show up when real data, real routing, and real CSS
cascade collide on an actual page. Component-in-isolation snapshots miss those.

I've been testing deployed routes directly with Playwright instead, and the main
challenge is flake (fonts/layout/lazy images) plus false positives from dynamic
content. Two things that helped: multi-render consensus (only count a diff if it
shows up across several renders) and classifying diffs with a vision model so a
"new blog title" gets labeled content_update instead of failing the build.

I packaged this as an open-source tool, @frontguard/cli + @frontguard/playwright
(MIT). The Playwright integration is ~3 lines:

```ts
import { expectVisual } from "@frontguard/playwright";
test("home", async ({ page }) => { await page.goto("/"); await expectVisual(page); });
```

Repo: https://github.com/ravidsrk/frontguard. Curious whether folks here test full
routes or stick to Storybook-level snapshots — and why.

---

## r/node

**Title:** A CLI-first approach to visual regression testing (BYO model key, self-hostable)

**Body:**

Sharing an approach in case it's useful for anyone wiring visual checks into a
Node CI pipeline. The goal was a tool that runs entirely from the command line, no
mandatory SaaS, with results you actually trust.

The flow: `npx -p @frontguard/cli frontguard run --url <url>` captures screenshots with Playwright,
renders each target multiple times to filter flake, and on a real diff sends
before/after to a vision model (OpenAI or Anthropic — your key, images don't pass
through any server I run) to classify it as regression / intentional /
content_update. Baselines are stored on a git orphan branch instead of bloating
main. It's MIT and self-hostable end to end.

Packages: @frontguard/cli and @frontguard/playwright. Repo:
https://github.com/ravidsrk/frontguard. Feedback on the CLI ergonomics and CI
integration especially welcome — what would make this drop cleanly into your
pipeline?

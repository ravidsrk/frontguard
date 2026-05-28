# Show HN

**Title:**

Show HN: Frontguard – open-source visual regression testing that uses AI to kill false positives

**URL:** https://github.com/ravidsrk/frontguard

**Body:**

I've watched a lot of teams add visual regression tests and then quietly mute the
channel they post to. The reason is always the same: false positives. Roughly 40%
of pixel-diff runs go red for things that aren't real bugs — a 2px font shift, a
date that changed, a lazy image that loaded differently. Once people learn that
red usually means "nothing," the tool is dead. Existing options didn't fix this
for me: Percy hits a pricing cliff fast, Chromatic is great but Storybook-locked,
BackstopJS is unmaintained, and Lost Pixel got archived. So I built Frontguard — a
CLI-first, Playwright-native tool that treats false positives as the actual
problem to solve.

It works in three parts. When pixels differ, it sends the before/after to a vision
model (OpenAI or Anthropic, bring-your-own-key — images never touch a server I
run) and classifies the change as regression, intentional, or content_update, so
you get "the submit button lost its background" instead of "47 pixels changed."
Before that, an anti-flake step renders each target multiple times and only counts
differences that are consistent across renders, which filters transient noise (and
keeps the model bill down). Baselines live on a git orphan branch so they're
versioned with your code without bloating main. It's MIT licensed, self-hostable,
and on npm as @frontguard/cli and @frontguard/playwright (`npx frontguard run
--url http://localhost:3000`). I'd love feedback, especially on where the
classifier gets it wrong — site is https://frontguard.dev.

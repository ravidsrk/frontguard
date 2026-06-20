# X / Twitter Thread

> 8 tweets. Hook → problem → solution (3 pillars) → demo → honesty → CTA.
> Keep each under 280 chars. Attach a short demo GIF to tweet 6.

---

**1/ (hook)**

Everyone adds visual regression tests. Then everyone mutes the channel they post
to.

The problem was never detecting changes. It's that ~40% of "failures" aren't real
bugs.

We built Frontguard to fix exactly that. 🧵

---

**2/ (problem)**

The failure mode you know: run goes red, you open the diff, and it's a 2px font
shift. Or a date that changed. Or a lazy image. Or nothing visible at all.

Once red "usually means nothing," the tool is dead. Worse than no tests.

---

**3/ (why existing tools don't cut it)**

Percy → hits a $399/mo pricing cliff fast.
Chromatic → great, but Storybook-locked.
BackstopJS → unmaintained.
Lost Pixel → archived.

Nothing open + maintained that treats false positives as THE problem. So we built
it.

---

**4/ (solution — pillar 1)**

Frontguard classifies diffs with AI vision (OpenAI/Anthropic, bring-your-own-key).

Every change is labeled: regression / intentional / content_update.

You get "the button lost its background" — not "47 pixels changed."

---

**5/ (solution — pillars 2 & 3)**

🌀 Anti-flake: renders each page multiple times, only trusts diffs that repeat. Most
flake is single-frame.

🌿 Baselines live on a git orphan branch — versioned with your code, zero bloat on
main.

CLI-first. Playwright-native.

---

**6/ (demo)**

It's one command:

  npx -p @frontguard/cli frontguard run --url http://localhost:3000

…or 3 lines with @playwright via @frontguard/playwright.

Demo 👇 (capture → diff → AI verdict in seconds)

[attach demo gif]

---

**7/ (honesty)**

Not magic: you depend on a model API and pay per judged diff (the anti-flake
pre-filter keeps that small). The classifier can be wrong on edge cases, so you
stay in the loop with approve/reject. We're publishing real false-positive numbers
as we validate.

---

**8/ (CTA)**

Frontguard is MIT, self-hostable, npm-installable today.

If you've ever muted a visual-test channel, I want your eyes on this — especially
where the classifier gets it wrong.

⭐ Repo: github.com/ravidsrk/frontguard
🌐 frontguard.dev

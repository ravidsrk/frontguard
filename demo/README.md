# Frontguard Demo Assets

Reproducible demo recordings for the README and landing page.

## Files

| File | Description | How to regenerate |
|------|-------------|-------------------|
| `frontguard-demo.tape` | VHS tape file (source of truth) | edit this |
| `frontguard-demo.gif` | Terminal recording for README | `vhs frontguard-demo.tape` |
| `frontguard-report.mp4` | Screen recording of the HTML report | manual capture |

## Regenerating the terminal recording

[VHS](https://github.com/charmbracelet/vhs) produces deterministic recordings from a tape file — no manual screen capture, no flaky timing.

```bash
# Install VHS
brew install vhs            # macOS
go install github.com/charmbracelet/vhs@latest   # any platform

# Render the GIF (output path is set inside the tape)
vhs demo/frontguard-demo.tape
```

The tape demonstrates the core flow:

1. `frontguard init` — generates a framework-aware config
2. `cat frontguard.config.ts` — shows the config
3. `frontguard doctor` — verifies the environment
4. `frontguard run` — runs visual regression tests
5. AI classification output — the differentiator

## Output formats

VHS can emit GIF, MP4, or WebM from the same tape. Change the `Output` line in
`frontguard-demo.tape`:

```
Output demo/frontguard-demo.gif
Output demo/frontguard-demo.mp4
Output demo/frontguard-demo.webm
```

## Constraints

- Keep the GIF **under 2MB** so it loads fast above the README fold.
- Keep total runtime **under ~20 seconds** — developers won't watch longer.
- The HTML report screen recording (`frontguard-report.mp4`) is captured
  manually since it shows a browser, not a terminal.

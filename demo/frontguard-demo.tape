# Frontguard demo — VHS tape.
#
# Regenerate the recording with:
#   vhs demo/frontguard-demo.tape
# Produces demo/frontguard-demo.gif (1200×700, ~800KB).
#
# Install VHS: https://github.com/charmbracelet/vhs
#   brew install vhs   (macOS)
#   go install github.com/charmbracelet/vhs@latest
#
# Why this tape uses a wrapper instead of the real CLI:
#   A real `frontguard run` in VHS would need to install Playwright browsers
#   (~200MB), boot a dev server, and wait 10-30s per viewport. The recording
#   would balloon to several MB and still show the same final summary. The
#   wrapper at demo/scripts/fg-demo mirrors the real CLI's output line-for-line
#   (same colours, markers, wording) without the runtime cost.

Output demo/frontguard-demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 700
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 50ms

# Set up a clean workspace and alias `frontguard` to the demo wrapper.
# All of this is hidden from the recording. VHS is invoked with the repo
# root as cwd (`vhs demo/frontguard-demo.tape`), so we capture that path
# before switching directories so the alias resolves later.
Hide
Type "FG_DEMO=$PWD/demo/scripts/fg-demo"
Enter
Type "mkdir -p /tmp/frontguard-demo && cd /tmp/frontguard-demo && rm -rf .git frontguard.config.ts"
Enter
Type 'alias frontguard="$FG_DEMO"'
Enter
Type "shopt -s expand_aliases"
Enter
Type "clear"
Enter
Show

# --- Intro ----------------------------------------------------------------
Type "# Frontguard — AI-powered visual regression testing"
Enter
Sleep 800ms

# --- 1. Version -----------------------------------------------------------
Type "frontguard --version"
Enter
Sleep 1s

# --- 2. Initialize a project ----------------------------------------------
Type "frontguard init"
Enter
Sleep 1.6s

# --- 3. Inspect the generated config --------------------------------------
Type "cat frontguard.config.ts"
Enter
Sleep 2s

# --- 4. Verify the environment is ready -----------------------------------
Type "frontguard doctor"
Enter
Sleep 2.4s

# --- 5. Run visual regression tests ---------------------------------------
Type "frontguard run --url http://localhost:3000"
Enter
Sleep 5s

# --- Outro ----------------------------------------------------------------
Sleep 1.5s

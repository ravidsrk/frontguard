# Frontguard demo — VHS tape file.
#
# Regenerate the recording with:
#   vhs demo/frontguard-demo.tape
# Produces demo/frontguard-demo.gif (and can also output MP4/WebM).
#
# Install VHS: https://github.com/charmbracelet/vhs
#   brew install vhs   (macOS)
#   go install github.com/charmbracelet/vhs@latest

Output demo/frontguard-demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 700
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 60ms

# --- Intro ------------------------------------------------------------------
Type "# Frontguard — AI-powered visual regression testing"
Enter
Sleep 1s

# --- 1. Initialize config ---------------------------------------------------
Type "npx frontguard init"
Enter
Sleep 2s

# --- 2. Inspect the generated config ----------------------------------------
Type "cat frontguard.config.ts"
Enter
Sleep 2s

# --- 3. Run the doctor command ----------------------------------------------
Type "npx frontguard doctor"
Enter
Sleep 2.5s

# --- 4. Run visual regression tests -----------------------------------------
Type "npx frontguard run --url http://localhost:3000"
Enter
Sleep 3s

# --- 5. Show AI classification result ---------------------------------------
Type "# ✘ /dashboard @ 375px — AI: 'Sidebar overlaps content (flex-direction)'"
Enter
Sleep 2s

Type "# 🔴 Critical (confidence: 94%) — fix suggested"
Enter
Sleep 2.5s

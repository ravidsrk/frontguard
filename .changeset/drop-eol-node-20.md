---
"@frontguard/cli": minor
"@frontguard/mcp": minor
"@frontguard/netlify-plugin": minor
---

Raise the minimum supported Node.js from 20 to 22.

Node.js 20 has reached end-of-life and no longer receives security patches, so
CI has stopped testing against it (the matrix is now 22 and 24). Continuing to
advertise `engines.node: ">=20"` would claim support for a runtime that is no
longer verified or patched.

**This is a breaking change for consumers still on Node 20.** Installing these
packages under `engine-strict` will now fail with `EBADENGINE`. No API or
runtime behaviour changes accompany it — the packages contain no Node-22-only
code — so the only action required is upgrading Node to 22 or later.

Taken as a minor rather than a patch because it narrows the supported platform
range, and shipped as its own changeset so the constraint is visible in the
changelog rather than arriving unannounced inside an unrelated release.

# =============================================================================
# Frontguard cross-OS rendering image
# =============================================================================
#
# This image freezes the entire visual-regression render stack so a baseline
# captured on a developer's macOS laptop is byte-equivalent to one captured
# in CI on Linux. Without this, Playwright's own docs warn that screenshots
# taken on different operating systems will not match — even with identical
# browsers — because of font hinting, sub-pixel anti-aliasing, and emoji
# tables baked into the host OS.
#
# Version-pin policy
# ------------------
# - Base: pinned to `mcr.microsoft.com/playwright:v1.61.0-jammy`. Microsoft
#   publishes one tag per Playwright release; the browsers (Chromium, Firefox,
#   WebKit) and their patch level are baked into that tag, so a `latest` tag
#   would silently change the rendered output across builds.
# - The base's Playwright minor MUST match the `playwright` version in
#   packages/cli/package.json (currently `1.61.0`, exact-pinned).
#   When bumping `playwright` in package.json, bump this FROM line in the same
#   commit. The build is intentionally simple to make that pairing obvious.
# - Fonts: Liberation (Microsoft-metric Arial/Helvetica/Times substitutes),
#   DejaVu (broad Unicode coverage), and Noto CJK + Color Emoji. These are
#   installed from Ubuntu Jammy's archive at a fixed apt snapshot when the
#   image is built; reproducible-fonts is intentionally pinned here.
# - The CLI itself is installed from a local `npm pack` tarball produced by
#   the docker-compose / build script, so the image self-contains a known
#   `@frontguard/cli` build instead of fetching `latest` from npm at runtime.
#
# Build & tag
# -----------
# The image is NOT yet published to a registry (tracked as an OPS action —
# see docs/ops-actions.md). Until then, build it locally from the repo root.
# First produce the CLI tarball this build context expects, then build with the
# architecture pinned so the rendered bytes match across a mixed fleet:
#
#   (cd packages/cli && npm pack && mv frontguard-cli-*.tgz docker/frontguard-cli.tgz)
#   docker build --platform linux/amd64 \
#     -t frontguard/render:v0.2.0 -t frontguard/render:latest \
#     packages/cli/docker
#
# `--platform linux/amd64` is required: Chromium's rasterizer emits different
# sub-pixel anti-aliasing per architecture, so an arm64 build and an amd64
# build would NOT be byte-equivalent. The `FROM --platform=` directive below
# enforces the same pin at image-build time even if `docker build` omits it.
# =============================================================================

FROM --platform=linux/amd64 mcr.microsoft.com/playwright:v1.61.1-jammy

LABEL org.opencontainers.image.title="frontguard-render" \
      org.opencontainers.image.description="Deterministic cross-OS rendering image for Frontguard visual regression tests" \
      org.opencontainers.image.source="https://github.com/ravidsrk/frontguard" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Frontguard"

# -----------------------------------------------------------------------------
# Fonts: install deterministic-glyph fonts BEFORE installing the CLI so the
# fontconfig cache is warm when Playwright starts rendering. The Microsoft
# Playwright base already ships Liberation + DejaVu via its browser deps, but
# we pin them explicitly here so a future base bump that drops them still
# yields the same glyphs.
# -----------------------------------------------------------------------------
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      fonts-liberation \
      fonts-liberation2 \
      fonts-dejavu-core \
      fonts-dejavu-extra \
      fonts-noto-core \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      fontconfig \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Node modules layout: the Microsoft base ships Node 20 + a global pnpm/npm.
# We install the CLI globally so `frontguard` is on PATH for any user.
# -----------------------------------------------------------------------------
WORKDIR /opt/frontguard

# Accept the local pack tarball produced by `npm pack` in packages/cli/.
# The compose file / build script copies the tarball into the build context
# as `frontguard-cli.tgz`. We install from disk (not the npm registry) so
# the image self-contains the exact CLI bits the user has in their repo.
COPY frontguard-cli.tgz /opt/frontguard/frontguard-cli.tgz

RUN npm install -g /opt/frontguard/frontguard-cli.tgz \
 && npm cache clean --force \
 && rm -f /opt/frontguard/frontguard-cli.tgz

# -----------------------------------------------------------------------------
# Workspace: the user mounts their repo at /workspace and the renderer reads
# their frontguard.config.{ts,js,json} from CWD.
# -----------------------------------------------------------------------------
WORKDIR /workspace

# Render-time env defaults: disable telemetry inside the image (CI/build
# contexts shouldn't beacon home), and make Playwright deterministic.
ENV FRONTGUARD_TELEMETRY=0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production

ENTRYPOINT ["frontguard"]
CMD ["run"]

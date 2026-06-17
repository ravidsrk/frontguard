# syntax=docker/dockerfile:1.7
#
# Frontguard Cloud API — self-host container (Task 16 / IN-12).
#
# Runtime model: `wrangler dev --local` (Miniflare under the hood) so the same
# Worker code that runs on Cloudflare's edge also runs unmodified on your own
# infrastructure. Miniflare emulates:
#   * D1   → SQLite file on disk (under /data)
#   * R2   → flat files on disk  (under /data)
#   * KV   → SQLite file on disk (under /data)
#
# Two stages keep the final image small:
#   1. builder  — npm install + tsup build (produces dist/index.js for sanity)
#   2. runtime  — pruned deps + wrangler/miniflare + src/ for hot reload-less run
#
# The runtime image starts on port 8787 and persists all state under /data so
# `docker volume`s survive container restarts.

# -----------------------------------------------------------------------------
# Stage 1 — builder
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy manifests first to maximise layer caching.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy sources required to build.
COPY tsconfig.json wrangler.toml ./
COPY src ./src

# Produce a bundle (smoke-checks that the project actually builds and gives
# downstream consumers something to copy if they want an alternative runtime
# such as @hono/node-server).
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2 — runtime
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    WRANGLER_SEND_METRICS=false \
    DO_NOT_TRACK=1

WORKDIR /app

# Install the minimum OS packages we need — wrangler/miniflare shell out to
# `sqlite3` for D1 migrations and tini gives us proper signal handling so
# Ctrl-C cleans up children instead of leaving zombies.
RUN apt-get update \
    && apt-get install -y --no-install-recommends sqlite3 tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies only (wrangler is a devDependency we add here
# explicitly so the runtime stage has Miniflare without dragging in tsup/tsx).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm install --no-save --no-audit --no-fund wrangler@^3

# Copy sources + config + the build output produced by stage 1.
COPY tsconfig.json wrangler.toml ./
COPY src ./src
COPY --from=builder /app/dist ./dist

# Entrypoint script: applies D1 migrations once per data volume, then launches
# wrangler with the persistence directory pointed at /data.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Persistent state (SQLite DB, R2 blobs, KV) lives here. Mount a named volume
# from compose so it survives `docker compose down`.
VOLUME ["/data"]

EXPOSE 8787

# Healthcheck — hits the unauthenticated /health endpoint mounted in src/index.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Make wrangler discoverable on PATH (npm install --no-save drops it into
# node_modules/.bin which is not on PATH by default in non-login shells).
ENV PATH="/app/node_modules/.bin:${PATH}"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npx", "wrangler", "dev", \
     "--local", \
     "--ip", "0.0.0.0", \
     "--port", "8787", \
     "--persist-to", "/data/wrangler", \
     "--var", "PUBLIC_BASE_URL:http://localhost:8787", \
     "--var", "API_BASE_URL:http://localhost:8787"]

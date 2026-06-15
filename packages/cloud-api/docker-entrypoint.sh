#!/usr/bin/env sh
# Frontguard Cloud API — container entrypoint.
#
# Responsibilities:
#   1. Make sure /data exists and the wrangler persist dir is initialised.
#   2. Apply the D1 schema migration once per fresh data volume (idempotent —
#      the schema uses CREATE TABLE IF NOT EXISTS so re-runs are safe).
#   3. Hand off to the CMD (typically `wrangler dev --local ...`).
set -eu

DATA_DIR="${DATA_DIR:-/data}"
PERSIST_DIR="${PERSIST_DIR:-$DATA_DIR/wrangler}"
MIGRATION_MARKER="$DATA_DIR/.migrated"

mkdir -p "$PERSIST_DIR"

if [ ! -f "$MIGRATION_MARKER" ]; then
  echo "[frontguard-api] applying D1 schema (first boot for this volume)"
  # `wrangler d1 execute --local` creates the SQLite database under
  # PERSIST_DIR/v3/d1 the first time it's invoked and then runs schema.sql.
  npx --yes wrangler d1 execute frontguard \
      --local \
      --persist-to "$PERSIST_DIR" \
      --file src/db/schema.sql \
    || {
      echo "[frontguard-api] D1 migration failed — continuing with in-memory store"
      # Don't hard-fail: the API will fall back to InMemoryStore (factory.ts)
      # which is still useful for kicking the tyres before fixing the binding.
    }
  touch "$MIGRATION_MARKER"
else
  echo "[frontguard-api] D1 schema already applied (delete $MIGRATION_MARKER to re-run)"
fi

echo "[frontguard-api] starting: $*"
exec "$@"

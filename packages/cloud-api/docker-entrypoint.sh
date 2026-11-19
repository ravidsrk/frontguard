#!/usr/bin/env sh
# Frontguard Cloud API — container entrypoint.
#
# Responsibilities:
#   1. Fail closed if required secrets are missing/weak in production.
#   2. Forward container environment variables into /app/.dev.vars (mode 0600)
#      so `wrangler dev --local` exposes them to the Worker `env` binding.
#   3. Apply the D1 schema migration once per fresh data volume — failing
#      closed (non-zero exit) rather than silently falling back to InMemoryStore.
#   4. Hand off to the CMD (`wrangler dev --local ...`).
set -eu

DATA_DIR="${DATA_DIR:-/data}"
PERSIST_DIR="${PERSIST_DIR:-$DATA_DIR/wrangler}"
MIGRATION_MARKER="$DATA_DIR/.migrated"
DEV_VARS_FILE="${DEV_VARS_FILE:-/app/.dev.vars}"

mkdir -p "$PERSIST_DIR"

# Fail closed when production is active (default) and DASHBOARD_SESSION_SECRET
# is unset, too short, or matches a known weak placeholder.
RUNTIME_ENV="${ENVIRONMENT:-production}"
if [ "$RUNTIME_ENV" = "production" ]; then
  SECRET_LEN=$(printf '%s' "${DASHBOARD_SESSION_SECRET:-}" | wc -c | tr -d ' ')
  if [ -z "${DASHBOARD_SESSION_SECRET:-}" ] \
      || [ "$SECRET_LEN" -lt 32 ] \
      || [ "${DASHBOARD_SESSION_SECRET:-}" = "change-me-in-production" ]; then
    echo "[frontguard-api] ERROR: DASHBOARD_SESSION_SECRET must be set to a random value of at least 32 characters in production" >&2
    exit 1
  fi
fi

# Bridge container environment variables into `.dev.vars` so `wrangler dev --local`
# binds them to Worker `c.env`. Restrict file permissions to owner read/write only.
umask 077
: > "$DEV_VARS_FILE"
write_var() {
  var_name="$1"
  eval "var_val=\${$var_name:-}"
  if [ -n "$var_val" ]; then
    # Reject newlines inside secret values to prevent .dev.vars line injection.
    case "$var_val" in
      *"
"*)
        echo "[frontguard-api] ERROR: environment variable $var_name contains a newline" >&2
        exit 1
        ;;
    esac
    printf '%s=%s\n' "$var_name" "$var_val" >> "$DEV_VARS_FILE"
  fi
}

export ENVIRONMENT="$RUNTIME_ENV"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://localhost:8787}"
export API_BASE_URL="${API_BASE_URL:-http://localhost:8787}"

for key in \
  ENVIRONMENT \
  PUBLIC_BASE_URL \
  API_BASE_URL \
  GITHUB_CLIENT_ID \
  GITHUB_CLIENT_SECRET \
  DASHBOARD_SESSION_SECRET \
  GITHUB_APP_URL \
  FRONTGUARD_CALLBACK_SECRET \
  VERCEL_INTEGRATION_SECRET \
  DAYTONA_API_KEY \
  OPENAI_API_KEY \
  ANTHROPIC_API_KEY \
  FRONTGUARD_OPENAI_KEY \
  FRONTGUARD_ANTHROPIC_KEY \
  RESEND_API_KEY \
  ALERT_FROM_EMAIL \
  STRIPE_SECRET_KEY \
  STRIPE_WEBHOOK_SECRET \
  STRIPE_PRICE_PRO \
  STRIPE_PRICE_BUSINESS \
  BILLING_SUCCESS_URL \
  BILLING_CANCEL_URL \
  OTEL_EXPORTER_OTLP_ENDPOINT \
  OTEL_EXPORTER_OTLP_HEADERS; do
  write_var "$key"
done
chmod 0600 "$DEV_VARS_FILE"

if [ ! -f "$MIGRATION_MARKER" ]; then
  echo "[frontguard-api] applying D1 schema (first boot for this volume)"
  # `wrangler d1 execute --local` creates the SQLite database under
  # PERSIST_DIR/v3/d1 the first time it's invoked and then runs schema.sql.
  if wrangler d1 execute frontguard \
      --local \
      --persist-to "$PERSIST_DIR" \
      --file src/db/schema.sql; then
    touch "$MIGRATION_MARKER"
  else
    echo "[frontguard-api] ERROR: D1 migration failed — refusing to start with uninitialized database" >&2
    exit 1
  fi
else
  echo "[frontguard-api] D1 schema already applied (delete $MIGRATION_MARKER to re-run)"
fi

echo "[frontguard-api] starting: $*"
exec "$@"

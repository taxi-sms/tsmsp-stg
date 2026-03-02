#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
PROJECT_REF="${2:-}"
ENV_FILE="${3:-}"

if [[ "$TARGET" != "stg" && "$TARGET" != "prod" ]]; then
  echo "Usage: $0 <stg|prod> <project-ref> [env-file]" >&2
  exit 1
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "Error: <project-ref> is required." >&2
  exit 1
fi

if [[ -z "$ENV_FILE" ]]; then
  ENV_FILE="supabase/env/${TARGET}.env"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found: $ENV_FILE" >&2
  echo "Hint: copy supabase/env/${TARGET}.example.env to ${ENV_FILE} and fill values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

required_vars=(
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_STARTER_MONTHLY
  APP_BASE_URL
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Error: required env var is empty: $name" >&2
    exit 1
  fi
done

echo "[1/3] Setting secrets on ${PROJECT_REF} (${TARGET})"
supabase secrets set \
  --project-ref "$PROJECT_REF" \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  STRIPE_PRICE_STARTER_MONTHLY="$STRIPE_PRICE_STARTER_MONTHLY" \
  APP_BASE_URL="$APP_BASE_URL"

echo "[2/3] Deploying create-checkout-session (no-verify-jwt)"
supabase functions deploy create-checkout-session \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt \
  --use-api

echo "[3/3] Deploying stripe-webhook"
supabase functions deploy stripe-webhook \
  --project-ref "$PROJECT_REF" \
  --use-api

echo "Done: ${TARGET} edge functions deployed to ${PROJECT_REF}."

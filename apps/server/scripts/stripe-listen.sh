#!/usr/bin/env bash
# apps/server/scripts/stripe-listen.sh
#
# Forwards Stripe events to the local server for two distinct endpoints
# (per ADR-0006). Pick mode at invocation:
#
#   ./stripe-listen.sh platform   -> /webhooks/stripe/platform
#   ./stripe-listen.sh connect    -> /webhooks/stripe/connect   (POS online sales)
#
# Easiest entry points (correct port baked in):
#   bun stripe:listen            (connect mode — payment_intent.succeeded, etc.)
#   bun stripe:listen:platform   (platform mode — subscription/invoice events)
#
# On first run, the `stripe` CLI prints a whsec_… secret. If it differs from
# the value already in apps/server/.dev.vars, paste it in and restart the
# server (bun dev:server) so signature verification matches:
#   STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...   (for platform mode)
#   STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...    (for connect mode)
#
# The dev server runs on 3020 (the bun stripe:listen* scripts set this).
# Override PORT env var if your server is elsewhere.

set -euo pipefail

MODE="${1:-platform}"
PORT="${PORT:-3020}"

# Pin the listener to the SAME Stripe account the server uses, regardless of
# which account `stripe login` is globally pointed at. The server's
# STRIPE_SECRET_KEY (apps/server/.dev.vars) is the dev-shared platform acct;
# the developer machine's CLI may be logged into a different account, in which
# case `stripe listen` would forward events that never correlate. Reading the
# key here keeps dev forwarding account-correct with zero per-machine setup.
DEV_VARS="$(dirname "$0")/../.dev.vars"
API_KEY_ARGS=()
if [[ -f "$DEV_VARS" ]]; then
  SK="$(grep -E '^STRIPE_SECRET_KEY=' "$DEV_VARS" | head -1 | cut -d= -f2-)"
  if [[ -n "${SK:-}" ]]; then
    API_KEY_ARGS=(--api-key "$SK")
  fi
fi

case "$MODE" in
  platform)
    exec stripe listen "${API_KEY_ARGS[@]}" \
      --forward-to "localhost:${PORT}/webhooks/stripe/platform" \
      --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,checkout.session.completed
    ;;
  connect)
    exec stripe listen "${API_KEY_ARGS[@]}" \
      --forward-connect-to "localhost:${PORT}/webhooks/stripe/connect" \
      --events payment_intent.succeeded,payment_intent.payment_failed,charge.refunded,charge.dispute.created,account.updated,payout.paid,payout.failed
    ;;
  *)
    echo "usage: $0 platform|connect" >&2
    exit 1
    ;;
esac

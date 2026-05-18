#!/usr/bin/env bash
# apps/server/scripts/stripe-listen.sh
#
# Forwards Stripe events to the local server for two distinct endpoints
# (per ADR-0006). Pick mode at invocation:
#
#   ./stripe-listen.sh platform   -> /webhooks/stripe/platform
#   ./stripe-listen.sh connect    -> /webhooks/stripe/connect
#
# On first run, the `stripe` CLI prints a whsec_… secret. Copy it into
# apps/server/.env.local as:
#   STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...   (for platform mode)
#   STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...    (for connect mode)
#
# Override PORT env var if server is not on default 3000.

set -euo pipefail

MODE="${1:-platform}"
PORT="${PORT:-3000}"

case "$MODE" in
  platform)
    exec stripe listen \
      --forward-to "localhost:${PORT}/webhooks/stripe/platform" \
      --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,checkout.session.completed
    ;;
  connect)
    exec stripe listen \
      --forward-connect-to "localhost:${PORT}/webhooks/stripe/connect" \
      --events payment_intent.succeeded,payment_intent.payment_failed,charge.refunded,charge.dispute.created,account.updated,payout.paid,payout.failed
    ;;
  *)
    echo "usage: $0 platform|connect" >&2
    exit 1
    ;;
esac

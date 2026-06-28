#!/usr/bin/env bash
# One-shot UAT review-page regenerator for THIS sandbox.
#
# Root-causes of prior failures, addressed here:
#  1. Zombie bash loops — caller must ensure a clean process state first.
#  2. workerd wedges under sustained load — so we restart a FRESH server before
#     EACH shard and keep shards small (≤ ~6 specs); a fresh worker + a few specs
#     never accumulates enough load to wedge.
#  3. `bun dev` restart conflicts on native's metro port (8081) — so we start
#     ONLY server (:3020) + web (:3021) via the per-app turbo tasks; never native.
#
#   bash _e2e/uat-regen.sh
set -u
cd "$(dirname "$0")/.." || exit 1

EMAIL="${E2E_EMAIL:-franchisee@gmail.com}"
PASSWORD="${E2E_PASSWORD:-password123}"
N="${E2E_SHARDS:-12}"

DIRS="web/branch web/access-control web/multi-tenant web/rbac \
web/service web/service-category web/my-services web/packages \
web/commissions web/booking web/reports web/customers web/onboarding \
web/payment/invoices web/payment/smoke web/google-calendar web/migration"

rm -rf _e2e/results/art-* _e2e/results/report-*.json _e2e/results/shard-*.log 2>/dev/null

wait_ready() {
  for i in $(seq 1 40); do
    w=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3021/login --max-time 5 2>/dev/null)
    a=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3020 --max-time 5 2>/dev/null)
    [ "$w" = "200" ] && [ "$a" = "200" ] && { echo "  ready (~$((i*3))s)"; return 0; }
    sleep 3
  done
  return 1
}

restart() {
  # Kill server (3020) + web (3021) listeners only. Never touch native/metro.
  for p in $(netstat -ano 2>/dev/null | grep -E ":(3020|3021).*LISTENING" | awk '{print $5}' | sort -u); do
    taskkill //T //F //PID "$p" >/dev/null 2>&1
  done
  for i in $(seq 1 15); do
    [ "$(netstat -ano 2>/dev/null | grep -cE ":(3020|3021).*LISTENING")" = "0" ] && break
    sleep 1
  done
  ( bun dev:server > _e2e/regen-server.log 2>&1 & )
  ( bun dev:web    > _e2e/regen-web.log    2>&1 & )
  wait_ready || echo "  WARN: not ready"
}

for i in $(seq 1 "$N"); do
  echo "=== SHARD $i/$N ==="
  restart
  E2E_EMAIL="$EMAIL" E2E_PASSWORD="$PASSWORD" \
    bunx playwright test --config _e2e/playwright.config.ts $DIRS \
      --shard="$i/$N" --output="_e2e/results/art-$i" \
    > "_e2e/results/shard-$i.log" 2>&1
  cp _e2e/results/report.json "_e2e/results/report-$i.json" 2>/dev/null
  echo "  shard $i done: $(grep -oE '[0-9]+ (passed|failed|skipped)' "_e2e/results/shard-$i.log" | tail -3 | tr '\n' ' ')"
done

echo "=== MERGE + REBUILD ==="
node _e2e/merge-reports.mjs
(cd apps/server && bun run scripts/migration/dump-uat-data.ts > /dev/null 2>&1) && echo "  dump ok"
node _e2e/build-uat-review.mjs | tail -1
node _e2e/build-migration-review.mjs | tail -1
echo "=== REGEN COMPLETE ==="

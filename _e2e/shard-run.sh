#!/usr/bin/env bash
# Run the _e2e UAT suite in N shards, restarting BOTH dev servers (web 3021 +
# API 3020) before each shard so no single batch wedges them — the suite reliably
# dies ~37 specs into a single serial run (dev-worker-under-load + Vite wedge).
# Each shard writes its own JSON report; merge-reports.mjs stitches them, then the
# review pages are rebuilt with a clean full-suite report.
#
#   bash _e2e/shard-run.sh
#
# Env: E2E_EMAIL / E2E_PASSWORD (default franchisee@gmail.com / password123),
#      E2E_SHARDS (default 5).
set -u
cd "$(dirname "$0")/.." || exit 1   # repo root

EMAIL="${E2E_EMAIL:-franchisee@gmail.com}"
PASSWORD="${E2E_PASSWORD:-password123}"
N="${E2E_SHARDS:-8}"

# Curated UAT-relevant dirs (excludes out-of-scope Stripe specs, which need a
# Stripe sandbox and are Post-MVP per the UAT). Playwright shards this selection.
DIRS="web/branch web/access-control web/multi-tenant web/rbac \
web/service web/service-category web/my-services web/packages \
web/commissions web/booking web/reports web/customers \
web/payment/invoices web/payment/smoke web/google-calendar web/migration"

rm -rf _e2e/results/art-* _e2e/results/report-*.json _e2e/results/shard-*.log 2>/dev/null

restart_servers() {
  # Tree-kill whatever holds 3020/3021, then start both via `bun dev`.
  for p in $(netstat -ano 2>/dev/null | grep -E ":(3020|3021).*LISTENING" | awk '{print $5}' | sort -u); do
    taskkill //T //F //PID "$p" >/dev/null 2>&1
  done
  sleep 3
  ( bun dev > _e2e/dev-all.log 2>&1 & )
  for i in $(seq 1 45); do
    w=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3021/login --max-time 5 2>/dev/null)
    a=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3020 --max-time 5 2>/dev/null)
    [ "$w" = "200" ] && [ "$a" = "200" ] && { echo "  servers ready (~$((i*5))s)"; return 0; }
    sleep 5
  done
  echo "  WARN: servers not ready after 225s"; return 1
}

for i in $(seq 1 "$N"); do
  echo "=== SHARD $i/$N ==="
  restart_servers
  E2E_EMAIL="$EMAIL" E2E_PASSWORD="$PASSWORD" \
    bunx playwright test --config _e2e/playwright.config.ts $DIRS \
      --shard="$i/$N" --output="_e2e/results/art-$i" \
    > "_e2e/results/shard-$i.log" 2>&1
  cp _e2e/results/report.json "_e2e/results/report-$i.json" 2>/dev/null
  echo "  shard $i: $(grep -oE '[0-9]+ (passed|failed|skipped)' "_e2e/results/shard-$i.log" | tail -3 | tr '\n' ' ')"
done

echo "=== merge + rebuild review ==="
node _e2e/merge-reports.mjs
(cd apps/server && bun run scripts/migration/dump-uat-data.ts > /dev/null 2>&1) && echo "  dump ok"
node _e2e/build-uat-review.mjs | tail -1
node _e2e/build-migration-review.mjs | tail -1
echo "=== ALL SHARDS DONE — open _e2e/review-uat.html ==="

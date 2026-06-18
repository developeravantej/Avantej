#!/usr/bin/env bash
# Run the _e2e suite in N shards, restarting the API worker (port 3020) before
# each shard so no single batch degrades it (the dev worker 500s on create
# procedures under sustained load — see findings #2). Each shard writes its own
# JSON report + video output dir; merge-reports.mjs stitches them together.
set -u
cd "C:/Project/Avantej"
N=8
rm -rf _e2e/results/art-* _e2e/results/report-*.json 2>/dev/null

restart_worker() {
  local pid
  pid=$(netstat -ano 2>/dev/null | grep -E "TCP.*:3020 .*LISTENING" | awk '{print $NF}' | head -1)
  if [ -n "${pid:-}" ]; then taskkill //PID "$pid" //T //F >/dev/null 2>&1; fi
  sleep 2
  ( bun run dev:server > _e2e/devserver.log 2>&1 & )
  echo "  waiting for API 3020..."
  until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3020/health --max-time 5)" = "200" ]; do sleep 3; done
  sleep 3
}

for i in $(seq 1 $N); do
  echo "=== SHARD $i/$N ==="
  restart_worker
  # No --reporter override: the config's json reporter writes _e2e/results/report.json.
  bunx playwright test --config _e2e/playwright.config.ts \
      --shard="$i/$N" --output="_e2e/results/art-$i" \
    > "_e2e/results/shard-$i.log" 2>&1
  cp _e2e/results/report.json "_e2e/results/report-$i.json" 2>/dev/null
  echo "  shard $i done: $(grep -oE '[0-9]+ (passed|failed|skipped)' "_e2e/results/shard-$i.log" | tail -3 | tr '\n' ' ')"
done
echo "ALL SHARDS DONE"

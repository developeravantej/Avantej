#!/usr/bin/env bash
# Record the UAT-mapped specs reliably: split the explicit file list (uat-specs.txt,
# which Playwright resolves correctly — unlike the dir-name --shard filters) into
# CHUNK-sized batches, each a FRESH playwright process writing its own report-cN.json.
# Then merge-reports.mjs stitches them and the review page is rebuilt.
set -u
cd "$(dirname "$0")/.." || exit 1   # repo root

CHUNK="${E2E_CHUNK:-18}"
export E2E_EMAIL="${E2E_EMAIL:-franchisee@gmail.com}"
export E2E_PASSWORD="${E2E_PASSWORD:-password123}"

rm -rf _e2e/results/art-* _e2e/results/report-*.json _e2e/results/report.json \
       _e2e/results/test-artifacts 2>/dev/null

mapfile -t SPECS < _e2e/uat-specs.txt
TOTAL=${#SPECS[@]}
echo "Total UAT spec files: $TOTAL  (chunk=$CHUNK)"

n=0
batch=0
while [ "$n" -lt "$TOTAL" ]; do
  batch=$((batch+1))
  slice=("${SPECS[@]:n:CHUNK}")
  echo "=== BATCH $batch  (files $((n+1))..$((n+${#slice[@]}))) ==="
  # Per-batch outputDir — Playwright wipes outputDir before each run, so sharing
  # one dir across batches deletes earlier videos. Isolate each batch's artifacts.
  PLAYWRIGHT_BASE_URL=http://localhost:3021 \
    bunx playwright test --config _e2e/playwright.config.ts "${slice[@]}" \
      --output="_e2e/results/art-$batch" \
      > "_e2e/results/batch-$batch.log" 2>&1
  cp _e2e/results/report.json "_e2e/results/report-$batch.json" 2>/dev/null \
    && echo "  batch $batch: $(grep -oE '[0-9]+ (passed|failed|flaky)' "_e2e/results/batch-$batch.log" | tail -3 | tr '\n' ' ')  -> report-$batch.json" \
    || echo "  batch $batch: NO report.json produced"
  n=$((n+CHUNK))
done

echo "=== merge + rebuild review ==="
node _e2e/merge-reports.mjs
node _e2e/build-uat-review.mjs | tail -1
echo "=== DONE — _e2e/review-uat.html ==="

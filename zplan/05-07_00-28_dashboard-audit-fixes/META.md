---
title: Dashboard Audit Fixes — E2E + DB Integrity
goal: Close 23 DB integrity gaps + 6 P0/feature gaps + 4 test defects from 2026-05-07 dashboard audit
created_at: 2026-05-07 00:28
linked_pr:
---

# Dashboard Audit Fixes

Remediation pass on `ztest/audit.md` findings. Ships in 6 phases: P0 sales detail flow → P1 schema additions → P1 write paths → P1 type migration → P2 status history hooks → P2 column additions + test/feature cleanup.

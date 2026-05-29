---
title: Quality 9 Roadmap — Seven Dimensions to 9/10
goal: Raise architecture, code org, docs, tests, CI, production readiness, and maintainability to at least 9/10 via phased, gated execution.
created_at: 2026-05-23 20:00
status: in_progress
current_plan: plan-a-complete
decisions:
  saas_middleware_gate: E2E smoke green (Plan B exit) before Plan C starts
  feature_wiring: ship (wire business logic; do not hide UI)
  ci_database: current Neon development database (same as local dev; no separate ci-e2e sandbox)
linked_docs:
  - docs/FEATURE_WIRING_AUDIT.md
  - graphify-out/GRAPH_REPORT.md
  - CLAUDE.md
---

# Quality 9 Roadmap

Multi-dimension improvement program derived from the 2026-05-23 codebase audit (7 parallel agent reports). See `overview.md` for program map; execute plans A → E in order with explicit gates.

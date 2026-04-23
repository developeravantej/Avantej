---
title: Design Guidelines Rollout — Dashboard
goal: Bring all 51 dashboard pages into compliance with docs/DESIGN_GUIDELINES.md v1.1
created_at: 2026-04-22 20:59
linked_pr:
---

# Design Guidelines Rollout — Dashboard

Apply `docs/DESIGN_GUIDELINES.md` (v1.1) to every page under `apps/web/src/routes/_authenticated/dashboard/`. Delivered in phases: foundational primitives first (Phase 0), then enforcement + sidebar fixes (Phase 1), then per-section page refactors gated by shared-primitive availability. Scope excludes `apps/native` beyond token naming parity and excludes the three legacy routes slated for rewrite (`/service/view`, `/user/view`, `/service-category/view`).

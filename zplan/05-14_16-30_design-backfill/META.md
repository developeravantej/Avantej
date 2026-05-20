---
title: Design Backfill — Re-expose Hidden Functions + Build New Backend
goal: Restore every affordance the 23-page redesign hid, and build the backend the new designs need, without breaking any production flow.
created_at: 2026-05-14 16:30
linked_pr:
---

# Design Backfill — Re-expose Hidden Functions + Build New Backend

After refactoring 23 dashboard pages to new layouts, some features are no longer reachable from the UI and some designs surface fields the API does not return. This session restores every hidden affordance and ships the backend (schema + procedures + caches) the new designs require — sequenced to avoid the scalability landmines flagged in the experience review.

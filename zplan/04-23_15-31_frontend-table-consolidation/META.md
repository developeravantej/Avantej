---
title: Frontend Table Consolidation
goal: Extract shared DataTable shell + hook to eliminate ~60-70% copy-paste across 17 entity tables
created_at: 2026-04-23 15:31
linked_pr:
---

# Frontend Table Consolidation

Replace 17 near-duplicate `data-table.tsx` implementations in `apps/web/src/components/tables/*/view/` with a shared `<EntityDataTable />` shell + `useEntityTable` hook. Pure refactor — no user-visible behaviour changes. Outliers (sales pagination, rooms deactivate, products enum forms, service org-scoping) stay custom and are documented.

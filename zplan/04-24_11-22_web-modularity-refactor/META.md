---
title: Web Modularity Refactor
goal: Eliminate duplication in apps/web by extracting shared hooks/libs (useApiMutation, money, validators, table-columns) and splitting 4 mega-files into cohesive units
created_at: 2026-04-24 11:22
linked_pr:
---

# Web Modularity Refactor

Pure internal refactor of `apps/web/src`. Consolidates 299 repeated try/catch+toast patterns behind a single `useApiMutation` hook, merges overlapping money libs, extracts shared zod validators and table column builders, and splits four 1000+ line files (add-appointment-modal, installments-page, trainers/view, EnhancedPermissionMatrix) into hooks + subcomponents. No user-visible behaviour change. Runs alongside the existing frontend-table-consolidation session and picks up where form-standardization left off.

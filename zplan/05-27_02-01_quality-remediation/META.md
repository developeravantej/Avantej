---
title: Codebase Quality Remediation Sprint
goal: Close security gaps in untested middleware, eliminate type erosion in router layer, raise critical-path test coverage
created_at: 2026-05-27 02:01
linked_pr:
---

# Codebase Quality Remediation Sprint

Three-phase remediation: (1) backfill unit + integration tests for `authMiddleware`, `tenantMiddleware`, `adminMiddleware`, `superAdminMiddleware`; (2) eliminate `as any` / `as unknown` casts in the router layer, starting with `payments.ts` and replacing them with typed `assertTenantContext` usage; (3) backfill tests for the permission system and the megacomponents flagged in the web audit. Pure remediation — no new features.

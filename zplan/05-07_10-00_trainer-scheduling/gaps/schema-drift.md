# Schema Drift Audit — Pass 1

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** schema-drift-auditor

## Summary

All 6 tables mentioned in the plan EXIST in `packages/db/src/schema/tenant/`.
No schema changes are proposed (correctly scoped out).

---

## Findings

### INFO — S1: `memberCategoryBufferOverrides` schema matches plan description exactly

**Rating:** INFO

File: `packages/db/src/schema/tenant/member-category-buffer-overrides.ts`

Plan states:
```
id: uuid PK
memberId: uuid → members.id CASCADE
categoryId: uuid → serviceCategories.id CASCADE
bufferTimeMinutes: integer NOT NULL
createdAt, updatedAt: timestamp
UNIQUE(memberId, categoryId) // index: mcbo_member_category_unique_idx
```

Actual:
- `id`: uuid PK ✓
- `memberId`: uuid → members.id CASCADE ✓
- `categoryId`: uuid → serviceCategories.id CASCADE ✓
- `bufferTimeMinutes`: integer NOT NULL ✓
- `createdAt`: timestamp WITH timezone ✓
- `updatedAt`: timestamp WITH timezone ✓
- `uniqueIndex("mcbo_member_category_unique_idx")` on (memberId, categoryId) ✓
- Additional: `index("mcbo_member_idx")` and `index("mcbo_category_idx")` (extra, no issue)

**No drift.**

---

### INFO — S2: `preferred_times` schema matches plan description

**Rating:** INFO

File: `packages/db/src/schema/tenant/preferred-times.ts`

Plan states `UNIQUE(packageInstanceId, priority)` with index name `preferred_times_package_priority_idx`.

Actual: `uniqueIndex("preferred_times_package_priority_idx").on(table.packageInstanceId, table.priority)` ✓

Plan states `createdAt: timestamp` — actual uses `timestamp` (WITHOUT timezone, no `withTimezone: true`).

This is a minor discrepancy vs the project convention of `withTimezone: true` but it's pre-existing and not introduced by this plan.

---

### MEDIUM — S3: Import path in service file uses per-file import, not barrel

**Rating:** MEDIUM

The plan's service code at T1.1 imports:
```typescript
import { memberCategoryBufferOverrides } from "@avantej-core/db/schema/tenant/member-category-buffer-overrides";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import { serviceCategoryConfig } from "@avantej-core/db/schema/tenant/service-category-config";
import { serviceMembers } from "@avantej-core/db/schema/tenant/service-members";
import { services } from "@avantej-core/db/schema/tenant/services";
```

These per-file imports are valid and consistent with how other services in this codebase import schema (e.g., `preferred-time.service.ts` imports directly from `@avantej-core/db/schema/tenant/preferred-times`). No issue.

The plan also references:
```typescript
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
```

This file exists at `packages/db/src/schema/tenant-schema.ts` and re-exports from `./tenant` which includes `member-category-buffer-overrides` via `index.ts`. ✓

---

### LOW — S4: `serviceCategoryConfig` uses `.unique()` constraint (not uniqueIndex)

**Rating:** LOW

The plan's service query does a LEFT JOIN from `services` to `serviceCategoryConfig` on `categoryId`. The actual schema has `categoryId` as `.notNull().unique()` — meaning there is at most one config row per category. The LEFT JOIN will correctly return 0 or 1 rows per category. No issue with join logic.

However: the plan's `selectDistinct` selects `orgDefaultBuffer: serviceCategoryConfig.bufferTimeMinutes`. If a category has no `serviceCategoryConfig` row (LEFT JOIN returns NULL), the result is `null`, and the service falls back to `0` via `r.orgDefaultBuffer ?? 0`. This is correct and documented.

---

### INFO — S5: `serviceMembers` has no `bufferTimeMinutes` column

**Rating:** INFO

The plan's service code selects `serviceId`, `categoryId`, and `categoryName` via joins — it does NOT attempt to select `bufferTimeMinutes` from `serviceMembers` (that lives in `member_service_buffer_overrides`, a separate table). The service code correctly avoids this. ✓

---

## Status Table

| Finding | Rating | Issue |
|---|---|---|
| S1: MCBO schema exact match | INFO | None |
| S2: preferred_times schema matches | INFO | Minor: no withTimezone (pre-existing) |
| S3: Import paths valid | MEDIUM | Paths are per-file style, consistent with codebase |
| S4: serviceCategoryConfig LEFT JOIN | LOW | Logic correct; null → 0 fallback works |
| S5: serviceMembers lacks bufferTimeMinutes | INFO | Correct — plan does not try to select it |

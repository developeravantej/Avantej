# Phase 0 Execution Summary

**Date:** 2026-05-07  
**Executor:** Claude Sonnet 4.6  
**Branch:** feat/package-approval-flow (phase 0 is pre-work, no branch change required)

---

## Tasks Completed

### Task 1 — Deprecation comment on `appointments.recurringFrequency`
**File:** `packages/db/src/schema/tenant/appointments.ts`  
Added two-line JSDoc comment above the column definition.

### Task 2 — Unique index `(recurringParentId, startTime)` on appointments
**Files:**
- `packages/db/src/schema/tenant/appointments.ts` — added `uniqueIndex` import and `appointmentsRecurringOccurrenceUniqueIdx` to the table definition
- `packages/db/src/migrations/tenant/0049_add_recurring_occurrence_unique_idx.sql` — NEW migration file
- `packages/db/src/generated/tenant-migrations.generated.ts` — appended migration entry

**Migration number used:** `0049_add_recurring_occurrence_unique_idx`

Migration SQL (partial index — only applies to child rows):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_recurring_occurrence_unique_idx"
ON "appointments" ("recurring_parent_id", "start_time")
WHERE "recurring_parent_id" IS NOT NULL;
```

Note: `bun db:push` was NOT run. Migration was hand-crafted and registered per tenant migration workflow.

### Task 3 — `resolveMemberIdFromUserId` helper
**Files:**
- `packages/services/src/appointment.service.ts` — added `members` import and exported helper function
- `packages/services/src/index.ts` — added `resolveMemberIdFromUserId` to named exports

### Task 4 — Timezone decision comment
**File:** `packages/services/src/appointment.service.ts`  
Added 3-line comment block above `resolveMemberIdFromUserId`, documenting UTC default and deferring organization-specific timezone to a future enhancement.

### Task 5 — Unit tests for `resolveMemberIdFromUserId`
**File:** `apps/server/src/tests/unit/resolve-member-id.test.ts` (NEW)  
2 tests:
- `valid userId returns members.id` — mock DB returns `[{ id: "..." }]`, asserts return value equals that id
- `unknown userId returns null` — mock DB returns `[]`, asserts return value is null

**Result:** 2 pass, 0 fail ✅

### Task 6 — Integration regression test
**File:** `apps/server/src/tests/integration/staff-id-convention.test.ts` (NEW)  
1 test: "commission calculator returns 0 splits when staffId is members.id instead of members.userId"

Seeds: trainer tier → trainer member → service category → service → commission config → appointment  
Asserts:
1. `calculateCommissionForAppointment` with `staffId = trainerMemberId` (UUID, WRONG format) → `[]`  
2. Companion: same call with `staffId = trainerUserId` (text, CORRECT format) → non-empty (validates setup)

Cleanup: all rows deleted in reverse FK order. Guarded by `shouldSkipIntegration()`.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/db/src/schema/tenant/appointments.ts` | Added deprecation comment, `uniqueIndex` import, unique index definition |
| `packages/db/src/migrations/tenant/0049_add_recurring_occurrence_unique_idx.sql` | NEW — partial unique index migration |
| `packages/db/src/generated/tenant-migrations.generated.ts` | Appended migration 0049 entry |
| `packages/services/src/appointment.service.ts` | Added `members` import, timezone comment, `resolveMemberIdFromUserId` export |
| `packages/services/src/index.ts` | Added `resolveMemberIdFromUserId` to named exports |
| `apps/server/src/tests/unit/resolve-member-id.test.ts` | NEW — 2 unit tests |
| `apps/server/src/tests/integration/staff-id-convention.test.ts` | NEW — 1 integration regression test |

---

## `bun check-types` Result

**Pre-existing errors:** Multiple errors in `apps/server/scripts/`, `src/services/neon.service.ts`, `src/lib/better-auth.ts`, `src/middleware/*.ts`, `src/routers/admin.ts` — all pre-existing, unrelated to Phase 0.

**New errors introduced by Phase 0:** None

**bun:test module errors in test files:** Pre-existing across all test files (server tsconfig doesn't include bun types). Same error appears in 20+ existing test files. Not introduced by Phase 0.

---

## Decisions Made

- **Timezone (Task 4/7):** Option B — default UTC, document limitation. Malaysia uses UTC+8 without DST, so virtual occurrence expansion in UTC is functionally correct for MVP. No `timezone` column added to org settings. Phase 2.1 can accept an optional `timezone` param when needed.
- **Migration registration:** Manual append to `tenant-migrations.generated.ts` (no `gen:migrations` script available in package.json for this path).

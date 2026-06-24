# Audit: 05-13_15-29_pin-customer-package

**Audited:** 2026-05-13 (re-audit)
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard
| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 0 |
| Missing impact | 3 files with unlisted callers |
| Unresolved questions | 1 (Drizzle partial-index DDL emission) |
| Execution state | not started |

## Findings

### Structural gaps
All 8 sections are present with actual content:
1. Overview — problem, goals, non-goals, success criteria. Present.
2. Result — Before/After in user terms. Present.
3. Technical Architecture — schema, API contracts, frontend wiring, key decisions. Present.
4. User Journeys — 3 journeys with explicit "Where it lives". Present.
5. Phased Implementation — 4 phases each delivering ≥1 journey. Present.
6. Impact & Breakage Analysis — callers listed, domain breakage vectors table. Present.
7. Cross-Cutting Concerns — error handling, testing, migration, rollback, performance checklist. Present.
8. Open Questions / Risks — table with 4 items. Present.

No structural gaps.

### Broken references (plan → codebase)
All 10 file paths referenced in the plan exist. Key line numbers verified correct:
- `packages/api/src/routers/package-instances.ts:88` — listPackageInstancesForClient in listForClient. Confirmed.
- `packages/api/src/routers/package-instances.ts:168` — listPackageInstancesForClient in getActiveForClient. Confirmed.
- `apps/native/app/(app)/dashboard/index.tsx:195` — getActiveForClient query. Confirmed.
- `apps/native/app/(app)/dashboard/profile.tsx:48` — getActiveForClient query. Confirmed.
- `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx:72` — listForClient call. Confirmed.
- `apps/native/app/(app)/dashboard/bookings/index.tsx:485` — listForClient call. Confirmed.

Schema state: `pinnedAt` column does NOT yet exist — consistent with the plan being unexecuted. `uniqueIndex` is not currently imported in `packages/db/src/schema/tenant/package-instances.ts` (current imports: `pgTable, uuid, text, integer, boolean, timestamp, index`). The `togglePin`/`togglePackagePin` symbols do not yet exist anywhere in the codebase. Plan is entirely pre-execution.

### Missing impact
The plan's Impact section lists only the two callers inside `packages/api/src/routers/package-instances.ts`. Three additional files call `listPackageInstancesForClient` or `orpc.packageInstances.listForClient` and will be silently affected:

1. `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx:72` — queries listForClient with `status: "active"` for package selection UI. Will receive pinned-first ordering.
2. `apps/native/app/(app)/dashboard/bookings/index.tsx:485` — queries listForClient with `status: "active"` for displaying active packages alongside bookings. Will receive pinned-first ordering.
3. `apps/server/src/tests/unit/services/package-instance.test.ts` — imports and calls `listPackageInstancesForClient` directly. Tests do NOT assert on ordering (only check `where` conditions and `limit`), so the ordering change will NOT break existing tests. Low risk, but the file should be updated when `togglePackagePin` unit tests are added in Phase 1.

Files 1 and 2 are partially addressed in Phase 4 acceptance criteria but are absent from the files-affected table in Section 6. File 3 is entirely absent from the plan.

### Domain Logic Warnings
1. **`uniqueIndex` import gap** — `packages/db/src/schema/tenant/package-instances.ts` currently imports `{ pgTable, uuid, text, integer, boolean, timestamp, index }`. The partial unique index requires `uniqueIndex` to be added to this import. Phase 1 Task 1.1 says "extend the import" but does not name `uniqueIndex` explicitly — developer must not miss this or the TypeScript build fails immediately.
2. **`tx.transaction()` nomenclature** — Plan Task 1.5 refers to `tx.transaction()`. The correct pattern in this codebase is `tenantDb.transaction(async (tx) => { ... })`. Minor terminology drift; no functional impact.
3. **Partial unique index Drizzle DDL** — `uniqueIndex(...).where(...)` has no existing precedent in this repo's Drizzle schemas (only `index(...).where(...)` with predicates is used). If Drizzle emits a plain unique index without the `WHERE` clause, the index will incorrectly block any second customer from pinning. Developer must inspect generated SQL in Phase 1 Task 1.2.

### Unresolved questions
1. **Drizzle partial unique index DDL** — highest-risk step. Flagged in the plan's Open Questions table with a mitigation. No TBD/TODO/decide-later markers in the plan body.

### Execution & verification gaps
- No `execute/log.md` — plan has not been executed.
- No `chrome-test/` artifacts.
- No `research/` or `prompts/` subfolders.

Plan is pre-execution. All 4 phases are pending.

## Priority Actions
1. Add `uniqueIndex` to the import line in Phase 1 Task 1.1 — without it, TypeScript build fails immediately on schema push.
2. Inspect generated migration SQL in Phase 1 Task 1.2 — confirm the partial `WHERE pinned_at IS NOT NULL` clause is emitted; hand-edit if not.
3. Add `book-workout.tsx` and `bookings/index.tsx` to the files-affected table in Section 6 for completeness.
4. Add `apps/server/src/tests/unit/services/package-instance.test.ts` to Phase 1 files-touched list — new `togglePackagePin` unit tests belong here.
5. Execute Phase 1 — `pinnedAt` column and partial unique index are the gate for all subsequent phases.

## Status rationale
`needs-attention`: 3 callers missing from the impact files-affected table; `uniqueIndex` import omission will cause an immediate TypeScript build failure. No broken file references; all 8 structural sections are present and substantive.

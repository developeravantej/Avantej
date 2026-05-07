# Schema Drift Audit — Pass 1

## Source files checked
- `packages/db/src/schema/tenant/announcement-scopes.ts`
- `packages/db/src/schema/tenant/announcements.ts`
- `packages/db/src/schema/tenant/index.ts` (barrel)
- `packages/db/src/generated/tenant-migrations.generated.ts`
- `packages/db/src/migrations/tenant/0037_add_promotion_waitlist_announcement_scopes.sql`

---

## Finding SD-01: Unique index, not unique constraint — LOW

**Plan claim (§3):** `UNIQUE(announcementId, branchId)` constraint

**Reality:** `announcement_scopes.ts` uses `uniqueIndex()` which compiles to `CREATE UNIQUE INDEX`, NOT a named `CONSTRAINT UNIQUE`. The migration confirms: `CREATE UNIQUE INDEX IF NOT EXISTS "announcement_scopes_unique_idx"`.

**Impact:** For the purposes of this plan (upsert logic via delete+insert), the distinction is irrelevant — we never reference the unique constraint by name. The unique index still prevents duplicate rows. No action required.

---

## Finding SD-02: Cascade delete on announcementId — CORRECT (LOW)

`announcementId` → `announcements.id` with `{ onDelete: "cascade" }`. When an announcement is deleted, all its scope rows are deleted. This is correct and the plan relies on it.

---

## Finding SD-03: Cascade delete on branchId — RISK (MEDIUM)

`branchId` → `hierarchy_nodes.id` with `{ onDelete: "cascade" }`. When a hierarchy node is deleted, all `announcement_scopes` rows referencing it are silently deleted. This can silently convert a branch-scoped announcement to a wider scope (if all branches are deleted, the announcement becomes org-wide).

**Plan gap:** The plan does not document this behavior. In practice, hierarchy node deletion is rare and destructive by design, so this is an acceptable risk. The plan should document it as a known side-effect.

---

## Finding SD-04: announcements.branchId is nullable — CORRECT (LOW)

`branchId` column has no `.notNull()`. Confirmed nullable. Consistent with plan's "keep as legacy nullable shortcut."

---

## Finding SD-05: announcements.branchId cascade delete risk — MEDIUM

`announcements.branchId` → `hierarchy_nodes.id` with `{ onDelete: "cascade" }`. If a hierarchy node is deleted, the entire announcement row is cascade-deleted (not just the branchId set to null).

**Risk:** An admin deletes a branch; all announcements that had that branch as their legacy `branchId` are hard-deleted. Since Phase 1 stops writing to `branchId` and stops reading it for filtering, this risk applies only to legacy data and diminishes over time. Worth documenting in the plan's Impact & Breakage section.

---

## Finding SD-06: announcementScopes exported from tenant barrel — CORRECT (LOW)

`packages/db/src/schema/tenant/index.ts` exports both `./announcements` and `./announcement-scopes`. Confirmed:
```
export * from "./announcements";
// #region Agent 2.10 ...
export * from "./announcement-scopes";
```
Import in the service (`@avantej-core/db/schema/tenant/announcement-scopes`) will work.

---

## Finding SD-07: Index coverage for EXISTS subquery — CORRECT (LOW)

The unique index on `(announcement_id, branch_id)` has `announcement_id` as the leftmost column. The EXISTS subquery `WHERE announcement_id = $1 AND branch_id = ANY($2)` can use this index via an index scan on `announcement_id`. Sufficient for the expected row counts.

---

## Finding SD-08: No timestamps on announcement_scopes — LOW

`announcement_scopes` has only `id`, `announcement_id`, `branch_id`. No `createdAt`. The plan's `setAnnouncementScopes` deletes and re-inserts, losing audit trail of when scopes were set.

**Impact:** No immediate functional issue. No audit requirement stated in the plan. Low priority.

---

## Finding SD-09: Missing withTimezone on announcement timestamps — HIGH

`announcements.ts` uses `timestamp("start_date")` and `timestamp("end_date")` WITHOUT `{ withTimezone: true }`. Drizzle defaults to `TIMESTAMP WITHOUT TIME ZONE`. Date comparisons like `startDate <= now` work correctly in UTC but can be off by the server's local timezone offset when the DB server is not UTC.

**Plan gap:** The plan adds date-range filters (Tasks 1.1, 1.2 keep existing date-range logic). The existing filters `lte(announcements.startDate, now)` and `gte(announcements.endDate, now)` are affected. If the Neon DB is UTC (as expected), this is harmless. But the project convention (per MEMORY.md §Phase 2S) is `{ withTimezone: true }` on all timestamps. This is a pre-existing schema defect, not introduced by this plan. Flagged for tracking.

**Note:** `announcement_scopes` has NO timestamps so no timezone issue there.

---

## Finding SD-10: announcement_scopes not in tenant-schema generated migrations — ACTION NEEDED (checked)

Already confirmed in migration `0037`: the table is created. No missing migration. CORRECT.

---

## Summary

| ID | Severity | Auto-fixable in plan |
|---|---|---|
| SD-03 | MEDIUM | Document in §6 breakage analysis |
| SD-05 | MEDIUM | Document in §6 breakage analysis |
| SD-09 | HIGH | Note as pre-existing schema debt; out of scope for this plan |
| SD-01,02,04,06,07,08,10 | LOW/INFO | No action |

# Scalability Audit — Pass 1

**Auditor:** scalability-auditor
**Date:** 2026-05-07

---

## Summary

The plan correctly addresses the primary scalability concern (unbounded history tables, cursor pagination). One HIGH gap found: the name resolution query pattern has an N+1 risk in one edge case. One MEDIUM gap: no `LIMIT` enforcement at the DB query level in the service function is specified. Indexes are correctly identified.

---

## Findings

### HIGH — Name resolution is safe for batch but silently degrades to N+1 if caller forgets deduplication

**Location:** Plan section 7, "Name resolution for changedBy"

The plan specifies:
1. Collect unique non-"system" changedBy values
2. Batch-query `auth.user WHERE id IN (...)`

This is correct. However, the plan does not specify where this batch query lives — in the router handler. If the implementation is done incorrectly (e.g., calling `getControlPanelDb` once per row in a `map()`), it becomes N+1.

**Risk level:** HIGH (not CRITICAL because plan describes batch query, but implementation mistakes are common here).

**Mitigation in plan:** Add explicit pseudocode showing the correct batch pattern:
```typescript
// Correct: batch collect → single query
const userIds = [...new Set(rows.map(r => r.changedBy).filter(id => id !== "system"))];
const userRecords = userIds.length > 0
  ? await cpDb.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
  : [];
const nameMap = new Map(userRecords.map(u => [u.id, u.name ?? u.email ?? "Unknown User"]));
```

---

### MEDIUM — Service function does not enforce `LIMIT` at DB query level in plan spec

**Location:** Plan section 5, Phase 1, item 1

Plan describes `getSalesOrderStatusHistory(tenantDb, salesOrderId, opts)` but does not show the exact Drizzle query. The plan must explicitly include `.limit(opts.limit ?? 50)` in the Drizzle query call. Without a `.limit()` clause, a WHERE by salesOrderId could return all rows for high-volume entities.

**Fix:** Add explicit note that the service function MUST pass `.limit()` to the Drizzle query:
```typescript
.limit(opts.limit ?? 50)
```

This is implied but not explicit in the plan.

---

### MEDIUM — Cursor WHERE clause is complex and could miss the second sort key

**Location:** Plan section 3.4 (Cursor pagination)

Plan specifies cursor pagination on `(changedAt DESC, id DESC)`. The WHERE clause for cursor-based pagination on two columns is:
```sql
WHERE (changed_at < cursor_ts) OR (changed_at = cursor_ts AND id < cursor_id)
```

This is correct but the plan does not show the exact Drizzle implementation. Drizzle's `or(lt(...), and(eq(...), lt(...)))` pattern is verbose and easy to get wrong.

**Risk:** If only `changed_at < cursor_ts` is used (missing the tie-breaking second condition), rows with the same `changed_at` timestamp may be skipped or duplicated across pages.

**Recommendation:** Add the exact Drizzle cursor expression to the plan:
```typescript
import { or, and, lt, eq } from "drizzle-orm";
// ...
.where(
  and(
    eq(table.entityId, entityId),
    cursor
      ? or(
          lt(table.changedAt, cursor.changedAt),
          and(eq(table.changedAt, cursor.changedAt), lt(table.id, cursor.id))
        )
      : undefined
  )
)
```

---

### LOW — No index on `(entityId, changedAt, id)` — cursor tie-breaking uses `id` without index coverage

**Location:** Plan section 3.1, section 7

Existing index: `(entityId, changedAt)` — two columns.
Cursor sort: `(changedAt DESC, id DESC)`.

When tie-breaking on `id` (same `changedAt`), PostgreSQL uses the two-column index for `entityId` and `changedAt` filtering, then sorts on `id` without index coverage. For the practical case (max 10,000 history rows per entity, default limit 50), this is not a performance problem.

**No action needed** for typical usage. Document this as a known limitation: if a single entity accumulates thousands of rows all with identical `changedAt` timestamps (extremely unlikely in practice), the `id` sort degrades. The existing index is sufficient.

---

### INFO — Composite index ordering is correct for DESC queries

PostgreSQL can use an ascending index for descending scans efficiently. The existing `index(...).on(t.entityId, t.changedAt)` will be used by `ORDER BY entityId = $1 AND changedAt DESC` queries. No additional index needed.

---

### INFO — Plan correctly notes "50 rows is far beyond any real-world case (most entities have 3–10 status changes)"

This assessment is accurate. The scalability concern is covered by the cursor design. No pagination UI in Phase 1 is a reasonable deferred decision.

---

### INFO — No N+1 in write path (confirmed)

All write-path functions use the same DB connection or transaction as the status update. No N+1 pattern exists in the write path.

---

## Verdict

The plan's scalability design is sound. Two medium gaps (LIMIT clause and cursor WHERE clause precision) should be documented explicitly in the plan to prevent implementation mistakes. The name resolution batch pattern must be enforced in code review.

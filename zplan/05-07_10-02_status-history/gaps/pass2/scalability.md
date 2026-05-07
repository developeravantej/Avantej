# Scalability Audit — Pass 2

**Auditor:** scalability-auditor
**Date:** 2026-05-07
**Based on:** Updated plan.md after Pass 1 fixes

---

## Summary

All Pass 1 scalability fixes confirmed applied. Cursor WHERE clause now shows exact Drizzle expression. `.limit()` is now explicit in the query example. Batch name resolution pattern is documented. No new CRITICAL or HIGH findings. One MEDIUM: the `parseCursor` function is defined in the plan but its location (router-level util or service-level util) is not specified — if two procedures independently duplicate it, there's drift risk. One LOW: the `inArray` import is not shown in the batch resolution pseudocode.

---

## Findings

### CONFIRMED RESOLVED — `.limit()` now explicit in query example

Plan cursor WHERE clause example ends with:
```typescript
.limit(opts.limit ?? 50);  // MUST include .limit() — never return unbounded rows
```
✓

### CONFIRMED RESOLVED — Exact Drizzle cursor WHERE clause documented

The `or(lt(...), and(eq(...), lt(...)))` pattern is now in the plan with the correct tie-breaking second condition. ✓

### CONFIRMED RESOLVED — Batch name resolution pseudocode added

The batch collect → single `IN` query → nameMap pattern is documented in section 3.4. ✓

### MEDIUM — `parseCursor` is defined in plan but its file location is unspecified

The plan shows `parseCursor` as a function in the pseudocode but does not say where it lives:
- Option A: Defined inline in each router handler (duplication across 4 procedures)
- Option B: Defined once in `packages/api/src/lib/` as a shared utility

If each of the four procedures duplicates the function, any future bug fix must be applied four times. The plan should specify Option B: create `packages/api/src/lib/cursor.ts` with `parseCursor` and `encodeCursor` and import from there.

The `encodeCursor` function is also not shown in the plan — it must exist to build `nextCursor` from the last row. Plan does not document how `nextCursor` is constructed.

**Recommended addition to plan:**
```typescript
// packages/api/src/lib/cursor.ts
export function encodeCursor(changedAt: Date, id: string): string {
  return `${changedAt.toISOString()}|${id}`;
}
export function parseCursor(cursor: string): { changedAt: Date; id: string } | null {
  // ... (already in plan section 3.4)
}
```

### MEDIUM — Plan does not show how `nextCursor` is built from query results

**Location:** Plan sections 3.4 and 5

The plan says the response includes `nextCursor: string | null` but never shows:
1. How to detect that there IS a next page: fetch `limit + 1` rows, if `rows.length > limit` there are more
2. How to encode the cursor from the last row: `encodeCursor(lastRow.changedAt, lastRow.id)`
3. How to strip the extra row before returning: `rows.slice(0, limit)`

The standard "fetch N+1, check length" pattern is not documented. Without this, implementations may use `rows.length === limit` as the next-page signal (wrong — misses the last exact-limit page boundary) or build the cursor from the wrong row.

**Required addition to plan:**
```typescript
// In router handler, after calling service:
const rows = await getSalesOrderStatusHistory(tenantDb, salesOrderId, {
  cursor: opts.cursor,
  limit: (opts.limit ?? 50) + 1,  // fetch one extra to detect next page
});
const hasMore = rows.length > (opts.limit ?? 50);
const page = hasMore ? rows.slice(0, opts.limit ?? 50) : rows;
const lastRow = page.at(-1);
const nextCursor = hasMore && lastRow
  ? encodeCursor(lastRow.changedAt, lastRow.id)
  : null;
```

This is the canonical cursor pagination pattern. Missing this from the plan is a HIGH implementation risk.

### LOW — `inArray` import not shown in batch resolution pseudocode

The pseudocode uses `inArray(users.id, userIds)` but `inArray` must be imported from `drizzle-orm`. The `appointments.ts` router already imports `inArray` from `drizzle-orm` — implementers should reuse this import. Just a minor doc gap.

### INFO — Performance budget confirmed

- History tables: 4 total. Each query is O(index scan on entityId) = O(log n) rows returned per entity.
- Name resolution: single `IN` query on control-panel `auth.user` PK. For ≤50 rows, the `IN` set has ≤50 IDs. Well within normal query parameters.
- Net: 2 DB queries per `statusHistory` procedure call (one tenant DB, one control-panel DB). Acceptable.

---

## Verdict

Two new MEDIUM findings: missing `encodeCursor` function and missing N+1-fetch pagination pattern. Both are HIGH implementation risk if left undocumented. Apply to plan.

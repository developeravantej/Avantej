# Scalability Audit — Pass 1

## Files checked
- `packages/services/src/announcements.service.ts`
- `packages/db/src/schema/tenant/announcement-scopes.ts`
- `packages/db/src/migrations/tenant/0037_add_promotion_waitlist_announcement_scopes.sql`
- Plan §7 (Performance section)

---

## Finding SC-01: EXISTS subquery index coverage — CORRECT (LOW)

The EXISTS subquery:
```sql
WHERE announcement_id = $1 AND branch_id = ANY($2)
```

Index: `UNIQUE INDEX on (announcement_id, branch_id)` — leftmost column is `announcement_id`. PostgreSQL can use this index for:
1. An index scan on `announcement_id = $1` to find candidates, then filter by `branch_id = ANY($2)`
2. For `NOT EXISTS`, same index is used to check zero rows efficiently

For typical tenant sizes (< 1000 announcements, < 50 hierarchy nodes), this is fast. Even at scale (10k announcements, 200 nodes), the indexed lookup is O(log N) per announcement. No additional index needed for this query pattern.

**Plan assessment:** Correct. No action.

---

## Finding SC-02: N+1 on scope enrichment (Task 1.8) — MEDIUM

Plan Task 1.8 proposes a two-query pattern:
1. Fetch announcements (up to 50 rows)
2. Fetch all `announcement_scopes` for those announcement IDs: `WHERE announcement_id IN (...)`

This is O(2) queries, not O(N). The second query is a single `IN` clause batch fetch. Correct approach — no N+1.

**Concern:** The `IN` clause with up to 50 UUIDs. PostgreSQL handles this efficiently. No issue.

---

## Finding SC-03: Unbounded announcement list — LOW (pre-existing)

Current `listAnnouncements` has `limit = 50` default. The plan does not change this. Acceptable for a management table. No issue introduced by this plan.

---

## Finding SC-04: Two correlated subqueries per announcement row — MEDIUM

The plan's WHERE clause runs TWO correlated subqueries per announcement row:
```sql
WHERE (
  NOT EXISTS (SELECT 1 FROM announcement_scopes WHERE announcement_id = a.id)
  OR EXISTS (SELECT 1 FROM announcement_scopes WHERE announcement_id = a.id AND branch_id = ANY(...))
)
```

For a list of 50 announcements, PostgreSQL executes up to 100 subquery lookups. Each is indexed but still has overhead. For initial data (all announcements have no scope rows), the NOT EXISTS short-circuits immediately (zero rows found, condition true), so the second EXISTS is not evaluated due to OR short-circuit.

**For announcements WITH scopes:** Both subqueries run. With proper indexing, each is an index lookup (O(1) effectively). At 50 announcements × 2 subqueries = 100 indexed lookups. Acceptable.

**Optimization alternative (not blocking):** Use a LEFT JOIN with GROUP BY instead:
```sql
SELECT a.*, COUNT(s.id) FILTER (WHERE s.branch_id = ANY(...)) as scope_match
FROM announcements a
LEFT JOIN announcement_scopes s ON s.announcement_id = a.id
GROUP BY a.id
HAVING COUNT(s.id) = 0 OR scope_match > 0
```

This is a single pass but more complex. The EXISTS approach from the plan is simpler to write in Drizzle and correct. At current scale, EXISTS is preferred. Flagging as MEDIUM for future awareness only.

---

## Finding SC-05: hierarchy.listNodes cache staleTime — plan recommends but doesn't mandate — LOW

Plan Task 2.1: "Cache it with a long `staleTime` (e.g. 5 minutes)."

The plan uses `useQuery` but doesn't show the `staleTime` in the code snippet. Without explicit `staleTime`, TanStack Query defaults to 0ms (always stale → refetch on window focus). Every time the dialog opens, a hierarchy node fetch fires.

**Impact:** Low for typical usage (< 50 nodes, fast query). But adds unnecessary requests.

**Required action:** Plan should add `staleTime: 5 * 60 * 1000` to the `useQuery` for `hierarchy.listNodes` in Task 2.1 code.

---

## Finding SC-06: Scope enrichment second query with empty announcementIds — LOW

Plan Task 1.8:
```typescript
const announcementIds = rows.map(r => r.id);
const scopes = announcementIds.length > 0
  ? await tenantDb.select()...
  : [];
```

Correctly guards against `inArray(announcementScopes.announcementId, [])` when rows are empty. Good.

---

## Finding SC-07: admin bypass avoids EXISTS subquery entirely — performance benefit

If `isAdmin` bypass (recommended in TS-02) is implemented, admin `listAnnouncements` skips the EXISTS filter entirely. This is also a performance win — admins don't pay the subquery cost. At scale with large organizations, this matters.

---

## Summary

| ID | Severity | Action |
|---|---|---|
| SC-04 | MEDIUM | Document as acceptable; note optimization path for future |
| SC-05 | MEDIUM | Add `staleTime: 5 * 60 * 1000` to Task 2.1 code snippet |
| SC-01,02,03,06,07 | LOW | Correct or informational; no action |

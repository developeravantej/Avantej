# Scalability Audit — Pass 1

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** scalability-auditor

---

## Summary

Checking for N+1 patterns, unbounded lists, missing indexes, external calls in transactions, and race conditions across all new service and router code in the plan.

---

## Findings

### HIGH — SC1: `upsertPreferredTimes` — non-atomic delete + insert (existing, documented)

**Rating:** HIGH (pre-existing, documented in plan as Open Question #2)

The plan acknowledges:
> "upsertPreferredTimes service is not transactional (delete + insert, not wrapped in a DB transaction). Data loss on insert failure is possible."

Actual code confirmed:
```typescript
await tenantDb.delete(preferredTimes).where(...);  // Step 1
if (items.length === 0) return [];
const rows = await tenantDb.insert(preferredTimes).values(...).returning();  // Step 2
```

If Step 2 fails (network partition, constraint violation), the preferred times for that package instance are permanently lost.

**The plan correctly identifies this and defers the fix.** For this plan's scope (admin edit UI), the risk is LOW in practice (single-user admin action, unlikely to hit network partition at the insert step after successful delete). However, the plan RECOMMENDS wrapping in a transaction (Section 7) — implementors should follow this.

**Recommended fix (not mandatory for this plan):**
```typescript
await tenantDb.transaction(async (tx) => {
  await tx.delete(preferredTimes).where(...);
  if (items.length > 0) {
    await tx.insert(preferredTimes).values(...);
  }
});
```

---

### MEDIUM — SC2: `listCategoryBufferOverridesForMember` — 2 queries but could be 1

**Rating:** MEDIUM

The service function runs:
1. `selectDistinct` with 4-table join to get assigned categories + defaults
2. `select` overrides for those categories

This is 2 round trips. For a typical trainer with 5-20 service categories, this is perfectly acceptable. However, the service could be written as a single query with LEFT JOIN on `member_category_buffer_overrides`:

```sql
SELECT DISTINCT
  s.category_id,
  sc.name,
  scc.buffer_time_minutes AS org_default,
  mcbo.buffer_time_minutes AS override
FROM service_members sm
JOIN services s ON sm.service_id = s.id
LEFT JOIN service_categories sc ON s.category_id = sc.id
LEFT JOIN service_category_config scc ON s.category_id = scc.category_id
LEFT JOIN member_category_buffer_overrides mcbo 
  ON s.category_id = mcbo.category_id AND mcbo.member_id = sm.member_id
WHERE sm.member_id = $memberId
```

This eliminates the second round trip and the `inArray` query. Since the plan explicitly notes "No N+1" in Performance, this 2-query approach is acceptable. Not a bug, but a minor optimization opportunity.

**Rating: LOW** — 2 queries for this use case is fine.

---

### HIGH — SC3: `listCategoryBufferOverridesForMember` — `inArray` with empty categoryIds

**Rating:** HIGH

```typescript
if (categoryIds.length === 0) return [];

const overrides = await tenantDb
  .select()
  .from(memberCategoryBufferOverrides)
  .where(
    and(
      eq(memberCategoryBufferOverrides.memberId, memberId),
      inArray(memberCategoryBufferOverrides.categoryId, categoryIds),
    ),
  );
```

The early return `if (categoryIds.length === 0) return []` correctly handles the empty array case. Without this guard, `inArray(column, [])` generates invalid SQL (`WHERE column IN ()`) which would throw a DB error in PostgreSQL.

**Plan correctly handles this.** ✓ The guard is in place. **No issue.**

---

### MEDIUM — SC4: No pagination on `listCategoryBufferOverridesForMember` or `listForMember`

**Rating:** LOW

The procedures return all category overrides for a member. A trainer will typically have 1-10 service categories. Even in an extreme case (50 categories), the dataset is tiny and pagination is not needed. The plan's Performance section correctly notes this is "bounded by member's service count."

**No issue for this use case.** ✓

---

### MEDIUM — SC5: `updateMine` verification query — potential N+1 if called in a loop

**Rating:** LOW

```typescript
const hasAssignment = await context.tenantDb
  .select({ id: serviceMembers.id })
  .from(serviceMembers)
  .innerJoin(services, eq(serviceMembers.serviceId, services.id))
  .where(
    and(
      eq(serviceMembers.memberId, context.member.id),
      eq(services.categoryId, input.categoryId),
    ),
  )
  .limit(1);
```

This is a LIMIT 1 query on indexed columns (`service_members_member_idx` + `service_members_service_idx`). Very fast. No N+1 possible — this is called once per `updateMine` invocation, which is a single-item mutation. ✓

---

### LOW — SC6: No index on `services.categoryId` for the service join

**Rating:** LOW

The `listCategoryBufferOverridesForMember` service joins `services` on `categoryId`. Checking the actual services schema:
- `services.categoryId` is a FK: `.references(() => serviceCategories.id, { onDelete: "restrict" })`

Drizzle/PostgreSQL does NOT automatically create an index on FK columns (unlike MySQL). An index on `services.category_id` would speed up the JOIN. This is a pre-existing gap in the schema, not introduced by this plan.

**Mitigation:** Service assignments are small enough (bounded by member's assigned services) that this is not a performance issue in practice.

---

### MEDIUM — SC7: `updateMine` category check uses `serviceMembers` join but could use the cached `listCategoryBufferOverridesForMember` result

**Rating:** LOW

When staff calls `updateMine`, the handler:
1. Runs a verification query to check if the category has assigned services
2. Then calls `upsertCategoryBufferOverride`

If the UI first loads via `listMine` (which already fetches all assigned categories) and only allows setting overrides for displayed categories, the `updateMine` verification is redundant from a UX perspective — but it's a necessary server-side guard.

No optimization needed. ✓

---

### INFO — SC8: Concurrent upserts on same (memberId, categoryId)

**Rating:** INFO

The plan notes in Section 7: "`INSERT ... ON CONFLICT DO UPDATE` — atomic; safe".

Confirmed: PostgreSQL `ON CONFLICT DO UPDATE` is atomic at the row level. Two concurrent upserts for the same `(memberId, categoryId)` will serialize correctly — one will win the conflict, the other will update. No lost update. ✓

---

### INFO — SC9: Phase 2 preferred times — query is lazy-loaded (only on expand)

**Rating:** INFO

The plan notes: "Phase 2 UI loads preferred times only when package row is expanded — existing lazy pattern."

Confirmed in `package-row.tsx`: `PreferredTimesSection` is rendered inside the expanded section, so the query only fires when the row is expanded. ✓

---

## Status Table

| Finding | Rating | Issue |
|---|---|---|
| SC1: upsertPreferredTimes non-atomic | HIGH | Pre-existing, plan defers fix |
| SC2: 2 queries vs 1 | LOW | Acceptable for this data size |
| SC3: inArray empty guard | INFO | ✓ correctly handled |
| SC4: No pagination | LOW | Bounded data, not needed |
| SC5: updateMine N+1 | INFO | ✓ LIMIT 1, indexed |
| SC6: No index on services.categoryId | LOW | Pre-existing schema gap |
| SC7: Redundant verification | INFO | Necessary server-side guard |
| SC8: Concurrent upserts | INFO | ✓ ON CONFLICT atomic |
| SC9: Phase 2 lazy load | INFO | ✓ existing pattern |

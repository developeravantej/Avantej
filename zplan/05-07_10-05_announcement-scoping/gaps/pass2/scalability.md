# Scalability Audit — Pass 2

## Changes since Pass 1
- SC-05 resolved: staleTime added to Task 2.1 ✓
- SC-04 noted: two correlated subqueries — acceptable, documented

---

## Re-check of SC findings

### SC-05: staleTime — RESOLVED ✓
### SC-04: correlated subqueries — documented as acceptable ✓

---

## New finding P2-SC-01: isAdmin bypass eliminates EXISTS overhead for admin routes — INFO

The `isAdmin` bypass (added as CRITICAL-2 fix) has a secondary performance benefit: admin `list` queries no longer run two correlated subqueries per row. Admins are typically the heaviest users of `listAnnouncements`. This is a positive side effect.

---

## New finding P2-SC-02: scope enrichment second query — pagination concern — MEDIUM

Task 1.8 batch-fetches scopes for returned announcement IDs:
```typescript
const announcementIds = rows.map(r => r.id);
const scopes = announcementIds.length > 0
  ? await tenantDb.select().from(announcementScopes)
      .where(inArray(announcementScopes.announcementId, announcementIds))
  : [];
```

With the default `limit = 50`, this means `WHERE announcement_id IN (50 UUIDs)`. This is fine.

**Concern:** `listActive` also uses Task 1.8 enrichment ("Apply the same enrichment to `listActiveAnnouncements`"). The widget uses `listActive` with `limit = 50` (default). If the service is called frequently (dashboard load), this adds a second query per request. At 1000 concurrent dashboard loads, that's 2000 queries/second to the tenant DB (1000 announcements + 1000 scopes). For a single tenant DB this is manageable. For a SaaS with 100 tenants each getting 1000 concurrent loads... less so.

**Mitigation:** The widget already has `staleTime: 60 * 1000` (60 seconds). So dashboard loads don't trigger 1000 concurrent queries — they're cached client-side. The scope enrichment second query is not on the hot path in practice.

**Recommendation:** Low concern for current scale. If `listActive` is called very frequently (no client-side cache), consider returning scopes only for `listAnnouncements` (admin table) and NOT for `listActiveAnnouncements` (widget). The widget doesn't display scope labels anyway (Task 2.6: no changes to widget).

---

## New finding P2-SC-03: hierarchy.listNodes in create dialog — node count concern — LOW

Task 2.1 fetches ALL accessible hierarchy nodes for the scope selector. For an org with 500 nodes, this is 500 checkboxes. The dialog becomes unusable.

**Plan gap:** The plan doesn't cap or paginate the node list in the multi-select. For orgs with many nodes, the checkbox list in the dialog will be very long.

**Mitigation from plan:** "Indent nodes by depth to show hierarchy visually (12px per level)" — this helps readability but not length.

**Recommendation (LOW priority):** For MVP, a scrollable list with max-height is sufficient (the plan already has `max-h-40 overflow-y-auto`). No action needed now. Note as a known UX limitation for large orgs.

---

## Summary

| ID | Severity | New? | Action |
|---|---|---|---|
| P2-SC-02 | MEDIUM | Yes | Note in plan: widget enrichment adds second query; acceptable with client-side cache |
| P2-SC-03 | LOW | Yes | Document as UX limitation for large orgs; max-height scroll is sufficient |
| P2-SC-01 | INFO | — | Positive side effect, no action |
| SC-01,03,04,06,07 | LOW/Info | Resolved or noted | ✓ |

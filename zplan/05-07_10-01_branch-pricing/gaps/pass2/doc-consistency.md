# Documentation Consistency Audit — Pass 2
**Lens:** doc-consistency-auditor
**Date:** 2026-05-07

## Summary

Re-auditing after Pass 1 fixes. Most doc issues resolved. A few new or surviving issues found.

---

## Findings

### [INFO] Line number references removed/qualified ✓
- §3.5 now says "(line numbers approximate — search for `useQuery` with `queryKey: ['services-list']`)"
- `disabled` logic now has the full expression rather than a stale line number

### [INFO] Phase 4 `validateSearch` now specified ✓

### [INFO] Products directory creation note added ✓

### [INFO] Filter-first UX now documented in Phase 3 ✓

### [MEDIUM] Phase 3 pricing-page description still says "Service Name" in §2 ("After" section) but the updated Phase 3 component table columns no longer include "Service Name" column (since it's filter-first, one service at a time). The §2 "After" description says the table has "service name, branch name, customer type..." — this is now inconsistent with the filter-first approach where service is already selected via combobox.
- **Fix: Update §2 "After" description to match filter-first UX: the table shows branch, customer type, price, dates for the selected service**

### [MEDIUM] Phase 3 step 1 says "Render `<ServicePricingPage />` when `tab === 'pricing'`" but does not specify where in the content switch to add this. The current switch is an if-else chain:
```typescript
const content =
  tab === "promotions" ? <PromotionsPage /> :
  tab === "rooms" ? <RoomsPage /> :
  tab === "categories" ? <ServiceCategoriesPage /> :
  <ServicesPage />;
```
Adding `pricing` must be before the final else. Not ambiguous for an experienced dev but should be explicit.
- **Fix: Add note that `tab === "pricing"` must be inserted before the final `<ServicesPage />` else branch**

### [MEDIUM] Plan §5 Phase 3 dialog uses `client.hierarchy.listNodes` but does not specify the input `{organizationId}` which is required by the procedure. The component needs access to `organizationId` (from `useUserContext`).
- **Fix: Add note that listNodes requires `organizationId` from `useUserContext` context**

### [LOW] Plan §5 Phase 2 pseudocode calls `client.services.resolvePrice({organizationId, serviceId: svc.id, branchId, customerType})` — the actual Zod input for `services.resolvePrice` uses `serviceId: z.string().uuid()` and `branchId: z.string().uuid().nullable().optional()`. When `branchId` is null (no customer selected), passing `branchId: null` is valid (optional nullable). The pseudocode is correct.

### [LOW] Phase 2 prop note says "defaults to null" for `selectedCustomer?` but TypeScript optional props default to `undefined`, not `null`. Inside the component: `const branchId = selectedCustomer?.branchId ?? null` correctly handles `undefined` case by returning `null`. The comment is slightly imprecise but not misleading.

### [INFO] The audit-swarm annotations are in the correct positions (before Phase 1 and Phase 2 headers). Implementation agents will see them.

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| §2 "After" description inconsistent with filter-first UX | MEDIUM | Yes |
| Phase 3 content switch insertion point not specified | MEDIUM | Yes |
| `hierarchy.listNodes` needs `organizationId` — not mentioned in dialog spec | MEDIUM | Yes |
| Optional prop defaults to undefined not null (imprecise comment) | LOW | Yes |

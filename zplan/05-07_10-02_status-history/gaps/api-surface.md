# API Surface Audit — Pass 1

**Auditor:** api-surface-auditor
**Date:** 2026-05-07

---

## Summary

Three CRITICAL permission resource name mismatches found. The plan uses non-existent permission resource strings. No `statusHistory` procedures exist yet (expected — not yet implemented). Payment router gap correctly identified in plan but option recommendation needs precision.

---

## Findings

### CRITICAL — Wrong permission resource: `sales_management` does not exist

**Location:** Plan section 3.4, Phase 1 item 3, Phase 1 item 4

Plan states:
> `salesOrders.statusHistory` → requires `sales_management:read`

Actual resource type in `packages/services/src/permission.service.ts`:
```typescript
| "sales"  // line 38
```

`sales_management` is NOT in the `Resource` union type. Using it in `requirePermission(context.tenantDb, context.member, "sales_management", "read")` will either silently pass (if the function falls through) or cause a runtime error.

**Fix:** Replace `"sales_management"` with `"sales"` in the plan and implementation.

Existing router `salesOrdersRouter` uses `requirePermission(context.tenantDb, context.member, "sales", "read")` which is the correct resource name.

---

### CRITICAL — Wrong permission resource: `package_management` does not exist

**Location:** Plan section 3.4, Phase 2 item 5

Plan states:
> `packageInstances.statusHistory` → requires `package_management:read`

`package_management` is NOT in the `Resource` union type. The actual resource name is not defined for package instances in the permission service. The nearest candidates are none — there is no `package_management` resource.

The `package-instances` router uses no `requirePermission` call in its existing list/create/update procedures (it gates on org membership, not a named permission resource). The plan must specify which actual resource to use, or add a new resource if truly needed.

**Recommended fix:** Use `"sales"` as the permission resource for package instances (they are purchased packages), or add `"package_management"` to the `Resource` union in `permission.service.ts`. Must be resolved before implementation.

---

### CRITICAL — Wrong permission resource: `financial_management` does not exist

**Location:** Plan section 3.4

Plan states:
> `payments.statusHistory` → requires `financial_management:read`

`financial_management` is NOT in the `Resource` union type. The actual resource for payment operations is:
```typescript
| "payments"  // line 39
```

**Fix:** Replace `"financial_management"` with `"payments"` in the plan and implementation.

---

### HIGH — No `statusHistory` procedures exist in any router (expected, but verify before Phase 1)

No `statusHistory` key exists in:
- `packages/api/src/routers/sales-orders.ts` (exports `salesOrdersRouter` with list/getById/create/update/cancel)
- `packages/api/src/routers/appointments.ts` (exports `appointmentsRouter`)
- `packages/api/src/routers/package-instances.ts` (exports `packageInstancesRouter`)
- `packages/api/src/routers/invoices.ts` (no payment status history)

This is expected (not yet implemented), but confirming the baseline so implementation knows exactly what to add.

---

### MEDIUM — No `getControlPanelDb` import shown in plan for new procedures

Plan section 3.4 describes name resolution via `getControlPanelDb(context)`. This helper exists at `packages/api/src/lib/context-helpers.ts`. The appointments router already imports and uses it. The plan correctly cites this pattern.

For the `salesOrders.statusHistory` procedure, the implementation must import `getControlPanelDb` — the plan mentions it but doesn't show it in the file diff explicitly.

---

### MEDIUM — `payments.statusHistory` router placement ambiguity

Plan Q1 recommends Option B: add `paymentStatusHistory` procedure to `invoicesRouter`. However, the plan body (section 3.4) refers to it as `payments.statusHistory`, implying a dedicated key. These are inconsistent.

If added to `invoicesRouter`, the client call would be `client.invoices.paymentStatusHistory(...)` not `client.payments.statusHistory(...)`. The plan must clarify and be consistent.

**Recommended fix:** If using Option B, rename to `paymentStatusHistory` on `invoicesRouter` and update all UI call patterns to `client.invoices.paymentStatusHistory(...)`.

---

### INFO — `salesOrdersRouter` is registered in `baseRouter` as `salesOrders`

`packages/api/src/routers/index.ts` line confirms `salesOrders: salesOrdersRouter`. Adding `statusHistory` to the router exports it automatically as `client.salesOrders.statusHistory(...)`. No `index.ts` change needed for Phase 1.

---

### INFO — `appointmentsRouter` registered as `appointments` ✓
### INFO — `packageInstancesRouter` registered as `packageInstances` ✓

Both are in `baseRouter`. Adding `statusHistory` to each router is sufficient.

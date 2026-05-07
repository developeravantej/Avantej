# Schema Drift Audit — Pass 1

**Auditor:** schema-drift-auditor
**Date:** 2026-05-07

---

## Summary

All four status-history schema files exist and match the plan's column description. No schema migrations are required. No drift found on table structure.

---

## Findings

### INFO — All four history tables confirmed present

Files exist:
- `packages/db/src/schema/tenant/sales-order-status-history.ts` ✓
- `packages/db/src/schema/tenant/appointment-status-history.ts` ✓
- `packages/db/src/schema/tenant/package-instance-status-history.ts` ✓
- `packages/db/src/schema/tenant/payment-status-history.ts` ✓
- `packages/db/src/schema/tenant/_status-history-columns.ts` ✓

### INFO — Column shape matches plan exactly

The `statusHistoryColumns` spread contains:
- `fromStatus` — text, nullable ✓
- `toStatus` — text, NOT NULL ✓
- `changedBy` — text, NOT NULL ✓
- `changedAt` — timestamptz, NOT NULL, DEFAULT NOW() ✓
- `reason` — text, nullable ✓
- `notes` — text, nullable ✓

Plan section 3.1 matches actual schema exactly.

### INFO — Composite indexes confirmed on all four tables

Each table has a named index on `(entityId, changedAt)`:
- `sales_order_status_hist_entity_idx` on `(salesOrderId, changedAt)` ✓
- `appointment_status_hist_entity_idx` on `(appointmentId, changedAt)` ✓
- `package_instance_status_hist_entity_idx` on `(packageInstanceId, changedAt)` ✓
- `payment_status_hist_entity_idx` on `(paymentId, changedAt)` ✓

Plan section 3.1 claim "composite index on (entityId, changedAt)" is correct.

### INFO — FK cascade delete confirmed

All four tables have `{ onDelete: "cascade" }` on the parent FK. This matches expected behavior.

### INFO — No migrations needed

Plan section 1 (Goals #3) states "add no schema migrations and no new DB tables." This is correct — all four tables already exist in the schema.

### MEDIUM — Plan refers to `status-history.helper.ts` import path

Plan section 3 (Phase 3, item 1) states: "Import `appendPackageInstanceStatusHistory` from `./status-history.helper`". The actual file is at `packages/services/src/status-history.helper.ts` and is imported via relative path `"./status-history.helper"` in service files. This is correct.

### INFO — No `paymentsRouter` in index

The plan correctly identifies in Q1 (Open Questions) that no `paymentsRouter` exists. `packages/api/src/routers/` has no `payments.ts` file. The recommendation to use Option B (add to `invoicesRouter`) is consistent with reality.

---

## Verdict

**No schema drift found.** All four tables, columns, indexes, and FKs match the plan. No action required on schema.

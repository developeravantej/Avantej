# Cross-Cutting Concerns

## Error Handling

No new error handling patterns needed. All changes follow existing patterns:
- oRPC routers throw `ORPCError` with standard codes
- Frontend catches errors in mutation `onError` callbacks and displays via `toast.error()`
- Service layer functions throw plain `Error` for business rule violations

## Testing Strategy

### Unit Tests (Phase 2)
- Test new `serviceCategoryConfig` router with mock tenantDb
- Test updated `cancelSalesOrder` writes cancellation fields to sales_orders
- Test `createPackageInstance` with `serviceId` param
- Use existing test helpers in `apps/server/src/tests/helpers/`

### Integration Tests (Phase 2-3)
- Test full flow: create service category + config → verify `service_category_config` row
- Test full flow: cancel sales order → verify cancellation columns on `sales_orders` row
- Test `packageInstances.create({ serviceId })` → verify both columns during transition

### Frontend Tests (Phase 3)
- Update `apps/web/src/__tests__/routes/packages.test.tsx` for services-based calls
- Verify form rendering tests for rewired data-tables

### Manual E2E (Phase 4)
- Full manual verification checklist in Phase 4 doc

## Migration Plan

### Data Migration Order
1. Phase 1: Add columns (additive, no data loss possible)
2. Phase 1: Run migration script to copy data
3. Phase 2-3: Deploy new code (reads/writes new columns)
4. Phase 4: Drop old columns and tables

### Rollback Strategy

**Phase 1 rollback:** Drop the newly added columns. No data loss (they were new).

**Phase 2 rollback:** Revert the code changes. Old routers are still present, old tables still exist. Data written to new columns during Phase 2 is harmless (nullable columns on existing tables).

**Phase 3 rollback:** Revert frontend code. Backend still has old routers alive (they're not removed until Phase 4). The old frontend code will work against the old routers.

**Phase 4 rollback:** This is the only irreversible phase. Before starting:
1. Take a full DB backup (`bun run scripts/backup-tenant-tables.ts` — extend to include all 5 tables)
2. Verify data migration script completed successfully
3. Confirm zero grep hits for dropped names

If Phase 4 must be rolled back:
1. Restore the deleted schema/router/service files from git
2. Re-add the exports to index files
3. Run a reverse migration to recreate the dropped tables
4. Restore data from backup

## Performance Considerations

### Positive Impact
- Fewer JOINs needed: commission config is on `service_category_config` (1:1 with category) instead of requiring service → service_commission_config + service → service_rules lookups
- Cancelled sales queries are simpler: one table scan with index on `status` instead of JOIN between `sales_orders` and `cancelled_sales`
- `package_instances.serviceId` enables direct JOINs to services without going through the `packages` intermediary

### Indexes to Verify
After migration, confirm these indexes exist and are used:
- `services_expiry_days_idx` on `services.expiryDays`
- `package_instances_service_idx` on `package_instances.serviceId`
- `sales_orders_cancellation_number_idx` on `sales_orders.cancellationNumber`
- `sales_orders_cancellation_date_idx` on `sales_orders.cancellationDate`

### Query Plan Check
After Phase 4, verify that the cancelled sales list query uses the `status` index:

```sql
EXPLAIN ANALYZE SELECT * FROM sales_orders WHERE status = 'cancelled' ORDER BY cancellation_date DESC LIMIT 50;
```

## Deployment Sequence

```
Phase 1 (safe, additive)
  ↓ deploy independently
Phase 2 + Phase 3 (MUST deploy together)
  ↓ verify in production for 1-2 days
Phase 4 (destructive, requires backup first)
  ↓ deploy after verification
```

**Never deploy Phase 2 without Phase 3** — the `packageInstances` router changes will break the native app if it still calls `packages.list`.

**Never deploy Phase 4 without Phase 2+3 verified** — dropping tables before code is updated = downtime.

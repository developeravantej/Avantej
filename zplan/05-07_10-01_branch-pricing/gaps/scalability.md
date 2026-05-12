# Scalability Audit — Pass 1
**Lens:** scalability-auditor
**Date:** 2026-05-07

## Summary

Checked N+1 patterns, unbounded lists, missing indexes on new WHERE clauses, external calls inside transactions, and race conditions.

---

## Findings

### [HIGH] N+1 in `listServicePriceOverrides` UI — plan fetches per service

Plan §5 Phase 3 says the pricing-page shows "all active overrides across all accessible services" on load. The suggested approach is "Single global table... On load, shows all active overrides across all accessible services."

But the only available API is `services.listPriceOverrides({organizationId, serviceId})` — which takes a single `serviceId`. To show all overrides:
1. First call `services.list()` → N services
2. For each service, call `services.listPriceOverrides(serviceId)` → N queries

**This is an N+1 pattern.** For a tenant with 50 services, this is 51 queries on page load. The plan acknowledges N+1 at POS checkout (≤5 items) as acceptable, but the admin pricing page could have many more services.

**Recommended fix:** Add a `services.listAllPriceOverrides({organizationId})` procedure that returns all overrides across all services in one query, or implement a filter-first approach where the table is empty until a service is selected.

**Severity: HIGH** — admin pages with many services will be slow. The plan should either:
- Accept the filter-first UX (no N+1 on load), or
- Specify a batch endpoint

### [MEDIUM] `resolveServicePrice` fetches ALL price rows for a service then filters in JS

Current `pricing.service.ts` implementation:
```typescript
const candidates = await tenantDb
  .select({...})
  .from(servicePrices)
  .where(
    and(
      eq(servicePrices.serviceId, serviceId),
      lte(servicePrices.effectiveFrom, at),
      or(isNull(servicePrices.effectiveUntil), gt(servicePrices.effectiveUntil, at)),
    ),
  )
  .orderBy(desc(servicePrices.effectiveFrom));
```

This fetches ALL valid price rows for a service (potentially many) and then runs `pickMostSpecific` in JS. The `service_prices_lookup_idx ON (serviceId, branchId, customerType)` index helps with filtering by `serviceId`, but `branchId` and `customerType` are NOT used as WHERE conditions — they're filtered in application code.

**Impact:** The query fetches rows for ALL branches and customer types, then discards inapplicable ones in JS. For a tenant with many overrides per service, this could fetch many rows unnecessarily.

**Better approach:** Add a WHERE clause filter for `(branchId = $branchId OR branchId IS NULL) AND (customerType = $customerType OR customerType IS NULL)` — then the index covers all filter dimensions.

**Note:** The plan accepts this (§7 Performance: "single-item N+1 is acceptable given typical POS cart sizes ≤5 items") but does NOT mention this JS-side filtering as a concern. It should be noted.

### [MEDIUM] `expireServicePrice` — no optimistic locking / race condition

If two admin sessions call `expireServicePrice` on the same `priceId` simultaneously:
- Both read the row, both update `effectiveUntil`
- Second update silently overwrites the first
- This is benign (both set the same or similar expiry time) but could surprise an admin who set a future expiry that gets overwritten

**Severity: MEDIUM** — acceptable for now, but the plan should note this is last-write-wins.

### [MEDIUM] `setBranchPrice` does not expire previous overlapping overrides

If an admin calls `setBranchPrice` for `(serviceId, branchId=X, customerType=null, priceCents=9000)` and there is already an active row for the same `(serviceId, branchId=X, customerType=null)`, two active rows will exist. The resolution chain picks the most recent one (by `effectiveFrom`). This is correct behavior but can accumulate stale rows.

**Impact:** Over time, `service_prices` may accumulate many superseded rows that are never expired. These don't cause incorrect results (most-recent wins) but bloat the table and slow the lookup.

**Plan does not address cleanup of superseded rows.** For MVP this is acceptable, but worth noting.

### [LOW] `listServicePriceOverrides` — no pagination

The procedure returns all active overrides for a service. For a service with many historical overrides, this could be a large result set. Currently the WHERE clause filters to active overrides (`effectiveFrom <= now AND (effectiveUntil IS NULL OR effectiveUntil > now)`) so expired rows are excluded, keeping the set small.

**However:** If the plan extends the UI to show historical overrides, pagination will be needed. For active-only, the set is bounded by how many active overrides an admin would configure — typically small. **Acceptable for now.**

### [LOW] Phase 2 POS — `resolvePrice` per-item call not batched (acknowledged)

Plan §7 and §5 Phase 2 explicitly acknowledge this: "For a typical POS cart (≤5 items) this is acceptable." **No action needed.**

### [LOW] Index coverage for `expireServicePrice` update

`expireServicePrice(db, priceId, until?)` will do:
```sql
UPDATE service_prices SET effective_until = ? WHERE id = ?
```

`id` is the primary key (UUID PK) — this is O(1) by PK. **Index coverage is fine.**

### [INFO] `deleteServicePrice(db, priceId)` — cascade behavior

`service_prices` has no child tables (it IS the terminal table). Hard delete is safe — no orphaned rows.

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| N+1 on admin pricing page load (per-service override fetch) | HIGH | Yes — add filter-first UX spec or batch endpoint |
| `resolveServicePrice` JS-side branch/customerType filtering not using index | MEDIUM | Yes — note in plan, defer optimization |
| `expireServicePrice` last-write-wins race condition | MEDIUM | Yes — note in plan |
| `setBranchPrice` accumulates superseded rows (no auto-expire) | MEDIUM | Yes — note in plan |
| `listServicePriceOverrides` no pagination | LOW | No — acceptable for now |

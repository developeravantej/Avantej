# Schema Drift Audit — Pass 1
**Lens:** schema-drift-auditor
**Date:** 2026-05-07

## Summary

The plan's schema section (§3.1) is read-only review. All tables claimed to already exist were verified. No new tables or columns are planned. Findings relate to accuracy of plan documentation vs. actual schema files.

---

## Findings

### [INFO] `service_prices` — schema matches plan exactly
- File: `packages/db/src/schema/tenant/service-prices.ts`
- Plan claims: `id`, `serviceId` (FK services, cascade), `branchId` (FK hierarchyNodes, nullable, cascade), `customerType` (text, nullable), `priceCents` (integer NOT NULL), `effectiveFrom` (timestamp tz, default now, NOT NULL), `effectiveUntil` (timestamp tz, nullable), `createdAt` (timestamp tz, NOT NULL default now)
- Index: `service_prices_lookup_idx ON (serviceId, branchId, customerType)`
- **Verified MATCH.**

### [INFO] `product_prices` — schema matches plan exactly
- File: `packages/db/src/schema/tenant/product-prices.ts`
- Mirror of `service_prices` with `productId` instead of `serviceId`
- Index: `product_prices_lookup_idx ON (productId, branchId, customerType)`
- **Verified MATCH.**

### [HIGH] Plan §3.1 says `effectiveFrom DEFAULT now()` but plan also says it's `NOT NULL` — correct but the service function `setServicePrice` only conditionally spreads `effectiveFrom` (omits when undefined). Drizzle will apply the DB default, so this is fine at DB level, but the plan's statement "defaults to now" in the dialog form (§5 Phase 3) implies the UI should pre-fill the value — worth calling out.

### [HIGH] Plan §3.4: `products.listPriceOverrides` is documented as guarded by `service_management:update` but the actual implementation in `packages/api/src/routers/products.ts` uses `inventory:read`. This is a **permission guard mismatch** between plan text and actual code.
- Plan says: `products.listPriceOverrides` → `service_management:update (check)`
- Actual code: `await requirePermission(context.tenantDb, context.member, "inventory", "read")`
- Impact: Plan description misleads implementers. The actual code uses the correct guard (`inventory:read`), so implementation should follow the code, not the plan text.

### [MEDIUM] `hierarchyNodes` table is referenced as `branchId` FK target in both price tables. The plan (§3 Phase 3 dialog) says to filter nodes to type "branch". The `hierarchy_nodes` table must have a `type` column for this filter. Verified: `packages/db/src/schema/tenant/hierarchy.ts` exists. **Not verified** that `type` column exists (plan assumed). Implementers should confirm `hierarchyNodes.type` column exists before building the branch filter in the dialog.

### [LOW] No new migrations are planned. Plan §6 states "No migration required" — verified correct since `service_prices` and `product_prices` tables already exist in the schema files.

### [INFO] `services.price` is defined as `nullable integer` in the actual schema (visible in `pricing.service.ts` fallback: `svc?.price ?? null`). This matches plan §6: "services.price (nullable integer)".

### [INFO] `products.price` is described as "NOT NULL integer" in plan §6. The `pricing.service.ts` throws `new Error("Product not found: ${productId}")` rather than returning null, which is consistent with NOT NULL semantics.

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| `products.listPriceOverrides` uses `inventory:read` not `service_management:update` — plan text wrong | HIGH | Yes — fix plan text |
| `hierarchyNodes.type` column existence not confirmed | MEDIUM | No — needs dev verification |
| `effectiveFrom` UI pre-fill note not in plan dialog spec | HIGH | Yes — add to plan dialog spec |

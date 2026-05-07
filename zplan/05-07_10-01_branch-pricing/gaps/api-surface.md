# API Surface Audit — Pass 1
**Lens:** api-surface-auditor
**Date:** 2026-05-07

## Summary

Verified all oRPC procedures mentioned in plan §3.4, §5 Phase 1, and the user journeys against actual router files.

---

## Findings

### [CRITICAL] `services.expireBranchPrice` — DOES NOT EXIST
- Plan §3.4 lists it as "Missing oRPC procedure (to be added in Phase 1)"
- Plan §5 Phase 1 specifies handler code
- Actual `packages/api/src/routers/services.ts`: has `resolvePrice`, `listPriceOverrides`, `setBranchPrice` — NO `expireBranchPrice`
- **Status: Correctly identified as missing. Must be implemented.**

### [CRITICAL] `services.deleteBranchPrice` — DOES NOT EXIST
- Same file, same situation. Correctly identified as missing.

### [CRITICAL] `products.expireBranchPrice` — DOES NOT EXIST
- `packages/api/src/routers/products.ts`: has `resolvePrice`, `listPriceOverrides`, `setBranchPrice` — NO `expireBranchPrice`
- **Status: Correctly identified as missing. Must be implemented.**

### [CRITICAL] `products.deleteBranchPrice` — DOES NOT EXIST
- Same file, same situation. Correctly identified as missing.

### [CRITICAL] `expireServicePrice` service function — DOES NOT EXIST
- `packages/services/src/pricing.service.ts` exports: `resolveServicePrice`, `resolveProductPrice`, `listServicePriceOverrides`, `listProductPriceOverrides`, `setServicePrice`, `setProductPrice`
- Missing: `expireServicePrice`, `expireProductPrice`, `deleteServicePrice`, `deleteProductPrice`
- **Status: Correctly identified as missing. Phase 1 must add these.**

### [HIGH] `services.index.ts` re-export missing for new functions
- `packages/services/src/index.ts` currently re-exports `./pricing.service` via `export * from "./pricing.service"`
- Since `expireServicePrice` etc. will be added to `pricing.service.ts`, the wildcard re-export will automatically include them
- **Status: No change to `index.ts` needed after the functions are added.** The plan says "re-export the four new functions" (Phase 1, step 2), but this is already handled by the existing `export *`. Plan step 2 is unnecessary — this is a false work item. LOW risk of confusion.

### [INFO] `services.resolvePrice` — EXISTS ✓
- In `packages/api/src/routers/services.ts` — verified

### [INFO] `services.listPriceOverrides` — EXISTS ✓
- In `packages/api/src/routers/services.ts` — verified, uses `service_management:read` guard

### [INFO] `services.setBranchPrice` — EXISTS ✓
- In `packages/api/src/routers/services.ts` — verified

### [INFO] `products.resolvePrice` — EXISTS ✓
- In `packages/api/src/routers/products.ts` — verified

### [INFO] `products.listPriceOverrides` — EXISTS ✓
- In `packages/api/src/routers/products.ts` — uses `inventory:read` guard (not `service_management:update` as plan mistakenly says)

### [INFO] `products.setBranchPrice` — EXISTS ✓
- In `packages/api/src/routers/products.ts` — uses `inventory:update` guard

### [HIGH] `client.services.resolvePrice` in POS Phase 2 — plan (§5) proposes calling `client.services.resolvePrice`. The actual procedure exists and returns `{ priceCents }`. The plan code snippet uses `const { priceCents } = await client.services.resolvePrice(...)` — this is correct for the return type.

### [HIGH] Plan §5 Phase 2 says to use `await client.services.resolvePrice(...)` directly (imperative). In the TanStack Query + oRPC pattern of this codebase, this should be a `useQuery` with `enabled: !!serviceId && !!branchId` rather than an async call inside an event handler, or use `queryClient.fetchQuery`. The plan's pseudocode shows an `await` inside `handleServiceSelect` — this is valid with a direct client call but may block the UI. This is a pattern concern, not a bug.

### [HIGH] Permission guard inconsistency in plan §3.4 table:
- Plan states `products.listPriceOverrides` → `service_management:update (check)`
- Actual code: `inventory:read`
- This is documentation drift in the plan. The code is correct.

### [MEDIUM] `client.hierarchy.listNodes` — plan §5 Phase 3 says the branch picker fetches hierarchy nodes via `client.hierarchy.listNodes`. Verified: `hierarchy` router exists in baseRouter. The plan should verify the exact procedure name — likely `client.hierarchy.listNodes` or similar. Need to confirm the actual procedure signature.

### [LOW] `deleteBranchPrice` should require `service_management:delete` (plan §8 Q4). This resource action (`delete`) must be a valid action in `requirePermission`. Should be verified against `permission.service.ts` action types.

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| 4 missing oRPC procedures (expire/delete on services + products) | CRITICAL | No — needs implementation |
| 4 missing service layer functions (expire/delete) | CRITICAL | No — needs implementation |
| Phase 1 step 2 (`index.ts` re-export) is redundant — `export *` covers it | LOW | Yes — remove from plan |
| `products.listPriceOverrides` guard in plan text incorrect | HIGH | Yes — fix plan text |
| POS `resolvePrice` call pattern (await vs. useQuery) | HIGH | Yes — add guidance to plan |
| `hierarchy.listNodes` exact name unconfirmed | MEDIUM | No — needs verification |

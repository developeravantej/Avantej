# API Surface Audit — Pass 2
**Lens:** api-surface-auditor
**Date:** 2026-05-07

## Summary

Re-auditing after Pass 1 fixes. All major documentation drift was corrected. Remaining gaps are implementation gaps (non-auto-fixable).

---

## Findings

### [CRITICAL] Missing procedures still correctly flagged
- `services.expireBranchPrice`, `services.deleteBranchPrice`, `products.expireBranchPrice`, `products.deleteBranchPrice` — all 4 still absent from actual router files (expected — Phase 1 not yet implemented)
- `expireServicePrice`, `expireProductPrice`, `deleteServicePrice`, `deleteProductPrice` — all 4 still absent from `pricing.service.ts`
- Plan §3.3 and §3.4 correctly marks them as **Missing**. Annotations added. No new action.

### [INFO] `products.listPriceOverrides` auth corrected ✓
- Plan §3.4 now shows `inventory:read` — matches actual code

### [INFO] `index.ts` re-export step correctly marked as no-op ✓

### [INFO] `hierarchy.listNodes` confirmed ✓
- Procedure exists in `packages/api/src/routers/hierarchy.ts` at line 188
- Input: `{ organizationId: string.uuid() }`
- Returns all nodes within the caller's accessible scope
- Plan's reference to `client.hierarchy.listNodes` is correct

### [MEDIUM] `products.setBranchPrice` permission guard inconsistency
- Plan §3.4 table shows `products.setBranchPrice` → `service_management:update`
- Actual code in `packages/api/src/routers/products.ts` uses `inventory:update`
- **New finding (missed in Pass 1):** The products pricing guard uses `inventory:*` namespace, not `service_management:*`. This is a documentation drift still present in the updated plan.
- **Fix: Update §3.4 table row for `products.setBranchPrice` to show `inventory:update`**

### [LOW] `products.expireBranchPrice` and `products.deleteBranchPrice` — plan §5 Phase 1 step 4 says "mirroring services" but the products router uses `inventory` namespace permissions, not `service_management`. The new procedures should use `inventory:update` for `expireBranchPrice` and `inventory:delete` for `deleteBranchPrice`, not `service_management:*`.
- **Fix: Note the correct permission namespace in Phase 1 step 4**

### [INFO] `client.services.resolvePrice` confirmed — returns `{ priceCents: number | null }` ✓
### [INFO] `client.services.setBranchPrice` confirmed ✓
### [INFO] `client.hierarchy.listNodes({organizationId})` confirmed ✓

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| `products.setBranchPrice` guard still shows `service_management:update` — should be `inventory:update` | MEDIUM | Yes |
| New products procedures should use `inventory` namespace, not `service_management` | LOW | Yes — note in Phase 1 step 4 |
| 4 missing oRPC procedures + 4 missing service functions — still flagged, not yet implemented | CRITICAL | No (implementation) |

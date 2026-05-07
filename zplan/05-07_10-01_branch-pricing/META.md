# META — Per-Branch Pricing Overrides

**Session ID:** `05-07_10-01_branch-pricing`
**Feature area:** Area B — Per-Branch Pricing Overrides
**Created:** 2026-05-07
**Status:** PLANNING COMPLETE — ready for implementation

---

## Summary

Backend infrastructure (schema, service functions, oRPC procedures) was built by Agent 2.2 but never connected to the UI. The plan identifies two concrete gaps and delivers them in four phases:

1. **Phase 1** — Backend completion: add `expireBranchPrice`, `deleteBranchPrice` to service layer + both routers.
2. **Phase 2** — POS wiring: `ItemsStep` calls `resolvePrice` on service select instead of reading stale `services.price`.
3. **Phase 3** — Services pricing admin tab: `/dashboard/service/view?tab=pricing`.
4. **Phase 4** — Products pricing admin tab: `/dashboard/products/view?tab=pricing`.

---

## Files touched (planned)

### Phase 1 — Backend
- `packages/services/src/pricing.service.ts` — add expire/delete functions
- `packages/services/src/index.ts` — re-export new functions
- `packages/api/src/routers/services.ts` — add `expireBranchPrice`, `deleteBranchPrice` procedures
- `packages/api/src/routers/products.ts` — add `expireBranchPrice`, `deleteBranchPrice` procedures

### Phase 2 — POS
- `apps/web/src/components/pos/items-step.tsx` — branch-aware price resolution on service select
- `apps/web/src/components/pos/pos-workflow.tsx` — pass `selectedCustomer` prop

### Phase 3 — Services UI
- `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx` — add "pricing" tab
- `apps/web/src/components/pages/services/pricing-page.tsx` (NEW)
- `apps/web/src/components/pages/services/service-price-override-dialog.tsx` (NEW)

### Phase 4 — Products UI
- `apps/web/src/routes/_authenticated/dashboard/_layout/products/view.tsx` — add "pricing" tab
- `apps/web/src/components/pages/products/pricing-page.tsx` (NEW)
- `apps/web/src/components/pages/products/product-price-override-dialog.tsx` (NEW)

---

## Key decisions

| Decision | Choice | Reason |
|---|---|---|
| Customer type enumeration | Text convention ("member"/"walk_in") | No pgEnum migration needed; enforced by Zod |
| Permission guard | `service_management:update` | Same as editing services; avoids new resource type |
| Price input in POS | Disabled for service items (cannot override) | Prevents staff from bypassing branch pricing |
| N+1 at checkout | Accepted (≤5 items typical) | Batch API deferred; index coverage is adequate |
| Product in POS | Out of scope | `LineItemType` excludes "product" |

---

## Hub pages affected

- `zhub/pages/web-dashboard-service-view.md` — update to mention pricing tab
- `zhub/pages/web-dashboard-products-view.md` — update to mention pricing tab
- `zhub/pages/web-dashboard-sales-create.md` — update POS price resolution description
- `zhub/shared/api-overview.md` — add `expireBranchPrice`/`deleteBranchPrice` to services and products router entries

Run `/hub-update` after implementation is merged.

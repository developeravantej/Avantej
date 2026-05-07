# Scalability Audit — Pass 2
**Lens:** scalability-auditor
**Date:** 2026-05-07

## Summary

Re-auditing after Pass 1 fixes. Filter-first UX addresses the admin N+1. Race condition and superseded-row accumulation now documented in plan. New issue found.

---

## Findings

### [INFO] N+1 admin page addressed ✓
- Plan §7 and Phase 3 now specify filter-first UX — no load-time N+1

### [INFO] Race condition documented ✓
- Last-write-wins note added to §7

### [INFO] Superseded-row accumulation documented ✓

### [MEDIUM] Phase 2 `handleServiceSelect` rapid-switching race condition (also flagged by type-safety lens)
- Two in-flight `resolvePrice` calls for the same cart item — the slower one may resolve last and stamp the wrong price
- **Not addressed in scalability section of §7.** Should be noted as a concurrency concern.
- Mitigation: track `currentServiceId` in a ref; after `await`, check if `item.refId` still matches before calling the second `onUpdate`

### [MEDIUM] `hierarchy.listNodes` is called in both Phase 3 and Phase 4 dialogs to populate the branch picker. This fetches ALL hierarchy nodes for the org (no filtering by type in the API — client-side filter). For large orgs with many nodes (100+), this is a moderate payload. Acceptable for MVP since admin dialogs are low-frequency.

### [LOW] `client.services.list` in the Phase 3 service filter combobox — no pagination. For tenants with many services, the full list is loaded at once. Same pattern used throughout the existing dashboard — acceptable.

### [LOW] `products.listPriceOverrides` — same observations as `services.listPriceOverrides` from Pass 1. No new concerns.

### [INFO] `expireServicePrice` UPDATE by PK — O(1), no scalability concern.
### [INFO] `deleteServicePrice` DELETE by PK — O(1), no scalability concern.

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| Rapid-switching race condition not in §7 scalability/concurrency note | MEDIUM | Yes — add note |
| `hierarchy.listNodes` full org load for branch picker — acceptable for MVP | MEDIUM | Info only |
| Service list no pagination in filter combobox | LOW | No action |

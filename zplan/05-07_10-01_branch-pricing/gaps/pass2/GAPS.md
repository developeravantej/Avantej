# GAPS — Per-Branch Pricing Overrides — Pass 2
**Session:** `05-07_10-01_branch-pricing`
**Date:** 2026-05-07
**Pass:** 2 of 2

---

## Priority Fix Order

### P1 — Critical (implementation gaps — carried from Pass 1, unchanged)

| # | Finding | Lens | Auto-fixable |
|---|---|---|---|
| C1 | 4 missing oRPC procedures — not yet implemented | api-surface | No |
| C2 | 4 missing service-layer functions — not yet implemented | api-surface | No |
| C3–C5 | Test authoring gaps (expire/delete unit tests, POS component tests) | test-coverage | No |

### P2 — High (new findings from Pass 2)

| # | Finding | Lens | Auto-fixable |
|---|---|---|---|
| H1-P2 | `products.setBranchPrice` guard still shows `service_management:update` — should be `inventory:update` | api-surface | Yes |
| H2-P2 | `onUpdate` merge pattern — plan must note that `onUpdateItem` must use spread-merge to avoid clearing refId/description on second call | type-safety | Yes |
| H3-P2 | Test split: service-layer functions should have unit tests (mock DB), router auth should be integration tests — plan sends everything to integration level | test-coverage | Yes |
| H4-P2 | Tenant isolation test description misleading — actual test is router-level access check (not cross-DB), should test that a priceId for inaccessible service returns FORBIDDEN | test-coverage | Yes |

### P3 — Medium (new findings from Pass 2)

| # | Finding | Lens | Auto-fixable |
|---|---|---|---|
| M1-P2 | Branch picker must filter `hierarchy.listNodes` result to `node.type === "branch"` — not specified in plan | schema-drift | Yes |
| M2-P2 | `products.expireBranchPrice`/`deleteBranchPrice` should use `inventory:update`/`inventory:delete` permissions, not `service_management:*` | api-surface | Yes |
| M3-P2 | §2 "After" description inconsistent with filter-first UX (mentions "service name" column that won't exist in filter-first design) | doc-consistency | Yes |
| M4-P2 | Phase 3 content switch insertion point not explicit — "before final `<ServicesPage />`" not stated | doc-consistency | Yes |
| M5-P2 | `hierarchy.listNodes` requires `organizationId` from `useUserContext` — not mentioned in dialog spec | doc-consistency | Yes |
| M6-P2 | `deleteServicePrice` tenant check: `service.branchId = null` (org-wide services) must allow delete by any permissioned admin — nuance not in plan | type-safety | Yes |
| M7-P2 | Rapid service-switching race condition in `handleServiceSelect` — not addressed in plan; mitigation: check `currentServiceId` ref before second `onUpdate` | type-safety + scalability | Yes |
| M8-P2 | `deleteServicePrice` needs both service-unit-level AND router-integration-level tests — plan only shows one row | test-coverage | Yes |

### P4 — Low (new findings from Pass 2)

| # | Finding | Lens | Auto-fixable |
|---|---|---|---|
| L1-P2 | `datetime-local` pre-fill formula `new Date().toISOString().slice(0,16)` gives UTC, not local time — confusing for non-UTC users | type-safety | Yes |
| L2-P2 | Optional prop comment "defaults to null" imprecise (TS optional defaults to `undefined`) | doc-consistency | Yes |

---

## Lens Summary Table — Pass 2

| Lens | CRITICAL | HIGH | MEDIUM | LOW | INFO |
|---|---|---|---|---|---|
| schema-drift | 0 | 0 | 1 | 0 | 2 |
| api-surface | 0 | 1 | 2 | 1 | 4 |
| test-coverage | 0 | 2 | 2 | 0 | 1 |
| doc-consistency | 0 | 0 | 3 | 1 | 3 |
| type-safety | 0 | 1 | 2 | 1 | 0 |
| scalability | 0 | 0 | 2 | 1 | 2 |
| **TOTAL** | **0** | **4** | **12** | **4** | **12** |

**Significant improvement from Pass 1:** 8 CRITICAL → 0 CRITICAL (all CRITICALs are now properly annotated implementation work items, not documentation gaps). Pass 2 found no new CRITICAL documentation/type issues.

---

## Auto-fixable Findings (Pass 2)

| ID | Fix |
|---|---|
| H1-P2 | Fix §3.4 `products.setBranchPrice` auth: `service_management:update` → `inventory:update` |
| H2-P2 | Add note to Phase 2: "Parent's `onUpdateItem` must merge patches (spread), not replace the full item" |
| H3-P2 | Clarify test table: service functions → unit tests with mock DB; router auth → integration tests |
| H4-P2 | Clarify tenant isolation test: "verify router rejects priceId for service outside accessibleNodeIds" |
| M1-P2 | Add to Phase 3/4 dialog: "Filter `listNodes` result to `node.type === 'branch'` for branch picker" |
| M2-P2 | Add to Phase 1 step 4: products procedures use `inventory:update`/`inventory:delete` permissions |
| M3-P2 | Update §2 "After" to match filter-first UX |
| M4-P2 | Add insertion-point note to Phase 3 step 1 |
| M5-P2 | Add `organizationId` note to dialog spec |
| M6-P2 | Add `branchId = null` handling note to delete tenant check |
| M7-P2 | Add race condition note + mitigation to Phase 2 and §7 |
| M8-P2 | Split `deleteServicePrice` into two test rows (service-unit + router-integration) |
| L1-P2 | Fix datetime-local pre-fill to use local time offset |
| L2-P2 | Fix prop comment: "defaults to undefined (treated as null in component)" |

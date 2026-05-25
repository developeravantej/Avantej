# Domain 02 — Commissions, Promotions, Tax & Pricing

Audited routers: `commission-splits/`, `category-commission.ts`, `promotions.ts`, `tax-rates.ts`.
Audited services: `commission-calculator.service.ts`, `commission-math.ts`, `commission-splits.service.ts`, `category-commission.service.ts`, `promotions.service.ts`, `tax-rates.service.ts`, `tax.service.ts`, `pricing.service.ts`.

All procedures are `tenantProcedure` (require an authenticated session + resolved tenant member). "auth" column lists the RBAC permission(s) enforced inside the handler.

---

## Routers & Procedures

### commission-splits (`packages/api/src/routers/commission-splits/`)

| Procedure | Auth (permission:action) | Purpose | Backing service fn |
|-----------|--------------------------|---------|--------------------|
| `list` | commission_management:read | List splits (memberId/appointment/date filters, RBAC-scoped) | `listCommissionSplits` |
| `getByAppointment` | commission_management:read | Splits for one appointment | `getCommissionsByAppointment` |
| `getMyCommissions` | commission_management:read | Current member's splits + total | `getMyCommissions` |
| `listLedger` | commission_management:read | Enriched ledger + status totals for Commissions page | `listCommissionLedger` |
| `approve` | commission_management:approve | Bulk approve pending splits (single-staff, ≤31-day batch invariants) | `approveCommissionSplits` |
| `markPaid` | commission_management:process | Bulk mark approved→paid, optional payoutId | `markCommissionSplitsPaid` |
| `void` | commission_management:approve | Void one split (blocks paid) | `voidCommissionSplit` |
| `createManualAdjustment` | commission_payout:create | Manual bonus/clawback split | `createManualAdjustment` |
| `markPaidBatch` | commission_payout:update | Mark approved→paid for members in earnedAt range | `markPaidBatch` |
| `markPaidById` | commission_management:process | Batch ≤50 by ID + paymentReference | `markCommissionSplitsPaid` (**ref dropped**) |
| `voidById` | commission_management:approve | Void one split by ID | `voidCommissionSplit` (duplicate of `void`) |
| `liabilitySummary` | commission_management:read **OR** commission_payout:read | Aggregate liability for date range | `liabilitySummary` |
| `liabilityByStaff` | commission_management:read | Per-staff pending/approved/paid totals (GROUP BY, LIMIT 500) | `liabilityByStaff` |
| `listPendingReview` | commission_management:read | List `pending_review` manual adjustments (Review tab) | `listPendingReview` |
| `resolveReview` | commission_review:resolve | Approve (→pending) or reject (→void) a pending_review split | `resolvePendingReview` |

### category-commission (`packages/api/src/routers/category-commission.ts`)

| Procedure | Auth | Purpose | Backing service fn |
|-----------|------|---------|--------------------|
| `getByCategory` | category_commission_management:read | Read config + slots + rates/conditions for a category | `getCategoryCommissionConfig` |
| `upsert` | category_commission_management:create | Replace config (delete+insert) with slots/rates/conditions | `upsertCategoryCommissionConfig` |
| `delete` | category_commission_management:delete | Delete config for category | `deleteCategoryCommissionConfig` |

### promotions (`packages/api/src/routers/promotions.ts`)

| Procedure | Auth | Purpose | Backing service fn |
|-----------|------|---------|--------------------|
| `list` | promotion_management:read | List promotions (active/type/branch filters) | `listPromotions` |
| `validate` | promotion_management:read | Validate code → returns {promotion, discountAmount} | `validatePromoCode` |
| `apply` | promotion_management:create | Record usage + bump usageCount on an order | `applyPromotion` |
| `create` | promotion_management:create | Create promotion | `createPromotion` |
| `update` | promotion_management:update | Update (name/desc/isActive/validFrom/validUntil only via router) | `updatePromotion` |
| `deactivate` | promotion_management:delete | Soft-deactivate (isActive=false) | `deactivatePromotion` |

### tax-rates (`packages/api/src/routers/tax-rates.ts`)

| Procedure | Auth | Purpose | Backing service fn |
|-----------|------|---------|--------------------|
| `list` | tax_configuration:read (skipped for role=client) | List tax rates | `listTaxRates` |
| `getById` | tax_configuration:read (skipped for role=client) | Get one rate | `getTaxRateById` |
| `getDefault` | tax_configuration:read (skipped for role=client) | Get default active rate | `getDefaultTaxRate` |
| `create` | tax_configuration:create | Create rate (clears prior default if isDefault) | `createTaxRate` |
| `update` | tax_configuration:update | Update rate (**cannot toggle isDefault/isActive**) | `updateTaxRate` |
| `setDefault` | tax_configuration:update | Set default (audited) | `setDefaultTaxRate` |
| `deactivate` | tax_configuration:delete | Soft-deactivate | `deactivateTaxRate` |

> Note: there is **no `pricing` router in this domain's owned set.** `pricing.service.ts` is consumed by `packages/api/src/routers/services/pricing.procedures.ts` and `products.ts` (out of scope for this audit) plus `pos.service.ts`. Its exported fns are inventoried below but their procedure wiring lives in the Services/Products domain.

---

## Service Functions

### commission-calculator.service.ts
- `calculateCommissionForAppointment` — appointment-delivery split engine (trainer-role-gated, condition by attendeeCount). Wired via `appointment.service.ts` → `runAppointmentCommission`.
- `calculateCommissionForPos` — POS product-line split engine (no trainer-role gate). Wired via `pos.service.ts`.
- `_buildSplits` (private) — shared weightage/redistribution/cap/insert loop.

### commission-math.ts (pure, no DB — unit-test surface)
- `assertConfigSumIs10000` — throws unless slots sum to 10000 bp.
- `dedupeBySlotIndex` — collapse duplicate slot assignments.
- `computeEffectiveWeightages` — redistribute absent-slot weightage across present coaches.
- `computeFinalAmountCents` — multiply-then-floor amount per coach.
All consumed by `_buildSplits`. Not directly behind a procedure (correct — internal helpers).

### commission-splits.service.ts
- `listCommissionSplits` — backs `list`.
- `getCommissionsByAppointment` — backs `getByAppointment`.
- `getMyCommissions` — backs `getMyCommissions`.
- `applyCommissionCaps` — per-cycle cap + discount-threshold opt-out. Consumed by `createCommissionSplit` and `_buildSplits`. **No procedure (internal — OK).**
- `resolveCategoryIdForSplit`, `computeOrderDiscountBps`, `getCycleBoundsForDate` (private helpers).
- `createCommissionSplit` — single-split insert w/ idempotency + comp/excluded guard. **ORPHAN at the router boundary** — only called internally (not by any procedure). Note hot POS path bypasses it (see Gaps P3).
- `approveCommissionSplits` — backs `approve`.
- `markCommissionSplitsPaid` — backs `markPaid` AND `markPaidById`.
- `voidCommissionSplit` — backs `void` AND `voidById`.
- `voidCommissionSplitsForSalesOrder` — cancel-sale cascade void (skips delivered appts). **ORPHAN at router** — called by cancelled-sales flow only.
- `createManualAdjustment` — backs `createManualAdjustment` (writes `pending_review` if ≥ RM500).
- `liabilitySummary` — backs `liabilitySummary`.
- `markPaidBatch` — backs `markPaidBatch`.
- `liabilityByStaff` — backs `liabilityByStaff`.
- `listCommissionLedger` — backs `listLedger`.
- `getLatestConfigVersionForCategory` — resolve latest config version id. **ORPHAN at router** — called by `appointment.service.ts`.
- `getOrCreatePayoutBatch` — idempotent payout-batch resolver. **ORPHAN** — no caller found in owned scope (see Gaps P2).
- `attachPayoutsToBatch` — wire payouts→batch. **ORPHAN** — no caller found in owned scope (see Gaps P2).
- `reverseForRefund` — refund→commission reversal chain. **ORPHAN at router** — called by refunds.service (out of scope); no commission-domain procedure exposes it.
- `listPendingReview` — backs `listPendingReview`.
- `resolvePendingReview` — backs `resolveReview`.

### category-commission.service.ts
- `getCategoryCommissionConfig` — backs `getByCategory`.
- `upsertCategoryCommissionConfig` — backs `upsert` (validates slot-sum=10000, condition non-overlap).
- `deleteCategoryCommissionConfig` — backs `delete`.
- `toHalfOpen`, `intervalsOverlap` (private validation helpers).

### promotions.service.ts
- `listPromotions` — backs `list`.
- `validatePromoCode` — backs `validate`.
- `applyPromotion` — backs `apply`.
- `createPromotion` — backs `create`.
- `updatePromotion` — backs `update`.
- `deactivatePromotion` — backs `deactivate`.

### tax-rates.service.ts
- `listTaxRates`, `getTaxRateById`, `getDefaultTaxRate`, `createTaxRate`, `updateTaxRate`, `setDefaultTaxRate`, `deactivateTaxRate` — all backed 1:1 by tax-rates router.

### tax.service.ts
- `resolveTaxRate` — point-in-time org-wide rate resolver (branchId param accepted but unused). **ORPHAN at router** — consumed by `pos.service.ts`. No procedure exposes it (intentional — it's an internal resolver).

### pricing.service.ts
- `resolveServicePrice`, `resolveProductPrice` — most-specific price chain. Consumed by `pos.service.ts` / services-pricing procedures (out of scope).
- `listServicePriceOverrides`, `listProductPriceOverrides` — consumed by services/products routers (out of scope).
- `setServicePrice`, `setProductPrice`, `expireServicePrice`, `expireProductPrice`, `deleteServicePrice`, `deleteProductPrice` — CRUD on overrides; consumed by services/products routers (out of scope). All ORPHAN within *this* domain but wired elsewhere.
- `pickMostSpecific` (private).

---

## Gaps (prioritized)

### P1 — Definitely broken / silent data loss

**P1.1 — `markPaidById` silently drops `paymentReference`.**
`lifecycle.procedures.ts:200-232`. The procedure accepts a required `paymentReference` (min 1, max 255) and its own docstring (§1.10) says it should persist it. The handler instead calls `markCommissionSplitsPaid(..., { payoutId: undefined, ... })` (line 218-219) with a comment admitting "no dedicated column yet." The reference is never written anywhere — not to `payoutId`, not to `notes`, not to audit `changes`. Finance reconciliation reference is lost on every call. Either a column/notes write is missing or the input field is dead.

**P1.2 — Promotion product/service applicability is never enforced.**
`promotions.service.ts:71-159` (`validatePromoCode`). The router passes `productIds`/`serviceIds` (`promotions.ts:74-75`) and the param type declares them (`promotions.service.ts:77-78`), and promotions store `applicableProductIds`/`applicableServiceIds` (set at create, `promotions.service.ts:213-214`). But `validatePromoCode` never reads those columns or the incoming `productIds`/`serviceIds` — a code scoped to specific products/services validates against ANY order. Scope restriction is dead config.

**P1.3 — `free_item` / `buy_x_get_y` promo types compute a nonsense discount.**
`promotions.service.ts:151-155`. The else branch (`discountAmount = promotion.value`) treats `free_item` and `buy_x_get_y` as a flat cents discount equal to `value`. There is no free-item resolution, no "buy X" qualifying-quantity check, and no "get Y" item selection. These two of the four enum types (`promotions.ts:120-125`) have no real implementation — they silently behave like a fixed_amount discount of `value` cents.

### P2 — Missing lifecycle / dead-end paths

**P2.1 — Payout-batch wiring has no caller in scope (likely dead).**
`getOrCreatePayoutBatch` (`commission-splits.service.ts:1647`) and `attachPayoutsToBatch` (`:1694`) are exported but no audited procedure, and no grep hit in `packages/services` outside their own file, calls them. `markCommissionSplitsPaid`/`markPaidBatch` set `status='paid'` and `payoutId`/`paidBy` directly without ever creating or attaching a `payout_batches` row. The batch grouping these functions implement appears unreachable from the live mark-paid paths — verify whether a payout-batch UI/flow was ever wired or this is orphaned scaffolding.

**P2.2 — `void` and `voidById` are exact duplicates.**
`lifecycle.procedures.ts:84-117` (`void`) and `:239-271` (`voidById`) have identical inputs (`{id, reason}`), identical permission (`commission_management:approve`), and both call `voidCommissionSplit` with the same args. Two procedure names for one operation — redundant surface; pick one. (Possibly intentional naming-convention migration, but it is live duplication.)

**P2.3 — No clawback/reversal procedure in the commission domain.**
`reverseForRefund` (`commission-splits.service.ts:1745`) implements full refund→reversal logic but is only invoked by the refunds flow (out of scope). There is no commission-domain procedure to inspect, list, or manually trigger reversals, and `commission_split_reversals` rows are never surfaced by `listCommissionLedger` (which reads only `commission_splits`). The reversal ledger is invisible to the commissions UI. Possibly intentional (refund-driven only) but flag: a voided/clawed-back amount won't appear in the ledger totals.

**P2.4 — Paid splits are a hard lifecycle dead-end with no correction path.**
`voidCommissionSplit` (`commission-splits.service.ts:800-802`) throws `BAD_REQUEST` "Cannot void a paid commission split. Contact finance." There is no un-pay, reverse-payment, or adjust-paid procedure. Once paid, the only correction is a separate manual adjustment (negative clawback) which is a *different* row and not linked to the original. Acceptable for audit integrity but there is no first-class correction transition.

### P3 — Consistency / correctness risks (possibly intentional)

**P3.1 — Deferred-commission consumer EXISTS and fires, but the sweep's stuck-detection can false-positive.**
Verified: POS sets `commissionDeferred=true` on service lines (`pos.service.ts:416-431`) and skips POS-time commission for them (`:740-781`). Delivery-side consumer is real: `appointment.service.ts` → `runAppointmentCommission` (`:767-885`) calls `calculateCommissionForAppointment` on completion/cancellation/no_show. **Not a dead deferral.** BUT the delivery split is keyed to `appointmentId`, while `sweep-deferred-commissions.ts:257-261` flags an order as stuck when "NO commission_splits row points at the `sales_order_id`." A POS service line whose appointment HAS been delivered (split exists, but keyed by appointmentId, not salesOrderId) will still be reported as stuck — false positives in the operational sweep. Also: the deferred line's POS price never drives the split; commission uses `appointment.priceSnapshotCents ?? pricePerClient` (`appointment.service.ts:878`), so a POS-sold service priced differently from the appointment snapshot earns on the appointment price, not the sale price.

**P3.2 — `validate` (preview) and `apply` (commit) duplicate discount math inconsistently.**
`validatePromoCode` (`promotions.service.ts:138-155`) computes `discountAmount` server-side with cap logic. `applyPromotion` (`:161-188`) takes `discountAmount` as a **client-supplied input** (`promotions.ts:95`) and writes it verbatim into `promotion_usages` + bumps `usageCount` — it re-validates nothing (no expiry, no usage-limit, no min-order, no recompute). A client can call `apply` with an arbitrary `discountAmount` and an expired/exhausted promo. The two-step validate→apply has a TOCTOU gap and no server-side re-check at commit.

**P3.3 — `applyPromotion` does not re-enforce usage limits at commit (race).**
`promotions.service.ts:161-188`. `usageCount` is incremented unconditionally inside the tx with no `WHERE usageCount < usageLimit` guard and no row lock on the promotion. Two concurrent `apply` calls both pass an earlier `validate` and both increment — global `usageLimit` and `perCustomerLimit` can be exceeded under concurrency. The limit checks live only in `validate` (`:109-131`), which is not transactionally tied to `apply`.

**P3.4 — `createCommissionSplit` guard is bypassed by the hot POS/appointment path.**
`commission-splits.service.ts:494-524` documents that comp-order / commission-excluded skip logic is duplicated in `_buildSplits` because the calculator inserts directly (`commission-calculator.service.ts:578-597`) rather than through `createCommissionSplit`. The guard IS mirrored (`_buildSplits` lines 422-444 + cap at 559-570), so it's not currently broken, but it is duplicated logic in two places that must be kept in sync — a maintenance hazard. `createCommissionSplit` itself is effectively orphaned from the automatic flow.

**P3.5 — Tax resolution is single-tier with no branch fallback chain.**
`tax.service.ts:41-66` (`resolveTaxRate`) accepts `_branchId` but ignores it (documented forward-compat). Fallback is only: active + effective-window + prefer default + most-recent. There is **no historical snapshotting fallback** — if no active rate matches `at`, it returns `null` and the caller must handle "no tax configured." Historical correctness relies entirely on `effective_from`/`effective_until` windows being maintained; `updateTaxRate` (`tax-rates.service.ts:91-123`) mutates `rateInBasisPoints` **in place** rather than closing the old window and inserting a new row, so editing a rate retroactively changes the rate applied to already-snapshotted historical orders that re-resolve. Snapshotting completeness depends on callers persisting the resolved id at order time (J2 design) — not enforced here.

**P3.6 — `updateTaxRate` cannot change `isDefault` or `isActive`; `deactivate` clears default silently.**
`tax-rates.service.ts:91-123` whitelists fields and omits `isDefault`/`isActive` (router also omits them, `tax-rates.ts:123-136`). Toggling default requires the separate `setDefault`; reactivating a deactivated rate is impossible via any procedure (no `reactivate`). `deactivateTaxRate` (`:167-193`) silently clears `isDefault` when deactivating the default rate, leaving the org with **no default tax rate** and no warning — subsequent `getDefault`/`resolveTaxRate` may return null. Per MEMORY this is "intentional" but it is a silent footgun.

**P3.7 — `liabilitySummary` OR-permission check swallows real errors.**
`analytics.procedures.ts:36-55`. The two `requirePermissionOrpc` calls are wrapped in bare `try/catch {}`. A genuine DB error inside the permission check (not just a permission denial) is swallowed and treated as "permission failed," then surfaced as a generic FORBIDDEN. Masks infra errors as authz failures.

### P4 — Doc / surface discrepancies

**P4.1 — `zhub/shared/api-overview.md` commission-splits table is stale.**
`api-overview.md:128-139` lists only 9 procedures. The router actually exposes **15** (`commission-splits/index.ts`). Missing from docs: `listLedger`, `markPaidById`, `voidById`, `liabilityByStaff`, `listPendingReview`, `resolveReview`. Run `/hub-update`.

**P4.2 — api-overview labels all as "protected" — understates RBAC.**
Every commission/promo/tax procedure enforces a *specific* permission:action inside the handler (e.g. `commission_review:resolve`, `commission_payout:update`); the doc's flat "protected" hides this. Minor, but the per-procedure permission matrix is undocumented.

**P4.3 — `category-commission` config edit is destructive (delete+reinsert).**
`category-commission.service.ts:153-156` deletes the entire config row (cascading slots/rates/conditions) then reinserts on every `upsert`. The config-version trigger (`migrations/tenant/0034`) snapshots each insert by `category_id` and `commission_splits.config_version_id` is `ON DELETE RESTRICT`, so historical splits keep their frozen snapshot — this is sound. But the `id` of the live config row changes on every save, which can invalidate any in-flight reference to `categoryCommissionConfigs.id` (the version table's `config_id` becomes a dangling pointer to a deleted row). Verify no FK from versions→config is RESTRICT, or saves on a category with prior versions will fail.

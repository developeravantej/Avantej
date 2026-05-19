# Audit Batch 4 — Payment / Promotions / Packages / Inventory

**Date:** 2026-05-07

---

## E2E Test Results

All tests run under project `dashboard-e2e` via `batch4.dashboard.spec.ts`.

| Suite | Test | Status | Error |
|-------|------|--------|-------|
| Payment View (`/dashboard/payment/view`) | TC-01: page loads with Payments heading | PASSED | — |
| Payment View (`/dashboard/payment/view`) | TC-02: page does not crash | PASSED | — |
| Payment View (`/dashboard/payment/view`) | TC-03: table container is rendered | PASSED | — |
| Payment View (`/dashboard/payment/view`) | TC-06: description text is present | PASSED | — |
| Promotions View — redirect | TC-01: redirects to `/dashboard/service/view?tab=promotions` and renders content | PASSED | — |
| Package Instances View — redirect | TC-01: redirects to `/dashboard/packages/view?tab=session-packs` and renders content | PASSED | — |
| Package Installments View — redirect | TC-01: redirects to `/dashboard/packages/view?tab=installments` and renders content | PASSED | — |
| Brands View — redirect | TC-01: redirects to `/dashboard/inventory-options?tab=brands` and renders content | PASSED | — |
| Categories View — redirect | TC-01: redirects to `/dashboard/inventory-options?tab=categories` and renders content | PASSED | — |
| Suppliers View — redirect | TC-01: redirects to `/dashboard/inventory-options?tab=suppliers` and renders content | PASSED | — |
| Transfer Orders View — redirect | TC-01: redirects to `/dashboard/stock-requests/view?tab=transfers` and renders content | PASSED | — |

**Summary: 11/11 passed, 0 failed, 0 skipped.**

> Note: Promotions, Package Instances/Installments, Brands, Categories, Suppliers, and Transfer Orders are redirect-only suites — each verifies the legacy URL redirects to the consolidated tab destination and that content renders. No deep page-level specs exist for those suites yet.

---

## DB Integrity vs Relationship Docs

Raw audit output from `apps/server/scripts/audit-db-batch4.ts` (tenant org `996febce-aaad-4ded-8f47-02d2b566c8ee`).

| Plan Item | Relationship Doc Ref | Plan Says | Actual (DB) | Verdict |
|-----------|---------------------|-----------|-------------|---------|
| `promotion_usages.sales_order_id` column type | Sales #4 | Should be `uuid` — text→uuid migration required | `text` | **FAIL** — still `text`; migration not applied |
| `promotion_usages` row count | Sales #4 | Rows should accumulate as promotions are applied to orders | 0 rows (1 promotion exists) | WARN — table empty; no usage data captured |
| `payment_items.promotion_id` real FK constraint | Sales #3 | Real FK to `promotions.id` (not just a uuid text column) | FK constraint present (`pg_constraint` count = 1), column type = `uuid` | **PASS** — FK applied |
| `payment_items.promotion_id` usage | Sales #3 | Rows with `promotion_id` set when promotions are applied | 0 rows with `promotion_id IS NOT NULL` | WARN — FK exists but no promotion-linked payment items in test data |
| `announcement_scopes` junction table | Engagement #3 | Junction `announcement_scopes(announcement_id, hierarchy_node_id)` | Table exists, 0 rows (2 announcements exist) | WARN — table exists but unused; announcements not linked via junction |
| `package_instances` row count | Cross X5 | Package instances should exist | 8 rows | INFO |
| `package_instance_status_history` | Cross X5 | Rows for each package state change | Table exists, 0 rows | **FAIL** — 8 package instances, zero history rows; status changes not recorded |
| `installment_plans` | Packages | Plans should exist | 3 rows, table exists | PASS |
| `installments` | Packages | Individual installment records | 2 rows, table exists | PASS |
| `installment_events` | Packages | Events (payment captured, overdue, waived, etc.) | Table exists, 0 rows | WARN — lifecycle event tracking not operational |
| `service_prices` / `product_prices` (branch-scoped pricing) | Services #6 / Agent 2.2 | Branch-level price overrides; backfill from `services.price` | 0 rows each | **FAIL** — tables empty; no backfill performed |
| `goods_receipts` + `goods_receipt_items` (3-way match) | Inventory #3 | Tables exist and rows recorded when POs are received | Both tables exist, 0 rows each | WARN — tables exist; no PO data so no receipts expected, but workflow unused |
| `purchase_orders` row count | Inventory #3 | Should have rows if any procurement activity | 0 rows | WARN — no PO data; entire procurement workflow unexercised in dev |
| `supplier_invoices` | Inventory #3 / Inventory #4 | Table for AP matching against POs | Table exists, 0 rows | WARN — table exists, no data |
| `transfer_order_items.received_qty` / `damaged_qty` | Inventory #5 | Columns added to record destination receipt confirmation | Neither column found | **FAIL** — columns missing; plan not applied |
| `stock_request_items.approved_qty` / `fulfilled_qty` | Inventory #6 | Columns added for per-line approved/fulfilled tracking | Neither column found | **FAIL** — columns missing; plan not applied |

---

## Issues Found

### FAIL — 4 schema/application gaps not resolved

| # | Item | Doc Ref | Detail |
|---|------|---------|--------|
| F1 | `promotion_usages.sales_order_id` still `text` | Sales #4 | Column type is `text`; plan called for uuid migration (new col + backfill + swap). Not run. Dangling refs on order delete remain possible; JOINs require explicit cast. Currently 0 rows so backfill cost is trivial — fix before data accumulates. |
| F2 | `package_instance_status_history` always empty | Cross X5 | Table was created but no application code writes to it. 8 package instances have no history rows. Status changes (activated → expired / cancelled) are mutated in place with no audit trail, blocking dispute resolution and per-redemption commission attribution. |
| F3 | `transfer_order_items.received_qty` / `damaged_qty` missing | Inventory #5 | Neither column exists. Destination branch cannot record short-shipment or damaged goods at receipt. Simple `ALTER TABLE ADD COLUMN` — plan item not applied. |
| F4 | `stock_request_items.approved_qty` / `fulfilled_qty` missing | Inventory #6 | Neither column exists. Approved-vs-requested-vs-fulfilled per line cannot be tracked. Simple `ALTER TABLE ADD COLUMN` — plan item not applied. |

### WARN — 6 items structurally present but operationally empty or deferred

| # | Item | Doc Ref | Detail |
|---|------|---------|--------|
| W1 | `announcement_scopes` table exists but 0 rows | Engagement #3 | Junction table created but the application does not populate it. The 2 existing announcements are not linked via scopes. Per the red-team filter in the relationship doc, this item was deferred — `branchId` nullable already covers org-wide scope; region-level fanout is a future requirement. Low urgency. |
| W2 | `promotion_usages` — 0 rows despite 1 promotion existing | Sales #4 | No usage tracking even for the seeded promotion. Either no orders applied a promo code in dev, or the write path is not wired in the application. |
| W3 | `installment_events` — 0 rows | Packages | Events table exists but no events written. Overdue / payment-captured / waived lifecycle is not being tracked. |
| W4 | `service_prices` / `product_prices` — 0 rows | Services #6 / Agent 2.2 | Tables created for branch-scoped pricing but no backfill from flat `services.price`. All branches fall back to the single `services.price` column. Multi-branch pricing not functional in practice. |
| W5 | `purchase_orders` — 0 rows | Inventory #3 | No procurement data in dev tenant. Goods-receipt and 3-way-match workflow exists in schema but is entirely unexercised. Not necessarily a bug — may simply require seeded data. |
| W6 | `payment_items.promotion_id` — 0 rows populated | Sales #3 | FK and `uuid` column confirmed present. However no payment items carry a `promotion_id` — either promotion discounts are not being written through the payment-items code path, or test data does not exercise it. |

### PASS — 1 item verified complete

| # | Item | Doc Ref | Detail |
|---|------|---------|--------|
| P1 | `payment_items.promotion_id` real FK | Sales #3 | FK constraint confirmed in `pg_constraint` (count = 1); column type is `uuid`. This was the primary deliverable for Sales #3. |

---

## Priority Recommendations

1. **F3 + F4 (Inventory #5 / #6)** — Simple `ALTER TABLE ADD COLUMN` migrations with no data risk. Unblock transfer-order receipt confirmation and stock-request fulfilment tracking immediately.
2. **F2 (Cross X5)** — Wire the `package_instance_status_history` write path wherever package instance status is mutated (service layer). Schema and table exist; this is a pure application gap.
3. **F1 (Sales #4)** — `promotion_usages.sales_order_id` text→uuid: standard new-col + backfill + swap migration. 0 rows now so backfill is a no-op; do it before usage data accumulates.
4. **W4 (Services #6)** — Seed `service_prices` from `services.price` at the default branch to make branch-scoped pricing functional for existing data.
5. **W1 (Engagement #3)** — Defer per red-team filter; revisit when region-level announcement scoping is required.

# Audit Batch 3 — Branch / Sales / Refunds / Commissions / Payouts

**Date:** 2026-05-07
**DB audited:** Tenant org `996febce-aaad-4ded-8f47-02d2b566c8ee` (Test Fitness Franchise)
**E2E results source:** `ztest/pw-results.json` (run 2026-05-06T15:51)

---

## E2E Test Results

### Branch View (/dashboard/branch/view)

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with branch heading and table | FAIL | strict mode violation — locator `getByRole('heading', { name: /branch/i }).or(getByText(/branch/i).first())` matched 2 elements (sidebar nav `<span>Branches</span>` AND page `<h1>Branches</h1>`). Fix: use `.getByRole('heading')` alone without `.or(getByText)`. |
| TC-02: no crash UI | PASS | — |
| TC-03: branch table shows rows or empty state | PASS | — |
| TC-07: Plus / Add Branch button visible for admin | PASS | — |

**Summary:** 3 pass, 1 fail. Failure is a test selector issue (overly broad locator), not a feature regression.

---

### Sales View (/dashboard/sales/view)

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with tabs and table | PASS | — |
| TC-02: no crash UI | PASS | — |
| TC-11: New Sale button navigates to create page | PASS | — |
| TC-13: Payments tab is clickable | PASS | — |

**Summary:** 4 pass, 0 fail.

---

### Sales Create (/dashboard/sales/create)

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads and POS workflow renders | PASS | — |
| TC-02: no crash UI on navigate | PASS | — |

**Summary:** 2 pass, 0 fail.

---

### Sales Detail (/dashboard/sales/$id)

| Test | Status | Error |
|------|--------|-------|
| TC-01: navigate to first order and page loads | FAIL | `TimeoutError: page.waitForURL("**/sales/**", timeout 15000ms)` — clicking the first row does not navigate to a detail URL. Row click is not wired to navigate (missing `onClick` → router.push, or table rows not linked). |
| TC-02: no crash UI on detail page | FAIL | Same root cause — navigation timeout at line 199. |
| TC-03: invalid order ID shows error state | FAIL | `element(s) not found` for `/not found\|error\|back/i` — page at `/dashboard/sales/invalid-uuid` renders nothing (no error state, no back link). |
| TC-11: back link navigates to sales view | FAIL | Same navigation timeout (line 230) — cannot reach detail page to test back link. |

**Summary:** 0 pass, 4 fail. Root issue: sales order table rows do not navigate to `/dashboard/sales/$id` on click, AND the detail page has no not-found/error state for invalid IDs.

---

### Refunds View (/dashboard/refunds/view)

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with Refunds heading and status tabs | FAIL | strict mode violation — same pattern as Branch View. `getByRole('heading', { name: /refund/i }).or(getByText(/refund/i).first())` matched both sidebar `<span>Refunds</span>` and page `<h1>Refunds</h1>`. |
| TC-02: no crash UI | PASS | — |
| TC-04: Pending tab is clickable | FAIL | `element(s) not found` for `getByRole('tab', { name: /pending/i })` — Refunds page does not have a "Pending" tab (tabs are likely "All / Approved / Rejected" or similar, not "Pending"). |

**Summary:** 1 pass, 2 fail. TC-01 is a test selector issue; TC-04 reveals missing "Pending" tab on Refunds page.

---

### Cancelled Sales View (/dashboard/cancelled-sales/view)

| Test | Status | Error |
|------|--------|-------|
| TC-01: route redirects to sales view | PASS | — |
| TC-02: no component rendered at original route | PASS | — |

**Summary:** 2 pass, 0 fail.

---

### Commissions View (/dashboard/commissions/view)

| Test | Status | Error |
|------|--------|-------|
| TC-01/TC-02: page loads with Commissions heading and at least Mine tab | FAIL | strict mode violation — `getByRole('heading', { name: /commission/i }).or(getByText(/commission/i).first())` matched sidebar `<span>Commissions</span>` AND page `<h1>Commissions</h1>`. Same test pattern bug as Branch/Refunds/Payouts. |
| TC-02: no crash UI | PASS | — |
| TC-04: All Commissions tab visible for admin and clickable | SKIP | "All Commissions tab not visible for this user" — test user (franchisee@gmail.com) does not have admin-level commission visibility. Expected for non-admin account. |

**Summary:** 1 pass, 1 fail, 1 skip. Failure is test selector issue; skip is expected (non-admin user).

---

### My Commissions (/dashboard/commissions/my)

| Test | Status | Error |
|------|--------|-------|
| TC-01: route redirects to commissions view with tab=mine | PASS | — |
| TC-02: no component rendered at original /my route | PASS | — |

**Summary:** 2 pass, 0 fail.

---

### Payouts View (/dashboard/payouts/view)

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with Payouts heading and status tabs | FAIL | strict mode violation — `getByRole('heading', { name: /payout/i }).or(getByText(/payout/i).first())` matched sidebar `<span>Payouts</span>` AND page `<h1>Payouts</h1>`. Same test pattern bug. |
| TC-02: no crash UI | PASS | — |
| TC-04: Pending tab filter is clickable | FAIL | `element(s) not found` for `getByRole('tab', { name: /pending/i })` — Payouts page does not have a "Pending" tab. |
| TC-05: Paid tab filter is clickable | SKIP | "Paid tab not found" — no "Paid" tab on Payouts page either. |

**Summary:** 1 pass, 2 fail, 1 skip. TC-01 is test selector issue; TC-04/TC-05 reveal Payouts page missing Pending/Paid filter tabs.

---

### Overall E2E Totals (Batch 3)

| Suite | Pass | Fail | Skip |
|-------|------|------|------|
| Branch View | 3 | 1 | 0 |
| Sales View | 4 | 0 | 0 |
| Sales Create | 2 | 0 | 0 |
| Sales Detail | 0 | 4 | 0 |
| Refunds View | 1 | 2 | 0 |
| Cancelled Sales | 2 | 0 | 0 |
| Commissions View | 1 | 1 | 1 |
| My Commissions | 2 | 0 | 0 |
| Payouts View | 1 | 2 | 1 |
| **TOTAL** | **16** | **10** | **2** |

---

## DB Integrity vs Relationship Docs

Raw DB snapshot:

```json
{
  "sales_orders_count": "8",
  "soi_total": "8",
  "soi_tax_rate_id_col_exists": true,
  "soi_tax_rate_id_set": "0",
  "payment_items_total": "10",
  "payment_items_tax_rate_col_exists": true,
  "payment_items_tax_rate_set": "0",
  "sales_order_status_history_table_exists": true,
  "sales_order_status_history": "0",
  "payment_status_history_table_exists": true,
  "payment_status_history": "0",
  "refunds_count": "1",
  "refund_items_table_exists": true,
  "refund_items_count": "0",
  "commission_splits_count": "0",
  "commission_split_reversals_table_exists": true,
  "commission_split_reversals": "0",
  "commission_cap_cols_on_splits": [],
  "cap_cols_on_config": [],
  "payout_batches_table_exists": true,
  "payout_batches": "0",
  "payouts_count": "0",
  "payouts_batch_id_col_exists": true,
  "payouts_with_batch_id": "0",
  "config_versions_table_exists": true,
  "config_versions": "0",
  "comp_cols_on_sales_orders": ["complimentary_reason"],
  "promotion_usages_so_id_type": "text"
}
```

| Plan Item | Relationship Doc Ref | Plan Says | Actual (DB) | Verdict |
|-----------|---------------------|-----------|-------------|---------|
| Sales #1: `sales_order_items.tax_rate_id` | Sales & Payments #1 (High) | Column should exist; new orders should populate it | Column EXISTS. 8 items, 0 have `tax_rate_id` set | PARTIAL — column migrated in, but write path does not populate it. Orders created after migration do not capture tax rate. |
| Sales #2: `payment_items.tax_rate_id` | Sales & Payments #2 (High) | Column should exist; `itemType="tax"` rows should reference rate | Column EXISTS. 10 items, 0 have `tax_rate_id` set | PARTIAL — same as above. Column present but not written by service layer. |
| Sales #4: `promotion_usages.sales_order_id` type | Sales & Payments #4 (High) | Should be `uuid` FK, not `text` | `data_type = text` | FAIL — still text. Migration to uuid not applied. Dangling refs on order delete remain possible. |
| Sales #9 / X5: `sales_order_status_history` table | Cross-domain X5 (should-have) | Per-entity status history table should exist | Table EXISTS, 0 rows | PARTIAL — table created, but status transitions are not logged. Service layer does not insert history on status change. |
| Sales #9 / X5: `payment_status_history` table | Cross-domain X5 (should-have) | Per-entity status history table should exist | Table EXISTS, 0 rows | PARTIAL — table created, but payment status changes are not logged. |
| Sales #10: `refund_items` | Sales & Payments #10 (Medium/operator High) | Table should exist; partial refunds should have line items | Table EXISTS. 1 refund, 0 refund_items | FAIL — table created but not populated. Refunds are header-only; no granular refund line items recorded. |
| Commission #2: `payout_batches` parent table | Commission & Payouts #2 (High) | New `payout_batches` table should exist for period grouping | Table EXISTS, 0 rows | PASS (structure) — table exists. No rows yet (no payouts run). |
| Commission #2: `payouts.batch_id` FK | Commission & Payouts #2 (High) | `payouts.batch_id` column should exist | Column EXISTS. 0 payouts total. | PASS (structure) — column present. Cannot verify FK path without payout data. |
| Commission #3: `category_commission_config_versions` | Commission & Payouts #3 (High) | Version history table for commission configs | Table EXISTS, 0 rows | PASS (structure) — table exists. No config saves recorded yet. |
| Agent 3.4: cap/floor cols on `commission_splits` | Commission & Payouts #3 / Operator O8 | `cap_applied`, `floor_applied`, `excluded`, `is_complimentary` cols on splits | 0 of 4 columns present | FAIL — none of the 4 cap/floor/exclusion columns exist on `commission_splits`. |
| Agent 3.4: cap/floor cols on `category_commission_configs` | Commission & Payouts #3 / Operator O8 | `cap_amount`, `floor_amount`, `excluded_order_types`, `max_per_cycle` cols | 0 of 4 columns present | FAIL — none of the 4 config cap/floor columns exist on `category_commission_configs`. |
| Agent 3.3: complimentary cols on `sales_orders` | Operator O3 | `is_complimentary`, `complimentary_reason`, `complimentary_approved_by` | Only `complimentary_reason` present (1 of 3) | PARTIAL — `is_complimentary` (boolean flag) and `complimentary_approved_by` (actor) are missing. Comp tracking incomplete. |
| Cross X4: `commission_split_reversals` table | Cross-domain X4 (critical) | Table for refund→commission reversal chain | Table EXISTS, 0 rows | PASS (structure) — table exists. 0 rows expected (no refunds have been processed through commission reversal flow). |

---

## Issues Found

### E2E Issues

**E1 — FEATURE: Sales order table rows do not navigate on click (Sales Detail — 4 tests)**
All 4 Sales Detail tests fail because clicking a row in the sales table does not trigger navigation to `/dashboard/sales/$id`. The test expects `page.waitForURL("**/sales/**")` after row click but the URL never changes. Either row click handler is missing, or the detail route does not exist/match. This is a functional gap, not a test issue.

**E2 — FEATURE: Sales detail page has no not-found / error state (Sales Detail TC-03)**
Navigating to `/dashboard/sales/invalid-uuid` renders a blank page with no error message, no "Not found" state, and no back link. The test looks for `/not found|error|back/i` and finds nothing.

**E3 — FEATURE: Refunds page missing "Pending" tab (Refunds TC-04)**
The Refunds view does not have a tab named "Pending". Test expects `getByRole('tab', { name: /pending/i })`. The page either has different tab names (e.g. "Awaiting") or no pending-state tab at all.

**E4 — FEATURE: Payouts page missing "Pending" and "Paid" tabs (Payouts TC-04, TC-05)**
The Payouts view does not have "Pending" or "Paid" filter tabs. Both tests find no matching tab element.

**E5 — TEST DEFECT: Strict mode violation on heading locators (Branch TC-01, Refunds TC-01, Commissions TC-01, Payouts TC-01)**
Four tests use `.getByRole('heading', {...}).or(getByText(...).first())` to find page headings. This matches both the sidebar nav `<span>` (inside an `<a>`) and the page `<h1>`, causing a strict mode violation. Fix is to scope to `.getByRole('heading')` only (without the `.or` fallback), since the `<h1>` heading is always present.

### DB Integrity Issues

**D1 — WRITE PATH MISSING: `sales_order_items.tax_rate_id` not populated (Sales #1)**
Column exists (migration applied) but 0 of 8 items have it set. The sales order creation service does not write `taxRateId` when creating order items. LHDN compliance gap — historical orders cannot reproduce tax calculation if rates change.

**D2 — WRITE PATH MISSING: `payment_items.tax_rate_id` not populated (Sales #2)**
Column exists but 0 of 10 payment items have it set. Same root cause as D1 — service layer omits the field.

**D3 — MIGRATION NOT APPLIED: `promotion_usages.sales_order_id` still `text` (Sales #4)**
Relationship doc calls this High severity. Column remains `text` instead of `uuid`. Dangling references on order delete are possible; JOIN performance is suboptimal.

**D4 — WRITE PATH MISSING: `sales_order_status_history` table empty (X5)**
Table exists but 0 rows. Status transitions (pending→confirmed→completed/cancelled) are not recorded. Dispute resolution and commission recomputation against historical state are blocked.

**D5 — WRITE PATH MISSING: `payment_status_history` table empty (X5)**
Same as D4 for payments. 0 rows despite 10 payment_items existing.

**D6 — WRITE PATH MISSING: `refund_items` table empty despite 1 refund existing (Sales #10)**
Table exists but 0 rows. The one refund in the DB is header-only. Partial-package refunds (operator's weekly request: "used 3 of 10, refund 7") cannot be recorded. Operator-rated High.

**D7 — COLUMNS MISSING: `commission_splits` cap/floor/exclusion columns absent (Commission #3)**
None of `cap_applied`, `floor_applied`, `excluded`, `is_complimentary` exist on `commission_splits`. Finance cannot verify commission cap enforcement at payout time. Operator-rated weekly fire (O8).

**D8 — COLUMNS MISSING: `category_commission_configs` cap/floor columns absent (Commission #3)**
None of `cap_amount`, `floor_amount`, `excluded_order_types`, `max_per_cycle` exist on `category_commission_configs`. Cap/floor rules cannot be configured at all.

**D9 — COLUMN MISSING: `sales_orders.is_complimentary` and `complimentary_approved_by` absent (Operator O3)**
Only `complimentary_reason` (text) was added. The boolean flag `is_complimentary` and the actor column `complimentary_approved_by` are missing. Comp tracking is incomplete — cannot filter/query complimentary orders without the boolean, and approver audit is lost.

---

## Summary by Severity

| # | Issue | Type | Severity |
|---|-------|------|----------|
| E1 | Sales order rows don't navigate to detail page | Feature gap | P0 (functional flow broken) |
| E2 | Sales detail page no error state for invalid ID | Feature gap | P1 |
| D1 | `sales_order_items.tax_rate_id` not written on create | Write path missing | P1 (LHDN compliance) |
| D2 | `payment_items.tax_rate_id` not written | Write path missing | P1 (LHDN compliance) |
| D6 | `refund_items` not written (1 refund, 0 items) | Write path missing | P1 (operator daily) |
| D7 | Cap/floor cols missing on `commission_splits` | Migration not applied | P1 (payroll weekly fire) |
| D8 | Cap/floor cols missing on `category_commission_configs` | Migration not applied | P1 (payroll weekly fire) |
| D3 | `promotion_usages.sales_order_id` still text | Migration not applied | P2 |
| D4 | `sales_order_status_history` empty | Write path missing | P2 |
| D5 | `payment_status_history` empty | Write path missing | P2 |
| D9 | `sales_orders.is_complimentary` + `complimentary_approved_by` missing | Migration partial | P2 |
| E3 | Refunds page missing "Pending" tab | Feature gap | P2 |
| E4 | Payouts page missing "Pending"/"Paid" tabs | Feature gap | P2 |
| E5 | Test selector strict-mode violation (4 suites) | Test defect | Fix-test only |

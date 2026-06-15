# Dashboard Audit — E2E Results + DB Integrity

**Generated:** 2026-05-07  
**Playwright run:** `dashboard-e2e` project, `e2e/batch*.dashboard.spec.ts`  
**Tenant org:** `996febce-aaad-4ded-8f47-02d2b566c8ee` (Test Fitness Franchise)  
**Schema reference:** `zhub/shared/schema-missing-relationships.md`

---

## E2E Summary

| Batch | Pass | Fail | Skip | Total |
|-------|------|------|------|-------|
| Batch 1 — Home / Access Control / Appointments | 23 | 1 | 2 | 26 |
| Batch 2 — Attendance / Audit / Services / Customers / Trainers / Branch Create | 24 | 2 | 1 | 27 |
| Batch 3 — Branch View / Sales / Refunds / Commissions / Payouts | 16 | 10 | 2 | 28 |
| Batch 4 — Payment / Promotions / Packages / Inventory | 11 | 0 | 0 | 11 |
| Batch 5 — UoM / Settings / Platform Admin / Operations | 25 | 0 | 0 | 25 |
| **TOTAL** | **99** | **13** | **5** | **117** |

---

## E2E Results by Page

| Page | TC-01 | TC-02 | TC-03+ | Notes |
|------|-------|-------|--------|-------|
| `/dashboard` (Home) | ✅ | ✅ | ✅ TC-03 TC-04 | — |
| `/dashboard/access-control/roles` | ✅ | ✅ | ✅ TC-03 TC-04 | — |
| `/dashboard/role/view` (redirect) | ✅ | ✅ | ⏭️ TC-03 skip | No clickable role rows in UI despite 7 DB rows |
| `/dashboard/access-control/user-assignment` | ✅ | ✅ | ✅ TC-03 TC-04 | — |
| `/dashboard/access-control/permissions` (redirect) | ✅ | ✅ | — | — |
| `/dashboard/access-control/invitations` (redirect) | ✅ | ✅ | — | — |
| `/dashboard/appointment/view` | ✅ | ✅ | ✅ TC-03 | — |
| `/dashboard/appointment/class-slots/view` | ❌ TC-01 | ✅ | ✅ TC-03; ⏭️ TC-04 | Empty-state has no `<table>` / `[data-testid=empty-state]` / `[class*=empty]` |
| `/dashboard/rooms/view` (redirect) | ✅ | ✅ | — | — |
| `/dashboard/attendance/view` | ✅ | ✅ | ✅ TC-03; ❌ TC-04 | KPI regex matches hidden sidebar `<code>` nav element, not KPI card |
| `/dashboard/audit/view` | ✅ | ✅ | ✅ TC-03 TC-04 | — |
| `/dashboard/my-services/view` | ✅ | ✅ | ✅ TC-03; ⏭️ TC-04 | TC-04 skip: needs seeded service data |
| `/dashboard/customers/view` | ✅ | ✅ | ✅ TC-03 | — |
| `/dashboard/customers/walk-in/view` (redirect) | ✅ | ✅ | — | — |
| `/dashboard/customers/$id` (Customer 360) | ✅ | ✅ | ✅ TC-03 | — |
| `/dashboard/trainers/view` | ✅ | ✅ | ✅ TC-03; ❌ TC-04 | Neither table rows nor empty-state text `/no trainers/i` found |
| `/dashboard/trainers/tiers` (redirect) | ✅ | ✅ | — | — |
| `/dashboard/branch/create` | ✅ | ✅ | ✅ TC-03 TC-04 | — |
| `/dashboard/branch/view` | ❌ TC-01 | ✅ | ✅ TC-03 TC-07 | TC-01: strict-mode — heading `.or(getByText)` matches sidebar span + h1 |
| `/dashboard/sales/view` | ✅ | ✅ | ✅ TC-11 TC-13 | — |
| `/dashboard/sales/create` | ✅ | ✅ | — | — |
| `/dashboard/sales/$id` (detail) | ❌ TC-01 | ❌ TC-02 | ❌ TC-03 TC-11 | Row click does not navigate; invalid ID shows blank page with no error state |
| `/dashboard/refunds/view` | ❌ TC-01 | ✅ | ❌ TC-04 | TC-01: strict-mode (same heading pattern); TC-04: no "Pending" tab |
| `/dashboard/cancelled-sales/view` (redirect) | ✅ | ✅ | — | — |
| `/dashboard/commissions/view` | ❌ TC-01 | ✅ | ⏭️ TC-04 skip | TC-01: strict-mode; TC-04 skip: franchisee is not admin |
| `/dashboard/commissions/my` (redirect) | ✅ | ✅ | — | — |
| `/dashboard/payouts/view` | ❌ TC-01 | ✅ | ❌ TC-04; ⏭️ TC-05 | TC-01: strict-mode; TC-04: no "Pending" tab; TC-05: no "Paid" tab |
| `/dashboard/payment/view` | ✅ | ✅ | ✅ TC-03 TC-06 | — |
| `/dashboard/promotions/view` (redirect) | ✅ | — | — | — |
| `/dashboard/packages/view` (redirect) | ✅ | — | — | — |
| `/dashboard/packages/instances/view` (redirect) | ✅ | — | — | — |
| `/dashboard/inventory-options` (brands redirect) | ✅ | — | — | — |
| `/dashboard/inventory-options` (categories redirect) | ✅ | — | — | — |
| `/dashboard/inventory-options` (suppliers redirect) | ✅ | — | — | — |
| `/dashboard/stock-requests/view` (transfer orders redirect) | ✅ | — | — | — |
| `/dashboard/uom/conversions/view` (redirect) | ✅ | ✅ | — | — |
| `/dashboard/settings/google-calendar` | ✅ | ✅ | ✅ TC-03 TC-05 | — |
| `/dashboard/settings/tax-rates` | ✅ | ✅ | ✅ TC-03 TC-05 | — |
| `/dashboard/settings/installment-plans` | ✅ | ✅ | ✅ TC-03 TC-05 | — |
| `/dashboard/settings/payment/view` | ✅ | ✅ | — | — |
| `/dashboard/platform-admin/admins` | ✅ | ✅ | — | Franchisee gracefully redirected or sees content |
| `/dashboard/platform-admin/users` | ✅ | ✅ | — | Franchisee gracefully redirected or sees content |
| `/dashboard/operations/approvals` | ✅ | ✅ | ✅ TC-03 TC-04 TC-08 | — |

---

## DB Integrity vs Relationship Docs

### FAIL — Schema not applied or data not written

| # | Check | Relationship Doc Ref | Expected | Actual | Severity |
|---|-------|---------------------|----------|--------|----------|
| D1 | `sales_order_items.tax_rate_id` populated on new orders | Sales #1 (critical) | >0 rows set | 0 / 8 items | **P1** |
| D2 | `payment_items.tax_rate_id` populated on new payments | Sales #2 (High) | >0 rows set | 0 / 10 items | **P1** |
| D3 | `promotion_usages.sales_order_id` is `uuid` type | Sales #4 (High) | `uuid` | `text` | **P1** |
| D4 | `sales_order_status_history` populated on status change | Cross X5 | ≥1 row per transition | 0 rows (8 orders) | **P2** |
| D5 | `payment_status_history` populated on status change | Cross X5 | ≥1 row per transition | 0 rows (10 items) | **P2** |
| D6 | `appointment_status_history` populated on status change | Appointments #3 | ≥1 row per transition | 0 rows (60 appointments) | **P2** |
| D7 | `members.role_id` backfilled for existing members | Identity #1 | 18/18 set | 0 / 18 | **P1** |
| D8 | `refund_items` populated on refund creation | Sales #10 (High) | ≥1 item per refund | 0 rows (1 refund exists) | **P1** |
| D9 | `commission_splits.cap_applied` / `floor_applied` columns exist | Commission #3 / Operator O8 | 4 columns present | all 4 absent | **P1** |
| D10 | `category_commission_configs.cap_amount` / `floor_amount` columns exist | Commission #3 / Operator O8 | 4 columns present | all 4 absent | **P1** |
| D11 | `sales_orders.is_complimentary` + `complimentary_approved_by` columns exist | Operator O3 | both columns present | both absent; only `complimentary_reason` added | **P2** |
| D12 | `members.lead_source_id` column exists | Agent 3.2 | column present | column absent; `lead_sources` table exists (0 rows) | **P1** |
| D13 | `walk_in_customers.customer_profile_id` + `converted_at` columns exist | Sales #7 / Agent 3.5 | both columns present | both absent; table has 2 rows | **P1** |
| D14 | `members.household_id` column exists | Agent 3.6 | column present | column absent; `households` table exists (0 rows) | **P1** |
| D15 | `members.invitation_id` column exists | Identity #4 | column present | column absent | **P2** |
| D16 | `check_ins.package_instance_id` FK constraint exists | Appointments #4 | FK constraint present | plain UUID column, no FK | **P2** |
| D17 | `transfer_order_items.received_qty` / `damaged_qty` columns exist | Inventory #5 | both columns present | both absent | **P2** |
| D18 | `stock_request_items.approved_qty` / `fulfilled_qty` columns exist | Inventory #6 | both columns present | both absent | **P2** |
| D19 | `package_instance_status_history` populated on status change | Cross X5 | ≥1 row per transition | 0 rows (8 instances) | **P2** |
| D20 | `uom_conversions` table exists in tenant DB | — | table exists | table does not exist | **P1** |
| D21 | `installment_plans` → `package_instances` FK exists | Sales #6 | FK present | absent (plain text ref) | **P2** |
| D22 | `google_calendar_connections.encryption_key_id` + `token_rotated_at` columns | Engagement #12 | both columns present | both absent | **P2** |
| D23 | `service_prices` / `product_prices` populated (branch-scoped pricing) | Services #6 / Agent 2.2 | ≥1 row per service | 0 rows each | **P2** |

### PASS — Schema applied and verified

| # | Check | Relationship Doc Ref | Actual |
|---|-------|---------------------|--------|
| P1 | `appointments_trainer_no_overlap` EXCLUDE constraint | Appointments #7 | ✅ exists |
| P2 | `appointments_room_no_overlap` EXCLUDE constraint | Appointments #7 | ✅ exists |
| P3 | `btree_gist` extension installed | Appointments #7 prereq | ✅ installed |
| P4 | `members.role_id` column added | Identity #1 | ✅ column exists (backfill missing — D7) |
| P5 | `appointment_status_history` table exists | Appointments #3 | ✅ table exists (rows missing — D6) |
| P6 | `sales_order_status_history` table exists | Cross X5 | ✅ table exists (rows missing — D4) |
| P7 | `payment_status_history` table exists | Cross X5 | ✅ table exists (rows missing — D5) |
| P8 | `sales_order_items.tax_rate_id` column exists | Sales #1 | ✅ column exists (write path missing — D1) |
| P9 | `payment_items.tax_rate_id` column exists | Sales #2 | ✅ column exists (write path missing — D2) |
| P10 | `payment_items.promotion_id` real FK + `uuid` type | Sales #3 | ✅ FK constraint confirmed |
| P11 | `payout_batches` table exists | Commission #2 | ✅ table exists |
| P12 | `payouts.batch_id` column exists | Commission #2 | ✅ column exists |
| P13 | `commission_split_reversals` table exists | Cross X4 | ✅ table exists |
| P14 | `category_commission_config_versions` table exists | Commission #3 | ✅ table exists (0 rows) |
| P15 | `package_instance_status_history` table exists | Cross X5 | ✅ table exists (rows missing — D19) |
| P16 | `installment_plans` table exists, 3 rows | Packages | ✅ functional |
| P17 | `tax_rates` table exists, default set (1 row) | Sales #1 prereq | ✅ functional |
| P18 | `refund_items` table exists | Sales #10 | ✅ table exists (not populated — D8) |
| P19 | `purchase_orders` table exists | Inventory #3 | ✅ table exists (no dev data) |
| P20 | `goods_receipts` + `goods_receipt_items` tables exist | Inventory #3 | ✅ both exist |

---

## Issues by Severity

### P0 — Functional flow broken

| ID | Issue | Fix |
|----|-------|-----|
| E1 | Sales order table rows do not navigate to `/dashboard/sales/$id` on click | Add `onClick` → router push to row, or wrap rows in `<Link>` |
| E2 | `/dashboard/sales/invalid-uuid` renders blank page — no error state, no back link | Add not-found / error boundary with back link in `sales/$id.tsx` |

### P1 — Data correctness / compliance / schema missing

| ID | Issue | Fix |
|----|-------|-----|
| D1 | `sales_order_items.tax_rate_id` never written at POS | Wire `taxRateId` in sales order creation service |
| D2 | `payment_items.tax_rate_id` never written | Wire `taxRateId` in payment recording service |
| D3 | `promotion_usages.sales_order_id` is `text` not `uuid` | New-col + backfill + swap migration (0 rows now — trivial) |
| D7 | `members.role_id` NULL for all 18 existing members | Backfill migration: JOIN `members.role` → `roles.name` → set `role_id` |
| D8 | `refund_items` not written on refund creation | Wire line-item write in refund service |
| D9 | `commission_splits` cap/floor columns absent (4 cols) | `ALTER TABLE commission_splits ADD COLUMN cap_applied bool, floor_applied bool, excluded bool, is_complimentary bool` |
| D10 | `category_commission_configs` cap/floor columns absent (4 cols) | `ALTER TABLE category_commission_configs ADD COLUMN cap_amount int, floor_amount int, excluded_order_types text[], max_per_cycle int` |
| D12 | `members.lead_source_id` column missing | `ALTER TABLE members ADD COLUMN lead_source_id uuid REFERENCES lead_sources(id)` |
| D13 | `walk_in_customers.customer_profile_id` + `converted_at` missing | `ALTER TABLE walk_in_customers ADD COLUMN customer_profile_id uuid, converted_at timestamptz` |
| D14 | `members.household_id` column missing | `ALTER TABLE members ADD COLUMN household_id uuid REFERENCES households(id)` |
| D20 | `uom_conversions` table does not exist in tenant DB | Run missing migration for UoM conversion table |

### P2 — Data integrity / missing audit trail / partial migrations

| ID | Issue | Fix |
|----|-------|-----|
| D4 | `sales_order_status_history` empty (8 orders) | Add service hook on order status mutations; backfill from current `status` |
| D5 | `payment_status_history` empty (10 items) | Same pattern for payment status mutations |
| D6 | `appointment_status_history` empty (60 appointments) | Same pattern for appointment status mutations; backfill existing |
| D11 | `sales_orders.is_complimentary` + `complimentary_approved_by` missing | `ALTER TABLE sales_orders ADD COLUMN is_complimentary bool DEFAULT false, complimentary_approved_by text` |
| D15 | `members.invitation_id` column missing | `ALTER TABLE members ADD COLUMN invitation_id uuid REFERENCES invitations(id)` |
| D16 | `check_ins.package_instance_id` has no FK constraint | `ALTER TABLE check_ins ADD CONSTRAINT check_ins_pkg_fk FOREIGN KEY (package_instance_id) REFERENCES package_instances(id)` |
| D17 | `transfer_order_items.received_qty` / `damaged_qty` missing | `ALTER TABLE transfer_order_items ADD COLUMN received_qty int, damaged_qty int` |
| D18 | `stock_request_items.approved_qty` / `fulfilled_qty` missing | `ALTER TABLE stock_request_items ADD COLUMN approved_qty int, fulfilled_qty int` |
| D19 | `package_instance_status_history` empty (8 instances) | Wire write hook on package instance status mutations |
| D21 | `installment_plans` → `package_instances` FK missing | Add FK or document `paymentPlanType` (text) is intentionally denormalized |
| D22 | `google_calendar_connections` missing `encryption_key_id` + `token_rotated_at` | `ALTER TABLE google_calendar_connections ADD COLUMN encryption_key_id text, token_rotated_at timestamptz` |
| D23 | `service_prices` / `product_prices` empty | Backfill from `services.price` at default branch |
| E3 | Refunds page missing "Pending" tab | Add tab to refunds view component |
| E4 | Payouts page missing "Pending" + "Paid" filter tabs | Add filter tabs to payouts view component |

### Test defects (fix spec only, not feature)

| ID | Test | Root cause | Fix |
|----|------|-----------|-----|
| T1 | Branch TC-01, Refunds TC-01, Commissions TC-01, Payouts TC-01 — strict-mode violation | `.getByRole('heading').or(getByText(...).first())` matches sidebar `<span>` + page `<h1>` | Remove `.or()` clause; use `.getByRole('heading')` alone |
| T2 | Attendance TC-04 — KPI regex matches hidden sidebar nav element | `getByText(/booked|checked.?in|no.?show|cancel/i)` unscoped | Scope to `page.locator('main').getByText(...)` |
| T3 | Trainers TC-04 — neither rows nor empty-state text found | Empty-state wording doesn't match `/no trainers|no results|empty/i` | Inspect screenshot, update regex to match actual wording |
| T4 | Class Slots TC-01 — empty state has no testable selector | Empty-state component lacks `<table>`, `data-testid=empty-state`, or `class*=empty` | Add `data-testid="empty-state"` to class slots empty-state component |

### Data / seed gaps (not schema bugs)

| ID | Issue | Note |
|----|-------|------|
| W1 | `platform_admins` table empty in control panel | Seed at least one dev platform admin |
| W2 | `class_slots` table empty (0 rows) | Add dev seed data to unblock TC-04 |
| W3 | `commission_splits` empty (0 rows) | No commissions generated yet; escalates once live |
| W4 | `promotion_usages` empty despite 1 promotion existing | Write path may not be wired; verify at next manual sale |
| W5 | `installment_events` empty | Event lifecycle tracking not exercised |
| W6 | `purchase_orders` empty | Procurement workflow unexercised in dev |
| W7 | `announcement_scopes` junction unused | Deferred per red-team filter (branchId covers org-wide scope) |

---

## Action Items (Priority Order)

1. **P0: Fix sales row navigation** — table rows must navigate to detail page; detail page must handle invalid IDs gracefully.
2. **P1 schema additions (migrations):** `members.lead_source_id`, `members.household_id`, `members.invitation_id`; `walk_in_customers` conversion cols; `commission_splits` + `category_commission_configs` cap/floor cols; `uom_conversions` table.
3. **P1 write paths:** Wire `tax_rate_id` at POS (sales order items + payment items); wire `refund_items` on refund create; run `members.role_id` backfill migration.
4. **P1 type fix:** `promotion_usages.sales_order_id` text→uuid — new-col + backfill + swap migration.
5. **P2 status histories:** Add service hooks for appointment, sales order, payment, package instance status changes; backfill existing rows from current status.
6. **P2 missing columns:** `is_complimentary` + `complimentary_approved_by` on `sales_orders`; `check_ins` FK constraint; `transfer_order_items` + `stock_request_items` qty cols; GCal token rotation cols.
7. **Fix test selector defects** (T1–T4) — no feature work required.
8. **Feature gaps:** Add "Pending" tab to Refunds; add "Pending"/"Paid" tabs to Payouts.
9. **Seed data:** dev platform admin, class slots, service prices from flat price backfill.

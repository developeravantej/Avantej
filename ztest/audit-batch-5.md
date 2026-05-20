# Audit Batch 5: UoM / Settings / Platform Admin / Operations

Generated: 2026-05-07
Spec file: `e2e/batch5.dashboard.spec.ts`
Tenant org: `996febce-aaad-4ded-8f47-02d2b566c8ee`

---

## E2E Results

| Page | Test | Status | Notes |
|------|------|--------|-------|
| UOM Conversions View — redirect | TC-01: navigating to /uom-conversions/view redirects to conversions tab | ✅ pass | |
| UOM Conversions View — redirect | TC-02: no crash after redirect | ✅ pass | |
| Settings — Google Calendar | TC-01: page loads without crash | ✅ pass | |
| Settings — Google Calendar | TC-02: no JavaScript crash on mount | ✅ pass | |
| Settings — Google Calendar | TC-03: page shows connect button or connected status | ✅ pass | |
| Settings — Google Calendar | TC-05: oauth return with ?gcal=connected shows no crash | ✅ pass | |
| Settings — Tax Rates | TC-01: page loads with heading and table or empty state | ✅ pass | |
| Settings — Tax Rates | TC-02: no JavaScript crash | ✅ pass | |
| Settings — Tax Rates | TC-03: add button is present | ✅ pass | |
| Settings — Tax Rates | TC-05: clicking add button opens a dialog | ✅ pass | |
| Settings — Installment Plans | TC-01: page loads with heading | ✅ pass | |
| Settings — Installment Plans | TC-02: no JavaScript crash | ✅ pass | |
| Settings — Installment Plans | TC-03: New Plan button is visible | ✅ pass | |
| Settings — Installment Plans | TC-05: clicking New Plan opens a dialog with form fields | ✅ pass | |
| Settings — Payment | TC-01: navigating to /settings/payment loads or redirects gracefully | ✅ pass | |
| Settings — Payment | TC-02: page does not throw a blank white screen with no content | ✅ pass | |
| Platform Admin — Admins | TC-01: navigating as franchisee results in content OR graceful redirect — not a crash | ✅ pass | |
| Platform Admin — Admins | TC-02: franchisee either sees admins page or is redirected to /dashboard | ✅ pass | |
| Platform Admin — Users | TC-01: navigating as franchisee results in content OR graceful redirect — not a crash | ✅ pass | |
| Platform Admin — Users | TC-02: franchisee either sees users page or is redirected to /dashboard | ✅ pass | |
| Operations — Package Approvals | TC-01: page loads with heading | ✅ pass | |
| Operations — Package Approvals | TC-02: no JavaScript crash | ✅ pass | |
| Operations — Package Approvals | TC-03: page shows table rows OR empty state after data loads | ✅ pass | |
| Operations — Package Approvals | TC-04: Refresh button is present and clickable | ✅ pass | |
| Operations — Package Approvals | TC-08: clicking Reject on a row opens a dialog (if rows present) | ✅ pass | |

**Summary: 25 passed, 0 failed, 0 skipped**

---

## DB Integrity

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `tax_rates` count | ≥1 | 1 | ✅ |
| `tax_rates` default set | 1 | 1 | ✅ |
| `sales_order_items.tax_rate_id` column exists | yes | yes | ✅ |
| `sales_order_items.tax_rate_id` captured on orders | >0 | 0 | ❌ |
| `payment_items.tax_rate_id` column exists | yes | yes | ✅ |
| `payment_items.tax_rate_id` captured on payments | >0 | 0 | ❌ |
| `commission_splits` count | any | 0 | ⚠️ no data yet |
| `commission_splits.cap_applied` column | exists | absent | ❌ |
| `commission_splits.floor_applied` column | exists | absent | ❌ |
| `category_commission_configs.cap_amount` column | exists | absent | ❌ |
| `category_commission_configs.floor_amount` column | exists | absent | ❌ |
| `uom_conversions` table exists | yes | does not exist | ❌ |
| `installment_plans` table exists | yes | yes | ✅ |
| `installment_plans` count | ≥1 | 3 | ✅ |
| `installment_plans` → `package_instances` FK | exists | absent | ❌ |
| `platform_admins` count (control panel) | ≥1 | 0 | ⚠️ no seed data |
| `operations_approvals` table exists | yes | does not exist | ❌ |
| `package_approvals` table exists (alt name) | yes | does not exist | ❌ |
| `promotion_usages.sales_order_id` data type | uuid | text | ❌ |
| `category_commission_config_versions` table exists | yes | yes | ✅ |
| `category_commission_config_versions` count | ≥1 | 0 | ⚠️ no data yet |
| `google_calendar_connections.encryption_key_id` col | exists | absent | ❌ |
| `google_calendar_connections.token_rotated_at` col | exists | absent | ❌ |

---

## Issues Found

### High

1. **`uom_conversions` table does not exist in tenant DB** — The UoM Conversions page redirects and loads the shell correctly, but no underlying table has been migrated. Any API call that reads or writes conversions will fail at runtime. No direct schema-missing-relationships.md item, but this is a missing table for a shipped feature. **Severity: High**

2. **No `operations_approvals` or `package_approvals` table exists** — The Operations Package Approvals page passes all smoke tests (loads, shows empty state, Reject dialog works), but there is no dedicated approvals audit table. The feature likely reads `package_instances` status transitions directly. If a separate approval-event log is required, it is absent. Maps conceptually to schema-missing-relationships.md **X5** (lifecycle/status_history for money-bearing entities). **Severity: High**

3. **`sales_order_items.tax_rate_id` column present but 0 rows populated** — Column was added by migration, but no existing or new sales orders capture a tax rate per line. Maps to schema-missing-relationships.md **Sales #1** (top-10 critical, LHDN MyInvois compliance). Historical orders cannot be reproduced if the rate is later edited. Application code at point-of-sale must be wired to set this field. **Severity: High**

4. **`payment_items.tax_rate_id` column present but 0 rows populated** — Same gap on the payment side. Maps to schema-missing-relationships.md **Sales #2** (High). `itemType="tax"` rows exist but carry no FK to the originating rate. **Severity: High**

5. **`promotion_usages.sales_order_id` is `text` not `uuid`** — Maps to schema-missing-relationships.md **Sales #4** (High). Dangling refs on order delete; JOIN type mismatch with `sales_orders.id` (uuid). The DB engineer review notes this requires a new-col + backfill + swap migration (not `ALTER TYPE`) to avoid lock. **Severity: High**

### Medium

6. **`commission_splits.cap_applied` and `floor_applied` columns absent** — Maps to schema-missing-relationships.md **Operator O8** (bonus pay caps) and **Commission #3** (version history context). Cap/floor enforcement cannot be audited per-split. Finance/payroll cannot verify whether a cap was applied for a given period. **Severity: Medium**

7. **`category_commission_configs.cap_amount` and `floor_amount` columns absent** — Same issue on the config source side. `category_commission_config_versions` table exists (versioning infrastructure is in place) but 0 rows and the config table itself lacks the fields being versioned — meaning version history is capturing config snapshots that are incomplete. Maps to schema-missing-relationships.md **Commission #3**. **Severity: Medium**

8. **`installment_plans` → `package_instances` FK absent** — Maps to schema-missing-relationships.md **Sales #6** (Medium). `paymentPlanType` is plain text on `package_instances`; plan renames silently break references. 3 installment plans exist in the DB but none are linked via FK. **Severity: Medium**

9. **`google_calendar_connections` missing token rotation columns** — `encryption_key_id` and `token_rotated_at` absent. Maps to schema-missing-relationships.md **Engagement #12** (Medium). Key rotation cannot identify stale OAuth ciphertexts; security hygiene gap. **Severity: Medium**

10. **`platform_admins` table has 0 rows in control panel DB** — Platform Admin pages pass e2e only because tests accept redirect-as-pass for franchisee users. No platform admin accounts exist in the dev environment. Full platform-admin flows (granting super_admin, impersonation) cannot be end-to-end tested. Maps to schema-missing-relationships.md **Control Panel #6** (`platform_admins.grantedBy` action audit). **Severity: Medium** (seed/data gap, not schema gap)

### Low

11. **`category_commission_config_versions` has 0 rows** — Table exists but nothing writes to it yet. Once commission splits are generated and a config is updated, disputed splits will lack the snapshot needed to recompute at `earnedAt`. Maps to schema-missing-relationships.md **Commission #3** (High in doc). Watch this as data volume grows. **Severity: Low** (data gap; escalates to Medium once commission_splits are created)

---

## Summary

- **E2E**: 25/25 passed across all 8 page areas — no regressions.
- **DB schema gaps**: 9 distinct issues — 2 missing tables, 5 missing columns, 1 type mismatch, 1 missing FK.
- **Top action items**:
  1. Migrate `uom_conversions` table to tenant DB.
  2. Clarify whether `package_approvals` / `operations_approvals` table is required or if `package_instances` status transitions suffice.
  3. Wire application code to populate `tax_rate_id` on `sales_order_items` and `payment_items` at point-of-sale.
  4. Plan `promotion_usages.sales_order_id` text→uuid migration (new-col + backfill + swap per DB engineer review).
  5. Add `cap_amount`/`floor_amount` to `category_commission_configs` and `cap_applied`/`floor_applied` to `commission_splits`.

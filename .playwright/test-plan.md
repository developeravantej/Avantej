# Playwright Test Plan — Sales Pipeline Fixes (2026-05-12)

**Session:** `05-12_17-10_sales-pipeline-fixes`
**Branch:** `feat/package-approval-flow`
**Generated:** 2026-05-12
**Scope:** Phase 0–7 work shipped this session only. Existing batch1-5 smoke tests are NOT replaced.

---

## Overview

| Area | Priority | Journeys | Seeding Required |
|------|----------|----------|-----------------|
| branch-onboarding | P0 | 1 | Yes (full submit path needs cleanup) |
| commission-rule | P0 | 4 | Yes (appointments, members) |
| payouts | P1 | 3 | No (read-only KPI + drawer) |
| trainer-assigned-packages | P1 | 2 | No (tab load + drawer) |
| package-lifecycle | P0 | 3 | No (row action on existing data) |
| sales-cancellation | P1 | 4 | No (UI verification) |
| pos-checkout | P0 | 3 | Partial (member.role check needs bad seed) |

**Total journeys: 20** (7 P0, 7 P1, 6 additional detail journeys)

---

## Area 1: branch-onboarding (P0)

**Route:** `/dashboard/branch/$id`, `/onboarding/$token?org=$orgId`
**Existing coverage:** `branch-onboarding.spec.ts` covers admin generates URL (5 specs) but explicitly stops before form submission to avoid orphan users.
**New journey needed:** Full submit with cleanup.

---

### Journey 1.1 — Full submit-form-and-create-account (seed-driven with cleanup)

**Actor:** `tenant_admin` (admin), anonymous browser (customer)
**Preconditions:**
- Dev stack running (`bun dev`)
- A branch hierarchy node exists in the test tenant
- Seed helper `e2e/helpers/seed-data.ts` provides `createTestUser(email, cleanup: true)` (to-be-written by EXECUTE phase)
- The test uses a unique email per run (`testuser+${Date.now()}@avantej-e2e.test`) so cleanup is deterministic

**Steps:**
1. Admin logs in → navigate to `/dashboard/branch/view` → click first table row → land on `/dashboard/branch/<nodeId>`
2. Click button `[data-testid="generate-qr-button"]`
3. Wait for modal → extract URL from `[data-testid="invite-url-input"]` value
4. Open fresh browser context (incognito) → navigate to the extracted URL
5. Assert `[data-testid="onboarding-branch-name"]` shows branch name (not a generic placeholder)
6. Fill `[data-testid="onboarding-name-input"]` with "E2E Test Customer"
7. Fill `[data-testid="onboarding-email-input"]` with `testuser+{timestamp}@avantej-e2e.test`
8. Fill `[data-testid="onboarding-password-input"]` with `TestPass123!`
9. Click `[data-testid="onboarding-submit-button"]`
10. Assert redirect to `/dashboard` or `/dashboard/buy-package` (URL contains "dashboard")
11. **Cleanup:** call `DELETE /api/test/cleanup-user?email=<email>` (test-only endpoint, or direct DB script via `bun scripts/e2e-cleanup.ts`)

**Assertions:**
- Branch name on onboarding page is non-empty and matches the branch navigated to in step 1
- After submit, page URL contains `/dashboard`
- A network request to `/rpc/onboarding/redeemInvite` returns 2xx
- No JS errors in browser console during submit

**Required test IDs:**
- `data-testid="generate-qr-button"` — on branch detail page
- `data-testid="invite-url-input"` — readonly input or text node showing the invite URL in QR modal
- `data-testid="onboarding-branch-name"` — heading or text on onboarding page
- `data-testid="onboarding-name-input"` — full name field
- `data-testid="onboarding-email-input"` — email field
- `data-testid="onboarding-password-input"` — password field
- `data-testid="onboarding-submit-button"` — form submit button

**Estimated complexity:** HIGH (cross-DB user creation + cleanup required)

---

## Area 2: commission-rule (P0)

**Routes:** `/dashboard/appointment/view`, `/dashboard/commissions/view`, `/dashboard/commissions/my`
**Existing coverage:** `fixes-verification.spec.ts` has an appointment load test but does NOT test commission splits.
**Overlapping batch spec:** `batch2.dashboard.spec.ts` likely smoke-visits commissions pages.

> **BLOCKER NOTE:** All 4 journeys below require a real trainer member with a service assignment AND a real appointment in `completed` or `cancelled` state. Without a seed helper that can create appointments and advance their status, these must be marked HIGH complexity and should be deferred until EXECUTE phase has `e2e/helpers/seed-data.ts` ready.

---

### Journey 2.1 — Trainer cancels appointment → admin sees pending split with earnReason=cancellation

**Actor:** `tenant_admin`
**Preconditions:**
- At least one appointment exists in `scheduled` or `confirmed` status in the test tenant
- Seed helper: `seedAppointment({ trainerId, customerId, serviceId, status: 'confirmed' })` returns appointment ID
- The cancellation is performed via the UI (not direct DB write) to exercise the full code path

**Steps:**
1. Navigate to `/dashboard/appointment/view`
2. Locate the seeded appointment row in the calendar or list view
3. Click the appointment → appointment detail panel opens
4. Click `[data-testid="appointment-cancel-button"]`
5. Confirm dialog appears with text about commission policy
6. Click `[data-testid="appointment-cancel-confirm-button"]`
7. Wait for toast "Appointment cancelled"
8. Navigate to `/dashboard/commissions/view`
9. Switch to "All Commissions" tab (if not default)
10. Filter or search for the trainer's name

**Assertions:**
- A commission split row is visible for the trainer with `earnReason` badge showing "Cancellation" (or equivalent label)
- Row status badge shows "Pending"
- The split's amount is greater than 0
- No duplicate split rows for the same appointment

**Required test IDs:**
- `data-testid="appointment-cancel-button"` — cancel action in appointment detail
- `data-testid="appointment-cancel-confirm-button"` — confirm in dialog
- `data-testid="commission-earn-reason-badge"` — earn reason badge on each commission row
- `data-testid="commission-status-badge"` — status badge on each commission row

**Estimated complexity:** HIGH (requires seeded appointment + trainer member)

---

### Journey 2.2 — Trainer completes appointment → split appears with earnReason=completion

**Actor:** `tenant_admin`
**Preconditions:**
- Seeded appointment in `confirmed` status
- Admin marks it complete via UI

**Steps:**
1. Navigate to `/dashboard/appointment/view` → locate seeded appointment
2. Click appointment → click `[data-testid="appointment-complete-button"]`
3. Confirm if dialog shown
4. Navigate to `/dashboard/commissions/view` → "All Commissions" tab
5. Locate the split row for this appointment

**Assertions:**
- Commission split row is visible with `earnReason` badge showing "Completion"
- Row status is "Pending"
- Amount > 0

**Required test IDs:**
- `data-testid="appointment-complete-button"`
- `data-testid="commission-earn-reason-badge"` (same as 2.1)

**Estimated complexity:** HIGH (requires seeded appointment)

---

### Journey 2.3 — POS sale of a service → NO commission split appears immediately

**Actor:** `tenant_admin`
**Preconditions:**
- At least one bookable service and one `role=client` member in test tenant
- No existing commission splits for the test member in the current period (or use a fresh member)

**Steps:**
1. Navigate to `/dashboard/sales/create`
2. Step 1 (Member): search for and select the test client member via `[data-testid="pos-member-search-input"]`
3. Step 2 (Items): add a bookable service item via `[data-testid="pos-add-service-button"]` or catalog
4. Step 3 (Payment): select cash payment → complete sale
5. Note the sale ID from the success screen
6. Navigate to `/dashboard/commissions/view` → "All Commissions" tab
7. Filter by trainer assigned to the service (if applicable)

**Assertions:**
- No commission split row exists with `salesOrderId` matching the new sale's ID
- Alternatively: the split count for the trainer has NOT increased after the POS sale
- Network: no `POST /rpc/commissions/...` request during the POS flow

**Required test IDs:**
- `data-testid="pos-member-search-input"`
- `data-testid="pos-add-service-button"` (or catalog item button)
- `data-testid="pos-complete-sale-button"`
- `data-testid="pos-sale-success-id"` — sale ID shown on completion screen

**Estimated complexity:** MEDIUM (POS flow exists; no seeded appointment needed; only checking absence)

---

### Journey 2.4 — POS sale of a product → split appears immediately (product commission not deferred)

**Actor:** `tenant_admin`
**Preconditions:**
- At least one non-bookable product in the catalog with a commission rule configured
- A `role=client` member in test tenant

**Steps:**
1. Navigate to `/dashboard/sales/create`
2. Add a product item (not a service) to the cart
3. Complete sale with cash payment
4. Navigate to `/dashboard/commissions/view` → "All Commissions" tab

**Assertions:**
- A commission split row IS visible for the product sale
- `earnReason` badge shows "Sale" or similar immediate-earn label (not "Cancellation" / "Completion")
- Status is "Pending"

**Required test IDs:**
- `data-testid="pos-add-product-button"` (or catalog product item)
- `data-testid="commission-earn-reason-badge"`

**Estimated complexity:** MEDIUM (requires a product with commission rule; no appointment needed)

---

## Area 3: payouts (P1)

**Route:** `/dashboard/payouts/view`
**Existing coverage:** None — page was a 5-line stub before this session; batch tests may smoke-visit it.
**Overlapping batch spec:** `batch3.dashboard.spec.ts` or `batch4.dashboard.spec.ts` may cover a smoke visit.

---

### Journey 3.1 — Page mounts with real KPI strip (not stub/empty)

**Actor:** `tenant_admin`
**Preconditions:**
- At least one `commission_splits` row in `approved` status in the test tenant
- Admin has `commission_payout:read` permission

**Steps:**
1. Navigate to `/dashboard/payouts/view`
2. Wait for `[data-testid="payouts-kpi-strip"]` to be visible

**Assertions:**
- `[data-testid="payouts-kpi-pending"]` is visible (even if value is 0)
- `[data-testid="payouts-kpi-approved"]` shows a number ≥ 0
- `[data-testid="payouts-kpi-paid"]` shows a number ≥ 0
- No "Coming soon" or redirect stub text visible
- Page title "Payouts" is in the DOM

**Required test IDs:**
- `data-testid="payouts-kpi-strip"` — container
- `data-testid="payouts-kpi-pending"` — pending amount/count card
- `data-testid="payouts-kpi-approved"` — approved card
- `data-testid="payouts-kpi-paid"` — paid card

**Estimated complexity:** LOW (read-only page assertion)

---

### Journey 3.2 — Run Batch drawer opens and preview fires

**Actor:** `tenant_admin`
**Preconditions:**
- At least one approved commission split exists
- Admin has `commission_payout:update` permission

**Steps:**
1. Navigate to `/dashboard/payouts/view`
2. Click `[data-testid="run-batch-button"]`
3. Assert `[data-testid="run-batch-drawer"]` is visible
4. Select a staff member from `[data-testid="batch-staff-combobox"]`
5. Set date range: `[data-testid="batch-period-start"]` and `[data-testid="batch-period-end"]`
6. Wait for `[data-testid="batch-preview-count"]` to update (debounced preview API call fires)

**Assertions:**
- Drawer is visible after clicking "Run Batch"
- After selecting staff + dates, `[data-testid="batch-preview-count"]` shows a number (may be 0 if no matching splits)
- `[data-testid="batch-confirm-button"]` is visible and enabled (when count > 0) or disabled (when count = 0)

**Required test IDs:**
- `data-testid="run-batch-button"` — trigger button on payouts page
- `data-testid="run-batch-drawer"` — the Sheet/Drawer component root
- `data-testid="batch-staff-combobox"` — staff multi-select
- `data-testid="batch-period-start"` — start date input
- `data-testid="batch-period-end"` — end date input
- `data-testid="batch-preview-count"` — split count shown after preview loads
- `data-testid="batch-confirm-button"` — confirm payout button

**Estimated complexity:** MEDIUM (requires approved splits to exist for preview to be non-zero)

---

### Journey 3.3 — Confirm payout creates a row in the table

**Actor:** `tenant_admin`
**Preconditions:**
- At least one approved commission split for a specific staff member
- Date range encompasses the split's `earnedAt`

**Steps:**
1. Navigate to `/dashboard/payouts/view`
2. Note initial row count of `[data-testid="payouts-table"]` via `locator('tbody tr').count()`
3. Click "Run Batch" → fill drawer → click `[data-testid="batch-confirm-button"]`
4. Wait for toast containing "payout" text
5. Wait for drawer to close

**Assertions:**
- Toast appears with success message mentioning payout(s) created
- `[data-testid="payouts-table"] tbody tr` count has increased by ≥ 1
- The new row shows today's date in the "Paid At" column
- The split that was `approved` is now shown as `paid` in `/dashboard/commissions/view`

**Required test IDs:**
- `data-testid="payouts-table"` — table container

**Estimated complexity:** HIGH (requires approved splits to actually batch and verify)

---

## Area 4: trainer-assigned-packages (P1)

**Route:** `/dashboard/my-services/view`
**Existing coverage:** None for the new Assigned Packages tab.
**Overlapping batch spec:** `batch1.dashboard.spec.ts` may smoke-visit My Services.

---

### Journey 4.1 — Assigned Packages tab loads and shows correct rows

**Actor:** `tenant_admin` (has all packages; a real trainer-scoped user would be ideal but is not seeded)
**Preconditions:**
- At least one `package_instances` row where `assignedTrainerId = context.member.id` in `active` or `frozen` status
- The test tenant's admin member ID must match at least one such row (or seed one)

**Steps:**
1. Navigate to `/dashboard/my-services/view`
2. Assert default tab is "Assigned Packages" (`?tab=assigned` in URL or tab UI)
3. Click `[data-testid="tab-assigned-packages"]` if not already active

**Assertions:**
- `[data-testid="assigned-packages-tab"]` is visible and active
- `[data-testid="assigned-packages-table"]` is in the DOM (even if empty — no error state)
- If rows exist: each row shows client name, service name, credits remaining, status badge
- Empty state (`data-testid="assigned-packages-empty"`) renders if no rows (not an error)

**Required test IDs:**
- `data-testid="tab-assigned-packages"` — tab trigger
- `data-testid="assigned-packages-table"` — table or list container
- `data-testid="assigned-packages-empty"` — empty state element

**Estimated complexity:** LOW (page load + tab switch; empty state is valid)

---

### Journey 4.2 — Click a row opens the assigned package drawer

**Actor:** `tenant_admin`
**Preconditions:**
- At least one assigned package row visible (requires seeded data or existing tenant data)

**Steps:**
1. Navigate to `/dashboard/my-services/view?tab=assigned`
2. Wait for `[data-testid="assigned-packages-table"]`
3. If table has rows: click first `tbody tr`
4. Assert `[data-testid="assigned-package-drawer"]` opens

**Assertions:**
- Drawer is visible
- Client name displayed in `[data-testid="drawer-client-name"]`
- Service name displayed in `[data-testid="drawer-service-name"]`
- Credits remaining shown
- Status badge present
- No JS errors during render

**Required test IDs:**
- `data-testid="assigned-package-drawer"` — Sheet root
- `data-testid="drawer-client-name"` — client display name
- `data-testid="drawer-service-name"` — service name

**Estimated complexity:** MEDIUM (requires at least one assigned package row to exist)

---

## Area 5: package-lifecycle (P0)

**Route:** `/dashboard/packages/view?tab=session-packs` (formerly `/dashboard/packages/instances/view` which is now a redirect)
**Existing coverage:** None for lifecycle mutations.
**Overlapping batch spec:** `batch3.dashboard.spec.ts` likely visits packages.

> **Implementation note:** `packages/instances/view` now redirects to `packages/view?tab=session-packs`. Journeys use the canonical `/dashboard/packages/view?tab=session-packs` URL.

---

### Journey 5.1 — Cancel package instance → row moves to Cancelled tab

**Actor:** `tenant_admin`
**Preconditions:**
- At least one `package_instances` row in `active` status in the test tenant
- Admin has `package_management` permission

**Steps:**
1. Navigate to `/dashboard/packages/view?tab=session-packs`
2. Wait for `[data-testid="instances-table"]` to render with rows
3. Click the action menu (`[data-testid="instance-action-menu"]`) on the first active row
4. Click `[data-testid="instance-action-cancel"]` in the dropdown
5. Assert `[data-testid="cancel-instance-dialog"]` is visible
6. Fill `[data-testid="cancel-reason-input"]` with "E2E test cancellation"
7. Click `[data-testid="cancel-instance-confirm-button"]`
8. Wait for toast "Package cancelled" (or similar)
9. Assert the row is no longer in the active tab
10. Click the "Cancelled" status filter
11. Assert the row appears in the Cancelled tab

**Assertions:**
- Cancel dialog opens after clicking action menu item
- After confirmation, toast with success message appears
- Row disappears from the active list
- Row appears in the Cancelled filter list
- Row status badge shows "Cancelled"

**Required test IDs:**
- `data-testid="instances-table"` — table container (Session Packs tab)
- `data-testid="instance-action-menu"` — kebab/ellipsis trigger per row
- `data-testid="instance-action-cancel"` — "Cancel" menu item
- `data-testid="cancel-instance-dialog"` — dialog root
- `data-testid="cancel-reason-input"` — reason textarea
- `data-testid="cancel-instance-confirm-button"` — confirm button in dialog
- `data-testid="status-filter-cancelled"` — "Cancelled" tab/filter chip

**Estimated complexity:** MEDIUM (action on existing data row; no seeding needed if test tenant has active instances)

---

### Journey 5.2 — Freeze package instance → row moves to Frozen tab → Unfreeze restores it

**Actor:** `tenant_admin`
**Preconditions:** Active package instance in test tenant

**Steps:**
1. Navigate to `/dashboard/packages/view?tab=session-packs`
2. Click action menu on an active row → click `[data-testid="instance-action-freeze"]`
3. Assert `[data-testid="freeze-instance-dialog"]` is visible
4. Optionally fill `[data-testid="freeze-until-input"]` (date picker)
5. Click `[data-testid="freeze-instance-confirm-button"]`
6. Wait for toast
7. Select "Frozen" filter — row appears
8. Click action menu on the frozen row → click `[data-testid="instance-action-unfreeze"]`
9. Confirm unfreeze

**Assertions:**
- After freeze: row appears in "Frozen" filter, not in "Active"
- After unfreeze: row returns to "Active" filter, disappears from "Frozen"
- Status badge transitions: Active → Frozen → Active

**Required test IDs:**
- `data-testid="instance-action-freeze"` — Freeze menu item
- `data-testid="freeze-instance-dialog"` — dialog root
- `data-testid="freeze-until-input"` — optional date input
- `data-testid="freeze-instance-confirm-button"`
- `data-testid="instance-action-unfreeze"` — Unfreeze menu item
- `data-testid="status-filter-frozen"` — Frozen filter chip
- `data-testid="status-filter-active"` — Active filter chip

**Estimated complexity:** MEDIUM

---

### Journey 5.3 — Extend package instance expiry date

**Actor:** `tenant_admin`
**Preconditions:** Active package instance with a known `expiresAt` date

**Steps:**
1. Navigate to `/dashboard/packages/view?tab=session-packs`
2. Note the expiry date displayed for the first active row: `[data-testid="instance-expires-at"]`
3. Click action menu → click `[data-testid="instance-action-extend"]`
4. Assert `[data-testid="extend-instance-dialog"]` is visible
5. Fill `[data-testid="extend-days-input"]` with "30"
6. Click `[data-testid="extend-instance-confirm-button"]`
7. Wait for toast

**Assertions:**
- After extension, the expiry date shown in the row is 30 days later than the original
- Toast shows success message
- No error state in the dialog

**Required test IDs:**
- `data-testid="instance-expires-at"` — expiry date cell or text
- `data-testid="instance-action-extend"` — Extend menu item
- `data-testid="extend-instance-dialog"`
- `data-testid="extend-days-input"` — number of days to add
- `data-testid="extend-instance-confirm-button"`

**Estimated complexity:** MEDIUM

---

## Area 6: sales-cancellation (P1)

**Routes:** `/dashboard/sales/view`, `/dashboard/sales/$id`, `/dashboard/cancelled-sales/view`
**Existing coverage:** `fixes-verification.spec.ts` does NOT cover sales KPIs or cancel flow.
**Overlapping batch spec:** `batch2.dashboard.spec.ts` likely smoke-visits sales/view.

---

### Journey 6.1 — Sales KPI shows "Confirmed" not zero

**Actor:** `tenant_admin`
**Preconditions:** At least one `sales_orders` row with `status = 'confirmed'` in the test tenant

**Steps:**
1. Navigate to `/dashboard/sales/view`
2. Wait for `[data-testid="sales-kpi-strip"]` to render

**Assertions:**
- `[data-testid="sales-kpi-confirmed"]` contains a number > 0 (assuming test tenant has at least one confirmed sale)
- The label reads "Confirmed" (not "Completed") — Phase 6.1 relabelled the KPI
- `[data-testid="sales-kpi-revenue"]` shows a non-zero value (includes tax)
- No "0" for confirmed sales when confirmed orders exist

**Required test IDs:**
- `data-testid="sales-kpi-strip"` — KPI strip container
- `data-testid="sales-kpi-confirmed"` — confirmed count KPI card value
- `data-testid="sales-kpi-revenue"` — total revenue KPI card value

**Estimated complexity:** LOW (read-only assertion against existing data)

---

### Journey 6.2 — Cancel Sale button on detail page works end-to-end

**Actor:** `tenant_admin`
**Preconditions:**
- A `sales_orders` row with `status = 'confirmed'` and no captured payment beyond preauth

**Steps:**
1. Navigate to `/dashboard/sales/view`
2. Click a row with "Confirmed" status badge → land on `/dashboard/sales/<id>`
3. Assert `[data-testid="cancel-sale-button"]` is visible and enabled
4. Click it
5. Assert `[data-testid="cancel-sale-dialog"]` is visible
6. Fill `[data-testid="cancel-sale-reason-input"]` with "E2E test cancellation"
7. Click `[data-testid="cancel-sale-confirm-button"]`
8. Wait for navigation to `/dashboard/cancelled-sales/view`

**Assertions:**
- "Cancel Sale" button present only on confirmed sales (not on cancelled/refunded rows)
- After confirm, page navigates to `/dashboard/cancelled-sales/view`
- Toast shows "Sale cancelled"
- The original sale detail page, if revisited, shows status "Cancelled"

**Required test IDs:**
- `data-testid="cancel-sale-button"` — in sale detail action bar
- `data-testid="cancel-sale-dialog"` — dialog root
- `data-testid="cancel-sale-reason-input"` — reason textarea
- `data-testid="cancel-sale-confirm-button"` — dialog confirm button

**Estimated complexity:** MEDIUM (requires a confirmed sale; the cancel mutation exists per code inspection)

---

### Journey 6.3 — Cancelled Sales view lists cancelled rows (no longer a redirect stub)

**Actor:** `tenant_admin`
**Preconditions:** At least one cancelled sale in the test tenant (may be created by Journey 6.2 in same run)

**Steps:**
1. Navigate to `/dashboard/cancelled-sales/view`
2. Assert page renders (no redirect, no "Coming soon")
3. Wait for `[data-testid="cancelled-sales-table"]`

**Assertions:**
- Page URL stays at `/dashboard/cancelled-sales/view` (not redirected)
- `[data-testid="cancelled-sales-table"]` is in the DOM
- At least one row visible if test tenant has cancelled orders
- Each row shows: order number / amount / cancellation date / status badge "Cancelled"
- Sidebar link to Cancelled Sales is visible in navigation

**Required test IDs:**
- `data-testid="cancelled-sales-table"` — table container
- `data-testid="sidebar-cancelled-sales"` — sidebar nav link (confirms it's wired)

**Estimated complexity:** LOW (read-only list page)

---

### Journey 6.4 — Receipt fallback shows "Receipt unavailable" not fake receipt

**Actor:** `tenant_admin`
**Preconditions:** A sale exists whose `buildReceiptData` would return null/empty (e.g., items have been partially cleaned up, or a sale created without full item metadata)

**Steps:**
1. Navigate to `/dashboard/sales/$id` for a sale where receipt data would be missing
2. Click `[data-testid="print-receipt-button"]` or wait for receipt section to render
3. Observe receipt area

**Assertions:**
- If receipt data unavailable: `[data-testid="receipt-unavailable-message"]` is visible
- The text contains "unavailable" or "loading" — NOT a fake/blank printable receipt layout
- No phantom receipt card rendered with zeroed-out values

**Required test IDs:**
- `data-testid="print-receipt-button"]` — print button in detail
- `data-testid="receipt-unavailable-message"` — fallback text element

**Estimated complexity:** MEDIUM (requires finding or creating a sale with incomplete receipt data)

---

## Area 7: pos-checkout (P0)

**Routes:** `/dashboard/sales/create`, `/dashboard/sales/$id`
**Existing coverage:** `fixes-verification.spec.ts` does NOT cover the POS flow.
**Overlapping batch spec:** None covering POS creation.

---

### Journey 7.1 — Service-line package sale creates package_instances row with salesOrderId populated

**Actor:** `tenant_admin`
**Preconditions:**
- A service-linked package (membership/session pack) available in the catalog
- A `role=client` member in the test tenant

**Steps:**
1. Navigate to `/dashboard/sales/create`
2. Step 1: search and select a `role=client` member via `[data-testid="pos-member-search-input"]`
3. Step 2: select a package/service item from the catalog via `[data-testid="pos-catalog-item"]`
4. Step 3: review order summary
5. Step 4: select cash payment → click `[data-testid="pos-complete-sale-button"]`
6. Wait for `[data-testid="pos-sale-success-screen"]`
7. Note the sale ID from `[data-testid="pos-sale-success-id"]`
8. Navigate to `/dashboard/packages/view?tab=session-packs`
9. Search or filter for the package just created

**Assertions:**
- POS completes without error toast
- A `package_instances` row appears in Session Packs tab with a non-null `salesOrderId` matching the sale
- (API assertion) Network call `POST /rpc/packageInstances/...` returns a row where `salesOrderId` is not null/empty
- Status badge on the new package instance shows "Active" or "Pending"

**Required test IDs:**
- `data-testid="pos-member-search-input"`
- `data-testid="pos-catalog-item"` — clickable item in the catalog step
- `data-testid="pos-complete-sale-button"`
- `data-testid="pos-sale-success-screen"` — success/receipt screen
- `data-testid="pos-sale-success-id"` — sale ID text on success screen

**Estimated complexity:** MEDIUM (POS happy path; verifying `salesOrderId` requires inspecting the package row)

---

### Journey 7.2 — Selling to member with role != 'client' returns friendly toast (BAD_REQUEST)

**Actor:** `tenant_admin`
**Preconditions:**
- A member with `role = 'staff'` or `role = 'admin'` in the test tenant (the admin actor themselves qualifies)
- Phase 7.8 fix is deployed: `pos.service.ts` now returns a typed BAD_REQUEST for non-client members

**Steps:**
1. Navigate to `/dashboard/sales/create`
2. Step 1: search and select a staff/admin member (not a client) via `[data-testid="pos-member-search-input"]`
3. Add any item to cart
4. Attempt to complete the sale via `[data-testid="pos-complete-sale-button"]`

**Assertions:**
- A toast or inline error appears with a friendly message (e.g., "Sales can only be created for client members")
- The toast does NOT show a raw server error or stack trace
- The sale does NOT appear in `/dashboard/sales/view` (no orphan order created)
- POS form remains open / does not navigate away

**Required test IDs:**
- `data-testid="pos-member-search-input"`
- `data-testid="pos-complete-sale-button"`
- `data-testid="pos-error-toast"` — error toast container (or assert via `page.getByRole("alert")`)

**Estimated complexity:** LOW (the "bad" actor is the admin member themselves; no special seeding needed)

---

### Journey 7.3 — Installment plan POS path uses correct schedule (no drift)

**Actor:** `tenant_admin`
**Preconditions:**
- An installment plan configured in Settings with ≥ 2 installments
- A `role=client` member

**Steps:**
1. Navigate to `/dashboard/sales/create`
2. Select a client member
3. Select a service package that supports installment payment
4. Choose installment plan in payment step via `[data-testid="pos-payment-method-installment"]`
5. Select the plan from `[data-testid="pos-installment-plan-select"]`
6. Complete the sale
7. Navigate to `/dashboard/packages/installments/view` (or the Installments tab in packages)
8. Locate the newly created installments

**Assertions:**
- The number of installment rows matches the plan's `numInstallments`
- Due dates follow the plan's schedule (first due = today or immediate; subsequent = monthly cadence)
- Each installment's `salesOrderId` is populated (Phase 7.3 fix)
- No schedule drift: if plan says 6 installments, exactly 6 rows exist, not 5 or 7

**Required test IDs:**
- `data-testid="pos-payment-method-installment"` — installment radio/button in payment step
- `data-testid="pos-installment-plan-select"` — plan dropdown
- `data-testid="pos-complete-sale-button"`

**Estimated complexity:** MEDIUM (requires a configured installment plan; verifying schedule correctness requires checking row dates)

---

## Agent Notes

### For Audit Agent (AUDIT phase)

1. **Verify all `data-testid` attributes listed above actually exist** in the source files. As of 2026-05-12, a codebase-wide grep for `data-testid` in `apps/web/src/` (excluding test files) returned NO matches. This means the EXECUTE phase must add ALL required test IDs before writing the test code. The AUDIT agent should flag any test that references a `data-testid` that the EXECUTE agent has not yet added to the component.

2. **`packages/instances/view` is a redirect** — it uses `makeTabRedirect("/dashboard/packages/view", "session-packs")`. All package-lifecycle journeys must target `/dashboard/packages/view?tab=session-packs`, not the old route.

3. **Cancel Sale button is wired** — code inspection of `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx` confirms `CancelSaleDialog` and `useMutation` for `client.salesOrders.cancel` exist. The required test IDs need to be added to the JSX.

4. **Payouts page is fully implemented** (not a stub) — imports `PayoutsKpiStrip`, `PayoutsTable`, `RunBatchDrawer` from `@/features/payouts/`. The AUDIT agent should verify these feature components exist and are not themselves stubs.

5. **My Services page has the Assigned Packages tab** — imports `AssignedPackagesTable` from `@/features/my-services/components/assigned-packages-table`. Verify this component renders a real table or explicit empty state.

6. **Commission earn reason badge** — verify `earnReason` field is surfaced in the `AllCommissionsPage` component (`@/components/pages/commissions/all-tab`). If not, the EXECUTE phase must add a column.

7. **Seed data infrastructure recommendation** — journeys 2.1, 2.2, and 1.1 REQUIRE a `e2e/helpers/seed-data.ts` with functions:
   - `createTestMember(role: 'client' | 'staff')` → `{ memberId, cleanup }`
   - `createTestAppointment({ trainerId, clientId, serviceId, status })` → `{ appointmentId, cleanup }`
   - `cleanupTestUser(email)` — calls a test-only API or direct Neon branch write

   Without these, those journeys cannot run. They should be created in the EXECUTE phase before those spec files are written.

### Blockers

1. **No `data-testid` attributes exist** in production components. Every journey needs the EXECUTE agent to add them as the first sub-task before writing selectors.

2. **Commission-rule journeys (2.1, 2.2) require a seeded appointment** in a specific status. The test tenant's franchisee@gmail.com is an admin, not a trainer — there is no pre-seeded trainer member for E2E. Either: (a) use the admin member as the "trainer" via a direct DB seed, or (b) accept that these tests can only run in CI with a freshly seeded Neon branch.

3. **Receipt fallback test (6.4)** requires a sale with missing receipt data. This is hard to produce deterministically without a direct DB mutation. Recommend skipping in first pass and marking as P2.

4. **`runBatch` confirm journey (3.3)** requires approved commission splits. Without a completed appointment in the test tenant, there are no approved splits to batch. This is HIGH complexity and should be deferred until the commission-rule seeding infrastructure exists.

### Assumptions

1. The dev stack (`bun dev`) is running with real Neon DB connections for the test tenant during E2E runs.
2. The `auth.setup.ts` auth state file (`e2e/.auth/tenant-admin.json`) is generated before any journey spec runs.
3. The test tenant ("Test Fitness Franchise") has at least one hierarchy node, one service, one client member, and at least one confirmed sale already created — matching existing integration test setup documented in `memory/MEMORY.md`.
4. The EXECUTE phase will add `data-testid` attributes to all components before writing selectors — not after.
5. `packages/instances/view` redirect is permanent; the canonical route for session packs is `packages/view?tab=session-packs`.

---

## Achievable WITHOUT New Seed Helpers vs Requires Seeding

### Achievable without new seed helpers (run against existing test tenant data):
- **3.1** — Payouts KPI strip mounts
- **3.2** — Run Batch drawer opens
- **4.1** — Assigned Packages tab renders (empty state counts as pass)
- **5.1** — Cancel package instance (if active instances exist in tenant)
- **5.2** — Freeze/Unfreeze instance
- **5.3** — Extend instance
- **6.1** — Sales KPI shows Confirmed label
- **6.2** — Cancel Sale button (if confirmed sale exists)
- **6.3** — Cancelled Sales view is not a stub
- **7.2** — Non-client member toast (admin is the bad actor)

### Require seeding infrastructure to be reliable:
- **1.1** — Full onboarding submit (needs user cleanup)
- **2.1** — Cancel appointment → commission (needs seeded appointment)
- **2.2** — Complete appointment → commission (needs seeded appointment)
- **2.4** — Product sale → immediate commission (needs product with commission rule)
- **3.3** — Confirm payout creates row (needs approved splits)
- **4.2** — Assigned package drawer (needs assigned package instance)
- **7.1** — Package instance has salesOrderId (needs to inspect created row)
- **7.3** — Installment schedule correctness (needs installment plan configured in Settings)

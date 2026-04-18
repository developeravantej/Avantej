# Installment Premium — Chrome Test Runbook

**Feature plan:** `zplan/17-04_14-00_installment-premium/plan.md`
**Result log:** `zdocs/installment-premium_result.md`
**Stack touched:** schema + migration + service + routers + 2 web pages

---

## 0. Prerequisites (run ONCE before testing)

- [ ] **Apply dev DB schema**
  ```bash
  cd C:/Project/Avantej && bun db:push
  ```
  Confirms new `price_premium_bps` column is added to local combined dev DB.

- [ ] **Apply tenant migration** (for the test org "Test Fitness Franchise")
  ```bash
  cd C:/Project/Avantej/apps/server && bun run scripts/migrate-all-tenants.ts --filter=test-fitness-franchise --concurrency=1
  ```
  Expected output: `Migrated: 0017_installment_plans → 0018_installment_plan_premium` on the test tenant.

- [ ] **Dry-run verify no tenant left behind**
  ```bash
  cd C:/Project/Avantej/apps/server && bun run scripts/migrate-all-tenants.ts --dry-run
  ```
  All tenants should report `✅ up to date`.

- [ ] **Start dev servers**
  ```bash
  cd C:/Project/Avantej && bun dev
  ```
  Web on `:3001`, server on `:3000`.

- [ ] **Log in** as `franchisee@gmail.com` / `password123` on `localhost:3001`.

---

## 1. Settings — Configure a Premium (J1)

Page: `/dashboard/settings/installment-plans`

- [ ] New **Premium** column appears between "Default Interval (days)" and "Default" (star).
- [ ] Initial state: all 3 seeded rows (full / half / quarterly) show `—` (no premium).
- [ ] Click **Edit** on the `half` row.
- [ ] In the sheet, a **Price Premium (%)** input field is visible after the "Installments / Interval" grid, before "Description".
- [ ] Field currently shows `0`.
- [ ] Change to `10`, click **Save Changes**.
- [ ] Toast: "Installment plan updated successfully."
- [ ] Sheet closes.
- [ ] **Premium** column for `half` now reads `10.00%`.
- [ ] Hard refresh (Ctrl+F5). Value persists: `10.00%`.
- [ ] Re-open edit sheet on `half`. Field reads `10`.

### Validation Edge Cases

> The Premium input uses HTML5 native validation (`min="0" max="100" step="0.01"`), so out-of-range values are blocked at the browser level with a native tooltip ("Value must be greater than or equal to 0.") before the submit handler fires. No custom toast is emitted. Functional correctness is equivalent; only the error-surface differs.

- [ ] Edit a plan, enter `-5` in Premium → submit is blocked; browser native tooltip appears; `installmentPlans/update` is NOT called.
- [ ] Edit a plan, enter `150` in Premium → submit blocked; native tooltip.
- [ ] Edit a plan, enter `abc` in Premium → input rejects non-numeric (field value stays empty or last valid); submit blocked.
- [ ] Edit a plan, enter `10.5` (decimal) → saves successfully → column reads `10.50%`.
- [ ] Edit a plan, clear the field (empty) → treated as `0` → column reads `—`.

### Create-New Flow

- [ ] Click **Add Plan**. Sheet opens with Premium field showing `0`.
- [ ] Fill code `test_premium`, name `Test (+15%)`, installments `3`, interval `30`, **premium `15`**, submit.
- [ ] New row appears in table with `15.00%` in the Premium column.
- [ ] Cleanup: deactivate `test_premium` when done.

---

## 2. Assign Package — Apply Premium (J2)

Page: `/dashboard/packages/instances/view`

**Prerequisite:** Step 1 complete — `half` plan has 10% premium.

- [ ] Click **Assign Package** (top-right).
- [ ] Sheet opens. A new **Installment Plan** select appears between "Source" and "Credits (Sessions)".
- [ ] Default value: `Full payment (no installments)`.
- [ ] Open the dropdown — confirm options include `Full payment (no installments)`, `Half (2 installments) (+10.0%)`, `Quarterly (4 installments)` (no suffix if 0%).
- [ ] Fill form:
  - Package: any package (e.g. "Test Fitness Package" — sessionCount > 0)
  - Client ID: a known client UUID (copy from Dashboard → Customers → Members)
  - Source: `Assigned (by staff)`
  - **Installment Plan: `Half (2 installments) (+10.0%)`**
  - Credits: `10`
  - Start Date: today
  - Expiry Date: today + 3 months
  - **Total Price (RM): `500`**
  - Payment Status: Pending
- [ ] Under the price input, confirm breakdown paragraph reads:
  > Base RM 500.00 + 10.0% premium = RM 550.00 → 2 × RM 275.00 every 30 days
- [ ] Click **Assign Package**.
- [ ] Toast: "Package assigned successfully."
- [ ] Sheet closes. New row appears at the top of the table.
- [ ] **Total (MYR)** column for the new row reads **RM 550.00** (NOT 500).

### Verify Installments (open dev tools Network tab OR Drizzle Studio)

- [ ] Network tab: find `/rpc/installments/listForPackageInstance` or call it manually via the app.
- [ ] Confirm 2 installment rows:
  - Amount: `27500` cents each (= RM 275.00)
  - Due dates: 30 days apart starting from "now"
  - Status: `pending`

### Edge Cases

- [ ] **No plan selected** (default "Full payment"): assign with price `500` → no breakdown shown → `Total (MYR)` = RM 500.00. No installment rows created.
- [ ] **Quarterly plan** (0% premium untouched): assign with price `400` → breakdown reads `Base RM 400.00 → 4 × RM 100.00 every 30 days` (NO premium phrase since pct = 0).
- [ ] **Empty price + plan selected**: breakdown paragraph does NOT render (gated on `baseRm > 0`).
- [ ] **Very small price** (RM `1.00` with half 10%): breakdown reads `RM 1.00 + 10.0% premium = RM 1.10 → 2 × RM 0.55 every 30 days`. Server: rounding — 110 cents split → first installment 56 cents, second 55 cents (remainder absorbed by #1 per `calculateInstallmentAmounts`).
- [ ] **Switch plans mid-form**: choose `half`, see premium; switch back to `Full payment (no installments)` → breakdown disappears, price reverts to entered value.

---

## 3. Regression Checks

### Deactivate Plan Flow (unchanged behavior)

- [ ] On `/dashboard/settings/installment-plans`, click **Deactivate** on a plan.
- [ ] Confirmation dialog opens with existing warning about services referencing the plan code.
- [ ] Cancel works. Confirm works. Plan becomes inactive. Existing package_instances rows are untouched.

### Set-Default Star (unchanged)

- [ ] Click the star icon on a non-default active plan.
- [ ] Toast: "Default installment plan updated."
- [ ] The newly-defaulted row's star fills; the previous default's star unfills.

### Historical Package Instances Untouched

- [ ] Navigate to `/dashboard/packages/instances/view`.
- [ ] Sort by `Starts` or `Created` ascending — find a package_instance created BEFORE today.
- [ ] Its `Total (MYR)` is unchanged from original (no retroactive premium).

### Full-Payment Flow (pre-existing, no plan)

- [ ] Assign a package without picking a plan → stored `total_price` equals entered amount exactly → no installment schedule.

### Service Form (out of scope but sanity check)

- [ ] On `/dashboard/services/view`, edit any service.
- [ ] "Available Payment Plans" checkbox list still loads from `client.installmentPlans.list`.
- [ ] Save any change → no errors. The feature did not break this surface.

---

## 4. Cleanup After Testing

- [ ] Revert `half` premium back to `0` (edit → premium `0` → save) if you want to leave the tenant in clean state.
- [ ] Deactivate any test plans you created (e.g. `test_premium`).
- [ ] Delete any temporary `package_instances` rows you assigned (optional — they'll age out).

---

## 5. Report Bugs Found

If any step above fails, capture:
- URL + step number
- Expected vs actual behavior
- Browser console errors
- Network tab response for the failing RPC

Append findings to `zdocs/installment-premium_test-results.md` (create if missing).

---

## 6. Definition of Done

- [ ] All checkboxes in §1, §2, §3 tick green.
- [ ] No console errors during any flow.
- [ ] No 4xx/5xx responses on the golden paths.
- [ ] Historical data intact.

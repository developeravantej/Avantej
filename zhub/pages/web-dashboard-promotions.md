# Promotions

**Route:** `/dashboard/promotions/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/promotions/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Create and manage discount codes/promotions — set type, value, validity window, usage limits.
**Produces:** Promotion table + Create/Edit sheets + Deactivate confirmation dialog.
**On success:** Promotions rendered; create/edit/deactivate mutations succeed with toast + query refresh.
**On failure / error states:** Loading spinner; error UI with retry button; "Select an organization" prompt if no org.

---

## 2. How It Works

**Execution flow:** Mount → get organizationId from useUserContext → query client.promotions.list() → map to PromotionRow shape → render table → open Create sheet (Add button) or Edit sheet (table action) → submit form → mutation call → cache refresh
**Inputs:** organizationId (from session); form state for create/edit
**State management:** TanStack Query `["promotions", organizationId]`; local sheet/dialog/form states; three mutations (create, update, deactivate)
**Outputs:** DataTable<PromotionRow> + CreateSheet (form) + EditSheet + DeactivateDialog
**Side effects:** On create/update/deactivate success: invalidate promotions query + toast; form reset on close

---

## 3. What Depends On It

**Calls these API endpoints:**
  - `client.promotions.list({ organizationId })` — fetches promotions
  - `client.promotions.create({ organizationId, code, name, type, value (basis points), minimumOrderAmount?, usageLimit?, perCustomerLimit?, validFrom, validUntil? })` — creates promotion
  - `client.promotions.update({ organizationId, id, name?, description?, validFrom, validUntil? })` — updates (code/type immutable)
  - `client.promotions.deactivate({ organizationId, id })` — deactivates (soft delete)
**Uses these components:** UI primitives (Sheet, Dialog, Button, Input, Select, etc.) + CopyableCell, StatusBadge, Badge
**Uses these hooks:** useUserContext, useQuery, useMutation, useState
**Navigation: who navigates here:** Dashboard sidebar link
**Navigation: where it goes:** None

---

## 4. Data Shapes

**DB tables touched:** tenantDb: promotions (R/W)
**Key types / Zod schemas:**
  - PromotionType: "percentage" | "fixed_amount" | "free_item" | "buy_x_get_y"
  - PromotionRow: `{ id, code, name, description, type, value (basis points), minimumOrderAmount?, maximumDiscount?, usageLimit?, usageCount, perCustomerLimit?, validFrom, validUntil?, isActive, branchId?, createdAt }`
  - CreateFormState: code, name, description, type, value (string input), minimumOrderAmount, usageLimit, perCustomerLimit, validFrom, validUntil
  - EditFormState: name, description, validFrom, validUntil (subset of create)
  - Value storage: percentage and fixed_amount stored as basis points (×100); displayed as decimal user input

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
  - Code validation (regex + trimming; client-side only)
  - Value validation (type-dependent range checks; no server-side schema visible)
  - Datetime round-trip (toIsoDatetime/toDatetimeLocal; browser timezone handling)
  - Concurrent create/edit conflicts
  - Usage tracking (display-only; mutation-based, no real-time sync)
  - Expired vs active filtering (none; all shown)

---

## 6. Notes

- Code auto-uppercased on input + in submit
- Value is user-entered decimal (e.g., 20 for 20%) → stored as basis points (2000) via Math.round(×100)
- validUntil is optional; "No expiry" shown if null
- Edit modal only allows name/description/validity dates; code and type locked
- Deactivate is soft-delete (isActive flag); no hard delete
- Form validation inline (client-side; toasts for errors)
- Date conversion: datetime-local → ISO 8601 for API; ISO 8601 → datetime-local for form display

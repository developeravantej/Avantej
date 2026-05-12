# Promotions View

**Route:** `/dashboard/promotions/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/promotions/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Manage discount codes and promotional offers for checkout — create new promotions, edit validity windows, and deactivate expired or unwanted codes.
**Produces:** A table of all promotions with code, name, type, discount value, validity period, usage count, and active status; plus a "New Promotion" sheet and an "Edit Promotion" sheet.
**On success:**
- Create: toast "Promotion created successfully.", sheet closes, table refreshes.
- Edit: toast "Promotion updated successfully.", sheet closes, table refreshes.
- Deactivate: toast "Promotion deactivated.", table refreshes.
**On failure / error states:**
- No organization: "Select an organization to view promotions."
- Loading: centered spinner.
- API error: destructive message with "Try Again" button.
- Empty: "No promotions created yet" empty state.

---

## 2. How It Works

**Execution flow:**
```
PromotionsViewPage
  → useUserContext() → organizationId
  → useQuery(["promotions", organizationId])
      → client.promotions.list({ organizationId })
        → promotionsRouter.list → requirePermission("promotion_management", "read")
        → listPromotions(tenantDb, {})

  → createPromotion mutation → client.promotions.create(...)
      → requirePermission("promotion_management", "create")
      → createPromotion(tenantDb, { code, name, type, value, validFrom, ... })

  → updatePromotion mutation → client.promotions.update(...)
      → requirePermission("promotion_management", "update")
      → updatePromotion(tenantDb, id, { name, description, validFrom, validUntil })

  → deactivatePromotion mutation → client.promotions.deactivate({ organizationId, id })
      → requirePermission("promotion_management", "delete")
      → deactivatePromotion(tenantDb, id)
```

**Inputs (create form):** Code (alphanumeric/hyphen/underscore, ≥3 chars, auto-uppercased), Name, Description, Type (percentage / fixed_amount / free_item / buy_x_get_y), Value (decimal → stored as basis points ×100), Minimum Order Amount (RM), Usage Limit, Per Customer Limit, Valid From (datetime-local), Valid Until (datetime-local).
**Inputs (edit form):** Name, Description, Valid From, Valid Until — code and type are immutable after creation.
**State management:**
- `createOpen`, `editOpen`, `editTarget`, `deactivateTarget` — sheet/dialog visibility.
- `createForm`, `editForm` — controlled form state.
- TanStack Query cache keyed on `["promotions", organizationId]`.
**Outputs:** Table with columns: Code (copyable), Name, Type (badge), Value (formatted), Valid From, Valid Until, Usage (count/limit), Status (Active/Inactive badge), Actions (Edit / Deactivate buttons).
**Side effects:** `queryClient.invalidateQueries(["promotions", organizationId])` on all mutation success.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `promotions.list` — read all promotions; requires `promotion_management:read`.
- `promotions.create` — create promotion; requires `promotion_management:create`.
- `promotions.update` — update name/description/validity; requires `promotion_management:update`.
- `promotions.deactivate` — soft-deactivate; requires `promotion_management:delete`.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table wrapper.
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — click-to-copy promo code.
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter` — `apps/web/src/components/ui/sheet.tsx`.
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` — `apps/web/src/components/ui/dialog.tsx` — deactivation confirmation.
- `Badge`, `Button`, `Input`, `Textarea`, `Select`, `Separator` — UI primitives.

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`.
- `useQuery`, `useMutation`, `useQueryClient` (TanStack Query).

**Navigation: who navigates here:** Sidebar "Sales & Inventory → Sales → Promotions" link (`apps/web/src/components/app-sidebar.tsx:159`).
**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `promotions` | SELECT / INSERT / UPDATE | `id`, `code`, `name`, `description`, `type`, `value`, `minimumOrderAmount`, `maximumDiscount`, `usageLimit`, `usageCount`, `perCustomerLimit`, `validFrom`, `validUntil`, `isActive`, `branchId`, `createdAt` |

**Key types:**
```typescript
type PromotionType = "percentage" | "fixed_amount" | "free_item" | "buy_x_get_y";
// value stored as integer basis points (e.g. 2000 = 20% or RM 20.00)
interface PromotionRow {
  id: string; code: string; name: string; description: string | null;
  type: PromotionType; value: number; // basis points
  minimumOrderAmount: number | null; maximumDiscount: number | null;
  usageLimit: number | null; usageCount: number;
  perCustomerLimit: number | null;
  validFrom: string; validUntil: string | null;
  isActive: boolean; branchId: string | null; createdAt: string;
}
// Edit is restricted to: name, description, validFrom, validUntil only
```

---

## 5. Tests

**Test files:**
- `apps/server/src/tests/unit/services/promotions.test.ts` — service-layer unit tests.
- `apps/server/src/tests/integration/promotions.integration.test.ts` — integration tests against real DB.

**Scenarios covered:** `listPromotions` (results, empty), `createPromotion`, `updatePromotion`, `validatePromoCode`, `applyPromotion`, `deactivatePromotion` at the service layer.
**Not tested:** Frontend form validation (code format, date ordering), client-side value encoding (decimal → basis points), deactivation confirmation dialog.

---

## 6. Notes

- Promo code is forced to uppercase on input and before submission; it must match `/^[A-Z0-9_-]+$/i`.
- For both `percentage` and `fixed_amount` types, the user enters a decimal (e.g. `20` for 20% or RM 20.00) which is multiplied by 100 before submission: `storedValue = Math.round(rawValue * 100)`.
- `formatPromotionValue` divides by 100 before displaying: `percentage` → `(value/100).toFixed(2)%`; `fixed_amount` → `formatPrice(value, "MYR")` (which also divides by 100 internally — verify no double-division).
- Edit form only allows changing name, description, and validity window — code, type, and value are immutable by design (server enforces this).
- Deactivation requires a two-step confirmation dialog before calling the API.

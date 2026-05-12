# Suppliers

**Route:** `/dashboard/suppliers/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/suppliers/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lets admins manage product suppliers — view, add, edit, deactivate, and filter by active status.
**Produces:** A paginated, searchable table of suppliers with dialogs for create/edit/details/deactivate-confirm.
**On success:** Toast notification and cache invalidated.
**On failure / error states:** Spinner while loading; "Select an organization" prompt; error panel with "Try Again" button on fetch failure; toast errors on mutation failure.

---

## 2. How It Works

**Execution flow:**
```
SuppliersViewPage
  → useUserContext() → organizationId
  → activeFilter state (true | undefined | false)
  → useQuery([...orpc.suppliers.list.key(), { organizationId, isActive: activeFilter }])
      → client.suppliers.list({ organizationId, isActive: activeFilter })
  → maps API data → SupplierRow[]
  → DataTable (suppliers/view/data-table)
      → SupplierFormDialog (create) → createMutation → client.suppliers.create
      → SupplierFormDialog (edit) → updateMutation → client.suppliers.update
      → SupplierDetailsDialog (view details, read-only)
      → deactivate confirm Dialog → deactivateMutation → client.suppliers.deactivate
```

**Inputs:** Active/All/Inactive filter tabs. Mutations receive `SupplierFormData`.
**State management:** `useState` for `activeFilter`; TanStack Query for server state using `orpc.suppliers.list.key()` for cache key.
**Outputs:** Table render with pagination and name filter; three dialogs (add, edit, details); deactivate confirmation dialog.
**Side effects:** All mutations invalidate `[...orpc.suppliers.list.key(), { organizationId }]`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `suppliers.list` — filtered by `isActive`
- `suppliers.create` — new supplier
- `suppliers.update` — edit supplier fields
- `suppliers.deactivate` — soft-delete

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/suppliers/view/data-table.tsx` — table with all dialogs embedded
- `SupplierFormDialog` — `apps/web/src/components/forms/supplier-form.tsx` — create/edit form
- `SupplierDetailsDialog` — `apps/web/src/components/dialogs/supplier-details-dialog.tsx` — read-only detail view
- `Badge` — supplier count display
- `Building2` icon — `lucide-react`

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`
- `useQuery`, `useMutation`, `useQueryClient`
- `useState`

**Navigation: who navigates here:**
- App sidebar → Inventory section → "Suppliers" link

**Navigation: where it goes:** Stays on this page; dialogs are modal overlays.

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `suppliers` | SELECT | `id`, `name`, `description`, `accountNumber`, `paymentTerms`, `contactPerson`, `contactPhone`, `officePhone`, `email`, `website`, `barcode`, `isActive`, `createdAt`, `updatedAt` |
| `suppliers` | INSERT | all above fields |
| `suppliers` | UPDATE | all mutable fields |
| `suppliers` | UPDATE | `isActive = false` (deactivate) |

**Key types:**
```ts
type SupplierRow = {
  id: string; name: string; description: string | null;
  accountNumber: string | null; paymentTerms: string | null;
  contactPerson: string | null; contactPhone: string | null;
  officePhone: string | null; email: string | null;
  website: string | null; barcode: string | null;
  isActive: boolean; createdAt: string | null; updatedAt: string | null;
};
```

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/suppliers.test.tsx`

**Scenarios covered:**
- Renders without crashing (heading visible)
- `client.suppliers.list` called on mount
- Supplier name displayed in table
- "Add Supplier" button visible

**Not tested:** Create/edit/deactivate flows, filter tabs (Active/All/Inactive), error state, details dialog.

---

## 6. Notes

- The `orpc.suppliers.list.key()` helper is used for the query key instead of a plain string, which is different from most other pages that use plain string arrays.
- The DataTable component handles all dialog state internally; the page only passes mutation callbacks and loading flags.
- The "All" filter tab passes `isActive: undefined` (not filtered), while "Active" passes `true` and "Inactive" passes `false`.
- `isDeactivating` is tracked in the DataTable for the confirmation dialog button state but the page-level mutation does not show a toast on success — toast is inside the DataTable's `handleDeactivateConfirm`.

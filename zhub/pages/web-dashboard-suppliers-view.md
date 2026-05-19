# Suppliers (Redirect)

**Route:** `/dashboard/suppliers/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/suppliers/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Legacy route. Visiting it redirects to the consolidated Inventory Options page on the Suppliers tab.

**Produces:** Nothing — `beforeLoad` throws a TanStack Router `redirect()` to `/dashboard/inventory-options?tab=suppliers`.

**On success:** User lands on `InventoryOptionsPage` with the Suppliers tab active.

**On failure / error states:** N/A — pure redirect.

---

## 2. How It Works

**Execution flow:**
```
Route.beforeLoad
  → makeTabRedirect("/dashboard/inventory-options", "suppliers")()
  → throw redirect({ to, search: { tab: "suppliers" } })
```

`makeTabRedirect` is defined in `apps/web/src/lib/tab-redirect.ts`:

```typescript
export function makeTabRedirect(to: string, tab: string) {
  return () => { throw redirect({ to, search: { tab } }); };
}
```

The redirect target renders `InventoryOptionsDashboard` (`apps/web/src/components/merge-tables/inventory-options-dashboard.tsx`), which is a `ConsolidatedTabs` host for three tabs:
- `brands` → `BrandsTabPage`
- `categories` → `CategoriesTabPage`
- `suppliers` → `SuppliersTabPage` (in `apps/web/src/components/pages/inventory/suppliers-tab.tsx`)

`SuppliersTabPage` is the real implementation: query (`orpc.suppliers.list.key()`), Active/All/Inactive filter, `DataTable` with create/edit/details dialogs and deactivate confirm.

**Inputs:** None at the route — the redirect is unconditional.

**State management:** None at this route.

**Outputs:** Browser navigation only.

**Side effects:** None.

---

## 3. What Depends On It

**Calls these API endpoints:** None at the route layer.

**Uses these components:** None — only `createFileRoute` and `makeTabRedirect`.

**Uses these hooks:** None.

**Navigation: who navigates here:**
- Legacy sidebar / bookmark links that still point to `/dashboard/suppliers/view`.
- The current `app-sidebar.tsx` "Suppliers" entry points directly to `/dashboard/inventory-options?tab=suppliers`, so this route is largely dormant.

**Navigation: where it goes:**
- `/dashboard/inventory-options?tab=suppliers` (always).

---

## 4. Data Shapes

Not a data page. See `web-dashboard-inventory-options.md` (or the source at `apps/web/src/components/pages/inventory/suppliers-tab.tsx`) for `SupplierRow` shape and the `suppliers.{list,create,update,deactivate}` procedures.

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/suppliers.test.tsx` (predates the consolidation — assertions target the standalone page that no longer exists; may need to be retargeted to `SuppliersTabPage` or removed).

**Not tested (risk areas):**
- Redirect behaviour itself (no test asserts `beforeLoad` redirects).
- Supplier-invoice workflows — these have moved entirely (see below) and are not covered by this route's tests.

---

## 6. Notes

- **Why this route still exists:** Kept as a thin redirect for backwards compatibility with bookmarks and any unmigrated deep links. The real Suppliers UI now lives inside `inventory-options` alongside Brands and Categories.
- **Supplier-invoice intake moved**: Anything related to recording, matching, and paying supplier invoices is no longer here. It now lives in the Purchase Orders feature as the "Supplier Invoices" tab — see `apps/web/src/features/purchase-orders/components/SupplierInvoicesTab.tsx`. The relevant page doc is [`web-dashboard-purchase-orders.md`](./web-dashboard-purchase-orders.md).
- **No DB tables touched here.** The redirect cascade is purely client-side router state.
- **If you need to deprecate the redirect**, search for inbound links via `Grep "suppliers/view"` before removing the route file.

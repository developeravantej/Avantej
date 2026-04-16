# UoM Conversions

**Route:** `/dashboard/uom-conversions/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/uom-conversions/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Manage unit-of-measure (UoM) conversion definitions — UoMs that are derived from a base UoM with a numeric conversion factor (e.g. "Gram = 0.001 Kilogram").

**Produces:** A filterable, paginated table of derived UoMs with columns for Name, Base UoM, Conversion Factor, and Description. Includes "Add Conversion" button and row-level Edit / Delete actions via dropdown.

**On success:**
- Create: dialog closes, success toast, table refreshes.
- Update: edit dialog closes, success toast, table refreshes.
- Delete: success toast, table refreshes.

**On failure / error states:**
- No `organizationId`: centered placeholder "Select an organization to view UoM conversions."
- Loading: centered spinner.
- Query error: error message with a "Try Again" button that calls `refetch()`.
- Mutation error: toast with the error message.
- Client-side validation errors in dialogs (empty name, no base UoM selected, factor ≤ 0) show toast before calling the API.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useQuery(["unitsOfMeasure", orgId])
      → client.unitsOfMeasure.list({ organizationId })
          → unitsOfMeasureRouter.list (packages/api/src/routers/units-of-measure.ts)
              → requirePermission(tenantDb, member, "inventory", "read")
              → listUnitsOfMeasure(tenantDb) (packages/services/src/units-of-measure.service.ts)
                  → SELECT * FROM units_of_measure ORDER BY name
  → allUoms split into conversions (baseUomId !== null) and baseUoms (baseUomId === null)
  → DataTable renders conversions; baseUoms populate the "Base UoM" selector in dialogs

Mutations follow the same router chain with "create" / "update" / "delete" permissions.
```

**Inputs:**
- `organizationId` from `useUserContext()` (not a URL param)
- Create form fields: name (required), base UoM selector (required), conversion factor > 0 (required), description (optional)
- Edit form fields: same as create, pre-populated from the selected row

**State management:**
- `useQuery` / `useMutation` via TanStack Query; cache key `["unitsOfMeasure", organizationId]`
- Local React state: `isAddDialogOpen`, `editTarget` (holds the row being edited)
- Dialog form state is managed inside `DataTable` component (not lifted to the page)

**Outputs:** Renders table with inline dialogs; invalidates `["unitsOfMeasure", orgId]` on any mutation.

**Side effects:** None beyond cache invalidation and toast notifications.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `unitsOfMeasure.list` — fetch all UoMs for the org (both base and derived)
- `unitsOfMeasure.create` — create a new conversion UoM
- `unitsOfMeasure.update` — update name/description/baseUomId/conversionFactor
- `unitsOfMeasure.delete` — hard-delete a conversion

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/uom-conversions/view/data-table.tsx` — table + create/edit dialogs
- `columns` — `apps/web/src/components/tables/uom-conversions/view/columns.tsx` — column definitions with actions dropdown
- `Button` — `apps/web/src/components/ui/button.tsx` — "Try Again" button on error state

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useQuery` — fetches UoM list
- `useMutation` (×3) — create, update, delete
- `useQueryClient` — cache invalidation

**Navigation: who navigates here:**
- App sidebar (`apps/web/src/components/app-sidebar.tsx:174`) under the Inventory section — link titled "UoM Conversions"
- `apps/web/src/components/merge-tables/unit-of-measure-dashboard.tsx` — dashboard widget links here

**Navigation: where it goes:** This page has no outbound navigation; all actions are in-page dialogs.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `units_of_measure` | SELECT | `id`, `name`, `description`, `base_uom_id`, `conversion_factor`, `created_at`, `updated_at` |
| `units_of_measure` | INSERT | `name`, `description`, `base_uom_id`, `conversion_factor` |
| `units_of_measure` | UPDATE | `name`, `description`, `base_uom_id`, `conversion_factor`, `updated_at` |
| `units_of_measure` | DELETE | `id` |

**Key types / Zod schemas:**

`UomConversionRow` (from `columns.tsx`):
```ts
{
  id: string;
  name: string;
  description: string | null;
  baseUomId: string | null;
  conversionFactor: string;   // numeric as string (precision 12, scale 4)
  createdAt: Date;
  updatedAt: Date;
}
```

DB schema (`packages/db/src/schema/tenant/units-of-measure.ts`):
- Self-referential FK: `base_uom_id` → `units_of_measure.id` with `ON DELETE RESTRICT`
- `conversion_factor`: `numeric(12, 4)` stored as string, default `"1"`
- Unique constraint on `name`

---

## 5. Tests

**Test files:** None found.

**Not tested:** Create/update/delete mutations, client-side validation logic, loading/error/empty states, permission enforcement.

---

## 6. Notes

- The page fetches ALL UoMs (base + derived) with a single `unitsOfMeasure.list` call and splits them client-side. Base UoMs (those with `baseUomId === null`) are only used to populate the "Base UoM" dropdown in create/edit forms; only derived UoMs are shown in the table.
- `conversionFactor` is stored as a numeric string. The columns file converts to `Number` and calls `.toFixed(4)` for display.
- The `unitsOfMeasure.delete` endpoint uses a hard delete. The DB enforces `ON DELETE RESTRICT` on the self-referential FK, so deleting a base UoM that has derived UoMs referencing it will fail at the database level — this error surfaces as a toast.
- Permission required: `inventory.read` to view; `inventory.create/update/delete` for mutations.
- Route is listed in `apps/web/src/lib/route-config.ts` — but no `requiredPermissions` entry exists for it (only `user/view` and others are configured there). Permission enforcement is handled at the API layer.

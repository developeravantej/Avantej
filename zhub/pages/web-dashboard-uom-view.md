# Units of Measure

**Route:** `/dashboard/uom/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/uom/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lets admins define, edit, and delete Units of Measure (UoM) used for product inventory (e.g., Piece, Kilogram).
**Produces:** A paginated, filterable table of base UoMs with inline dialogs for add, edit, and delete confirmation.
**On success:** Toast notification and query cache invalidated.
**On failure / error states:** Spinner while loading; "Select an organization" prompt; error panel with "Try Again" button; toast errors on mutation failure; validation (name required) before create/update.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId
  → useQuery(["unitsOfMeasure", organizationId])
      → client.unitsOfMeasure.list({ organizationId })
  → filter: baseUoms = allUoms.filter(u => !u.baseUomId) [only top-level UoMs shown]
  → DataTable (uom/view/data-table)
      → Add dialog → createMutation → client.unitsOfMeasure.create(...)
      → Edit dialog → updateMutation → client.unitsOfMeasure.update(...)
      → Delete confirm dialog → deleteMutation → client.unitsOfMeasure.delete(...)
```

**Inputs:** No URL params. Create/Edit form fields: name (required), description (optional textarea).
**State management:** `useState` for `isAddDialogOpen` and `editTarget`. TanStack Query for server state. DataTable manages its own filter/sort/pagination state.
**Outputs:** Renders table; "Add UoM" button; dialogs for CRUD. Page passes callbacks down; DataTable owns dialog state.
**Side effects:** All mutations invalidate `["unitsOfMeasure", organizationId]`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `unitsOfMeasure.list` — all UoMs for org
- `unitsOfMeasure.create` — new base UoM
- `unitsOfMeasure.update` — rename/re-describe
- `unitsOfMeasure.delete` — hard delete

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/uom/view/data-table.tsx` — table with embedded add/edit/delete dialogs
- `columns` — `apps/web/src/components/tables/uom/view/columns.tsx` — column definitions

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`
- `useQuery`, `useMutation`, `useQueryClient`
- `useState`

**Navigation: who navigates here:**
- App sidebar → Inventory section → "Unit of Measure" link

**Navigation: where it goes:** Stays on this page.

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `units_of_measure` | SELECT | `id`, `name`, `description`, `baseUomId`, `conversionFactor`, `createdAt`, `updatedAt` |
| `units_of_measure` | INSERT | `organizationId`, `name`, `description` |
| `units_of_measure` | UPDATE | `name`, `description` |
| `units_of_measure` | DELETE | `id` |

**Key types:**
```ts
type UomRow = { id: string; name: string; description?: string | null; baseUomId?: string | null; conversionFactor?: string; };
```

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/uom.test.tsx`

**Scenarios covered:**
- Renders without crashing (empty state, "Add UoM" button visible)
- `client.unitsOfMeasure.list` called on mount
- UoM data (name) shown in table when resolved

**Not tested:** Create, edit, delete flows; dialog open/close; validation; error state; filtering; pagination.

---

## 6. Notes

- Only base UoMs (where `baseUomId` is null) are displayed in the table. Child UoMs (conversion-based) are filtered out client-side before passing data to the table.
- Delete is a hard delete (not soft-delete) — the procedure is `client.unitsOfMeasure.delete`.
- The `DataTable` component fully manages dialog open/close state internally via the `meta` object passed to `useReactTable`; the page only controls `isAddDialogOpen` and `editTarget` which are passed as props.
- The route component is named `RouteComponent` (generic name) rather than a descriptive name.

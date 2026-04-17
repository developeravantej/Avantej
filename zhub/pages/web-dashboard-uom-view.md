# Units of Measure

**Route:** `/_authenticated/dashboard/_layout/uom/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/uom/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (server requires `inventory:read/create/update/delete`)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Manage base units of measure (e.g., Kilogram, Litre, Each) used to define product quantities and inventory tracking.
**Produces:** A page with a header (Ruler icon, "Units of Measure" title, "Manage base units of measure for products." subtitle, and Separator), followed by a data table of base UoMs (those without a `baseUomId`) with inline add/edit/delete actions. Content is wrapped in `div.p-6.space-y-6`.
**On success:** Create/update/delete each invalidate the UoM query and show a sonner toast.
**On failure / error states:** "Select an organization" prompt if no org. Spinner while loading. Error state with "Try Again" button on fetch failure.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → currentOrganizationId
  → useQuery(["unitsOfMeasure", orgId])
      → client.unitsOfMeasure.list({ organizationId })
          → unitsOfMeasureRouter.list
              → requirePermission(tenantDb, member, "inventory", "read")
              → listUnitsOfMeasure(tenantDb)
  → baseUoms = allUoms.filter(u => !u.baseUomId)
  → DataTable (columns, baseUoms, ...)

  createMutation → client.unitsOfMeasure.create({ organizationId, name, description })
  updateMutation → client.unitsOfMeasure.update({ organizationId, id, name, description })
  deleteMutation → client.unitsOfMeasure.delete({ organizationId, id })
  [all invalidate ["unitsOfMeasure", orgId] on success]
```

**Inputs:** No URL/query params. `isAddDialogOpen` and `editTarget` state passed down to `DataTable`.

**State management:**
- `isAddDialogOpen` — controls add dialog in DataTable
- `editTarget` — `{ id, name, description }` or null; controls edit dialog

**Outputs:** `DataTable` from `apps/web/src/components/tables/uom/view/data-table.tsx`. Mutations invalidate `["unitsOfMeasure", orgId]`.
**Side effects:** None beyond DB writes.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `unitsOfMeasure.list` — fetch all UoMs (base + conversions)
- `unitsOfMeasure.create` — create base UoM (no `baseUomId`)
- `unitsOfMeasure.update` — update name/description
- `unitsOfMeasure.delete` — delete UoM

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/uom/view/data-table.tsx`
- `columns` — `apps/web/src/components/tables/uom/view/columns.tsx`

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`
- `useQueryClient` — cache invalidation

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — Sales & Inventory → Inventory → "Unit of Measure"

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `units_of_measure` (tenant) | SELECT, INSERT, UPDATE, DELETE | `id`, `name`, `description`, `baseUomId`, `conversionFactor` |

**Key type (UoM record):**
```typescript
{
  id: string;
  name: string;
  description: string | null;
  baseUomId: string | null;       // null for base UoMs
  conversionFactor: string | null; // null for base UoMs
  createdAt: Date;
  updatedAt: Date;
}
```

**Form fields (Add/Edit dialog in DataTable):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| name | text | required (min 1) | `unitsOfMeasure.create/update.name` |
| description | text | optional | `unitsOfMeasure.create/update.description` |

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/uom.test.tsx`
**Scenarios covered:**
- Renders without crashing (empty state, "Add UoM" button visible)
- `client.unitsOfMeasure.list` is called on mount
- Shows UoM name in table when data returned

**Not tested (risk areas):**
- Create/update/delete mutations
- Error state with "Try Again" button
- Filtering base UoMs from derived UoMs (this page shows only base UoMs; uom-conversions page shows derived)

---

## 6. Notes

- This page and `uom-conversions/view` share the same query key `["unitsOfMeasure", orgId]` and the same `client.unitsOfMeasure.list` call. They split the same data client-side: base UoMs (`!u.baseUomId`) here, derived UoMs (`u.baseUomId !== null`) on the conversions page. Mutations on either page invalidate the shared cache.
- Page now includes a styled header with `Ruler` icon from lucide-react, title, subtitle, and a `Separator` before the data table.
- `conversionFactor` is stored as a `string` (not a number) in the schema to preserve decimal precision.
- Deleting a base UoM may leave dangling references in conversion UoMs if the server does not enforce a FK cascade — check `units_of_measure` schema for cascade rules.

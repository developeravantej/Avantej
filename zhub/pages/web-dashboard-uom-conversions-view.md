# UoM Conversions

**Route:** `/_authenticated/dashboard/_layout/uom-conversions/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/uom-conversions/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (server requires `inventory:read/create/update/delete`)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Manage unit-of-measure conversion records — derived UoMs that express a ratio to a base UoM (e.g., "Box" = 12 × "Each").
**Produces:** A data table of conversion UoMs showing name, base UoM, and conversion factor, with inline add/edit/delete actions.
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
          → unitsOfMeasureRouter.list → listUnitsOfMeasure(tenantDb)
  → conversions = allUoms.filter(u => u.baseUomId !== null)
  → baseUoms = allUoms.filter(u => !u.baseUomId)
  → uomMap = { [id]: name } for display lookups
  → DataTable (columns, conversions, uomMap, baseUoms, ...)

  createMutation → client.unitsOfMeasure.create({ organizationId, name, description, baseUomId, conversionFactor })
  updateMutation → client.unitsOfMeasure.update({ organizationId, id, name?, description?, baseUomId?, conversionFactor? })
  deleteMutation → client.unitsOfMeasure.delete({ organizationId, id })
  [all invalidate ["unitsOfMeasure", orgId] on success]
```

**Inputs:** No URL/query params. Dialog state and form data passed to DataTable as props.

**State management:**
- `isAddDialogOpen` — controls add dialog
- `editTarget` — `{ id, name, description, baseUomId, conversionFactor }` or null

**Outputs:** `DataTable` from `apps/web/src/components/tables/uom-conversions/view/data-table.tsx`.
**Side effects:** None beyond DB writes.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `unitsOfMeasure.list` — fetch all UoMs (shared with uom/view)
- `unitsOfMeasure.create` — create conversion (must include `baseUomId` and `conversionFactor`)
- `unitsOfMeasure.update` — update conversion fields
- `unitsOfMeasure.delete` — delete conversion record

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/uom-conversions/view/data-table.tsx`
- `columns` — `apps/web/src/components/tables/uom-conversions/view/columns.tsx`

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`
- `useQueryClient` — cache invalidation

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — Sales & Inventory → Inventory → "UoM Conversions"

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `units_of_measure` (tenant) | SELECT, INSERT, UPDATE, DELETE | `id`, `name`, `description`, `baseUomId`, `conversionFactor` |

**Form fields (Add/Edit dialog):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| name | text | required | `unitsOfMeasure.create.name` |
| description | text | optional | `unitsOfMeasure.create.description` |
| baseUomId | Select from baseUoms | required | `unitsOfMeasure.create.baseUomId` |
| conversionFactor | text (numeric string) | required | `unitsOfMeasure.create.conversionFactor` |

---

## 5. Tests

**Test files:** None found specifically for the conversions page. The `uom.test.tsx` covers base UoMs only.
**Scenarios covered:** N/A
**Not tested (risk areas):**
- Create with `baseUomId` and `conversionFactor`
- `uomMap` lookup display in table
- Editing `baseUomId` on an existing conversion

---

## 6. Notes

- This page shares the `["unitsOfMeasure", orgId]` query cache with `uom/view`. A mutation on either page refreshes both.
- `conversionFactor` is stored as a string (e.g., `"12"` or `"0.001"`) for decimal precision. The DataTable input should be validated as numeric before submit — check `data-table.tsx` for that guard.
- There is no server-side validation preventing a conversion from pointing to another conversion as its `baseUomId`. The UI only offers base UoMs (`!u.baseUomId`) in the selector, which is the correct constraint.

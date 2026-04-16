# Create Branch

**Route:** `/dashboard/branch/create`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/create.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Provides a guided, multi-step form for creating a new hierarchy node (country → region → area → branch) within the organization's geographic structure.

**Produces:** A 2-column layout: the `HierarchicalBranchForm` on the left (spans 2 of 3 cols) and a sticky "How it works" info card on the right explaining the 4-step process.

**On success:** `onSuccess` callback fires (`console.log` only — no navigation implemented yet). The form component itself handles toast and any redirect.

**On failure / error states:** Handled entirely within `HierarchicalBranchForm` — the route itself has no error UI.

---

## 2. How It Works

**Execution flow:**
```
CreateBranchComponent
  → <HierarchicalBranchForm onSuccess={handleSuccess} />
      → useAuth() → organizationId
      → client.hierarchy.listNodes({ organizationId }) — cascading dropdown data
      → react-hook-form + zod validation
      → client.hierarchy.createNode({ organizationId, ... }) — on submit
```

**Inputs:** All form inputs are driven by `HierarchicalBranchForm` (4-step wizard: country, region, area, branch details).

**State management:** Entirely within `HierarchicalBranchForm` — step counter, cascading selection state, loading flag, form data via `react-hook-form`.

**Outputs:** Creates a hierarchy node; calls `onSuccess` prop on completion.

**Side effects:** Invalidates hierarchy-related queries (inside `HierarchicalBranchForm`).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.hierarchy.listNodes` (via form) — populate country/region/area dropdowns
- `client.hierarchy.createNode` (via form) — create the new node

**Uses these components:**
- `HierarchicalBranchForm` — `apps/web/src/components/forms/hierarchical-branch-form.tsx` — multi-step wizard with cascading selects and zod validation
- `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription` — shadcn/ui

**Uses these hooks:**
- `requirePermission` (beforeLoad guard) — `hierarchy_management:create`

**Navigation: who navigates here:**
- `app-sidebar.tsx` — "Create Branch" link under Hierarchy section
- `/dashboard/branch/view` — linked via sidebar

**Navigation: where it goes:**
- `HierarchicalBranchForm` calls `useNavigate` internally; after success it navigates to `/dashboard/branch/view` (implemented within the form component).

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `hierarchy_nodes` | SELECT | `id`, `name`, `type`, `depth`, `parent_id`, `code` |
| `hierarchy_nodes` | INSERT | `name`, `type`, `depth`, `parent_id`, `code`, `organization_id` |

**Key types / Zod schemas** (`hierarchical-branch-form.tsx`):
```ts
z.object({
  country_id?, country_name?, country_code?,
  region_id?, region_name?, region_code?,
  area_id?, area_name?, area_code?,
  branch_name, branch_code, branch_type?
})
```

**Permission required:** `hierarchy_management:create` (enforced in `beforeLoad` — redirects to `/dashboard/branch/view` on failure)

---

## 5. Tests

**Test files:** None found

**Not tested:** Form submission, cascading dropdown logic, step navigation

---

## 6. Notes

- `handleSuccess` in the route component is a no-op stub (`console.log` only). Navigation after creation is handled inside `HierarchicalBranchForm` via `useNavigate`.
- The "How it works" card is purely informational; it shows 4 numbered steps (Country, Region, Area, Branch) plus a permissions note.
- `requirePermission` is currently a stub in `route-guards.ts` and does not block access.

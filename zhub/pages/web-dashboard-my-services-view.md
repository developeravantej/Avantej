# My Services

**Route:** `/dashboard/my-services/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Allows individual staff members to view their service category assignments and override the per-category buffer time between appointments.
**Produces:** A table listing each assigned service category with its default buffer time and the staff member's personal override, plus an edit sheet for setting or clearing overrides.
**On success:** Override saved and table refreshes; toast confirms update.
**On failure / error states:** Loading spinner while fetching; "Select an organization" guard if no org context; empty state with instructional message if no assignments exist.

---

## 2. How It Works

**Execution flow:**
```
MyServicesView
  → useUserContext() → organizationId
  → useQuery(serviceMembers.listMine) → client.serviceMembers.listMine({ organizationId })
  → renders DataTable<CategoryBufferAssignment>
  → Edit button → opens Sheet
  → handleSave() → useMutation(serviceMembers.updateMyBuffer)
                   → client.serviceMembers.updateMyBuffer({ organizationId, categoryId, bufferTimeMinutes })
  → onSuccess → invalidateQueries(["myServices", orgId]) + closeSheet + toast
```

**Inputs:** No URL params. Sheet form has one field: buffer time in minutes (numeric, blank = use default).
**State management:** `useState` for sheet open, selected service row, and buffer input string. TanStack Query for data and mutation.
**Outputs:** Renders table; mutation updates buffer override on the backend.
**Side effects:** Cache key `["myServices", orgId]` invalidated on save.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `serviceMembers.listMine` — returns the authenticated staff member's category assignments with buffer times
- `serviceMembers.updateMyBuffer` — sets or clears the per-category buffer override for the authenticated user

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic TanStack Table wrapper
- `Sheet` / `SheetContent` / `SheetHeader` / `SheetTitle` / `SheetDescription` / `SheetFooter` — shadcn/ui slide-over
- `Button`, `Badge`, `Input`, `Label`, `Separator` — shadcn/ui primitives

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useQueryClient` — for query invalidation after mutation

**Navigation: who navigates here:**
- App sidebar: special "My Services" link rendered at line 515–518 of `app-sidebar.tsx` — only visible to the current staff user

**Navigation: where it goes:** No outbound navigation from this page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `service_category_config` | SELECT / UPDATE | `categoryId`, `bufferTimeMinutes` |
| `service_members` | SELECT | `memberId`, `categoryId` |
| `service_categories` | SELECT (join) | `id`, `name`, `defaultBufferMinutes` |

**Key type:**
```typescript
type CategoryBufferAssignment = {
  categoryId: string;
  categoryName: string | null;
  categoryDefaultBuffer: number;   // minutes
  bufferTimeMinutes: number | null; // null = use category default
};
```

**Form fields:**
- `bufferTimeMinutes` — number input, min 0, blank clears override

---

## 5. Tests

**Test files:** None found.
**Not tested:** Anything — no test coverage for this page.

---

## 6. Notes

- "Clear Override" button only appears in the sheet when the selected row already has a non-null override (`bufferTimeMinutes != null`).
- Sending `bufferTimeMinutes: null` via the mutation is how the override is cleared (falls back to category default).
- This page is staff-scoped: `listMine` returns only the current user's assignments, not all members.

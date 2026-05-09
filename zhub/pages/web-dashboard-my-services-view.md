# My Services

**Route:** `/dashboard/my-services/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-09

---

## New in this update

- **Category Buffer Defaults section** added below the service assignments table. Trainers can now set a per-category default buffer time (overrides the org-wide category default but is lower priority than the per-service override).
- `CategoryBufferRow` component (`apps/web/src/components/trainers/category-buffer-row.tsx`) — new shared inline-edit row with Save/Cancel and 0–480 min validation.
- Two new API procedures consumed: `categoryBufferOverrides.listMine` and `categoryBufferOverrides.updateMine`.
- The edit dialog changed from a `Sheet` (slide-over) to a `Dialog` (modal).

---

## 1. What It Does

**Purpose (user perspective):** Allows individual staff members to view the specific services they are assigned to and override the buffer time (break after each appointment) per service. A new "Category Buffer Defaults" section lets trainers set a per-category default buffer that applies across all services in that category.

**Produces:**
- A table listing each assigned service with its category, category default buffer, and the member's personal service-level override.
- A modal dialog to edit or clear the service-level override.
- A "Category Buffer Defaults" list below the table — one row per service category, each with inline edit/save/cancel.

**On success:** Override saved and relevant section refreshes; toast "Buffer time updated." (service) or "Category buffer updated" (category).
**On failure / error states:** Loading spinner while fetching; "Select an organization to view your services." if no org context; error message if query fails; empty state "No services assigned" with guidance to contact a manager.

---

## 2. How It Works

**Execution flow:**
```
MyServicesView
  → useUserContext() → organizationId
  → useQuery(["myServices", organizationId])
      → client.serviceMembers.listMine({ organizationId })
        → JOIN service_members, services, service_categories, service_category_config
        → JOIN member_service_buffer_overrides for this member
        → returns per-service buffer override (or null)
  → DataTable<ServiceBufferAssignment> with inline columns
  → Edit button → opens Dialog → bufferInput
  → handleSave() → useMutation(serviceMembers.updateMyBuffer)
      → verifies member assigned to service → upsert or delete member_service_buffer_overrides
  → handleClearOverride() → same mutation with bufferTimeMinutes: null
  → onSuccess → invalidateQueries(["myServices", orgId]) + closeDialog + toast

  → useQuery(["myCategoryBuffers", organizationId])
      → client.categoryBufferOverrides.listMine({ organizationId })
        → returns per-category buffer overrides for calling member
  → renders <CategoryBufferRow> for each category
  → CategoryBufferRow: local editing/value state; Edit → inline input → Save/Cancel
  → onSave → useMutation(categoryBufferOverrides.updateMine)
      → validates member has services in category
      → upsert category_buffer_overrides row
  → onSuccess → invalidateQueries(["myCategoryBuffers", orgId]) + toast
```

**Inputs:** No URL params. Dialog form has one field: buffer time in minutes (numeric, blank clears override). Category Buffer section uses `CategoryBufferRow` with local inline state.

**State management:** `useState` for dialog open/closed, selected service row, buffer input string. `useQuery` + `useMutation` for both data layers. `useQueryClient` for cache invalidation.

**Outputs:** Table render; service mutation upserts/deletes `member_service_buffer_overrides`; category mutation upserts/deletes `category_buffer_overrides`.

**Side effects:**
- `["myServices", orgId]` invalidated on service save.
- `["myCategoryBuffers", orgId]` invalidated on category save.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `serviceMembers.listMine` — returns the calling member's service assignments with category default buffer and personal override
- `serviceMembers.updateMyBuffer` — sets or clears the per-service buffer override for the calling member (input: `serviceId`, `bufferTimeMinutes | null`)
- `categoryBufferOverrides.listMine` — returns the calling member's per-category buffer overrides; no permission gate
- `categoryBufferOverrides.updateMine` — upserts or clears a category buffer override; validates the member has services in that category

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic TanStack Table wrapper (columns defined inline in the route file)
- `CategoryBufferRow` — `apps/web/src/components/trainers/category-buffer-row.tsx` — shared inline edit row for category buffer; accepts `cat: CategoryBufferRowData` and `onSave` callback
- `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` — shadcn/ui modal (replaced Sheet in this update)
- `Button`, `Badge`, `Input`, `Label`, `Separator`, `EmptyState`, `PageLoader` — shadcn/ui + local

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useQueryClient` — cache invalidation after mutations
- `useApiMutation` — service buffer mutation (wraps success toast + cache invalidation)
- `useMutation` — category buffer mutation (manual toast + invalidation)

**Navigation: who navigates here:**
- App sidebar: "My Services" link — always visible

**Navigation: where it goes:** No outbound navigation from this page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `service_members` | SELECT (join) | `memberId`, `serviceId` |
| `services` | SELECT (join) | `id`, `name`, `categoryId` |
| `service_categories` | LEFT JOIN | `id`, `name` |
| `service_category_config` | LEFT JOIN | `categoryId`, `bufferTimeMinutes` (category default) |
| `member_service_buffer_overrides` | SELECT / UPSERT / DELETE | `memberId`, `serviceId`, `bufferTimeMinutes`, `updatedAt` |
| `category_buffer_overrides` | SELECT / UPSERT / DELETE | `memberId`, `categoryId`, `bufferTimeMinutes` |

**Key types:**
```typescript
type ServiceBufferAssignment = {
  serviceId: string;
  serviceName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryDefaultBuffer: number;    // minutes (0 if no config)
  bufferTimeMinutes: number | null; // null = use category default
};

type CategoryBufferRowData = {
  categoryId: string;
  categoryName: string;
  orgDefaultBuffer: number;         // org-wide category default
  bufferTimeMinutes: number | null; // null = use org default
};
```

**Service-level dialog form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| My Buffer (minutes) | number input, min 0 | blank → null | `bufferTimeMinutes` |

**Category inline form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| Buffer (minutes) | number input, 0–480 | blank → null, NaN/out-of-range rejected | `bufferTimeMinutes` |

---

## 5. Buffer Resolution Cascade

The appointment scheduler resolves buffer time with this priority (most to least specific):

1. `member_service_buffer_overrides` (per-member, per-service) — set on this page's dialog
2. `category_buffer_overrides` (per-member, per-category) — set on this page's Category Buffer Defaults section
3. `service_category_config.bufferTimeMinutes` (org-wide per-category)
4. 0 (no buffer)

---

## 6. Tests

**Test files:** None found.
**Not tested:** Anything — no test coverage for this page.

---

## 7. Notes

- "Clear Override" button in the service dialog only appears when the selected service already has a non-null override.
- Sending `bufferTimeMinutes: null` to `updateMyBuffer` deletes the `member_service_buffer_overrides` row.
- `updateMine` (category) validates that the calling member has at least one service assigned in the target category before writing — returns NOT_FOUND otherwise.
- No permission gate on `listMine` / `updateMyBuffer` / `listMine (category)` — any authenticated org member can access their own data. `updateMine` (category) also has no permission gate beyond authentication.
- `CategoryBufferRow` re-syncs its local `value` state from `cat.bufferTimeMinutes` on each Edit click to avoid stale input state across re-renders.
- The `TrainerServicesSection` component (`apps/web/src/components/trainers/TrainerServicesSection.tsx`) renders the same Category Buffer Defaults section for admin views of a specific member, using `categoryBufferOverrides.listForMember` (admin-gated) and `categoryBufferOverrides.upsert` instead of the self-scoped variants.

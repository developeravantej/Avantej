# My Services

**Route:** `/dashboard/my-services/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Allows individual staff members to view the specific services they are assigned to and override the buffer time (break after each appointment) per service. The category default buffer is shown for reference.
**Produces:** A table listing each assigned service with its category, category default buffer, and the member's personal override. A slide-out sheet allows editing or clearing the override.
**On success:** Override saved and table refreshes; toast "Buffer time updated."
**On failure / error states:** Loading spinner while fetching; "Select an organization to view your services." if no org context; empty state "You have no service assignments yet." with guidance to contact a manager.

---

## 2. How It Works

**Execution flow:**
```
MyServicesView
  → useUserContext() → organizationId
  → useQuery(["myServices", organizationId])
      → client.serviceMembers.listMine({ organizationId })
        → serviceMembersRouter.listMine (no permission gate — scoped to calling member)
          → JOIN service_members, services, service_categories, service_category_config
          → JOIN member_service_buffer_overrides for this member
          → returns per-service buffer override (or null)
  → DataTable<ServiceBufferAssignment> with inline columns
  → Edit button → opens Sheet → bufferInput
  → handleSave() → useMutation(serviceMembers.updateMyBuffer)
      → client.serviceMembers.updateMyBuffer({ organizationId, serviceId, bufferTimeMinutes })
        → verifies member assigned to service → upsert or delete member_service_buffer_overrides
  → handleClearOverride() → same mutation with bufferTimeMinutes: null
  → onSuccess → invalidateQueries(["myServices", orgId]) + closeSheet + toast
```

**Inputs:** No URL params. Sheet form has one field: buffer time in minutes (numeric input, blank or null clears override).
**State management:** `useState` for sheet open/closed, selected service row (`ServiceBufferAssignment`), and buffer input string. TanStack Query for list data and mutation.
**Outputs:** Renders table; mutation upserts or deletes `member_service_buffer_overrides` row.
**Side effects:** Cache key `["myServices", orgId]` invalidated on save.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `serviceMembers.listMine` — returns the calling member's service assignments with category default buffer and personal override
- `serviceMembers.updateMyBuffer` — sets or clears the per-service buffer override for the calling member (input: `serviceId`, `bufferTimeMinutes | null`)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic TanStack Table wrapper (columns defined inline in the route file)
- `Sheet` / `SheetContent` / `SheetHeader` / `SheetTitle` / `SheetDescription` / `SheetFooter` — shadcn/ui slide-over
- `Button`, `Badge`, `Input`, `Label`, `Separator`, `Briefcase`, `Edit` (Lucide)

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useQueryClient` — cache invalidation after mutation

**Navigation: who navigates here:**
- App sidebar: "My Services" link rendered at line ~515 of `apps/web/src/components/app-sidebar.tsx` — always visible in sidebar

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

**Key type:**
```typescript
type ServiceBufferAssignment = {
  serviceId: string;
  serviceName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryDefaultBuffer: number;    // minutes (0 if no config)
  bufferTimeMinutes: number | null; // null = use category default
};
```

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| My Buffer (minutes) | number input, min 0 | blank → null | `bufferTimeMinutes` |

---

## 5. Tests

**Test files:** None found.
**Not tested:** Anything — no test coverage for this page.

---

## 6. Notes

- "Clear Override" button only appears in the sheet when the selected service already has a non-null override (`bufferTimeMinutes != null`).
- Sending `bufferTimeMinutes: null` deletes the `member_service_buffer_overrides` row — the appointment scheduler then falls back to the category default buffer.
- The buffer resolution cascade (most-to-least specific): (1) staff service-level override, (2) `service_category_config.bufferTimeMinutes`, (3) 0.
- This page is entirely scoped to the calling member: `listMine` uses `context.member.id`; `updateMyBuffer` verifies the member is assigned to the service before writing.
- The existing doc incorrectly described the granularity as "category-level" — the overrides are stored at the **service** level (not category) in `member_service_buffer_overrides(memberId, serviceId)`.
- No permission gate on `listMine` / `updateMyBuffer` — any authenticated org member can access their own data.

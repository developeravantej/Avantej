# Buffer Time: Category-Level Default + Staff Self-Override

## 1. Overview

### Problem Statement

After a service appointment is completed, there needs to be a mandatory gap (buffer time) before
the next booking can start. Buffer time varies — a deep tissue massage needs 15 minutes for
cleanup, but a consultation needs none.

Buffer time is configured at two levels:
- **Category level** — admin sets a default that applies to all services in a category
- **Staff level** — each staff member/trainer can override it for their own assigned services

Two separate user flows control the staff-level override:
1. **Staff self-service** — a trainer/staff member sets their own buffer time per assigned service
2. **Admin configuration** — an admin selects a specific staff member and adjusts their buffer
   overrides on their behalf

### Goals

1. Admin can set a default `bufferTimeMinutes` per service category (via `service_category_config`)
2. Staff self-override: trainer/staff members set their own buffer per assigned service
3. Admin override: admin can view and configure any staff member's buffer overrides from the
   Trainers management page
4. Booking logic enforces the resolved buffer (staff override > category default > 0)
5. UI: category config form (admin), My Services page (staff), Trainers sheet (admin)

### Success Criteria

- Buffer time is enforced: creating an appointment that violates the buffer is rejected with a
  clear error message including the buffer duration
- Category-level buffer is the default for all services in that category
- A staff member's own override takes precedence over the category default
- Staff can view and change their own overrides without admin involvement
- Admin can view and change any staff member's overrides from the Trainers page
- Existing appointments are unaffected

### Scope

**In scope:**
- Schema: `service_category_config.bufferTimeMinutes`, `service_members.bufferTimeMinutes`
- Resolution service + booking enforcement
- Category config form UI (admin) — COMPLETED
- Staff self-service "My Services" page (trainer/staff roles only)
- Admin buffer management in Trainer edit Sheet
- Sidebar "My Services" link gated to trainer/staff roles

**Out of scope:**
- Per-branch overrides (future)
- Available-slots endpoint (separate feature)
- Retroactive validation of existing appointments

---

## 2. Implementation Status

| Phase | Description | Status |
|---|---|---|
| 1 | Schema + migration + resolution service | **COMPLETED** |
| 2 | Appointment enforcement (create/update) | **COMPLETED** |
| 3 | Category config UI (admin form + detail dialog) | **COMPLETED** |
| 4A | Staff self-service API + UI | **TO BUILD** |
| 4B | Admin manages staff buffer via Trainers page | **TO BUILD** |

Only Phases 4A and 4B remain.

---

## 3. Technical Architecture

### Resolution Cascade (unchanged, already implemented)

```
service_members.bufferTimeMinutes  ← staff override, wins if non-null
        ↓ null fallback
service_category_config.bufferTimeMinutes  ← category default
        ↓ null/missing fallback
0 (no buffer)
```

### API Contracts — Phase 4

All four procedures go in the same new file:
`packages/api/src/routers/service-members.ts`

---

#### `serviceMembers.listMine`

Staff member views their own service assignments. No permission gate — scoped to
`context.member.id` automatically.

```typescript
// Input
{ organizationId: string }

// Output
Array<{
  id: string;                    // service_members row id
  serviceId: string;
  serviceName: string;
  categoryName: string | null;
  categoryDefaultBuffer: number; // 0 if category has no config
  bufferTimeMinutes: number | null; // null = using category default
}>
```

Query: `service_members` inner join `services`, left join `service_categories`,
left join `service_category_config` — filtered to `memberId = context.member.id`.

---

#### `serviceMembers.updateMyBuffer`

Staff member sets or clears their own buffer for one assigned service.

```typescript
// Input
{
  organizationId: string;
  serviceId: string;
  bufferTimeMinutes: number | null; // null = clear override, revert to category default
}

// Authorization
// Row lookup: service_members WHERE serviceId = input.serviceId AND memberId = context.member.id
// If not found → ORPCError("NOT_FOUND", "You are not assigned to this service")
// Row ownership enforced by WHERE clause — no separate permission check needed
```

---

#### `serviceMembers.listForMember`

Admin views a specific staff member's service assignments. Requires
`user_management:read` or `service_management:read` permission.

```typescript
// Input
{ organizationId: string; memberId: string }

// Output — same shape as listMine
Array<{
  id: string;
  serviceId: string;
  serviceName: string;
  categoryName: string | null;
  categoryDefaultBuffer: number;
  bufferTimeMinutes: number | null;
}>
```

---

#### `serviceMembers.updateBuffer`

Admin sets or clears a buffer override for a specific staff member's service assignment.
Requires `user_management:update` or `service_management:update`.

```typescript
// Input
{
  organizationId: string;
  memberId: string;
  serviceId: string;
  bufferTimeMinutes: number | null;
}

// Authorization: permission check (user_management:update or service_management:update)
// Row lookup: service_members WHERE serviceId = input.serviceId AND memberId = input.memberId
// If not found → ORPCError("NOT_FOUND", "This member is not assigned to this service")
```

---

## 4. User Journeys

### Journey 1 (COMPLETED): Admin sets category buffer time

```
Admin → Service Categories → Edit → "Buffer Time (minutes)" field → Save
```

### Journey 2 (TO BUILD): Staff member sets their own buffer override

```
Trigger: Trainer wants to reduce prep time for a specific service they're fast at

1. Trainer logs in → sees "My Services" in sidebar (visible only to trainer/staff roles)
2. Navigates to My Services page
3. Page loads a table: Service | Category | Category Default | My Override | Actions
   Example row: "Deep Tissue | Recovery | 15 min | — (using default) | Edit"
4. Trainer clicks "Edit" on a row
5. Sheet opens with:
   - Service name (read-only)
   - "My Buffer (minutes)" number input, blank if no override
   - Helper text: "Category default is 15 min. Leave blank to revert to it."
   - "Save" button + "Clear Override" button
6. Trainer enters 10 → Save
7. Row updates: "My Override: 10 min"
8. Future appointments with this trainer + this service enforce 10 min buffer

Where: apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx (NEW)
       No permission gate — visible to any authenticated member, but sidebar link is
       gated to trainer/staff roles
```

### Journey 3 (TO BUILD): Admin configures a staff member's buffer override

```
Trigger: Admin wants to adjust a specific trainer's buffer settings

1. Admin → Trainers page (/dashboard/trainers/view)
2. Clicks "Edit" on a trainer row → Trainer edit Sheet opens
3. Sheet has a new collapsible section: "Service Buffer Times"
4. Section loads: table of trainer's assigned services showing current overrides
   Columns: Service | Category Default | Override | Edit
5. Admin clicks "Edit" on a service row inline or opens a sub-sheet
6. Sets bufferTimeMinutes for that trainer/service pair → Save
7. Toast: "Buffer time updated"
8. Override takes effect immediately for future bookings

Where: apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx (MODIFY)
       — add "Service Buffer Times" collapsible to existing Trainer edit Sheet
       — uses serviceMembers.listForMember + serviceMembers.updateBuffer
```

### Journey 4 (COMPLETED): Booking blocked by buffer time

```
Appointment create/update → resolveBufferTime → checkAppointmentBufferConflict
→ ORPCError("BAD_REQUEST") → frontend toast with buffer duration
```

---

## 5. Phased Implementation

### Phase 4A: Staff Self-Service API + UI

#### Task 4A.1: Create `serviceMembers` router

**File (new):** `packages/api/src/routers/service-members.ts`

Implement `listMine` and `updateMyBuffer` as specified in Section 3.

Key implementation notes:
- Both procedures check `!context.tenantDb || !context.member` → `ORPCError("FORBIDDEN")`
- `listMine`: uses Drizzle join query, maps `categoryDefaultBuffer: r.categoryDefaultBuffer ?? 0`
- `updateMyBuffer`: validates `bufferTimeMinutes` is `z.number().int().min(0).max(480).nullable()`
- `updateMyBuffer`: uses `WHERE serviceId = input.serviceId AND memberId = context.member.id`
  in both the lookup and the update (belt-and-suspenders, no reliance on the looked-up row id)

#### Task 4A.2: Register in router index

**File:** `packages/api/src/routers/index.ts`

Add: `import { serviceMembersRouter } from "./service-members";`
Add to `baseRouter`: `serviceMembers: serviceMembersRouter`

#### Task 4A.3: Create My Services route

**File (new):** `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx`

No `beforeLoad` permission gate.

Page structure:
```tsx
// Data fetch
const { data: myServices } = useQuery({
  queryKey: ["myServices", organizationId],
  queryFn: () => client.serviceMembers.listMine({ organizationId }),
  enabled: !!organizationId,
});

// Table columns
// Service | Category | Category Default | My Override | Actions

// "My Override" cell renders:
//   bufferTimeMinutes != null  → "{n} min"
//   null                       → "— (category default: {categoryDefaultBuffer} min)"

// Edit opens a Sheet with:
//   - read-only service + category name
//   - number input (blank = null = use default)
//   - "Clear override" button sets null
//   - on save: client.serviceMembers.updateMyBuffer({ organizationId, serviceId, bufferTimeMinutes })
//   - invalidate ["myServices"] on success

// Empty state: "You have no service assignments yet."
```

#### Task 4A.4: Gate sidebar "My Services" link to trainer/staff roles

**File:** `apps/web/src/components/app-sidebar.tsx`

`NAV_GROUPS` is a static constant — role-gated items must be added dynamically inside the
component. Add a conditionally rendered section below `NAV_GROUPS`:

```tsx
// Inside the AppSidebar component, after rendering NAV_GROUPS:
const { hasRole } = useUserContext();
const isStaffOrTrainer = hasRole(["trainer", "staff"]);

// Render a "My Work" group only when isStaffOrTrainer is true:
{isStaffOrTrainer && (
  <SidebarGroup>
    <SidebarGroupLabel>My Work</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/my-services")}>
            <Link to="/dashboard/my-services/view">
              <Briefcase className="h-4 w-4" />
              <span>My Services</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)}
```

Add `Briefcase` to the lucide-react import line.

#### Task 4A.5: Regenerate route tree

Run `bun dev:web` once after creating the new route file. TanStack Router regenerates
`routeTree.gen.ts` automatically on dev server start.

**Acceptance Criteria for 4A:**
- Trainer logs in, sees "My Services" in sidebar; admin does not see it
- Table shows all assigned services with category default and current override
- Can set a new override (0-480 min), persists after refresh
- Can clear override back to null (shows "using default" again)
- Cannot call `updateMyBuffer` for a service they're not assigned to (NOT_FOUND)

---

### Phase 4B: Admin Manages Staff Buffer via Trainers Page

#### Task 4B.1: Add `listForMember` and `updateBuffer` to `serviceMembers` router

**File:** `packages/api/src/routers/service-members.ts` (extend Phase 4A file)

Add `listForMember` and `updateBuffer` as specified in Section 3.

Permission check pattern (try both, succeed on either):
```typescript
let hasPermission = false;
for (const resource of ["user_management", "service_management"] as const) {
  try {
    await requirePermission(context.tenantDb, context.member, resource, "read"); // or "update"
    hasPermission = true;
    break;
  } catch { /* try next */ }
}
if (!hasPermission) throw new ORPCError("FORBIDDEN", { message: "..." });
```

#### Task 4B.2: Add "Service Buffer Times" section to Trainer edit Sheet

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx`

The Trainer edit Sheet already has Profile and Availability collapsible sections. Add a third
collapsible: "Service Buffer Times" — visible only in edit mode (`editingMemberId != null`).

```tsx
// State additions
const [bufferSectionOpen, setBufferSectionOpen] = useState(false);
const [editingBufferServiceId, setEditingBufferServiceId] = useState<string | null>(null);
const [bufferInputValue, setBufferInputValue] = useState<string>("");

// Query: load when section opens and editingMemberId is set
const { data: trainerServices = [], refetch: refetchTrainerServices } = useQuery({
  queryKey: ["trainerServices", organizationId, editingMemberId],
  queryFn: () =>
    client.serviceMembers.listForMember({
      organizationId: organizationId!,
      memberId: editingMemberId!,
    }),
  enabled: !!organizationId && !!editingMemberId && bufferSectionOpen,
});

// Mutation
const updateBufferMutation = useMutation({
  mutationFn: ({ serviceId, bufferTimeMinutes }: {
    serviceId: string;
    bufferTimeMinutes: number | null;
  }) =>
    client.serviceMembers.updateBuffer({
      organizationId: organizationId!,
      memberId: editingMemberId!,
      serviceId,
      bufferTimeMinutes,
    }),
  onSuccess: () => {
    refetchTrainerServices();
    setEditingBufferServiceId(null);
    toast.success("Buffer time updated.");
  },
  onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update buffer."),
});

// UI (inside the Sheet, after Availability collapsible):
<Collapsible open={bufferSectionOpen} onOpenChange={setBufferSectionOpen}>
  <CollapsibleTrigger ...>Service Buffer Times</CollapsibleTrigger>
  <CollapsibleContent>
    {trainerServices.length === 0 ? (
      <p className="text-sm text-muted-foreground py-2">
        This trainer has no service assignments.
      </p>
    ) : (
      <div className="space-y-2 pt-2">
        {trainerServices.map((svc) => (
          <div key={svc.serviceId} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{svc.serviceName}</p>
              <p className="text-xs text-muted-foreground">
                Category default: {svc.categoryDefaultBuffer > 0
                  ? `${svc.categoryDefaultBuffer} min`
                  : "None"}
              </p>
            </div>
            {editingBufferServiceId === svc.serviceId ? (
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={480}
                  className="w-20 h-7 text-sm"
                  placeholder="min"
                  value={bufferInputValue}
                  onChange={(e) => setBufferInputValue(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    const val = bufferInputValue === "" ? null : parseInt(bufferInputValue);
                    updateBufferMutation.mutate({ serviceId: svc.serviceId, bufferTimeMinutes: val });
                  }}
                  disabled={updateBufferMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setEditingBufferServiceId(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {svc.bufferTimeMinutes != null
                    ? `${svc.bufferTimeMinutes} min (override)`
                    : "Using default"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setEditingBufferServiceId(svc.serviceId);
                    setBufferInputValue(svc.bufferTimeMinutes?.toString() ?? "");
                  }}
                >
                  <Edit className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </CollapsibleContent>
</Collapsible>
```

**Acceptance Criteria for 4B:**
- Admin opens Trainer edit Sheet → "Service Buffer Times" collapsible appears
- Opening the section loads the trainer's service assignments
- Admin can set a numeric override or leave blank to clear it
- Changes persist and reflect immediately after save
- "Using default" shown for services with no override
- `listForMember` and `updateBuffer` fail for non-admin callers (FORBIDDEN)

---

## 6. Impact & Breakage Analysis

### New Files

| File | Purpose |
|---|---|
| `packages/api/src/routers/service-members.ts` | New router (listMine, updateMyBuffer, listForMember, updateBuffer) |
| `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx` | Staff self-service page |

### Modified Files

| File | Change | Risk |
|---|---|---|
| `packages/api/src/routers/index.ts` | Add `serviceMembers` to baseRouter | Low — additive |
| `apps/web/src/components/app-sidebar.tsx` | Dynamic "My Work" section for trainer/staff | Low — additive |
| `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx` | Add collapsible section + 2 queries + 1 mutation | Low — additive to existing Sheet |

### No schema migration needed

Both `service_members.bufferTimeMinutes` and `service_category_config.bufferTimeMinutes` already
exist from Phase 1.

### Existing flows unaffected

- Appointment enforcement (Phase 2): no change
- Category config (Phase 3): no change
- Trainer create/profile edit: the new collapsible is additive, existing form fields unchanged

---

## 7. Verification Steps

After implementation, verify each user journey end-to-end:

1. **Staff self-service**: Log in as a trainer → "My Services" visible in sidebar → set override
   for one service → create appointment for that service + this trainer → confirm buffer enforced

2. **Admin config**: Log in as admin → Trainers page → Edit trainer → "Service Buffer Times"
   section → override a service → confirm the change is visible on the staff's My Services page

3. **Resolution order**: Set category default to 15, staff override to 10 → booking enforces 10.
   Clear override (null) → booking enforces 15. Set category default to 0, no override → no buffer.

4. **Authorization**: Call `updateBuffer` as a trainer (not admin) → confirm FORBIDDEN.
   Call `updateMyBuffer` with a serviceId the trainer isn't assigned to → confirm NOT_FOUND.

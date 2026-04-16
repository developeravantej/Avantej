# 4. Phased Implementation

---

## Phase 1: Database Schema + Backend (Service & Router)

**Goal:** Create the `trainer_availability` table, service, and oRPC router. Add `trainerId` filter to the existing appointments list endpoint.

**Delivers:** Journey 1 (backend only — availability CRUD), Journey 2 (backend only — trainerId filtering).

**Dependencies:** None (this is the foundation).

---

### Task 1.1: Create `trainer_availability` schema

**File to create:** `packages/db/src/schema/tenant/trainer-availability.ts`

```typescript
import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { members } from "./members";

export const trainerAvailability = pgTable("trainer_availability", {
  id: uuid("id").primaryKey().defaultRandom(),

  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),

  dayOfWeek: text("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  isActive: boolean("is_active").default(true).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  trainerIdIdx: index("trainer_availability_trainer_id_idx")
    .on(table.trainerId),
  trainerDayIdx: index("trainer_availability_trainer_day_idx")
    .on(table.trainerId, table.dayOfWeek),
}));
```

**Export from index:**

**File to modify:** `packages/db/src/schema/tenant/index.ts`

Add line:
```typescript
export * from "./trainer-availability";
```

---

### Task 1.2: Generate and embed migration

**Steps:**

1. Run `bun db:generate` to generate the SQL migration file.
2. Verify the generated SQL creates the `trainer_availability` table with correct columns, FK, and indexes.
3. Run `bun db:push` to apply to dev database and verify.
4. Embed the migration SQL constant in `packages/db/src/migrate-tenant.ts` following the existing pattern (see `MIGRATION_0007_SHORT_KORATH` pattern).
5. Update the tenant migration journal and snapshot files accordingly.

**Files to modify:**
- `packages/db/src/migrations/tenant/` — new SQL file auto-generated
- `packages/db/src/migrations/tenant/meta/_journal.json` — auto-updated
- `packages/db/src/migrations/tenant/meta/` — new snapshot file auto-generated
- `packages/db/src/migrate-tenant.ts` — embed new migration constant

---

### Task 1.3: Create trainer availability service

**File to create:** `packages/services/src/trainer-availability.service.ts`

```typescript
import { eq, and } from "drizzle-orm";
import { trainerAvailability } from "@avantej-core/db/schema/tenant/trainer-availability";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

// ─── Types ──────────────────────────────────────────────────────────

export type AvailabilitySlot = {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
};

// ─── Constants ─────────────────────────────────────────────────────

const DAY_ORDER: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};

// ─── List ───────────────────────────────────────────────────────────

export async function listTrainerAvailability(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  trainerId: string,
): Promise<(typeof trainerAvailability.$inferSelect)[]> {
  // Fetch all rows, then sort client-side for correct day order
  // (alphabetical DB order puts "friday" before "monday")
  const rows = await tenantDb.query.trainerAvailability.findMany({
    where: eq(trainerAvailability.trainerId, trainerId),
  });
  return rows.sort((a, b) => {
    const dayDiff = (DAY_ORDER[a.dayOfWeek] ?? 7) - (DAY_ORDER[b.dayOfWeek] ?? 7);
    if (dayDiff !== 0) return dayDiff;
    return a.startTime.localeCompare(b.startTime);
  });
}

// ─── Upsert (replace-all) ──────────────────────────────────────────

export async function upsertTrainerAvailability(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  trainerId: string,
  slots: AvailabilitySlot[],
): Promise<(typeof trainerAvailability.$inferSelect)[]> {
  // Validate: endTime > startTime for each slot
  for (const slot of slots) {
    if (slot.endTime <= slot.startTime) {
      throw new Error(
        `Invalid time range: ${slot.startTime} – ${slot.endTime} on ${slot.dayOfWeek}`
      );
    }
  }

  // Validate: no overlapping shifts on same day
  const byDay = new Map<string, AvailabilitySlot[]>();
  for (const slot of slots) {
    const daySlots = byDay.get(slot.dayOfWeek) ?? [];
    daySlots.push(slot);
    byDay.set(slot.dayOfWeek, daySlots);
  }
  for (const [day, daySlots] of byDay) {
    const sorted = daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime < sorted[i - 1].endTime) {
        throw new Error(
          `Overlapping shifts on ${day}: ${sorted[i - 1].startTime}–${sorted[i - 1].endTime} and ${sorted[i].startTime}–${sorted[i].endTime}`
        );
      }
    }
  }

  // Transaction: delete all existing → insert new
  return tenantDb.transaction(async (tx) => {
    await tx.delete(trainerAvailability)
      .where(eq(trainerAvailability.trainerId, trainerId));

    if (slots.length === 0) return [];

    const rows = await tx.insert(trainerAvailability)
      .values(slots.map((s) => ({
        trainerId,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })))
      .returning();

    return rows;
  });
}

// ─── Delete single slot ────────────────────────────────────────────

export async function deleteTrainerAvailabilitySlot(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string,
): Promise<void> {
  await tenantDb.delete(trainerAvailability)
    .where(eq(trainerAvailability.id, id));
}
```

**Export from index:**

**File to modify:** `packages/services/src/index.ts`

Add:
```typescript
// Trainer Availability
export {
  listTrainerAvailability,
  upsertTrainerAvailability,
  deleteTrainerAvailabilitySlot,
} from "./trainer-availability.service";
```

---

### Task 1.4: Create trainer availability router

**File to create:** `packages/api/src/routers/trainer-availability.ts`

```typescript
import {
  listTrainerAvailability,
  upsertTrainerAvailability,
  deleteTrainerAvailabilitySlot,
  requirePermission,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

const dayOfWeekSchema = z.enum([
  "monday", "tuesday", "wednesday", "thursday",
  "friday", "saturday", "sunday",
]);

export const trainerAvailabilityRouter = {
  list: protectedProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      trainerId: z.string().uuid(),
    }))
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Tenant database not available",
        });
      }
      return listTrainerAvailability(context.tenantDb, input.trainerId);
    }),

  upsert: protectedProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      trainerId: z.string().uuid(),
      slots: z.array(z.object({
        dayOfWeek: dayOfWeekSchema,
        startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
        endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
      })),
    }))
    .handler(async ({ input, context }) => {
      if (!context.tenantDb || !context.member) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Tenant database or member not available",
        });
      }
      try {
        await requirePermission(context.tenantDb, context.member, "appointment_management", "update");
      } catch {
        throw new ORPCError("FORBIDDEN", { message: "Permission denied" });
      }
      try {
        return await upsertTrainerAvailability(
          context.tenantDb, input.trainerId, input.slots,
        );
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Failed to update availability",
        });
      }
    }),

  delete: protectedProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
    }))
    .handler(async ({ input, context }) => {
      if (!context.tenantDb || !context.member) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Tenant database or member not available",
        });
      }
      try {
        await requirePermission(context.tenantDb, context.member, "appointment_management", "update");
      } catch {
        throw new ORPCError("FORBIDDEN", { message: "Permission denied" });
      }
      await deleteTrainerAvailabilitySlot(context.tenantDb, input.id);
      return { success: true };
    }),
};
```

**Register in router index:**

**File to modify:** `packages/api/src/routers/index.ts`

Add import:
```typescript
import { trainerAvailabilityRouter } from "./trainer-availability";
```

Add to `baseRouter` object:
```typescript
trainerAvailability: trainerAvailabilityRouter,
```

---

### Task 1.5: Add `trainerId` filter to appointments list

**File to modify:** `packages/services/src/appointment.service.ts`

In `ListAppointmentsParams`, add:
```typescript
trainerId?: string;
```

In `listAppointments()`, add a condition after the existing `userId` condition:
```typescript
if (params.trainerId) {
  conditions.push(eq(appointments.trainerId, params.trainerId));
}
```

**File to modify:** `packages/api/src/routers/appointments.ts`

In the `list` procedure's input schema, add:
```typescript
trainerId: z.string().uuid().optional(),
```

In the handler, pass the new field to the service:
```typescript
const items = await listAppointments(context.tenantDb, {
  branchId: input.branchId,
  serviceId: input.serviceId ?? undefined,
  trainerId: input.trainerId,  // <── NEW
  status: input.status,
  startFrom: input.startFrom ? new Date(input.startFrom) : undefined,
  startTo: input.startTo ? new Date(input.startTo) : undefined,
  accessibleNodeIds,
  limit: input.limit,
});
```

---

### Task 1.6: Add Drizzle relations for `trainerAvailability`

**File to modify:** `packages/db/src/schema/tenant/trainer-availability.ts` (append relations)

```typescript
import { relations } from "drizzle-orm";

export const trainerAvailabilityRelations = relations(trainerAvailability, ({ one }) => ({
  trainer: one(members, {
    fields: [trainerAvailability.trainerId],
    references: [members.id],
  }),
}));
```

This is needed for `tenantDb.query.trainerAvailability.findMany()` to work with Drizzle's relational query builder.

---

### Task 1.7: Expose `member.id` in `userContext` response

**Problem:** The `userContext` endpoint's `hierarchy.member` object currently returns `{ role, hierarchyScopeId, hierarchyScopeName, accessibleNodeIds }` — it does **not** include the member's `id`. Phase 3 needs this `id` to auto-filter a trainer's own appointments (setting `trainerId = memberId`).

**File to modify:** `apps/server/src/routers/auth.ts`

In the `userContext` handler, the member object is built at ~line 377:

```typescript
// BEFORE
hierarchyData.member = {
  role: member.role,
  hierarchyScopeId: member.hierarchyScopeId,
  hierarchyScopeName: scopeNode?.name || "Unknown",
  accessibleNodeIds,
};

// AFTER — add `id`
hierarchyData.member = {
  id: member.id,                                    // <── NEW
  role: member.role,
  hierarchyScopeId: member.hierarchyScopeId,
  hierarchyScopeName: scopeNode?.name || "Unknown",
  accessibleNodeIds,
};
```

**File to modify:** `packages/api/src/routers/index.ts`

Update the type-inference stub for `userContext` to include `id` in the member shape (~line 129):

```typescript
// BEFORE
member: {
  role: string;
  hierarchyScopeId: string;
  hierarchyScopeName: string;
  accessibleNodeIds: string[];
} | null;

// AFTER
member: {
  id: string;                                       // <── NEW
  role: string;
  hierarchyScopeId: string;
  hierarchyScopeName: string;
  accessibleNodeIds: string[];
} | null;
```

**Why this is critical:** Without `member.id`, the Phase 3 trainer auto-filter (`selectedTrainerId = isTrainer ? memberId : sidebarSelectedId`) cannot work — `memberId` would be `undefined`, causing the query to return all appointments instead of just the trainer's own.

---

### Phase 1 Acceptance Criteria

- [ ] `bun db:push` succeeds with the new `trainer_availability` table.
- [ ] `bun check-types` passes — no TypeScript errors.
- [ ] Calling `client.trainerAvailability.upsert(...)` creates availability records.
- [ ] Calling `client.trainerAvailability.list(...)` returns the records.
- [ ] Calling `client.appointments.list({ trainerId: "..." })` filters appointments by trainer.
- [ ] Existing `client.appointments.list({})` (no trainerId) returns all appointments (no regression).
- [ ] `client.auth.userContext({})` response includes `hierarchy.member.id` (the member table PK).
- [ ] Overlap validation rejects `[{mon, 09:00-12:00}, {mon, 10:00-15:00}]`.
- [ ] endTime <= startTime is rejected.

---

## Phase 2: Trainers Page — Availability Management UI

**Goal:** Add the weekly availability editor to the existing Trainers CRUD page edit sheet.

**Delivers:** Journey 1 (end-to-end), Journey 5 (end-to-end).

**Dependencies:** Phase 1 (schema + backend must exist).

---

### Task 2.1: Create `TrainerAvailabilityEditor` component

**File to create:** `apps/web/src/components/trainers/trainer-availability-editor.tsx`

This is a self-contained component that:
- Fetches existing availability for a trainer via `client.trainerAvailability.list`.
- Renders a day-by-day editor (Monday–Sunday).
- Allows adding/removing time shifts per day.
- Calls `client.trainerAvailability.upsert` on save.

**Component API:**

```typescript
interface TrainerAvailabilityEditorProps {
  organizationId: string;
  trainerId: string;        // members.id
  onSaved?: () => void;     // callback after successful save
}
```

**UI Structure:**

```
┌─────────────────────────────────────────────────┐
│  Weekly Availability                            │
│                                                 │
│  Monday                                         │
│  ┌──────────┐  ┌──────────┐                     │
│  │ 09:00    │──│ 12:00    │  [×]                │
│  └──────────┘  └──────────┘                     │
│  ┌──────────┐  ┌──────────┐                     │
│  │ 14:00    │──│ 18:00    │  [×]                │
│  └──────────┘  └──────────┘                     │
│  [+ Add Shift]                                  │
│                                                 │
│  Tuesday                                        │
│  No shifts set  [+ Add Shift]                   │
│                                                 │
│  Wednesday                                      │
│  ┌──────────┐  ┌──────────┐                     │
│  │ 09:00    │──│ 17:00    │  [×]                │
│  └──────────┘  └──────────┘                     │
│  [+ Add Shift]                                  │
│                                                 │
│  ... (Thu–Sun)                                  │
│                                                 │
│  [Save Availability]                            │
└─────────────────────────────────────────────────┘
```

**Time inputs:** Use `<Select>` components with 30-minute increment options:
`["06:00", "06:30", "07:00", ..., "22:00", "22:30", "23:00"]`

**State management:**
```typescript
type ShiftState = { dayOfWeek: string; startTime: string; endTime: string };
const [shifts, setShifts] = useState<ShiftState[]>([]);
// Populated from API on mount, edited locally, saved on submit
```

**Dependencies (existing components):**
- `@/components/ui/select` — for time pickers
- `@/components/ui/button` — add/remove/save buttons
- `@/components/ui/separator` — between days
- `lucide-react` — `Plus`, `X`, `Clock` icons

---

### Task 2.2: Integrate availability editor into Trainers edit sheet

**File to modify:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx`

Changes:
1. Import `TrainerAvailabilityEditor` component.
2. Add a new `<Collapsible>` section below the existing Profile collapsible in the edit form.
3. Only show the Availability section when editing (not creating) — `editingMemberId` is set.
4. Pass `organizationId` and `trainerId={editingMemberId}` to the editor.

**Code location in the existing file:**

After the Profile `<Collapsible>` block (ends around line 737), add:

```tsx
{/* ── Availability (edit only) ─────────────────────────── */}
{editingMemberId && (
  <Collapsible open={availabilitySectionOpen} onOpenChange={setAvailabilitySectionOpen}>
    <CollapsibleTrigger asChild>
      <button type="button" className="flex w-full items-center justify-between pt-1">
        <div className="space-y-0.5 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Weekly Availability
          </p>
          <Separator />
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200",
          availabilitySectionOpen && "rotate-180"
        )} />
      </button>
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-3">
      <TrainerAvailabilityEditor
        organizationId={organizationId!}
        trainerId={editingMemberId}
        onSaved={() => toast.success("Availability saved")}
      />
    </CollapsibleContent>
  </Collapsible>
)}
```

New state to add:
```typescript
const [availabilitySectionOpen, setAvailabilitySectionOpen] = useState(false);
```

**Important:** The availability editor has its own save button — it does NOT submit with the profile form. The profile "Save Changes" button saves profile data. The availability section's "Save Availability" button saves availability data. These are independent operations.

---

### Phase 2 Acceptance Criteria

- [ ] Admin opens edit sheet for a trainer → sees "Weekly Availability" collapsible section.
- [ ] Expanding the section loads existing availability from the API.
- [ ] Admin can add shifts with start/end time selectors for each day.
- [ ] Admin can remove individual shifts with the X button.
- [ ] Admin can add multiple shifts per day (split shifts).
- [ ] Clicking "Save Availability" persists the data and shows success toast.
- [ ] Re-opening the edit sheet shows the previously saved availability.
- [ ] Overlap validation shows an error toast before saving.
- [ ] Creating a new trainer (not editing) does NOT show the availability section.

---

## Phase 3: Appointment View — Trainer Sidebar + Role-Based Filtering

**Goal:** Redesign the appointment page with a trainer sidebar (left) and calendar (right). Trainers auto-filter to their own schedule.

**Delivers:** Journey 2 (end-to-end), Journey 3 (end-to-end), Journey 4 (end-to-end).

**Dependencies:** Phase 1 (trainerId filter on appointments.list must work).

---

### Task 3.1: Create `TrainerSidebar` component

**File to create:** `apps/web/src/components/calendar/trainer-sidebar.tsx`

```typescript
interface TrainerSidebarProps {
  organizationId: string;
  selectedTrainerId: string | null;  // null = "All Trainers"
  onSelectTrainer: (trainerId: string | null) => void;
}
```

**UI Structure:**

```
┌──────────────────────────┐
│  Trainers                │
│  ┌──────────────────────┐│
│  │ 🔍 Search trainers   ││
│  └──────────────────────┘│
│                          │
│  ● All Trainers          │  ← selected by default
│                          │
│  ○ Coach Alex            │
│    Strength & Cond.      │
│                          │
│  ○ Sarah M.              │
│    Yoga & Pilates        │
│                          │
│  ○ John D.               │
│    CrossFit              │
│                          │
└──────────────────────────┘
```

**Data source:** `client.members.list({ organizationId, role: "trainer", status: "active" })`

**Enrichment:** Fetch profiles in parallel via `client.memberProfiles.get()` (same pattern as the trainers page) to show specialization. If profiles are expensive, this can be skipped — just show name.

**Behavior:**
- "All Trainers" is always first and selected by default.
- Clicking a trainer calls `onSelectTrainer(trainerId)`.
- Selected trainer has a highlighted background.
- Search filters client-side by name (debounced 300ms).
- Loading state: skeleton list.

---

### Task 3.2: Refactor appointment view layout

**File to modify:** `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`

**Current structure (simplified):**
```tsx
<div className="space-y-4">
  <h1>Appointments</h1>
  <AppointmentCalendar appointments={appointments} ... />
</div>
```

**New structure:**
```tsx
function RouteComponent() {
  const { data: userContext } = useUserContext();
  const organizationId = userContext?.currentOrganizationId ?? null;
  const currentOrg = userContext?.organizations.find(o => o.id === organizationId);
  const memberRole = currentOrg?.hierarchy?.member?.role;
  const memberId = currentOrg?.hierarchy?.member?.id;
  const isTrainer = memberRole === "trainer";

  // For admins: selected from sidebar. For trainers: locked to self.
  const [sidebarSelectedId, setSidebarSelectedId] = useState<string | null>(null);
  const selectedTrainerId = isTrainer ? memberId : sidebarSelectedId;

  const { startFrom, startTo } = getAppointmentQueryRange();

  const { data: apiAppointments = [], isLoading } = useQuery({
    queryKey: ["appointments", organizationId, selectedTrainerId, startFrom, startTo],
    queryFn: async () => {
      if (!organizationId) return [];
      return client.appointments.list({
        organizationId,
        trainerId: selectedTrainerId ?? undefined,  // <── NEW filter
        startFrom,
        startTo,
        limit: 200,
      });
    },
    enabled: !!organizationId,
    staleTime: 60 * 1000,
  });

  const appointments = useMemo(
    () => apiAppointments.map(mapApiAppointmentToCalendar),
    [apiAppointments],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-heading">
          {isTrainer ? "My Schedule" : "Appointments"}
        </h1>
      </div>

      <div className="flex gap-4">
        {/* Sidebar — hidden for trainers */}
        {!isTrainer && organizationId && (
          <div className="w-64 shrink-0">
            <TrainerSidebar
              organizationId={organizationId}
              selectedTrainerId={sidebarSelectedId}
              onSelectTrainer={setSidebarSelectedId}
            />
          </div>
        )}

        {/* Calendar — takes remaining width */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              Loading appointments...
            </div>
          ) : (
            <AppointmentCalendar
              appointments={appointments}
              onDateSelect={handleDateSelect}
              onAppointmentClick={handleAppointmentClick}
              initialView={search.view === "weekly" ? "weekly" : "monthly"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

---

### Task 3.3: Pass selected trainer to AddAppointmentModal

**File to modify:** `apps/web/src/components/calendar/appointment.tsx`

The `AppointmentCalendar` component already renders `<AddAppointmentModal>`. We need to pass the currently selected trainer ID so the modal can pre-fill the team member field.

**Changes:**

1. Add new prop to `AppointmentCalendarProps`:
```typescript
interface AppointmentCalendarProps {
  appointments?: Appointment[];
  onDateSelect?: (date: Date) => void;
  onAppointmentClick?: (appointment: Appointment) => void;
  onAddAppointment?: () => void;
  initialView?: CalendarView;
  defaultTrainerId?: string | null;  // <── NEW
}
```

2. Pass `defaultTrainerId` to `<AddAppointmentModal>`:
```tsx
<AddAppointmentModal
  ...
  defaultTrainerId={defaultTrainerId}
/>
```

3. In `AddAppointmentModal`, if `defaultTrainerId` is provided, pre-select it in the team member dropdown.

**File to modify:** `apps/web/src/components/calendar/add-appointment-modal.tsx`

Add prop:
```typescript
interface AddAppointmentModalProps {
  // ... existing props
  defaultTrainerId?: string | null;
}
```

In the component, initialize the selected team member state from this prop:
```typescript
const [selectedTeamMember, setSelectedTeamMember] = useState(defaultTrainerId ?? "");
```

---

### Task 3.4: Role-based UI adjustments

**File to modify:** `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`

For trainers:
- Hide the "Add Appointment" button (or make it optional via prop on `AppointmentCalendar`).
- Show "My Schedule" as the page title.
- No sidebar rendered.

For admins:
- Show "Appointments" as the page title.
- Show sidebar with all trainers.
- Show "Add Appointment" button.

This is handled by the `isTrainer` flag already computed in Task 3.2. Pass `hideAddButton={isTrainer}` to `AppointmentCalendar` if needed.

---

### Phase 3 Acceptance Criteria

- [ ] Admin visits `/dashboard/appointment/view` → sees trainer sidebar on left and calendar on right.
- [ ] Sidebar lists all active trainers scoped by admin's hierarchy.
- [ ] "All Trainers" selected by default → calendar shows all appointments.
- [ ] Admin clicks a trainer → calendar refreshes to show only that trainer's appointments.
- [ ] Admin clicks "All Trainers" → calendar goes back to all.
- [ ] Search in sidebar filters trainer list.
- [ ] Trainer visits `/dashboard/appointment/view` → sees only their own calendar, no sidebar.
- [ ] Title shows "My Schedule" for trainers, "Appointments" for admins.
- [ ] Add Appointment modal pre-fills the selected trainer.
- [ ] Existing calendar features (monthly/weekly toggle, date nav, status updates) still work.
- [ ] `bun check-types` passes.

---

## Phase Summary

| Phase | Tasks | Delivers Journeys | Est. Complexity |
|-------|-------|-------------------|-----------------|
| **1** | 1.1–1.7 | Backend for J1, J2 + userContext fix | Medium |
| **2** | 2.1–2.2 | J1, J5 end-to-end | Medium |
| **3** | 3.1–3.4 | J2, J3, J4 end-to-end | Medium-High |

Phases 2 and 3 both depend on Phase 1 but are **independent of each other** — they can be worked on in parallel after Phase 1 is complete.

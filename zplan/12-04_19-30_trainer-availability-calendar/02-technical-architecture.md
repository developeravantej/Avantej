# 2. Technical Architecture

## System Design & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Web Dashboard (apps/web)                                   │
│                                                             │
│  ┌──────────────────────┐  ┌─────────────────────────────┐  │
│  │  Trainers CRUD Page  │  │  Appointment View Page      │  │
│  │  /trainers/view      │  │  /appointment/view          │  │
│  │                      │  │                             │  │
│  │  [Edit Trainer] ───┐ │  │  ┌──────────┐ ┌──────────┐ │  │
│  │  ├─ Profile         │ │  │  │ Trainer  │ │ Calendar │ │  │
│  │  └─ Availability ◄─┘ │  │  │ Sidebar  │ │ (right)  │ │  │
│  │     Weekly schedule   │  │  │ (left)   │ │          │ │  │
│  │     editor            │  │  │          │ │ Filtered │ │  │
│  └──────────────────────┘  │  │ Scoped   │ │ by       │ │  │
│                             │  │ by RBAC  │ │ trainerId│ │  │
│                             │  └────┬─────┘ └────┬─────┘ │  │
│                             └───────┼────────────┼───────┘  │
└─────────────────────────────────────┼────────────┼──────────┘
                                      │            │
                     ┌────────────────┘            │
                     ▼                             ▼
              members.list              appointments.list
              (role:"trainer")          (trainerId filter)
                     │                             │
                     ▼                             ▼
              ┌──────────────────────────────────────┐
              │  oRPC API (packages/api)             │
              │                                      │
              │  trainerAvailability router (NEW)     │
              │  appointments router (MODIFIED)       │
              │  members router (existing)            │
              └──────────────┬───────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │  Tenant Database (Neon)              │
              │                                      │
              │  trainer_availability (NEW)           │
              │  appointments (existing)              │
              │  members (existing)                   │
              └──────────────────────────────────────┘
```

## Data Model: `trainer_availability`

### Schema Definition

```typescript
// packages/db/src/schema/tenant/trainer-availability.ts

import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { members } from "./members";

export const trainerAvailability = pgTable("trainer_availability", {
  id: uuid("id").primaryKey().defaultRandom(),

  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),

  dayOfWeek: text("day_of_week").notNull(),
  // Allowed values: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"

  startTime: text("start_time").notNull(),
  // Format: "HH:MM" (24h), e.g. "09:00", "14:30"

  endTime: text("end_time").notNull(),
  // Format: "HH:MM" (24h), e.g. "12:00", "18:00"

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

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| FK on `members.id` (not `members.userId`) | `members.id` is the PK with a unique constraint; `members.userId` has a unique INDEX but not a unique CONSTRAINT — PostgreSQL FKs require a constraint. Same issue found in Phase 2S with `partner-stripe-accounts`. |
| `text` for `dayOfWeek` / times | Follows the `preferred_times` pattern already in the codebase. No enum — validation happens at the service/router layer. |
| `onDelete: "cascade"` | If a trainer's member record is deleted, their availability should be cleaned up automatically. |
| No unique constraint on (trainerId, dayOfWeek) | A trainer can have multiple shifts per day (e.g., 9–12 and 14–18 on Monday). Each shift is a separate row. |
| `isActive` column included but not filtered on | Included for future use (e.g., temporarily disabling a shift without deleting). The service and router do NOT filter by `isActive` in V1 — all rows are returned. Can add filtering later if needed. |
| No `branchId` column | Confirmed out of scope — availability is per-trainer, not per-branch. |
| Composite index on (trainerId, dayOfWeek) | Optimizes the most common query: "get trainer X's availability for day Y" or "get all availability for trainer X". |

### Example Data

| id | trainerId | dayOfWeek | startTime | endTime | isActive |
|----|-----------|-----------|-----------|---------|----------|
| a1 | trainer-X | monday | 09:00 | 12:00 | true |
| a2 | trainer-X | monday | 14:00 | 18:00 | true |
| a3 | trainer-X | wednesday | 09:00 | 17:00 | true |
| a4 | trainer-X | friday | 10:00 | 16:00 | true |
| a5 | trainer-Y | monday | 08:00 | 20:00 | true |

---

## API Contracts

### Trainer Availability Router

**New file:** `packages/api/src/routers/trainer-availability.ts`

#### `trainerAvailability.list`

```typescript
// Input
z.object({
  organizationId: z.string().uuid(),
  trainerId: z.string().uuid(),
})

// Response
Array<{
  id: string;
  trainerId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}>
```

#### `trainerAvailability.upsert`

Replaces ALL availability for a given trainer (delete-and-reinsert pattern, like `preferredTimes.upsert`).

```typescript
// Input
z.object({
  organizationId: z.string().uuid(),
  trainerId: z.string().uuid(),
  slots: z.array(z.object({
    dayOfWeek: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })),
})

// Response
Array<{ id: string; trainerId: string; dayOfWeek: string; startTime: string; endTime: string }>
```

#### `trainerAvailability.delete`

```typescript
// Input
z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid(),
})

// Response
{ success: boolean }
```

### Appointments Router — Modified `list`

Add optional `trainerId` filter to the existing `list` procedure.

```typescript
// BEFORE: input schema
z.object({
  organizationId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  status: statusSchema.optional(),
  startFrom: z.string().datetime().optional(),
  startTo: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(500).optional(),
})

// AFTER: input schema (one field added)
z.object({
  organizationId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  trainerId: z.string().uuid().optional(),  // <── NEW
  status: statusSchema.optional(),
  startFrom: z.string().datetime().optional(),
  startTo: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(500).optional(),
})
```

Response shape is **unchanged** — the existing appointments array.

### Members Router — `list` (no changes)

Already supports `role: "trainer"` filter and RBAC-scoped results. The appointment view sidebar will call:

```typescript
client.members.list({ organizationId, role: "trainer", status: "active" })
```

---

## Key Technical Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Upsert pattern (delete-all + re-insert) for availability | Same approach as `preferred_times`. Simpler than diff-based updates. One transaction replaces the full weekly schedule. |
| 2 | Permission: reuse `"appointment_management"` | Trainer availability is an appointment concern. Adding a new resource type would require seeding permission data. Using the existing resource keeps it simple. Verified: `seed-rbac.ts` already grants `appointment_management:read/create/update` to the `trainer` role. |
| 3 | Trainer sidebar queries `members.list` (not a new endpoint) | The members router already has role filtering + RBAC scoping. No need for a new endpoint. |
| 4 | `trainerId` added to service-layer `ListAppointmentsParams` | Clean extension — one more optional filter condition pushed to the `conditions` array. No breaking change. |
| 5 | Auto-filter for trainer role uses `userContext.hierarchy.member.id` | When the logged-in user's member role is `"trainer"`, the appointment view uses their `member.id` as the `trainerId` filter and hides the sidebar. **Requires Task 1.7** — the `userContext` response must be updated to include `member.id` (currently absent). |
| 6 | Day ordering via client-side `DAY_ORDER` map | Drizzle's `orderBy: [dayOfWeek]` sorts alphabetically ("friday" < "monday"). Instead, fetch all rows and sort in JS with a `DAY_ORDER` lookup (`monday=0, ..., sunday=6`), then by `startTime`. |

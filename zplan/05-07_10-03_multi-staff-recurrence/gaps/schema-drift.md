# Schema Drift Audit

## Summary

All three tables exist in `packages/db/src/schema/tenant/` and are present in `packages/db/src/generated/tenant-migrations.generated.ts`. However several discrepancies exist between the plan's schema descriptions and actual schema definitions.

---

## Findings

### SD-001 — `appointment_staff.slotIndex` is NULLABLE in schema, plan says "int" (implied NOT NULL)
**Severity: MEDIUM**

Schema: `slotIndex: integer("slot_index")` — no `.notNull()`
Plan section 3.1 describes it as `slotIndex int` without nullable qualifier.
Migration confirms: `"slot_index" integer` (no NOT NULL).

Impact: commission calculator reads `slotIndex` to match config slots. A null `slotIndex` row is skipped or causes undefined behavior.

Fix: Add `.notNull().default(0)` to `slotIndex` in `appointment-staff.ts` and add a migration. OR plan must explicitly acknowledge nullable and handle it in the commission calculator.

---

### SD-002 — `recurrence_rules` has NO timezone on timestamps
**Severity: MEDIUM**

Schema: `createdAt: timestamp("created_at").defaultNow().notNull()` — no `{ withTimezone: true }`
Plan section 7 (Cross-Cutting Concerns — Timezone): "All startTime / endTime timestamps stored with timezone."
The `recurrence_rules.createdAt` and `updatedAt` use default timezone-naive timestamps.

More critically: there is NO `endsOn` timestamp column in `recurrence_rules`. The plan section 3.1 says:
```
endsOn timestamp (via appointments.recurringEndDate)
```
This means `endsOn` is NOT stored in `recurrence_rules` but in `appointments.recurringEndDate`. The plan text is correct but potentially confusing; the schema is consistent with the plan's parenthetical note.

---

### SD-003 — `package_instance_staff` uses `assignedAt` not `createdAt`
**Severity: LOW**

Schema: column is `assignedAt: timestamp("assigned_at").defaultNow().notNull()`
Plan section 3.1 says `createdAt timestamp`.

Plan should be corrected to say `assignedAt` to match actual schema.

---

### SD-004 — No unique constraint on `(recurringParentId, startTime)` on `appointments`
**Severity: HIGH** (Open Question Q2 in plan, confirmed as missing)

Schema review: `appointments` has `recurringParentIdIdx: index("appointments_recurring_idx").on(table.recurringParentId)` — plain index, NOT unique.
No composite unique constraint on `(recurringParentId, startTime)` exists.

Plan section 7 (Transactions): "Phase 2.4 materializeOccurrence: INSERT child in a transaction to prevent duplicate materialization races (add unique constraint on (recurringParentId, startTime) if not already present — check schema)."

Status: NOT present. Plan must include adding this constraint in Phase 2. Without it, concurrent "Edit this occurrence" clicks can produce duplicate child rows.

---

### SD-005 — `appointment_staff.slotIndex` added via ALTER in migration, not original CREATE
**Severity: LOW (informational)**

In `tenant-migrations.generated.ts` line 2065: `ALTER TABLE "appointment_staff" ADD COLUMN IF NOT EXISTS "slot_index" integer;`
The column was added after initial table creation. This is fine but confirms it was added later and has no NOT NULL constraint (consistent with SD-001).

---

### SD-006 — `package_instance_staff` table was added in migration `0018_famous_ego`
**Severity: LOW (informational)**

All three tables confirmed in migrations:
- `appointment_staff`: original CREATE + slot_index ALTER
- `recurrence_rules`: original CREATE
- `package_instance_staff`: added in `0018_famous_ego`

All three confirmed present. Pre-implementation check in META.md can be marked complete.

---

### SD-007 — `appointments.trainerId` uses `{ onDelete: "set null" }` not "cascade"
**Severity: LOW (informational)**

Schema: `trainerId: uuid("trainer_id").references(() => members.id, { onDelete: "set null" })`

This means deleting a member sets `trainerId = NULL` on related appointments. The plan does not mention this. If a trainer is deleted, the appointment loses its `trainerId` link but `appointment_staff` rows (cascade delete via appointments FK) remain if the appointment itself is not deleted. No plan change needed, but worth noting for the implementation of staff removal.

---

## Verified Correct

- `appointment_staff.staffId`: text (no FK) — correct per plan
- `appointment_staff`: UNIQUE(appointmentId, staffId) — confirmed as `uniqueIndex`
- `package_instance_staff`: UNIQUE(packageInstanceId, staffId) AND UNIQUE(packageInstanceId, slotIndex) — both confirmed
- `package_instance_staff.role`: text DEFAULT 'trainer' — confirmed
- `recurrence_rules.appointmentId`: unique FK to appointments.id — confirmed (`.unique()`)
- `recurrence_rules.repeatOn`: jsonb typed as `number[] | null` — confirmed
- `recurrence_rules.endsType`: text not null — confirmed
- Legacy recurrence columns on `appointments`: all four present (isRecurring, recurringParentId, recurringFrequency, recurringEndDate)

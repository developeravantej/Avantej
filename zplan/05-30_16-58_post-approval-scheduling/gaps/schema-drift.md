# Schema Drift Audit
**Session:** 05-30_16-58_post-approval-scheduling
**Audit Date:** 2026-05-30
**Findings:** 5 (1 CRITICAL · 3 HIGH · 1 INFO)

## Findings

### [CRITICAL] Missing foreign key on package_instances.assignedTrainerId
**Plan claims:** `assignedTrainerId` is `members.id` with referential integrity
**Actual:** `assignedTrainerId: uuid("assigned_trainer_id")` has NO foreign key reference to members
**File:** packages/db/src/schema/tenant/package-instances.ts:89
**Fix:** Add `.references(() => members.id, { onDelete: "set null" })` to assignedTrainerId column definition
**Impact:** Plan assumes trainerId validation via FK; actual schema allows orphaned/invalid trainer references. Data integrity at risk if trainer member is deleted without cascading cleanup.

---

### [HIGH] Missing index on appointments(trainerId, startTime)
**Plan claims:** Index exists at Q3 for trainer availability/schedule conflict detection
**Actual:** No compound index on (trainerId, startTime); only single indexes exist: `appointments_trainer_idx` and `appointments_start_time_idx`
**File:** packages/db/src/schema/tenant/appointments.ts:171-213
**Fix:** Add index: `.on(table.trainerId, table.startTime)` to appointments table indexes for efficient trainer schedule queries
**Impact:** Queries filtering by both trainerId and startTime will require table scan or multi-index merge, degrading scheduling query performance.

---

### [HIGH] Plan references table names that use different schema tables
**Plan claims:** `trainer_availability` and `trainer_availability_exceptions` tables with `kind` enum
**Actual:** Schema defines BOTH:
  - `trainer_availability` (matches plan) with `kind` enum: "available", "blocked", "timeoff" ✓
  - `coach_intake_availability` (separate intake-specific table, not in plan scope)
  - `coach_intake_exceptions` (separate intake-specific table, not in plan scope)
**File:** packages/db/src/schema/tenant/trainer-availability.ts, coach-intake-availability.ts, coach-intake-exceptions.ts
**Fix:** Plan should clarify whether it uses `trainer_availability` (general) or `coach_intake_availability` (intake-only). Two separate availability systems exist; plan does not acknowledge this bifurcation.
**Impact:** Scheduling implementation may target wrong table (coach intake vs general availability), causing availability mismatches.

---

### [HIGH] package_instance_staff.staffId is userId (text), plan asserts members.userId
**Plan claims:** `package_instance_staff.staffId` is `members.userId` — correct assertion
**Actual:** Column definition: `staffId: text("staff_id").notNull()` with comment "References members.userId (Better-Auth user.id)" ✓
**File:** packages/db/src/schema/tenant/package-instance-staff.ts:34
**Issue:** Plan states this correctly, but schema has NO foreign key to members or users table (cross-DB design). No validation layer enforces FK; orphaned staffId references possible.
**Impact:** Data integrity: staffId can reference non-existent users with no constraint enforcement. Application must validate at service layer.

---

### [INFO] Services duration column is "duration" (seconds), not durationMin
**Plan claims:** Open Question Q1 — exact column name unconfirmed (durationMin vs duration)
**Actual:** `duration: integer("duration").notNull()` in seconds (with `durationUnitType` field to interpret units)
**File:** packages/db/src/schema/tenant/services.ts:25
**Resolution:** Q1 RESOLVED — use `services.duration` (in seconds by default; durationUnitType defaults to "minutes")
**Note:** Appointments table uses `duration: integer("duration").notNull()` in minutes (line 41), creating unit mismatch: services duration is seconds but appointments duration is minutes. Conversion layer required.

---

## Summary

The plan correctly identifies core columns and tables, but audit reveals **three data integrity gaps**: (1) missing FK on assignedTrainerId allows orphaned trainer references, (2) missing compound index on appointments(trainerId, startTime) degrades scheduling query performance, (3) plan does not acknowledge the dual availability systems (trainer_availability vs coach_intake_availability), risking implementation against the wrong table. Additionally, services.duration and appointments.duration use conflicting units (seconds vs minutes), requiring explicit conversion logic. One FK constraint (package_instance_staff.staffId → members.userId) is documented but not enforced in schema, relying entirely on application validation. All claims about column existence are CORRECT; column types and constraints match plan expectations where defined.


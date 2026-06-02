# Type Safety Audit
**Session:** 05-30_16-58_post-approval-scheduling
**Findings:** 10 (1 critical · 2 high · 5 medium · 2 low)

## Findings

### [CRITICAL] `serviceDurationMin` vs `durationMin` — inconsistent naming within the same output type
**Plan claims:** `proposeSchedule` output has `serviceDurationMin: number` at the top level and `durationMin: number` inside each `proposed[]` slot.
**Actual:** The codebase uses `duration` (minutes) everywhere: `appointments.create` input (`duration: z.number().int().min(1)`), `updateAppointment` params, and the `appointments` DB column. No existing procedure uses `durationMin`.
**File:** `packages/api/src/routers/appointments/crud.procedures.ts:57`
**Fix:** Rename both fields to `duration` to match all existing appointment API conventions. Remove `durationMin` entirely from the plan's API contracts.

---

### [HIGH] `bulkCreateFromSchedule` input uses `durationMin` — diverges from every existing appointment procedure
**Plan claims:** `slots: Array<{ startTime: string; durationMin: number }>`
**Actual:** `appointments.create` uses `duration: z.number().int().min(1)`. `appointments.update` uses `duration: z.number().int().min(1).optional()`. `CreateAppointmentParams` uses `duration: number`. A new procedure using `durationMin` breaks the naming convention and will cause copy-paste errors in callers.
**File:** `packages/api/src/routers/appointments/crud.procedures.ts:57`
**Fix:** Rename to `duration` in the `bulkCreateFromSchedule` input schema.

---

### [HIGH] `bulkCreateFromSchedule` handler must convert `startTime: string` → `Date` — plan omits this
**Plan claims:** Slots carry `startTime: string (ISO)` and the handler calls `createAppointment(...)`.
**Actual:** `createAppointment` service expects `startTime: Date`. The existing `appointments.create` handler does `startTime: new Date(input.startTime)` (crud.procedures.ts:143). If the bulk handler forgets this conversion, TypeScript may not catch it if the service type is loosely inferred, causing a runtime crash.
**File:** `packages/api/src/routers/appointments/crud.procedures.ts:143`
**Fix:** Document explicitly in Phase 1 task 1.3: each slot must be mapped `startTime: new Date(slot.startTime)` before calling `createAppointment`.

---

### [MEDIUM] `proposeSchedule` returns `trainerName` — cross-DB hydration not in the plan
**Plan claims:** Output includes `trainerName: string | null`.
**Actual:** No existing query procedure hydrates trainer names from the control-panel DB in its response. Names are resolved client-side from the member list already loaded in the approvals view. Adding a cross-DB lookup in a query procedure adds latency and a new error-handling path not covered in the plan.
**File:** `packages/api/src/routers/appointments/crud.procedures.ts`
**Fix:** Remove `trainerName` from `proposeSchedule` output. The approvals view already has the trainer list loaded; the client can resolve the name from `assignedTrainerId` locally.

---

### [MEDIUM] `reschedule` output shape is minimal but existing CRUD always returns the full record
**Plan claims:** `output: { id: string; startTime: string; durationMin: number }`
**Actual:** `appointments.update` and `appointments.create` both return the full appointment record (the updated DB row). Client components (calendar, detail dialog) destructure many fields. A minimal return from `reschedule` forces clients to re-fetch or work with stale data.
**File:** `packages/api/src/routers/appointments/crud.procedures.ts`
**Fix:** Return the full appointment record (same shape as `appointments.update`). Also rename `durationMin` → `duration`.

---

### [MEDIUM] No Zod output schema defined for `proposeSchedule` — status union unvalidated at runtime
**Plan claims:** `proposed[].status: "ok" | "conflict" | "outside_availability" | "after_expiry"`
**Actual:** All existing schemas in `appointments/schemas.ts` use Zod enums. A handler that returns an unvalidated union can silently return a wrong string, and oRPC won't catch it without an `.output()` declaration.
**File:** `packages/api/src/routers/appointments/schemas.ts`
**Fix:** Add `export const proposedSlotStatusSchema = z.enum(["ok", "conflict", "outside_availability", "after_expiry"])` to `schemas.ts`. Define full output Zod schema and attach with `.output(proposeScheduleOutputSchema)` on the procedure.

---

### [MEDIUM] `computeAvailableSlots` returns `{ date, windows: [{startTime, endTime}] }` — ISO assembly not shown
**Plan claims:** `proposeSchedule` uses `computeAvailableSlots` to derive slot `startTime: string (ISO)`.
**Actual:** `computeAvailableSlots` returns `ComputedDayAvailability[]` where `windows` contain `startTime: string` (HH:MM format, NOT ISO datetime). Constructing an ISO datetime requires combining `date` (YYYY-MM-DD) with `window.startTime` (HH:MM), accounting for the tenant timezone. The plan does not document this transformation.
**File:** `packages/services/src/trainer-availability.service.ts`
**Fix:** Phase 1 task 1.1 must document: `new Date(\`${day.date}T${window.startTime}:00\`)` (tenant-TZ-aware). Open Q2 (tenant timezone) is therefore blocking this specific step.

---

### [MEDIUM] `proposeSchedule` `fromDate` input has no format validation in plan's Zod schema
**Plan claims:** `fromDate?: string (YYYY-MM-DD)`
**Actual:** The plan shows no Zod schema for the input. Existing procedures that take date strings use regex: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")` (trainer-availability.ts:74).
**File:** `packages/api/src/routers/trainer-availability.ts:74`
**Fix:** Add `fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` to the input schema.

---

### [LOW] `coverageForPreferredTimes` output field `perPreferred` is unclear
**Plan claims:** Output field `perPreferred: Array<{...}>`
**Actual:** No naming convention issue, but `perPreferred` is ambiguous (is it a map? a list?). Existing API field names use clear nouns: `proposed`, `windows`, `slots`.
**File:** `plan/plan.md §3.3`
**Fix:** Rename to `coverage` or `slots` for clarity.

---

### [LOW] No type for `ProposedSlot` — inline definition duplicated across plan sections
**Plan claims:** The `proposed[]` array shape is defined inline in §3.3 and referred to narratively elsewhere.
**Actual:** Existing shared types live in `packages/api/src/routers/appointments/types.ts` and `packages/types/src/`.
**File:** `packages/api/src/routers/appointments/types.ts`
**Fix:** Define `type ProposedSlot = { index: number; startTime: string; duration: number; sourcePriority: number | null; status: ProposedSlotStatus; conflictReason?: string }` in `appointments/types.ts` and reference it in both the service and the procedure output schema.

---

## Summary

The most impactful type issues are the `duration`/`durationMin`/`serviceDurationMin` naming inconsistency (which affects every new procedure and will cause integration errors), the missing `string` → `Date` conversion in `bulkCreateFromSchedule`, and the undefined Zod output schemas. None of these would be caught by TypeScript at compile time if the service layer uses loose typing — they would surface as runtime errors. All are mechanical fixes requiring < 1 hour to resolve before Phase 1 implementation begins.

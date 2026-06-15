# Doc Consistency Audit
**Session:** 05-30_16-58_post-approval-scheduling
**Findings:** 7 (2 critical · 2 high · 2 medium · 1 low)

## Findings

### [CRITICAL] Duration field unit mismatch — services (seconds) vs appointments (minutes)
**Plan claims:** Open Q1 asks for confirmation of `services.durationMin` column. Plan uses both `durationMin` and `duration` across API contracts without resolving the unit.
**Actual:** `services.duration` stores **seconds** (integer). `appointments.duration` stores **minutes** (integer). The plan's output type uses `serviceDurationMin` at the top level and `durationMin` in nested slots — neither matches the DB column names, and no conversion formula is documented in Phase 1 tasks.
**File:** `packages/db/src/schema/tenant/services.ts`, `packages/db/src/schema/tenant/appointments.ts`
**Fix:** Phase 1.1 task must document: `serviceDurationMin = Math.floor(services.duration / 60)`. Standardize API field name to `duration` (matching existing `appointments.create` schema).

---

### [CRITICAL] Missing composite index `appointments(trainerId, startTime)` — flagged as Q3 but no migration task assigned
**Plan claims:** Risk acknowledged in §7 scalability checklist: "add the index via tenant migration before Phase 1 ships". No migration task exists in any phase.
**Actual:** Schema only has single-column `trainerIdIdx` and `startTimeIdx`. No composite index. The plan assigns no owner or phase to create it.
**File:** `packages/db/src/schema/tenant/appointments.ts`
**Fix:** Add Phase 0 task (or Phase 1 pre-requisite): author `packages/db/src/migrations/tenant/00NN_appointments_trainer_starttime_idx.sql`, run `bun gen:migrations`, commit both files.

---

### [HIGH] Phase 5 dependency on "Phase 4 picker" is ambiguous — Phase 4 never extracts a shared picker
**Plan claims:** Phase 5 depends on "Phase 4 (picker)". Phase 4 says "build picker as shared component in P2, reuse here." Phase 5 says "ScheduleSessionsPanel in single-slot mode OR BookReplacementDialog."
**Actual:** Phase 2 task list has 4 tasks (2.1–2.4) — none mentions extracting a `DateTimeSlotPicker` component. Phase 4 task 4.2 builds `RescheduleDialog` with its own pickers. Phase 5 cannot start until this is resolved.
**File:** `plan/plan.md` §5 Phase 2 + Phase 4
**Fix:** Decide before Phase 2 starts: (A) extract `DateTimeSlotPicker` as task 2.1b; or (B) Phase 4 builds its own, Phase 5 reuses Phase 4's dialog. Update phase dependency lines.

---

### [HIGH] Journey D single-slot booking modality unresolved — `ScheduleSessionsPanel` vs `BookReplacementDialog`
**Plan claims:** Journey D step 3 says "ScheduleSessionsPanel in single-slot mode (or a 'Book replacement' variant)". Phase 5 task 5.2 says "OR a thin BookReplacementDialog". Both are listed as new files.
**Actual:** The OR is unresolved. Phase 2 scope depends on whether `ScheduleSessionsPanel` needs a `mode` prop. Phase 5 implementation depends on the choice.
**File:** `plan/plan.md` §4 Journey D, §5 Phase 5
**Fix:** Choose one: recommend `ScheduleSessionsPanel mode="single"` (less code, reuses proposal logic). Update Phase 2 task 2.1 to accept a `mode` prop. Remove `BookReplacementDialog` from new-files list.

---

### [MEDIUM] Duration terminology scattered — `duration`, `durationMin`, `serviceDurationMin` used inconsistently
**Plan claims:** Output type uses `serviceDurationMin` at top level but `durationMin` in nested `proposed[]`. Phase task 1.1 says "resolve service `duration`". Phase 4 update says "Updates `startTime`/`duration`" (unqualified).
**Actual:** DB columns are `services.duration` (seconds) and `appointments.duration` (minutes). API contract should be standardized.
**File:** `plan/plan.md` §3.3, §5 phases 1 + 4
**Fix:** Global replace: use `duration` (minutes, matching existing appointment API) for all API fields. Document `services.duration ÷ 60` conversion once in Phase 1.1.

---

### [MEDIUM] Phase 4 marked "independent" but depends on Phase 2 picker extraction
**Plan claims:** Phase 4 dependency: "none (independent), but shares date/time picker primitives with P2".
**Actual:** If Phase 2 extracts a picker, Phase 4 depends on Phase 2. If Phase 4 builds its own, Phase 5 depends on Phase 4 not Phase 2. The statement "independent" is contradicted by the phrase that follows it.
**File:** `plan/plan.md` §5 Phase 4
**Fix:** Replace dependency line with: "Depends on Phase 2 (picker extraction in task 2.1b)." OR "Independent — RescheduleDialog uses inline pickers; Phase 5 depends on Phase 1 + Phase 4."

---

### [LOW] Phase 2 task list does not include picker extraction task
**Plan claims:** Phase 4 and Phase 5 both need a reusable date+time picker from Phase 2.
**Actual:** Phase 2 has tasks 2.1–2.4. None mentions extracting a picker component.
**File:** `plan/plan.md` §5 Phase 2
**Fix:** Add task 2.1b: "Extract `DateTimeSlotPicker` component (date + time pickers, pre-fillable) and export from `apps/web/src/components/appointments/`."

---

## File Existence Verification

| File | Expected | Status |
|---|---|---|
| `packages/services/src/schedule-proposal.service.ts` | New | ✅ Does not exist yet |
| `packages/api/src/routers/appointments/schedule.procedures.ts` | New | ✅ Does not exist yet |
| `apps/web/src/features/appointments/components/RescheduleDialog.tsx` | New | ✅ Does not exist yet |
| `apps/web/src/features/appointments/components/BookReplacementDialog.tsx` | New | ✅ Does not exist yet |
| `apps/web/src/features/approvals/components/ScheduleSessionsPanel.tsx` | New | ✅ Does not exist yet |
| `packages/services/src/index.ts` | Existing | ✅ Exists |
| `packages/api/src/routers/appointments/crud.procedures.ts` | Existing | ✅ Exists |
| `packages/api/src/routers/appointments/index.ts` | Existing | ✅ Exists |
| `packages/api/src/routers/trainer-availability.ts` | Existing | ✅ Exists |
| `apps/web/src/features/approvals/components/ExpandedRowDetail.tsx` | Existing | ✅ Exists |
| `apps/web/src/features/approvals/components/InboxRow.tsx` | Existing | ✅ Exists |
| `apps/web/src/features/approvals/components/InboxList.tsx` | Existing | ✅ Exists |
| `apps/web/src/features/appointments/components/AppointmentDetailDialog.tsx` | Existing | ✅ Exists |
| `apps/web/src/features/appointments/components/AttendanceDialog.tsx` | Existing | ✅ Exists |
| `docs/TENANT_MIGRATION_WORKFLOW.md` | Existing | ✅ Exists |

---

## Summary

All file paths are correct — no unresolvable references. The plan is structurally sound but has two blocking ambiguities (Journey D modality, picker extraction ownership) that must be resolved before Phase 2 starts, and a missing migration task for the composite index that must be added before Phase 1 ships. The duration unit inconsistency (services in seconds, appointments in minutes, API using `durationMin`) must be addressed in Phase 1.1 to avoid a silent runtime error.

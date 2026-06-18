# Swarm Audit — GAPS.md
**Session:** 05-30_16-58_post-approval-scheduling
**Run at:** 2026-05-30T17:10Z
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 32 (5 critical · 9 high · 11 medium · 5 low · 2 info)

---

## Priority Fix Order

### P1 — Critical (block execution — fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| C1 | schema-drift | `services.duration` stores **seconds**; appointments store **minutes**; plan's `durationMin` API fields assume minutes — no conversion formula in Phase 1 tasks | `schema/tenant/services.ts`, `appointments.ts` | Add `serviceDurationMin = Math.floor(services.duration / 60)` to Phase 1.1; standardize API field to `duration` |
| C2 | doc-consistency | Missing composite index `appointments(trainerId, startTime)` — flagged as Q3 but no migration task assigned to any phase | `schema/tenant/appointments.ts` | Add Phase 0 task: author `00NN_appointments_trainer_starttime_idx.sql`, `bun gen:migrations`, commit |
| C3 | type-safety | `serviceDurationMin` vs `durationMin` in the same `proposeSchedule` output type — inconsistent with every existing procedure that uses `duration` | `crud.procedures.ts:57` | Rename both to `duration` across all new API contracts |
| C4 | test-coverage | Zero test coverage on `bulkCreateFromSchedule` credit guard and `FOR UPDATE` concurrency — a financial mutation with no tests | Plan Phase 1 | Write integration tests (credit bound, over-booking rejected, partial failure) before or alongside Phase 1 implementation |
| C5 | test-coverage | Zero test coverage on Journey D no-show reinstate + replacement (net-zero credit invariant) | Plan Phase 5 | Write test asserting: reinstate +1 credit, replacement −1, original stays `no-show`, net = 0 |

---

### P2 — High (fix before merging)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| H1 | schema-drift | No FK constraint on `assignedTrainerId` → `members.id`; plan assumes referential integrity but only application layer enforces it | `schema/tenant/package-instances.ts:73` | Document as known gap; add NOT NULL + FK if trainers are always required on active packages |
| H2 | schema-drift | Two trainer availability tables exist: `trainer_availability` (general) and `coach_intake_availability` (intake-specific) — plan only targets the former; may be using wrong table | `schema/tenant/coach-intake-availability.ts` | Confirm which table `computeAvailableSlots` reads; document in Phase 1 |
| H3 | type-safety | `bulkCreateFromSchedule` input uses `durationMin` — diverges from `duration` naming in every existing appointment procedure | `crud.procedures.ts:57` | Rename to `duration` |
| H4 | type-safety | `bulkCreateFromSchedule` handler must convert `startTime: string` → `Date` before calling `createAppointment`; plan omits this | `crud.procedures.ts:143` | Explicit `new Date(slot.startTime)` in Phase 1.3 task |
| H5 | doc-consistency | Phase 5 depends on "Phase 4 picker" but Phase 4 never extracts a shared picker component; Phase 2 task list has no picker-extraction task | `plan.md §5 Phase 2 + 4` | Decide before Phase 2: extract `DateTimeSlotPicker` as task 2.1b or keep inline; update dependency lines |
| H6 | doc-consistency | Journey D modality unresolved: `ScheduleSessionsPanel mode="single"` vs `BookReplacementDialog` — both listed as new files; Phase 2 scope depends on the choice | `plan.md §4 Journey D, §5 Phase 5` | Choose `ScheduleSessionsPanel mode="single"` (recommended), remove `BookReplacementDialog`, update Phase 2 task 2.1 |
| H7 | test-coverage | Zero test coverage on `appointments.reschedule` — status guard, no credit movement, conflict detection | Plan Phase 4 | Write unit tests alongside Phase 4 before merging |
| H8 | test-coverage | `createAppointment` FOR UPDATE concurrency guard not tested for concurrent scheduling actors | Plan Phase 1 | Add concurrency integration test |
| H9 | api-surface | 4 new procedures (`proposeSchedule`, `bulkCreateFromSchedule`, `reschedule`, `coverageForPreferredTimes`) and 1 service file don't exist yet — confirmed as expected new work but must all be created before UI phases | New files | All Phase 1 + Phase 3 backend tasks; create before Phase 2/3 UI |

---

### P3 — Medium (fix before shipping)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| M1 | type-safety | `proposeSchedule` returns `trainerName` requiring a cross-DB lookup; no existing query proc hydrates names; adds latency and uncovered error path | `plan.md §3.3` | Remove `trainerName`; client resolves from already-loaded member list |
| M2 | type-safety | `reschedule` output is minimal (`{id, startTime, duration}`) but existing CRUD returns full appointment record; clients destructure many fields | `plan.md §3.3` | Return full appointment record (same as `appointments.update`) |
| M3 | type-safety | No Zod output schema for `proposeSchedule`; `status` union unvalidated at runtime | `appointments/schemas.ts` | Add `proposedSlotStatusSchema = z.enum([...])` + `.output()` on procedure |
| M4 | type-safety | `computeAvailableSlots` returns HH:MM windows, not ISO datetimes; the date+TZ assembly step is undocumented | `trainer-availability.service.ts` | Document `new Date(\`${day.date}T${window.startTime}:00\`)` in Phase 1.1; resolves after Q2 (tenant TZ) is answered |
| M5 | type-safety | `fromDate` input on `proposeSchedule` has no Zod format validation | `trainer-availability.ts:74` (pattern to copy) | Add `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` |
| M6 | doc-consistency | `duration` / `durationMin` / `serviceDurationMin` used inconsistently across 6+ locations in the plan | `plan.md` | Global replace: use `duration` (minutes) everywhere in API contracts; document seconds→minutes conversion once |
| M7 | doc-consistency | Phase 4 dependency says "none (independent)" but also "shares picker with P2" — contradiction | `plan.md §5 Phase 4` | Fix to: "Depends on Phase 2 (picker extraction task 2.1b)" |
| M8 | scalability | Missing composite index `(trainerId, startTime)` on appointments — single-column indexes only; conflict lookups degrade at 1k+ appointments per trainer | `schema/tenant/appointments.ts` | Tenant migration `00NN_appointments_trainer_starttime_idx.sql` (overlaps C2 — same fix) |
| M9 | test-coverage | No frontend Vitest tests for `ScheduleSessionsPanel`, `RescheduleDialog` — components don't exist yet | Plan phases 2+4 | Create component tests alongside implementation |
| M10 | test-coverage | `reinstateCredits` existing test coverage is minimal — Journey D net-neutral invariant not tested end-to-end | `apps/server/src/tests/` | Extend existing `reinstateCredits` tests to cover the combined reinstate+replacement flow |
| M11 | type-safety | No shared `ProposedSlot` type defined — inline definition duplicated across plan; should live in `appointments/types.ts` | `packages/api/src/routers/appointments/types.ts` | Define `type ProposedSlot` in types.ts; reference in service + procedure |

---

### P4 — Low / Info

- **[LOW schema-drift]** `package_instance_staff.staffId` stores `members.userId` (cross-DB, no FK possible) — plan correctly documents this but doesn't add a code comment for future maintainers. Add an inline comment in the bulk-create handler.
- **[LOW schema-drift]** Latest migration is `0072_trainer_availability_exceptions.sql` — any new index migration must be `0073_` or higher. Confirm before authoring.
- **[LOW doc-consistency]** Phase 2 task list missing explicit picker-extraction task 2.1b (overlaps H5 fix).
- **[LOW type-safety]** `coverageForPreferredTimes` output field named `perPreferred` — rename to `coverage` for clarity.
- **[LOW type-safety]** No `ProposedSlot` type alias in `types.ts` — inline definition scattered (overlaps M11).
- **[INFO api-surface]** All existing procedures called by the plan (`reinstateCredits`, `getComputedSlots`, `preferredTimes.list`, `members.list`, `assignTrainer`) confirmed present and registered in baseRouter. ✅
- **[INFO scalability]** GCal sync fires after transaction commits (fire-and-forget) — no network I/O holding transactions open. ✅

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 1 | 2 | 0 | 2 | 0 | ⚠️ needs fixes |
| api-surface | 0 | 1 | 0 | 0 | 1 | ✅ mostly clean |
| test-coverage | 2 | 3 | 2 | 0 | 0 | 🔴 gaps on financial paths |
| doc-consistency | 2 | 2 | 2 | 1 | 0 | ⚠️ needs fixes |
| type-safety | 1 | 2 | 5 | 2 | 0 | ⚠️ needs fixes |
| scalability | 0 | 0 | 1 | 0 | 1 | ✅ sound |

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| P1 critical fixes (duration naming + migration task + test stubs) | plan.md + 1 new migration SQL | ~1,500 | Mostly plan edits + new migration file |
| P2 high fixes (picker extraction decision, Journey D modality, type renames) | plan.md + 2 type file edits | ~2,000 | Plan rewrites + type-rename propagation |
| P3 medium fixes (Zod schemas, output type corrections, `ProposedSlot` type) | 3–4 new schema/type additions | ~3,000 | New Zod schemas + type alias |
| All test stubs for financial paths (P1 C4, C5, H7, H8) | 4 new test files | ~8,000 | Integration + unit test files |

---

## Auto-fixable findings (safe for `--apply` to plan.md)

| # | Lens | Finding | Location in plan.md | Mechanical fix |
|---|------|---------|---------------------|----------------|
| A1 | doc-consistency | `durationMin` → `duration` in all API contracts | §3.3 proposeSchedule output, bulkCreateFromSchedule input, reschedule input/output | Global replace `durationMin` → `duration`; replace `serviceDurationMin` → `duration` |
| A2 | doc-consistency | Add migration task for composite index | §5 Phase 1 dependencies | Add: "Pre-req: author `packages/db/src/migrations/tenant/0073_appointments_trainer_starttime_idx.sql` + `bun gen:migrations`" |
| A3 | doc-consistency | Resolve Phase 4 dependency contradiction | §5 Phase 4 | Change "Dependencies: none (independent)" → "Dependencies: Phase 2 (picker, task 2.1b)" |
| A4 | doc-consistency | Add picker-extraction task to Phase 2 | §5 Phase 2 task list | Add task 2.1b: "Extract `DateTimeSlotPicker` component; export from `apps/web/src/components/appointments/`" |
| A5 | doc-consistency | Resolve Journey D modality | §4 Journey D, §5 Phase 5 | Choose `ScheduleSessionsPanel mode="single"`; remove `BookReplacementDialog` from new-files |
| A6 | doc-consistency | Mark Q1 as resolved with answer | §8 Open Questions Q1 | Change to: "Q1 RESOLVED: `services.duration` is **seconds**; convert via `Math.floor(services.duration / 60)` in Phase 1.1" |
| A7 | type-safety | Remove `trainerName` from `proposeSchedule` output | §3.3 proposeSchedule output type | Delete the `trainerName: string | null` line |
| A8 | type-safety | Add `fromDate` regex validation note | §3.3 proposeSchedule input | Add: `fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` |
| A9 | type-safety | Rename `perPreferred` → `coverage` | §3.3 coverageForPreferredTimes output | Replace field name |

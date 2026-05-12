# Audit: 05-04_17-18_coach-intake-availability

**Audited:** 2026-05-05 14:00
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 7 (all new files — expected pre-execution) |
| Missing impact | 2 files with unlisted callers |
| Unresolved questions | 0 (all 5 open questions in §8 are resolved inline) |
| Execution state | not started |

---

## Findings

### Structural gaps

All 8 sections are present with substantive content. No gaps.

1. Overview — problem, goals, success criteria, scope: present
2. Result (Before/After) — present for all 3 user roles
3. Technical Architecture — schema DDL, API contracts, key decisions table: present
4. User Journeys — 5 journeys each with explicit "Where it lives": present
5. Phased Implementation — 3 phases, each delivering ≥1 journey, with tasks and acceptance criteria: present
6. Impact & Breakage Analysis — callers listed, deployment coupling, breakage vectors: present
7. Cross-Cutting Concerns — error handling, testing, migration, rollback, performance: present
8. Open Questions / Risks — 5 questions all resolved inline: present

---

### Broken references (plan → codebase)

The following 7 files are listed as NEW in the plan and correctly do not yet exist. This is expected pre-execution — not a plan defect. Listed for completeness:

| File | Status |
|------|--------|
| `packages/db/src/schema/tenant/coach-intake-availability.ts` | MISSING (new — expected) |
| `packages/db/src/schema/tenant/coach-intake-exceptions.ts` | MISSING (new — expected) |
| `packages/services/src/coach-intake.service.ts` | MISSING (new — expected) |
| `packages/api/src/routers/coach-intake.ts` | MISSING (new — expected) |
| `apps/native/components/weekly-timetable.tsx` | MISSING (new — expected) |
| `apps/web/src/components/trainers/coach-intake-editor.tsx` | MISSING (new — expected) |
| `apps/web/src/components/trainers/coach-intake-claim-dialog.tsx` | MISSING (new — expected) |

All modified files exist and match:
- `packages/db/src/schema/tenant-schema.ts` — EXISTS (wraps `./tenant/index.ts`; see correction below)
- `packages/services/src/index.ts` — EXISTS
- `packages/api/src/routers/index.ts` — EXISTS
- `apps/native/app/(app)/dashboard/buy-package/trainer.tsx` — EXISTS
- `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/availability.tsx` — EXISTS
- `apps/web/src/components/trainers/trainer-availability-editor.tsx` — EXISTS
- `apps/web/src/components/trainers/trainer-availability-sheet.tsx` — EXISTS

**Schema registration correction (medium severity):** The plan says to register new tables in `packages/db/src/schema/tenant-schema.ts`. In reality, `tenant-schema.ts` is a single-line re-export (`export * from "./tenant"`). The actual registration file is `packages/db/src/schema/tenant/index.ts`. Implementors must add `export * from "./coach-intake-availability"` and `export * from "./coach-intake-exceptions"` to `packages/db/src/schema/tenant/index.ts`.

---

### Domain Logic Warnings

1. **Multi-tenant isolation — OK.** All queries target `context.tenantDb` (per-organization Neon branch). The `listCoachIntakeByBranch` service signature correctly mirrors the existing `listTrainerAvailabilityByBranch` pattern which uses both `controlPanelDb` (to resolve user names) and `tenantDb` (org-scoped data).

2. **organizationId scoping — OK.** Tenant DB isolation provides org-level scoping automatically.

3. **UNIQUE constraint for claimSlot — sound design, but DDL gap.** The plan proposes `UNIQUE (trainerId, date, startTime, endTime)` on `coach_intake_exceptions` in §7 (Performance §6). This is correct. However, the DDL snippet in §3 does NOT include this constraint. The implementor must add `uniqueIndex("coach_intake_exc_unique_claim_idx").on(table.trainerId, table.date, table.startTime, table.endTime)` to the table definition manually.

4. **Journey realism — OK.** All 5 journeys are realistic for a gym/fitness SaaS coach management flow.

5. **claimSlot dayOfWeek derivation — implementation detail gap.** The plan requires validating that a matching recurring slot exists before inserting an exception. Since exceptions store `date` (not `dayOfWeek`), the service must derive `dayOfWeek` from the date string (timezone-safe). This is not documented in Task 1.3.

---

### Missing impact

1. **`packages/db/src/schema/tenant/index.ts` not listed as a modified file.** The plan lists `tenant-schema.ts` but the actual registration happens in `tenant/index.ts`. This file is not in the plan's "Modified Files" table.

2. **`apps/web/src/components/trainers/TrainerFormDialog.tsx`** is an unlisted caller of `trainer-availability-editor.tsx` (the pattern the plan mirrors). Not a breakage risk, but worth knowing the editor has two existing consumers.

---

### Unresolved questions

All 5 items in §8 carry explicit resolution statuses. Zero unresolved.

---

### Execution & verification gaps

- No `execute/log.md` — feature has not been started.
- No `chrome-test/` folder — no browser automation test plan.
- No `research/brief.md` — no research notes.
- No `prompts/` folder — no saved prompts.

Session is fully pre-execution.

---

## Priority Actions

1. **Fix schema registration target in plan** — Task 1.1 and 1.2 should reference `packages/db/src/schema/tenant/index.ts`, not `tenant-schema.ts`. Update before executing.

2. **Add UNIQUE constraint to §3 DDL snippet** — `coach_intake_exceptions` table definition is missing `uniqueIndex("coach_intake_exc_unique_claim_idx").on(table.trainerId, table.date, table.startTime, table.endTime)`. Add it to the plan before Task 1.2 is executed.

3. **Document dayOfWeek derivation in Task 1.3** — note that `claimIntakeSlot` must derive day-of-week from the date parameter (timezone-safe) to validate against the recurring slot template.

4. **Add `packages/db/src/schema/tenant/index.ts` to the Modified Files table** — currently missing from §5 and the File Index.

---

## Status rationale

Plan is structurally complete (8/8 sections), domain logic is sound, all 7 missing files are expected new files, and all open questions are resolved. Two correctness issues prevent `clean`: the schema registration path is stated incorrectly (`tenant-schema.ts` should be `tenant/index.ts`), and the UNIQUE constraint described in §7 is absent from the §3 DDL. Both are one-line fixes and easy to correct before execution starts.

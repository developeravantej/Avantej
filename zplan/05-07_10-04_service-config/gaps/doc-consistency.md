# Doc Consistency Audit — Pass 1

**Auditor:** doc-consistency-auditor
**Date:** 2026-05-07

## File Path Verification

| Plan claim | Actual existence | Status |
|---|---|---|
| `packages/api/src/routers/service-members.ts` | EXISTS | OK |
| `apps/web/src/components/forms/service-category-detail-dialog.tsx` | EXISTS | OK |
| `apps/web/src/components/forms/service-category-form.tsx` | EXISTS | OK |
| `apps/web/src/components/forms/service-detail-dialog.tsx` | EXISTS | OK |
| `apps/web/src/hooks/useAppointmentFormState.ts` | EXISTS | OK |
| `apps/web/src/components/calendar/appointment-form/StaffPicker.tsx` | EXISTS | OK |
| `apps/web/src/components/calendar/appointment-form/AppointmentFormContent.tsx` | EXISTS | OK |
| `apps/server/src/tests/integration/` | EXISTS (directory) | OK |
| `packages/api/src/routers/index.ts` | EXISTS | OK |

## Symbol / Import Verification

### Task 2.1 — `listForService` imports needed

Plan says:
```typescript
import { members } from "@avantej-core/db/schema/tenant/members";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
```

Current `service-members.ts` imports:
- `serviceMembers` from service-members schema — YES
- `services` from services schema — YES  
- `serviceCategories` from service-categories schema — YES
- `serviceCategoryConfig` from service-category-config schema — YES
- `memberServiceBufferOverrides` — YES
- `members` — **NOT currently imported** → needs adding
- `memberProfiles` — **NOT currently imported** → needs adding

**Plan correctly identifies both as needing addition.** VERIFIED.

However: the `listForService` procedure joins `serviceMembers` and `memberProfiles` only — NOT `members`. The plan's import list includes `members` but the code snippet does NOT use the `members` table. The `memberId` in `serviceMembers` is a UUID FK to `members.id`, but the query joins to `memberProfiles` directly via `serviceMembers.memberId = memberProfiles.memberId`.

**FINDING DC1 — LOW:** The import for `members` schema is declared as needed in Task 2.1 but the actual `listForService` code does NOT reference the `members` table. The Drizzle query goes: `serviceMembers → (left join) memberProfiles`. The `members` import is unnecessary. This is a dead import but not a runtime error. **Recommend removing `members` from the import list in Task 2.1.**

### Task 1.3 — Cache invalidation

Plan says `service-category-form.tsx` `onSuccess` currently only invalidates `orpc.serviceCategories.list.key()`.

Verified at line 161 of `service-category-form.tsx`:
```typescript
invalidate: [orpc.serviceCategories.list.key()],
```

The `serviceCategoryConfig.getByCategoryId` key is NOT in this invalidation array. **Plan correctly identifies this gap.** VERIFIED.

### Task 1.1 — `service-category-detail-dialog.tsx` already fetches config

The plan says the existing component uses `useEffect + setState` and warns not to refactor the category fetch. Verified: the component uses `useState` + `useEffect` + `Promise.all` at lines 109–145. **The plan's guidance is accurate.**

**FINDING DC2 — MEDIUM:** The plan says "Add a `useQuery` inside `ServiceCategoryDetailDialog`" but the component already fetches the config via `Promise.all` in its `useEffect` and stores it in `useState`. **The booking rules display is ALREADY IMPLEMENTED.** The component at lines 233–267 already renders:
- "Timing" section with `defaultDuration` and `defaultMaxAttendees`
- "Booking & Cancellation Rules" section with `requireAdvanceBooking`, `enableCancellationWindow`, `bufferTimeMinutes`

The plan's Phase 1 (Task 1.1) is describing work that has **already been done**. The plan needs to be updated to reflect that Phase 1 implementation is complete. Only Task 1.3 (cache invalidation) remains for Phase 1.

**This is a significant doc consistency finding — the plan is out of date with the actual codebase state for Phase 1.**

### Task 2.2 — `ServiceDetailDialog` tab addition

Plan says "Current structure: Single-panel dialog with service info fields. No tabs." Verified: `service-detail-dialog.tsx` has no `Tabs` import and no tab structure. **CONFIRMED — no tabs exist yet.** The plan's description of the current state is accurate.

### META.md file claims

META.md says `useAppointmentFormData.ts` is in the files affected. The actual hook `useAppointmentFormState.ts` is the file the plan modifies (Task 3.1). `useAppointmentFormData.ts` is a separate file that provides base data. The plan (Section 5, Task 3.1) correctly modifies `useAppointmentFormState.ts`. META.md is slightly misleading but not blocking.

**FINDING DC3 — LOW:** META.md lists `useAppointmentFormData.ts` as a files-affected entry, but Phase 3 changes land in `useAppointmentFormState.ts`. The plan body is correct; META is slightly wrong.

### Phase dependency claims

Plan Section 5 note says phases are sequential (1 → 2 → 3). This is correct:
- Phase 2 depends on `listForService` procedure (added in Phase 2)
- Phase 3 depends on `listForService` (also added in Phase 2, reused)
- Phase 1 is standalone

**FINDING DC4 — MEDIUM:** Phase 3 (Task 3.1) depends on the `listForService` procedure being added in Phase 2 (Task 2.1). This dependency is noted in the plan but could be made more explicit — if Phase 2 is skipped, Phase 3 will fail at the `orpc.serviceMembers.listForService.key(...)` call because the procedure doesn't exist yet.

## Summary

| ID | Severity | Finding |
|---|---|---|
| DC1 | LOW | `members` import unnecessary in Task 2.1 (unused in query) |
| DC2 | CRITICAL | Phase 1 Task 1.1 already implemented — booking rules panel exists in current codebase |
| DC3 | LOW | META.md lists wrong hook file |
| DC4 | MEDIUM | Phase 3 dependency on Phase 2 procedure needs explicit callout |

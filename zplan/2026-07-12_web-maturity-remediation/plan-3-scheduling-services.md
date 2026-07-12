# Plan 3 — Scheduling/Services: consolidation + stale-cache fixes + unit coverage

**Agent scope:** appointments, class slots, rooms, services, categories, trainers, my-services. Read [00-orchestration.md](00-orchestration.md) shared conventions first.

## Goal
Kill the duplicate legacy service-category page, fix the coach-intake save that never refetches, unify appointment query keying, and add unit tests for the three untested areas (rooms, categories, my-services buffer).

## User journeys affected
- **Manager edits service categories:** today two divergent UIs exist (legacy standalone `routes/_authenticated/service-category/view.tsx` with `as any` cast vs the canonical `services/categories-page.tsx` tab). After this plan: one UI, legacy route redirects to `service/view?tab=categories` (the dashboard variant already does this).
- **Manager sets a trainer's intake schedule:** saves via `CoachIntakeEditor` → today the panel shows stale data until manual refresh → after fix the availability view refetches on save.
- **Trainer adjusts their service buffer** (my-services): save/parse/clear logic gets unit coverage.

## Tasks

### Task 1 — Consolidate legacy service-category route
- `apps/web/src/routes/_authenticated/service-category/view.tsx` (standalone DataTable, `as any` at `:77`): replace body with a redirect to `service/view?tab=categories`, matching `dashboard/_layout/service-category/view.tsx` (already a LEGACY redirect).
- Grep entire codebase for links/navigations to the standalone route before and after; update any found.
- Delete now-unused components imported only by the legacy view (verify each is imported nowhere else before deleting).

### Task 2 — Fix no-op onSaved in trainer availability
- `apps/web/src/components/pages/trainers/trainer-availability-tab.tsx:544`: `onSaved={() => {}}` passed to `CoachIntakeEditor`. Fix: invalidate/refetch the same queries the sibling `TrainerAvailabilitySheet` / `AddExceptionDialog` refresh (copy their exact invalidation pattern from within this same file).

### Task 3 — Unify appointment query keying
- `apps/web/src/routes/_authenticated/appointment/view.tsx:40` uses hand-rolled `queryKey: ["appointments", ...]` while `useTrainerSchedule.ts:55` uses `orpc.appointments.list.queryOptions`. Migrate the hand-rolled one to `orpc.appointments.list.queryOptions(...)` so mutations invalidating the orpc key refresh both routes.
- After migrating, grep for any `invalidateQueries` referencing the old `["appointments"` literal key and update.

### Task 4 — Unit tests for untested areas
New files (place under `apps/web/src/__tests__/` so vitest globs pick them up):
- `__tests__/pages/rooms-page.test.tsx` — rooms list renders from mocked `orpc.rooms.list`; create/update mutations called with expected payloads; active/inactive tab filter.
- `__tests__/pages/categories-page.test.tsx` — canonical `services/categories-page.tsx` list + CRUD wiring.
- `__tests__/pages/my-services-buffer.test.tsx` — `my-services/view.tsx:145` `handleSave` parse/clear logic: valid minutes saved via `updateMyBuffer`, invalid input rejected, clear sends null/reset.

### Task 5 — Class-slot KPI honesty
- `class-slots-page.tsx:285-308` computes fill-rate/revenue client-side over only the loaded page. Minimal fix (this plan): label the KPI cards as reflecting loaded rows (e.g. "of loaded slots") AND add a unit test pinning the computation. Do NOT build server aggregation here — if server-side KPIs are wanted, that's a separate feature; note it in the completion report.

## Files owned
- `apps/web/src/routes/_authenticated/service-category/**`, `apps/web/src/routes/_authenticated/appointment/view.tsx`
- `apps/web/src/components/pages/trainers/trainer-availability-tab.tsx`
- `apps/web/src/components/pages/class-slots/class-slots-page.tsx`
- New test files listed above

## Risks
- Task 3 changes cache identity for the calendar route — verify appointment create/reschedule still refreshes the calendar in the browser (known active area: AVANTEJ bug-fix comments live in class-slots).
- Task 1: the standalone route may be linked from older nav components — the pre-delete grep is mandatory.
- Do not touch `services-page.tsx` or trainer hooks beyond what's listed (owned behaviors are covered by existing tests — keep them green).

## Verification
1. `bun check-types`; `cd apps/web && bun run test` — new + existing scheduling tests green.
2. Browser: legacy service-category URL redirects; save an intake schedule → availability panel updates without reload; create an appointment from the calendar route → list refreshes.
3. Existing e2e still green: `_e2e/web/appointment/`, `_e2e/web/service-category/`, `_e2e/web/rooms/`.

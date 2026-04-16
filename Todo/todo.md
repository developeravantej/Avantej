# Avantej — Outstanding Work
_Branch: `Customer-app` · Last updated: 2026-04-15_

---

## 1. Google Calendar Integration — Post-Implementation Checklist
_Plan: `zplan/15-04_16-00_google-calendar-integration` · Code: DONE_

### Environment Setup (required before it works)
- [ ] Add to `apps/server/.env`:
  ```
  GOOGLE_CLIENT_ID=<from Google Cloud Console>
  GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
  GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google-calendar/callback
  ```
- [ ] In Google Cloud Console: enable **Google Calendar API** and **OAuth2 API**
- [ ] Add `http://localhost:3000/auth/google-calendar/callback` as an authorised redirect URI

### DB Migration
- [ ] Run `bun db:push` (or apply migration `0013_google_calendar` to tenant DBs via `runTenantMigrations`)

### Route Tree Regeneration
- [ ] Run `bun dev:web` once — TanStack Router's Vite plugin auto-regenerates `routeTree.gen.ts` to register the new `/dashboard/settings/google-calendar` route

### Manual Smoke Test
- [ ] Settings → Google Calendar → "Connect Google Calendar" → complete OAuth → see "Connected" status
- [ ] Admin role → sync scope badge shows "All appointments"
- [ ] Trainer role → sync scope badge shows "Your appointments"
- [ ] Create an appointment for a connected trainer → event appears in their Google Calendar
- [ ] Cancel appointment → event is deleted from Google Calendar
- [ ] Disconnect → status returns to "Not connected"

### Phase 3 Polish (not yet implemented)
- [ ] Unit tests for `google-calendar.service.ts` and `google-calendar-sync.service.ts`
  - `getGoogleAuthUrl` generates correct URL
  - `buildCalendarEvent` formats appointment data correctly
  - `ensureValidToken` refreshes when near expiry
  - Mock `fetch` for all Google API calls
- [ ] Handle trainer reassignment: delete event from old trainer's calendar, create in new trainer's
  - Modify `syncAppointmentToGoogleCalendar` to accept optional `previousTrainerId`
  - Wire into `appointments.update` when `trainerId` changes

---

## 2. Remove Packages Page — Consolidate into Services
_Plan: `zplan/15-04_13-29_remove-packages-page` · Phase 1: ✅ DONE · Phases 2–4: TODO_

### Phase 2 — Add "Sessions" column to Services table
- [ ] `apps/web/src/components/tables/service/view/columns.tsx` — add Sessions column after Price:
  ```typescript
  {
    accessorKey: "sessionCount",
    header: "Sessions",
    cell: ({ row }) => {
      const count = row.getValue("sessionCount") as number | null;
      return count != null ? count : "—";
    },
  }
  ```

### Phase 3 — Remove Packages page and sidebar entry
- [ ] `apps/web/src/components/app-sidebar.tsx` — remove `{ title: "Packages", url: "/dashboard/packages/view", icon: Package }` line (and the `Package` import if unused after removal)
- [ ] Delete `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx` (already deleted per git status ✅)
- [ ] Delete `apps/web/src/__tests__/routes/packages.test.tsx` (already deleted per git status ✅)
- [ ] Run `bun dev:web` to regenerate `routeTree.gen.ts` — verify all `PackagesViewRoute` references gone
- [ ] Smoke test: `/dashboard/packages/view` → 404, `/dashboard/packages/instances/view` → still works

### Phase 4 — Update zhub docs
- [ ] `zhub/index.md` — delete row for `/dashboard/packages/view`
- [ ] Delete `zhub/pages/web-dashboard-packages-view.md` (if it exists)
- [ ] `zhub/pages/web-dashboard-service-view.md` — note that session packages are now managed here

---

## 3. Trainer Availability & Calendar Dashboard
_Plan: `zplan/12-04_19-30_trainer-availability-calendar` · Status: NOT STARTED_

### Summary
Full plan exists. No code implemented yet. New files partially scaffolded:
- `apps/web/src/components/calendar/trainer-sidebar.tsx` (untracked, may be WIP)
- `apps/web/src/components/trainers/` dir (untracked)

### Key phases to implement
- [ ] **Phase 1** — Backend: `trainerId` filter on `appointments.list` procedure + service
- [ ] **Phase 2** — Trainers page: availability CRUD UI (weekly schedule per trainer)
- [ ] **Phase 3** — Appointment view: trainer list sidebar (left) + per-trainer calendar (right)
  - Admin: trainer picker visible, selects trainer → calendar shows that trainer's appointments
  - Trainer role: no picker, sees own schedule automatically
- [ ] **Phase 4** — Native app: `trainer_availability` drives booking slot generation (replaces hardcoded 8AM–7PM)

---

## 4. Buffer Time — Staff Self-Override
_Plan: `zplan/13-04_15-30_buffer-time-category-override` · Phases 1–3: ✅ DONE · Phase 4: TODO_

### Phase 4A — Staff self-service buffer override API + UI
- [ ] API: extend `service-members.ts` router with `setBufferOverride` and `getBufferOverride` procedures
- [ ] Frontend: My Services page (`/dashboard/my-services/`) — let trainers set their own buffer time per assigned service

### Phase 4B — Admin manages staff buffer via Trainers page
- [ ] Frontend: Trainers page — admin can select a trainer and edit their buffer overrides per service
- [ ] Uses same API procedures from Phase 4A

---

## 5. Installment-Based Credit Unlocking
_Plan: `zplan/13-04_17-00_installment-credit-unlocking` · Status: Schema EXISTS, phases NOT started_

Schema (`installments`, `installment_events`, updated `package_instances`) is already in the DB.
Business logic and UI are not implemented.

### Phase 1 — Core services & admin configuration
- [ ] Installment schedule generation service
- [ ] Admin config: enable half/quarterly payment plans per service (already in service form ✅)
- [ ] Verify `createAppointment` correctly decrements `creditsRemaining` (pre-existing bug fix — check if already done in `appointment.service.ts`)

### Phase 2 — Purchase flow with plan selection
- [ ] Native buy-package flow: show installment plan options, generate schedule on purchase
- [ ] Web admin: create package instance with installment plan

### Phase 3 — Payment confirmation, locking & admin actions
- [ ] Admin confirms manual transfer → unlocks credits for that installment
- [ ] Overdue detection → grace period → package locking
- [ ] Admin unlock, refund actions

### Phase 4 — Dashboards, notifications & coach visibility
- [ ] Package Instances view: installment progress columns
- [ ] Installments page: full management table (All / Active / Overdue / Locked tabs)
- [ ] Notification triggers: 14d, 3d, 1d before due; weekly during grace; on lock/unlock

---

## 6. Miscellaneous

### routeTree.gen.ts sync
- [ ] Run `bun dev:web` to regenerate after any route file additions/deletions — the file is currently stale relative to new routes added in this branch

### zhub/ hub update
- [ ] Run `/hub-update` before merging this branch to keep the codebase context hub current

### Biome lint pass
- [ ] Run `bun check` and fix any lint warnings introduced by this branch's changes

### DB push for current branch schema
- [ ] Run `bun db:push` to apply all pending schema changes (buffer time columns, installment columns, google calendar tables) to the dev database

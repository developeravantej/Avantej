# 7. Open Questions & Risks

## Resolved Decisions (from brainstorming)

| Decision | Resolution |
|----------|-----------|
| Model trainer availability in DB vs. just filter appointments? | Model in DB — new `trainer_availability` table |
| Admin UX — dropdown filter or sidebar? | Sidebar: trainer list on left, calendar on right |
| Scope — dashboard + mobile? | Dashboard only (no mobile changes) |
| Trainer's own view — separate route or auto-filter? | Same page, auto-filtered by role |
| Weekly hours vs. one-off blocks? | Regular weekly hours only (no time-off table) |
| Multiple shifts per day? | Yes — multiple rows per day |
| Branch-scoped availability? | No — availability is per-trainer, not per-branch |
| Where to manage availability? | Trainers CRUD page (Option A) |
| Calendar display — availability background? | No — just booked appointments |

## Remaining Open Questions

| # | Question | Impact | Default if Unresolved |
|---|----------|--------|-----------------------|
| 1 | Should the trainer sidebar show a count of today's appointments per trainer? | Nice UX touch but requires an extra query or aggregation | Skip for V1 — can add later |
| 2 | When a trainer is suspended, should their availability be auto-cleared? | Data hygiene concern | No — keep data, filter by `members.status = "active"` in sidebar |
| 3 | Should the "Add Appointment" modal validate against trainer availability (e.g., warn if booking outside working hours)? | Conflict prevention | Out of scope for this feature — no validation against availability |

## Critical Issues Found During Review (FIXED in plan)

| # | Issue | Resolution | Task |
|---|-------|-----------|------|
| 1 | **`userContext.hierarchy.member` has no `id` field** — The plan's Phase 3 code assumed `currentOrg?.hierarchy?.member?.id` exists for trainer auto-filtering, but the member object only returns `{ role, hierarchyScopeId, hierarchyScopeName, accessibleNodeIds }`. | **Added Task 1.7** — expose `member.id` in the userContext response (both `auth.ts` handler and `index.ts` type stub). | Task 1.7 |
| 2 | **Trainers may lack `appointment_management:read` permission** — Concern that trainers calling `appointments.list` would get FORBIDDEN. | **Already resolved** — `packages/db/src/seed-rbac.ts` line 127 confirms the `trainer` role has `appointment_management:create`, `appointment_management:read`, and `appointment_management:update` seeded. No action needed. | N/A |
| 3 | **Day ordering sorts alphabetically** — `orderBy: [trainerAvailability.dayOfWeek]` puts "friday" before "monday". | **Fixed in Task 1.3** — service now fetches all rows and sorts client-side using a `DAY_ORDER` map (`monday=0, ..., sunday=6`), then by `startTime`. | Task 1.3 |

## Known Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| 1 | **Trainer sidebar performance with many trainers** — An organization with 50+ trainers could slow down the sidebar rendering and profile enrichment. | Low (most orgs have <20 trainers) | Low | Skip profile enrichment in sidebar (just show name). Cache with `staleTime: 5min`. |
| 2 | **Availability data orphaned on role change** — If a member's role is changed from "trainer" to "staff", their availability records remain but serve no purpose. | Low | Low | Acceptable — records don't cause harm. Can add cleanup logic later if needed. |
| 3 | **Calendar layout breakage on narrow screens** — The two-panel layout (sidebar + calendar) may not work well on tablets or narrow browser windows. | Medium | Medium | Make sidebar collapsible or use a responsive breakpoint to hide it below a certain width. |
| 4 | **Drizzle relational query setup** — If `trainerAvailability` relations are not properly registered in the schema, `tenantDb.query.trainerAvailability.findMany()` will fail at runtime. | Medium | High (blocks Phase 1) | Task 1.6 explicitly handles this. Test with `bun db:push` + a manual query before proceeding. |
| 5 | **Migration embedding in migrate-tenant.ts** — The tenant migration embedding pattern must be followed exactly, or new tenant DBs won't get the table. | Low | High | Follow the existing `MIGRATION_0007_SHORT_KORATH` pattern precisely. Test by creating a new tenant branch. |

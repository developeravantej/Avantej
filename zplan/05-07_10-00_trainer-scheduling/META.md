# META — Trainer Scheduling & Buffers

**Session:** 05-07_10-00_trainer-scheduling
**Created:** 2026-05-07
**Author:** Claude (planner agent)
**Status:** DRAFT — not yet reviewed

## What this plan covers

Area A of the Trainer Scheduling & Buffers feature:

- Trainer weekly availability grid (admin configures, trainers self-serve edit)
- Trainer buffer time overrides at category and service level (admin + self-service)
- Coach intake availability + exception/claim management (admin + self-service)
- Customer preferred times captured from package instances (admin view/edit via Customer 360)

## What already exists (DO NOT re-implement)

| Artifact | Status |
|---|---|
| `trainer_availability` schema | Exists |
| `coach_intake_availability` schema | Exists |
| `coach_intake_exceptions` schema | Exists |
| `member_category_buffer_overrides` schema | Exists |
| `member_service_buffer_overrides` schema | Exists |
| `preferred_times` schema | Exists |
| `trainerAvailabilityRouter` (list, listByBranch, getComputedSlots, upsert, delete) | Exists |
| `coachIntakeRouter` (listSlots, upsertSlots, getOpenSlots, claimSlot, unclaimSlot, listExceptions, listByBranch) | Exists |
| `serviceMembersRouter` (listMine, updateMyBuffer, listForMember, updateBuffer, assign, remove) | Exists |
| `preferredTimesRouter` (list, upsert) | Exists |
| `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/availability.tsx` | Exists (tabs: General Schedule + Intake) |
| `TrainerAvailabilityEditor` component | Exists |
| `CoachIntakeEditor` component | Exists |
| `CoachIntakeClaimDialog` component | Exists |
| `TrainerAvailabilitySheet` component | Exists |
| Customer 360 `PackageRow` (shows preferred times) | Exists |

## Key gap: `member_category_buffer_overrides`

The `memberCategoryBufferOverrides` table has no oRPC router and no UI. This is the **primary missing piece**.
The service-level override (`memberServiceBufferOverrides`) IS fully wired. The category-level override is not.

## Plan file

`zplan/05-07_10-00_trainer-scheduling/plan/plan.md`

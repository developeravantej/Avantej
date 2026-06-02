# Recovery Note — COMMITTED & SAFE

## ✅ COMMITTED (final)
Branch `feat/post-approval-scheduling` @ commit `9dba389d` — 20 files, 1690 insertions.
Created via git plumbing (commit-tree on top of HEAD) so the concurrent session's
HEAD/index/working tree were NEVER touched. The commit lives in git's object store +
a branch ref, so it survives any future stash/reset/clean. Migration 0084 confirmed
bundled in both the SQL file and the generated module.
To view:  git log feat/post-approval-scheduling
To use:   git checkout feat/post-approval-scheduling  (once concurrent sessions settle)

---
# Recovery Note — RESOLVED (transient concurrent-session git cycle)

## COMMIT BLOCKED — shared index, multi-session (do not commit yet)
The repo's git INDEX was already pre-staged with HUNDREDS of files from concurrent
session(s) before I started (broad `git add`). A commit would capture everyone's
in-flight work, INCLUDING broken files (commission-tracks missing @avantej-core/types
exports). So a clean isolated commit of just this feature is NOT possible while the
other sessions are active.

**Protective action taken instead:** full external backup at
`C:/Users/user/avantej-backup-post-approval/` (new/ = 8 files, modified/ = 12 files,
plus the zplan session folder). Survives any `git reset`/`clean`/`stash`.

**Git state restored:** created branch was deleted (0 commits, nothing lost), switched
back to `feat/customer-name-snapshot`, unstaged only my new files. Concurrent session's
index left exactly as it was.

**To commit cleanly later (once other sessions quiesce):**
1. Confirm no other session is active; `git status` should be stable.
2. `git checkout -b feat/post-approval-scheduling`
3. `git reset` (unstage everyone's pre-staged soup), then `git add` ONLY the file list
   in the section below + the 6 new files.
4. Verify `git diff --cached --name-only` shows ~21 files (not hundreds), then commit.
5. If on-disk edits were wiped by then, restore from the external backup.

## RESOLUTION (final)
The "revert" was a TRANSIENT `git stash`/`stash pop` cycle by a concurrent session.
All files restored at 18:17:22. Final state verified:
- All 6 frontend files: HAS-MY-EDIT ✓
- index.ts re-applied (no duplication — 1 import + 1 spread) ✓
- trainer-availability.ts coverage proc present ✓
- web `tsc --noEmit`: clean ✓
- schedule-proposal.test.ts: 7/7 pass ✓
- Only broken files in tree are OTHER sessions' in-flight work (commission-tracks
  missing @avantej-core/types exports; backfill unused import; set-password) — NOT mine.

Browser verification PASSED before the cycle: Schedule panel opened at page level with
10 seeded editable sessions, pending count decremented on assign, toast confirmed.

## Original incident notes (kept for reference)
---
# Recovery Note — concurrent session wiped 8 tracked-file edits

**When:** during browser verification (which had already PASSED — panel opened with 10 seeded sessions, credit debit + conflict paths confirmed live).
**Cause:** a concurrent session committed `62796939 fix(customers): weekly drift-heal…` on branch `feat/customer-name-snapshot` and ran `git reset`/checkout ops that reverted shared tracked files to HEAD. My uncommitted edits to 8 tracked files were lost. New (untracked) files + 5 edits survived.

## SURVIVED (verified present)
- NEW: schedule-proposal.service.ts, schedule.procedures.ts, DateTimeSlotPicker.tsx, ScheduleSessionsPanel.tsx, RescheduleDialog.tsx, NoShowFollowupDialog.tsx, 0084_*.sql, schedule-proposal.test.ts
- EDIT: crud.procedures.ts (reschedule + appointments import + reinstate returns packageInstanceId), appointments/schemas.ts (proposedSlotStatusSchema), services/index.ts (exports), appointments.ts schema (trainerStartTimeIdx), tenant-migrations.generated.ts (0084)

## REVERTED — must re-apply (8 files)
1. `packages/api/src/routers/appointments/index.ts` — import + spread `appointmentsScheduleProcedures`
2. `packages/api/src/routers/trainer-availability.ts` — import `coverageForPreferredTimes`; add `coverageForPreferredTimes` proc
3. `apps/web/src/components/appointments/appointment-list.tsx` — import RescheduleDialog/NoShowFollowupDialog/ScheduleSessionsPanel; state rescheduleAppt/noShowFollowupId/replacementPkgId; updateMutation status add "no-show"; onCancel → status "no-show" + open followup; render RescheduleDialog + NoShowFollowupDialog + ScheduleSessionsPanel(mode single); AppointmentDetailDialog onReschedule
4. `apps/web/src/features/appointments/components/AppointmentDetailDialog.tsx` — CalendarClock import; onReschedule prop; Reschedule button (status ≠ cancelled)
5. `apps/web/.../operations/approvals.tsx` — import ScheduleSessionsPanel; schedulePkgId state; pass onSchedule to InboxList; render page-level ScheduleSessionsPanel(mode full)
6. `apps/web/src/features/approvals/components/InboxList.tsx` — thread onSchedule prop → InboxRow
7. `apps/web/src/features/approvals/components/InboxRow.tsx` — thread onSchedule prop → ExpandedRowDetail
8. `apps/web/src/features/approvals/components/ExpandedRowDetail.tsx` — CoverageChip component; onSchedule prop; call onSchedule(row.id) on assign/self-assign success; "Schedule sessions" button (approved rows); coverage chips

NOTE: reverted approvals chain is an OLDER baseline (no approvalStatus tabs) — re-apply adapted to current file state, additively.

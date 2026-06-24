# Audit: 05-13_22-30_push-notifications

**Audited:** 2026-05-13 22:45
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 0 (5 files are correctly "to-be-created") |
| Missing impact | 0 files with unlisted callers |
| Unresolved questions | 3 intentional `TODO (audit)` markers |
| Execution state | not started |

## Findings

### Structural gaps

All 8 required sections are present with substantive content:
1. Overview — problem statement, goals, and scope clearly defined
2. Result — before/after in user terms
3. Technical Architecture — data flow, data model, API contracts, key decisions
4. User Journeys — 4 journeys, each with explicit "Where it lives"
5. Phased Implementation — 3 phases, each mapping to at least 1 journey
6. Impact & Breakage Analysis — files-modified table, caller list, deployment coupling
7. Cross-Cutting Concerns — error handling, testing, migration, rollback, performance
8. Open Questions / Risks — 3 open questions and risk table

No structural gaps.

### Broken references (plan -> codebase)

**Files marked "to-be-created" (correctly absent):**
- `packages/db/src/schema/tenant/push-tokens.ts` — new file
- `packages/services/src/push-token.service.ts` — new file
- `packages/services/src/push.service.ts` — new file
- `packages/api/src/routers/push-tokens.ts` — new file
- `apps/native/hooks/usePushNotifications.ts` — new hook

**All existing files verified present:**
- `packages/db/src/schema/tenant/index.ts` — EXISTS
- `packages/db/src/schema/tenant-schema.ts` — EXISTS
- `packages/services/src/notification.service.ts` — EXISTS (notifyStaffOfPendingPackage line 113, notifyCustomerPackageAssigned line 179, notifyCustomerPackageRejected line 201)
- `packages/services/src/index.ts` — EXISTS
- `packages/api/src/routers/index.ts` — EXISTS
- `packages/api/src/routers/package-instances.ts` — EXISTS (imports all 3 notify functions)
- `packages/db/src/scripts/migrate-all-tenants.ts` — EXISTS (MIGRATIONS dict at line 25)
- `apps/native/hooks/useAuth.ts` — EXISTS (logout function at line 51)
- `apps/native/app/(app)/dashboard/_layout.tsx` — EXISTS
- `apps/native/app.json` — EXISTS
- `apps/server/scripts/backfill-pending-notifications.ts` — EXISTS (notifyStaffOfPendingPackage call at line 76)
- `packages/services/package.json` — EXISTS

**Key symbols verified:**
- `notificationPreferences` schema with `pushEnabled` field confirmed in `packages/db/src/schema/tenant/notification-preferences.ts`
- EAS project ID `5a313f96-b7c5-43c6-87cd-c6a526474cd3` confirmed in `apps/native/app.json` line 55
- `handleToggleNotifPref` confirmed in `apps/native/app/(app)/dashboard/profile.tsx` at line 92

**Packages not yet installed (correctly absent — plan covers installation steps):**
- `expo-server-sdk` — not yet in `packages/services/package.json`
- `expo-notifications`, `expo-device` — not yet in `apps/native/package.json`

No broken references.

### Missing impact

Plan lists these callers of `notification.service.ts`:
1. `packages/api/src/routers/package-instances.ts` — confirmed importer
2. `apps/server/scripts/backfill-pending-notifications.ts` — confirmed importer

Grep found exactly these two importers (plus the services index barrel which is already in the files-modified table). No unlisted callers.

No missing impact.

### Unresolved questions

Three intentional `TODO (audit)` markers remain — all are decision points that must be resolved before or during execution:

1. **Line 9 — Scope mismatch:** Overview/Result sections mention "booking confirmations" as a push trigger, but Phase 2 only hooks into package-event functions. No booking notification functions exist in `notification.service.ts` today. Plan asks to decide between: (a) keep wording as aspirational, (b) narrow scope to package-only for v1, or (c) expand Phase 2 to add booking notification functions.

2. **Line 383 — Profile Notifications row (Step 3.6):** Profile screen already has `handleToggleNotifPref` for `pushEnabled`/`emailEnabled`/`smsEnabled`. Plan asks to decide between: (a) navigate to a dedicated `/dashboard/notification-settings` screen, (b) open a bottom sheet/modal, or (c) inline toggles directly into the Account card.

3. **Line 424 — Backfill script push side-effect:** `backfill-pending-notifications.ts` will fire live push notifications for every historical pending package when Phase 2 ships. Plan asks to decide between: (a) add `--no-push`/`skipPush` guard, (b) skip push in non-prod/scripts context, or (c) accept and document one-time-run behavior. This is the highest-priority risk — if the backfill script were re-run after Phase 2, it would send spurious notifications to all affected customers.

### Execution & verification gaps

- `execute/log.md` — not present (not started)
- `chrome-test/plan.md` — not present
- `chrome-test/results.md` — not present
- `research/brief.md` — not present
- `prompts/` folder — not present

No execution has occurred. Expected for a pre-execution audit.

### Domain Logic Warnings

- `domain-warning`: Journey 2 routes `"package_pending_review"` notification type to `/dashboard/packages/[referenceId]`. This type is generated by `notifyStaffOfPendingPackage`, which targets staff members — but staff push is explicitly out of scope in §1. Customers do not receive `package_pending_review` notifications. This deep-link entry is likely dead code for the customer-facing app and should be confirmed or removed.

- `domain-warning`: `sendPushToUser` is called once per staff member in `notifyStaffOfPendingPackage` (N+1 token loads). The plan acknowledges this in §7 Performance but treats the batch-load fix as a future recommendation rather than a Phase 2 task. If average staff-per-event can exceed 3, batch loading should be promoted to a concrete task.

## Priority Actions

1. **Resolve TODO #3 (backfill script) before Phase 2 execution.** This is the only item with real production risk. Add a `skipPush` parameter to `backfill-pending-notifications.ts` or guard via a `SKIP_PUSH` env variable. Must be done before or alongside Phase 2.

2. **Resolve TODO #1 (scope mismatch).** Option (b) — narrow §1/§2 to package status changes only and mark booking push as out-of-scope for v1 — is lowest-effort and accurate given no booking notification functions exist today. Update §1 and §2 wording accordingly.

3. **Resolve TODO #2 (profile Notifications row) before Step 3.6.** Option (c) — inline toggles into the existing Account card — is consistent with the profile screen's card structure and avoids a new route/sheet. Confirm the choice and delete the TODO comment.

4. **Verify `"package_pending_review"` deep-link target.** Confirm whether customers ever receive this notification type. If not, remove it from the Journey 2 routing table to avoid dead code in the notification listener.

## Status rationale

Plan is structurally complete (8/8 sections), has zero broken file or symbol references, and correctly accounts for all importers of the modified `notification.service.ts`. Status is `needs-attention` solely because of 3 intentional `TODO (audit)` markers — all require a decision before safe execution, with TODO #3 (backfill push side-effect) carrying the highest production risk.

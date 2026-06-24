# Push Notifications — Execute Log

## Agent: Agent A (backend) — Phase 1
**Completed:** 2026-05-13 22:55

### What I Did
- `packages/db/src/schema/tenant/push-tokens.ts`: NEW file. `pushTokens` table with `id` (uuid pk defaultRandom), `userId` (text notNull), `token` (text notNull), `platform` (text notNull), `deviceId` (text nullable), `createdAt` + `updatedAt` (timestamp defaultNow notNull). Indexes: `push_tokens_user_idx` on `userId`, unique index `push_tokens_token_unique` on `token`.
DONE: #1
- `packages/db/src/schema/tenant/index.ts`: appended `export * from "./push-tokens";` next to the existing notifications exports.
DONE: #2
- `packages/db/src/schema/tenant-schema.ts`: no change required — this file re-exports everything via `export * from "./tenant"`, so adding the entry to `tenant/index.ts` (task #2) automatically propagates `pushTokens` to the tenant-schema barrel. Verified by greping the existing barrel pattern — every other tenant table relies on the same wildcard re-export.
DONE: #3
- `packages/services/src/push-token.service.ts`: NEW. Exports `registerPushToken(tenantDb, { userId, token, platform, deviceId? })` using `insert().onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform, deviceId, updatedAt: new Date() } })` and `.returning({ id })`. Exports `unregisterPushToken(tenantDb, token)` doing `delete().where(eq(pushTokens.token, token))`. Exports `getPushTokensForUser(tenantDb, userId)` via `tenantDb.query.pushTokens.findMany`. Also exports `RegisterPushTokenParams` type.
DONE: #4
- `packages/services/src/index.ts`: added a "Push token services" block exporting `getPushTokensForUser`, `RegisterPushTokenParams` (type), `registerPushToken`, `unregisterPushToken`.
DONE: #5
- `packages/api/src/routers/push-tokens.ts`: NEW oRPC router. `register` (protectedProcedure, input `{ organizationId: uuid, token: string, platform: "ios"|"android", deviceId?: string }`) → calls `registerPushToken` with `userId` pulled from `context.session.user.id`, returns `{ id }`. `unregister` (protectedProcedure, input `{ organizationId, token }`) → calls `unregisterPushToken`, returns `{ success: true }`. Both procedures match the `context.tenantDb` null-guard + `ORPCError` style used by `notifications.ts`.
DONE: #6
- `packages/api/src/routers/index.ts`: imported `pushTokensRouter` next to `notificationsRouter`, registered as `pushTokens: pushTokensRouter` inside `baseRouter` (right after `notificationPreferences`). The router auto-flows through to `appRouter` via the `...baseRouter` spread, so it's exposed to clients without further wiring.
DONE: #7
- `packages/db/src/scripts/migrate-all-tenants.ts`: added a `"push-tokens"` entry to the MIGRATIONS map containing `CREATE TABLE IF NOT EXISTS push_tokens (...)` plus `CREATE INDEX IF NOT EXISTS push_tokens_user_idx` and `CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_unique`. SQL style matches existing entries (uses `gen_random_uuid()`, `timestamp DEFAULT now() NOT NULL`, `--> statement-breakpoint` markers between statements).
DONE: #8
- Ran `cd packages/db && source ../../apps/server/.env && export DATABASE_URL ENCRYPTION_KEY && bun run src/scripts/migrate-all-tenants.ts push-tokens`. Applied to all 7 tenant DBs successfully.
DONE: #9

### Decisions Made
- Used `new Date()` for `updatedAt` in the upsert `set` clause rather than a SQL function. Drizzle handles serialization, and this matches how other services in the repo perform upserts.
- Added an explicit `if (!row) throw` guard after `.returning()` in `registerPushToken` to satisfy strict null-check (`TS18048`). Drizzle's `returning` type is `T[]`, so destructuring yields `T | undefined`.
- Skipped touching `tenant-schema.ts` directly: it re-exports `* from "./tenant"`, so the new schema is already wired through. Marking task #3 done because the acceptance condition ("pushTokens re-exported from tenant-schema") is met without a literal edit.
- The Zod `token` input on both `register` and `unregister` uses `z.string().min(1)` (rather than just `z.string()`) so empty-string registrations are rejected — defense against client bugs that would otherwise upsert a row with empty `token`.

### Issues Encountered
- `bun check-types` reports pre-existing `TS2769` errors in `apps/server/src/tests/integration/*.test.ts` related to a missing `slug` field on `hierarchy_nodes` inserts. These are unrelated to push notifications and are not in any files Agent A owns. The only check-types failure attributable to this phase was a single `TS18048` ("row possibly undefined") on `push-token.service.ts:58`, which I fixed before running the migration.
- The `source ../../apps/server/.env` step emits one stray line `../../apps/server/.env:35: command not found: Core` — this is harmless (an unquoted token in the .env file the shell tries to evaluate); the env vars are still exported and migration proceeds normally.

### Migration output
```
🚀 Running migration: Create push_tokens table for Expo push notification tokens (per-device, unique on token)
Migration: push-tokens

📦 Fetching organizations from control panel...
Found 7 organization(s)

Test Fitness Franchise...   ✓ Migration applied successfully
Test Org 1777516872351...   ✓ Migration applied successfully
Test Org 1777516948038...   ✓ Migration applied successfully
Test Org 1777517210761...   ✓ Migration applied successfully
Test Org 1777517289172...   ✓ Migration applied successfully
Test Org 1777517842170...   ✓ Migration applied successfully
Test Org 1777520773265...   ✓ Migration applied successfully

==================================================
Summary:
  ✓ Successful: 7
  ✗ Failed: 0
  Total: 7
==================================================
```

---
## Agent: Agent B (backend) — Phase 2
**Completed:** 2026-05-13 22:55

### What I Did
- packages/services/package.json: added `expo-server-sdk ^3.7.0` and ran `bun install` (5 packages installed).
- packages/services/src/push.service.ts: NEW — `sendPushToUser(tenantDb, userId, { title, body, data })`. Checks `pushEnabled`, loads tokens via `getPushTokensForUser`, filters with `Expo.isExpoPushToken`, sends in chunks via module-singleton `expo`. Errors caught & logged via `console.error`, never thrown.
- packages/services/src/index.ts: added `export { type SendPushParams, sendPushToUser } from "./push.service";`
- packages/services/src/notification.service.ts: added `NotifyOptions` type + `options?: NotifyOptions` param to `notifyStaffOfPendingPackage`, `notifyCustomerPackageAssigned`, `notifyCustomerPackageRejected`. After each notification insert, awaits `sendPushToUser` when `!options?.skipPush`. Staff fan-out loops one push call per staff (acceptable for v1 per plan §7). Push data payload always includes `{ type, referenceId, referenceType }`.
- apps/server/scripts/backfill-pending-notifications.ts: passes `{ skipPush: true }` to `notifyStaffOfPendingPackage` so historical pending packages don't fire push on re-run.
DONE: #10
DONE: #11
DONE: #12
DONE: #13
DONE: #14

### Decisions Made
- Module-singleton `const expo = new Expo()` at module top (matches plan §3 and §7.7).
- Awaited `sendPushToUser` inside notify* functions (not fire-and-forget at the call site) because error swallowing already happens inside `sendPushToUser` — keeps existing return semantics for callers.
- Reused title/body strings for both the DB row and the push payload by hoisting them into locals before the insert in `notifyCustomerPackageAssigned` / `notifyCustomerPackageRejected`.
- Did NOT batch-load staff tokens for `notifyStaffOfPendingPackage` — plan §7 explicitly defers the batch-load optimization; v1 ships per-staff calls.

### Issues Encountered
- `bun check-types` fails with pre-existing hierarchy `slug` errors in `apps/server/src/services/payment.service.ts` and several integration tests. None of my Phase 2 files appear in the error list (verified via grep). Per orchestrator instructions, these are out of scope.

### Smoke test output
- `bun -e "import('expo-server-sdk').then(async ({Expo}) => { const e = new Expo(); console.log('result:', await e.sendPushNotificationsAsync([])); })"` → `result: []` (clean resolve, no module errors).

---

## Agent: Agent C (mobile) — Phase 3
**Completed:** 2026-05-13 22:55

### What I Did
- apps/native/package.json: installed expo-notifications@0.32.17 + expo-device@8.0.10 via `npx expo install`.
DONE: #15
- apps/native/app.json: added `"expo-notifications"` to `expo.plugins` (string form, no custom icon). Verified `extra.eas.projectId === "5a313f96-b7c5-43c6-87cd-c6a526474cd3"`.
DONE: #15 (app.json portion)
- apps/native/hooks/usePushNotifications.ts: NEW. Configures `Notifications.setNotificationHandler` at module load. Hook checks `Device.isDevice`, requests permissions, fetches Expo push token using the EAS project ID, calls `orpc.pushTokens.register` mutation, and sets up `addNotificationResponseReceivedListener` that deep-links package_assigned / package_rejected → `/dashboard/packages/[referenceId]`, else → `/dashboard/notifications`. Exposes a module-level `currentPushTokenRef` so `useAuth.logout()` can unregister without sharing hook state.
DONE: #16
- apps/native/app/(app)/dashboard/_layout.tsx: imported and called `usePushNotifications()` at the top of `DashboardLayout`.
DONE: #17
- apps/native/hooks/useAuth.ts: in `logout()`, before `authClient.signOut()`, reads `currentPushTokenRef` and calls `client.pushTokens.unregister({ organizationId, token })` directly through the oRPC client. Wrapped in try/catch — logout never blocks on push errors. Ref is cleared in the `finally` block.
DONE: #18
- apps/native/app/(app)/dashboard/profile.tsx: replaced the single placeholder "Notifications" row in the Account `SettingsCard` with three new `SettingsToggleRow` entries (Push / Email / SMS) bound to `notifPrefs.{pushEnabled,emailEnabled,smsEnabled}` and `handleToggleNotifPref(key, value)`. Added a new `SettingsToggleRow` sub-component (mirrors `SettingsRow` styling but renders a `Switch` with `trackColor={{ false: secondary[2], true: primary[1] }}, thumbColor={primary[2]}` instead of the chevron). Icons: notifications-outline (push), mail-outline (email), chatbubble-outline (sms).
DONE: #19

### Decisions Made
- **Logout/unregister wiring**: used a module-level `currentPushTokenRef` exported from `usePushNotifications.ts` rather than passing a cleanup callback into `useAuth`. Reasoning: `useAuth.logout` runs inside an `Alert` callback where calling React hooks is not possible, and the dashboard layout already mounts `usePushNotifications` for the lifetime of the authenticated session — so the ref is reliably populated by the time logout fires. `useAuth.logout` uses the imperative `client.pushTokens.unregister(...)` (not a mutation hook).
- **Notification handler shape**: included `shouldShowBanner` and `shouldShowList` in addition to the documented `shouldShowAlert` — Expo SDK 54's notifications types now require these (the old `shouldShowAlert` alone triggers a TS error).
- **Push icon for `notifications-outline` row title**: kept the existing `notifications-outline` icon for the Push row (per spec: bell-outline) — Ionicons `bell-outline` does not exist in this set; `notifications-outline` is the equivalent bell glyph already used elsewhere in the app.
- **Toggle row styling**: built a new `SettingsToggleRow` component rather than extending `SettingsRow` with a right-slot prop — keeps `SettingsRow` (used by chevron rows + the destructive Sign Out row) unchanged.

### Issues Encountered
- `bun check-types` from repo root failed with pre-existing errors in `apps/server` (hierarchy.service.ts, payment.service.ts, several integration tests — all related to a `slug` / `type` mismatch in `hierarchy_nodes`, unrelated to this phase). Native-only `npx tsc --noEmit` from `apps/native` shows only pre-existing errors (`(drawer)/index.tsx`, `useAuth.ts:38` firstName/lastName, `useAuth.ts:74` forgetPassword, `lib/colors.ts`). No new TS errors introduced by Phase 3 files.

---

## Run: 2026-05-14 00:20
**Trigger:** /execute
**Plan version:** zplan/05-13_22-30_push-notifications/plan/plan.md (3 audit TODOs resolved this run)

### Phase outcomes
- Phase 1: pass — 9/9 tasks. Schema + service + router + migration shipped; migration ran across all 7 tenant DBs
- Phase 2: pass — 5/5 tasks. expo-server-sdk wired; sendPushToUser + skipPush flag added to 3 notify* fns; backfill updated
- Phase 3: pass — 5/5 tasks. expo-notifications/device installed; usePushNotifications hook + deep-link listener; logout unregister via module-level ref; profile Account card now has 3 inline toggles

### Final build status
- type check: pre-existing hierarchy-slug errors in payment.service.ts + tests (unrelated to this work)
- lint (bun check): pass — 95 warnings (pre-existing), 0 errors
- tests: not run

### Cross-agent decisions (resolved during pre-exec review)
- OQ1 Backfill push-guard → skipPush flag on notify* fns
- OQ2 Scope wording → narrowed §1/§2 to package events only for v1
- OQ3 Profile UX → 3 inline toggles in Account card

### Subagent retry summary
- 1 retry: Phase 1 backend-engineer (codex) 400 model_error → fallback general-purpose succeeded

---

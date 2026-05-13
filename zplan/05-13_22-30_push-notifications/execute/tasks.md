# Task Inventory

**Plan:** zplan/05-13_22-30_push-notifications/plan/plan.md
**Generated:** 2026-05-13 23:35
**Total tasks:** 19

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | Create `packages/db/src/schema/tenant/push-tokens.ts` | Agent A (backend) | done |
| 2 | 1 | Update `packages/db/src/schema/tenant/index.ts` — add export | Agent A (backend) | done |
| 3 | 1 | Update `packages/db/src/schema/tenant-schema.ts` | Agent A (backend) | done |
| 4 | 1 | Create `packages/services/src/push-token.service.ts` | Agent A (backend) | done |
| 5 | 1 | Update `packages/services/src/index.ts` — export push token fns | Agent A (backend) | done |
| 6 | 1 | Create `packages/api/src/routers/push-tokens.ts` | Agent A (backend) | done |
| 7 | 1 | Update `packages/api/src/routers/index.ts` — register router | Agent A (backend) | done |
| 8 | 1 | Update `packages/db/src/scripts/migrate-all-tenants.ts` | Agent A (backend) | done |
| 9 | 1 | Run migration across all tenant DBs | Agent A (backend) | done |
| 10 | 2 | Add `expo-server-sdk` ^3.x + smoke test | Agent B (backend) | done |
| 11 | 2 | Create `packages/services/src/push.service.ts` — sendPushToUser | Agent B (backend) | done |
| 12 | 2 | Update `packages/services/src/index.ts` — export sendPushToUser | Agent B (backend) | done |
| 13 | 2 | Update `packages/services/src/notification.service.ts` — add skipPush + push calls | Agent B (backend) | done |
| 14 | 2 | Update `apps/server/scripts/backfill-pending-notifications.ts` — pass skipPush:true | Agent B (backend) | done |
| 15 | 3 | Install expo-notifications + expo-device; update app.json | Agent C (mobile) | done |
| 16 | 3 | Create `apps/native/hooks/usePushNotifications.ts` | Agent C (mobile) | done |
| 17 | 3 | Update `apps/native/app/(app)/dashboard/_layout.tsx` | Agent C (mobile) | done |
| 18 | 3 | Update `apps/native/hooks/useAuth.ts` — unregister on logout | Agent C (mobile) | done |
| 19 | 3 | Update `apps/native/app/(app)/dashboard/profile.tsx` — inline 3 toggle rows | Agent C (mobile) | done |

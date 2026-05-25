# Domain Home, Reports & Comms

Audit of the Home (dashboard KPIs/widgets), Reports, Announcements, Notifications, and Audit Log surfaces.
Read-only. All `file:line` refs are repo-relative to `C:\Project\Avantej`.

Cross-checked against `zhub/shared/api-overview.md`.

---

## Endpoints / Procedures

### analytics (`packages/api/src/routers/analytics.ts`)
Registered as `analytics` in `packages/api/src/routers/base-router.ts:116`. All gated by `requirePermissionOrpc(... "reports","read")`.

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `getDashboardKpis` (`:18`) | protected | Dashboard KPIs (sales, appts, active members, churn, LTV, fill rate, revenue-by-branch) for a period/branch | `getDashboardKpis` (analytics.service.ts:124) |
| `getStaffPerformance` (`:53`) | protected | Per-staff completed-appointment count + total commission for period | `getStaffPerformance` (analytics.service.ts:327) |
| `getRevenueSeries` (`:78`) | protected | Daily revenue sparkline series (1-365 days) | `getRevenueSeries` (analytics.service.ts:403) |
| `getMemberCountSeries` (`:108`) | protected | Daily active-member series (7/30/90d) | `getMemberCountSeries` (analytics.service.ts:504) |
| `getChurnSeries` (`:124`) | protected | Daily churn-% series (7/30/90d) | `getChurnSeries` (analytics.service.ts:545) |
| `getLtvSeries` (`:140`) | protected | Daily avg-LTV series (7/30/90d) | `getLtvSeries` (analytics.service.ts:609) |
| `getClassFillRateSeries` (`:156`) | protected | Daily class fill-rate series (7/30/90d) | `getClassFillRateSeries` (analytics.service.ts:654) |

### scheduled-reports (`packages/api/src/routers/scheduled-reports.ts`)
Registered as `scheduledReports` (`base-router.ts:117`). All mutations gated by `reports:export`.

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` (`:32`) | protected | List all scheduled reports (NO `reports:export` check — see Gap P3) | `listScheduledReports` (scheduled-reports.service.ts:72) |
| `create` (`:39`) | protected | Create scheduled report (recipients validated as CSV emails) | `createScheduledReport` (scheduled-reports.service.ts:50) |
| `delete` (`:68`) | protected | Hard-delete a scheduled report by id | `deleteScheduledReport` (scheduled-reports.service.ts:79) |
| `toggle` (`:87`) | protected | Flip `isActive` on a scheduled report | `toggleScheduledReportActive` (scheduled-reports.service.ts:86) |

### announcements (`packages/api/src/routers/announcements.ts`)
Registered as `announcements` (`base-router.ts:105`). Gated by `announcement_management:{read|create|update|delete}`.

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` (`:13`) | protected | List announcements (branch/active filters, RBAC scope) | `listAnnouncements` (announcements.service.ts:103) |
| `listActive` (`:44`) | protected | List active+in-window announcements for widget | `listActiveAnnouncements` (announcements.service.ts:144) |
| `create` (`:63`) | protected | Create announcement + branch scopes | `createAnnouncement` (announcements.service.ts:199) |
| `update` (`:105`) | protected | Update announcement fields/scopes | `updateAnnouncement` (announcements.service.ts:231) |
| `delete` (`:150`) | protected | Soft-delete (sets `isActive=false`) | `deleteAnnouncement` (announcements.service.ts:278) |

### notifications (`packages/api/src/routers/notifications.ts`)
Registered as `notifications` (`base-router.ts:84`). Scoped to `session.user.id`; NO permission gate (own data only).

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` (`:19`) | protected | List caller's notifications (isRead/type filters) | `listNotifications` (notification.service.ts:32) |
| `getUnreadCount` (`:47`) | protected | Caller's unread count | `getUnreadCount` (notification.service.ts:56) |
| `markRead` (`:66`) | protected | Mark one notification read (scoped to caller) | `markNotificationRead` (notification.service.ts:70) |
| `markAllRead` (`:97`) | protected | Mark all caller notifications read | `markAllNotificationsRead` (notification.service.ts:86) |

### notification-preferences (`packages/api/src/routers/notification-preferences.ts`)
Registered as `notificationPreferences` (`base-router.ts:85`). Scoped to `session.user.id`.

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `get` (`:17`) | protected | Get caller prefs (returns null if none — does NOT create default) | `getNotificationPreferences` (notification-preference.service.ts:32) |
| `update` (`:37`) | protected | Upsert caller prefs | `upsertNotificationPreferences` (notification-preference.service.ts:45) |

### audit-logs (`packages/api/src/routers/audit-logs.ts`)
Registered as `auditLogs` (`base-router.ts:129`). Gated by `audit_log:read`.

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` (`:24`) | protected | List audit rows (filters + RBAC + actor-name enrichment from control DB) | `listAudit` (audit-log.service.ts:202) |
| `exportCsv` (`:56`) | protected | CSV export of filtered audit rows (50k hard cap) | `exportAuditCsv` (audit-log.service.ts:427) |

### user-activity-log (`packages/api/src/routers/user-activity-log.ts`)
Registered as `userActivityLog` (`base-router.ts:87`). Scoped to `session.user.id`. (Backs "Recent Activity" home widget — domain-relevant.)

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` (`:14`) | protected | List caller activity-log entries | `listUserActivityLog` (user-activity-log.service.ts:27) |

> Note: `member-stats.service.ts` (`getMembersNewToday`) and `health-score.ts` (`computeHealthScore`) are home/dashboard logic but have NO router file of their own. They are reached via `members.newToday` (`packages/api/src/routers/members/read.procedures.ts:114`) and the daily snapshot cron respectively — see Logic Functions below.

---

## Logic Functions

### analytics.service.ts
- `getDashboardKpis()` — period KPIs incl. churn/LTV/fill-rate via raw SQL CTEs.
- `getStaffPerformance()` — staff completed-appt + commission rollup.
- `getRevenueSeries()` — daily revenue spine.
- `getMemberCountSeries()` — daily active-member spine.
- `getChurnSeries()` — daily churn-% spine.
- `getLtvSeries()` — daily avg-LTV spine.
- `getClassFillRateSeries()` — daily fill-rate spine.
- (helpers `getPeriodDates`, `buildDateSpine`, `spineKeys` are private, not exported.)

### scheduled-reports.service.ts
- `computeNextRunAt()` — advance schedule by daily/weekly/monthly. Used by `markScheduledReportSent`.
- `createScheduledReport()` — insert row (`nextRunAt` defaults to now).
- `listScheduledReports()` — list all (no tenant filter needed; per-tenant DB).
- `deleteScheduledReport()` — hard delete.
- `toggleScheduledReportActive()` — flip isActive.
- `listDueScheduledReports()` — cron read: active + `nextRunAt <= now`. Called by `apps/server/src/services/scheduled-reports.service.ts:93`.
- `markScheduledReportSent()` — advance `nextRunAt`, clear error, set `lastSentAt`. Called by cron `:114`.
- `markScheduledReportFailed()` — record `lastError`, bump `nextRunAt` +1h. Called by cron `:124`.

### announcements.service.ts
- `listAnnouncements()` — paginated list w/ scope filter + enrichment.
- `listActiveAnnouncements()` — active+window+scope+audience filter.
- `createAnnouncement()` — tx insert + branch scopes.
- `updateAnnouncement()` — tx update + scope reconcile.
- `deleteAnnouncement()` — soft delete.
- (private: `buildScopeFilter`, `enrichWithScopes`, `setAnnouncementScopes`.)

### notification.service.ts
- `listNotifications()` — list by user.
- `getUnreadCount()` — counts via `findMany` then `.length` (see Gap P3 — not a SQL count).
- `markNotificationRead()` — mark one (scoped to userId).
- `markAllNotificationsRead()` — bulk mark.
- `notifyStaffOfPendingPackage()` — fan-out "package_pending_review" rows to branch admins/trainers. Called by `packages/api/src/routers/package-instances/{create,pending}.procedures.ts`.
- `notifyCustomerPackageAssigned()` — customer "package_assigned" row. Called by `package-instances/assign.procedures.ts`.
- `notifyCustomerPackageRejected()` — customer "package_rejected" row. Called by `package-instances/{approve,pending}.procedures.ts`.
- `clearPendingReviewNotifications()` — mark staff review notifications read after assign/reject. Called by assign/approve procedures.

### notification-preference.service.ts
- `getNotificationPreferences()` — fetch row or null.
- `upsertNotificationPreferences()` — insert-or-update prefs.
> Both reachable via router, BUT see **Gap P1** — no delivery code reads these prefs.

### audit-log.service.ts
- `getActionSeverity()` / `deriveSeverity` (alias) — map action string → info/warning/danger. Used internally + tests.
- `writeAudit()` — insert an audit row inside a tx. Called widely by other domains (sales, refunds, commissions, members, etc.).
- `listAudit()` — filtered+RBAC+enriched read.
- `exportAuditCsv()` — chunked CSV export.
- (private: `getSeverityActions`, `deriveInitials`, `escapeCsv`, `rowToCsv`.)

### branch-stats-cache.service.ts
- `refresh()` — debounced (2s `setTimeout`) write-through UPSERT of branch member/staff/revenue counts. Called by `hierarchy.service.ts:870-872` and `member.service.ts` (multiple). **See Gap P2 — debounce uses `setTimeout`, unreliable on Cloudflare Workers.**
- `refreshNow()` — immediate UPSERT. Called by `apps/server/scripts/backfill-branch-stats-cache.ts`.
- (cache rows are read by `packages/api/src/routers/hierarchy/read.procedures.ts` — not orphan.)

### user-activity-log.service.ts
- `listUserActivityLog()` — list user activity. Reachable via router. NOTE: there is NO writer for `user_activity_log` in any owned/services file — see Gap P2.

### health-score.ts
- `computeHealthScore()` — pure composite 0-100 score + risk flags. Called by `apps/server/src/services/tenant-usage-snapshot.service.ts:212` (daily snapshot cron). Not orphan.

### member-stats.service.ts
- `getMembersNewToday()` — count + 3 most-recent members joined today (UTC), RBAC-scoped. Called by `members.newToday` procedure. Not orphan.

**No ORPHAN exported functions found** in this domain — every exported fn has a router, cron, or script caller.

---

## Gaps (prioritized)

### P1 — Notification preferences are write-only; no delivery path consults them  (notification-preference.service.ts:45)  [status: partial | testable: true]
`upsert/get` store `emailEnabled`, `smsEnabled`, `pushEnabled`, `bookingReminders`, `bookingConfirmations`, `promotionalEmails`, `packageExpiry`. A repo-wide grep for these flags returns ONLY `notification-preference.service.ts` itself — no notification dispatcher, email sender, SMS, or push code reads them. The settings UI (`apps/web/.../settings/notifications.tsx:189,214`) lets users toggle prefs that have zero downstream effect.
Why it matters: a user disabling "promotional emails" or "booking reminders" changes nothing; this is a silent no-op feature.
Repro: `notificationPreferences.update({ emailEnabled:false })`, then trigger any notification-producing flow → row still written, no channel honoured (there is no channel at all — see P1b).
persistence: `{ tenant: organizationId, table: notification_preferences, where: { userId }, expect: { emailEnabled:false, updatedAt:<now> } }`

### P1b — Notifications are persisted but never *delivered* (in-app only; no email/SMS/push)  (notification.service.ts:162)  [status: partial | testable: false]
Every `notify*` helper only `INSERT`s into the tenant `notifications` table. Grep for `sendSms|sendPush|twilio|firebase|fcm|web-push` across `apps/server/src` + `packages/services/src` finds nothing; the only `sms/push` mentions are the preference columns. So "notifications" = an in-app bell list, period. The preference toggles for email/SMS/push (P1) describe channels that do not exist.
Why it matters: contradicts the preference UI's promise of multi-channel delivery; any expectation that staff/customers get emailed on package events is unmet.
Note: in-app delivery itself works and IS testable (bell list populates) — that part is covered by P-domain. The *gap* (no real delivery) is missing → testable:false.
persistence: `{ tenant: organizationId, table: notifications, where: { userId, type }, expect: { isRead:false } }` (row written, but no external send)

### P2 — `branch-stats-cache.refresh()` debounces with `setTimeout` — unreliable on Cloudflare Workers  (branch-stats-cache.service.ts:48)  [status: partial | testable: false]
`refresh()` schedules the UPSERT via `setTimeout(..., 2000)` and returns immediately (fire-and-forget, called un-awaited from `member.service.ts` / `hierarchy.service.ts`). On Cloudflare Workers the request context can be torn down before a detached 2s timer fires (timers only run while the request/`waitUntil` is alive), so the cached member/staff/revenue counts read by `hierarchy/read.procedures.ts` can silently go stale. CLAUDE.md explicitly flags Workers/Node-module pitfalls; this is the same class of problem.
Why it matters: branch KPI cards (home/hierarchy) may show stale counts after member moves/sales; no error surfaces.
Possibly intentional (comment says "Safe to call fire-and-forget"), but the Workers lifetime caveat is not addressed — `refreshNow` exists but is only used by the backfill script.

### P2b — `user_activity_log` has a reader but no writer in this codebase  (user-activity-log.service.ts:27)  [status: partial | testable: true]
`listUserActivityLog` + the `userActivityLog.list` procedure read the table (backs the "Recent Activity" home widget), but no owned service nor any `INSERT into user_activity_log` exists across services/server. The widget will therefore always be empty in practice.
Why it matters: "Recent Activity" home widget is permanently blank — looks broken to the user.
Repro: load dashboard home; Recent Activity shows nothing regardless of user actions.
persistence: read-only path; expected-empty `{ tenant: organizationId, table: user_activity_log, where: { userId }, expect: { /* zero rows */ } }`

### P3 — `announcements.requiresAcknowledgement` is a lifecycle dead-end (no ack table / no acknowledge procedure)  (packages/api/src/routers/announcements.ts:75)  [status: partial | testable: true]
The flag is created/updated/stored and the UI renders a "Requires ack" badge, but there is no `announcementAcknowledgements` table, no `acknowledge` procedure, and no read of who acknowledged. The view explicitly hardcodes `—` for both "views" and "acknowledged" counts with `STUB:` comments (`announcements/view.tsx:723,745,753`). `_future/announcements-read-receipts.md` confirms this is deferred.
Why it matters: admins can mark an announcement "requires acknowledgement" but can never see or enforce acknowledgement — a status nothing can reach.
Repro: create announcement with `requiresAcknowledgement:true`; no UI/endpoint records or reports an acknowledgement.
persistence: `{ tenant: organizationId, table: announcements, where: { id }, expect: { requiresAcknowledgement:true } }` (flag persists; no ack rows anywhere)

### P3b — `scheduledReports.list` has no `reports:export` permission gate  (packages/api/src/routers/scheduled-reports.ts:32)  [status: partial | testable: true]
`create`/`delete`/`toggle` all call `requirePermissionOrpc(... "reports","export")`, but `list` only relies on `tenantProcedure` (session+tenant) with no permission check and even omits the `assertOrgContextMatch` call the others run. Recipient emails (PII) are returned to any authenticated tenant member.
Why it matters: inconsistent RBAC — a staff member without report-export rights can enumerate all scheduled-report recipients/config.
Repro: as a low-privilege tenant member, call `scheduledReports.list({ organizationId })` → returns rows.
Possibly intentional (read vs export), but inconsistent with the rest of the router and exposes recipient PII.

### P3c — `getUnreadCount` loads all unread rows into memory instead of a SQL COUNT  (notification.service.ts:56)  [status: implemented | testable: true]
Uses `findMany({ columns:{id:true} })` then `rows.length`. Correct result, but scales linearly with unread volume; a heavy-bell user pulls every unread id on each poll. Minor scalability gap, not a correctness bug.
Why it matters: the bell polls `getUnreadCount` frequently; an N-row fetch per poll is wasteful vs `COUNT(*)`.

### P4 — `notificationPreferences.get` does not create a default row despite docstring  (notification-preference.service.ts:30)  [status: partial | testable: true]
The service docstring says "Creates default row if not found", but `getNotificationPreferences` returns `null` and never inserts. Defaulting only happens on `upsert`. The UI must therefore tolerate `null` (it appears to). Behaviour vs documentation mismatch — low risk but a stale contract.

### P5 — Doc drift vs `zhub/shared/api-overview.md`  (zhub/shared/api-overview.md:51-55)  [status: partial | testable: false]
- `analytics` section lists ONLY `getDashboardKpis` + `getStaffPerformance` (lines 54-55). MISSING: `getRevenueSeries`, `getMemberCountSeries`, `getChurnSeries`, `getLtvSeries`, `getClassFillRateSeries` — 5 procedures absent from the overview.
- `audit-logs` section (lines 79-82) lists only `list`; MISSING `exportCsv`.
- `scheduled-reports` router has NO section at all in the overview (registered as `scheduledReports` in base-router but undocumented).
- `user-activity-log` (`userActivityLog`) router has NO section in the overview.
Why it matters: the overview is the designated "read before any API work" doc; these omissions mislead future work.

---

## Testable findings count
`testable:true` findings: **7** (P1, P2b, P3, P3b, P3c, P4, and P1b's in-app-delivery sub-behaviour is owned by P-domain; counted conservatively — P1b's *gap* itself is testable:false).
Strict count of findings explicitly marked `testable: true`: **6** (P1, P2b, P3, P3b, P3c, P4).
`testable:false`: P1b, P2, P5.

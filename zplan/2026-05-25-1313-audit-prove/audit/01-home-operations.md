# Domain: Home, Approvals & Operations

> Audited: 2026-05-25  
> Auditor: read-only subagent  
> Stack: oRPC + Drizzle, multi-tenant Neon, TanStack Router, Better-Auth

---

## Endpoints / Procedures

### packages/api/src/routers/analytics.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `getDashboardKpis` | `tenantProcedure` + `reports:read` | KPI aggregates for the selected period and branch | `getDashboardKpis` |
| `getStaffPerformance` | `tenantProcedure` + `reports:read` | Per-staff session count + commission totals | `getStaffPerformance` |
| `getRevenueSeries` | `tenantProcedure` + `reports:read` | Daily revenue time-series (up to 365 days) | `getRevenueSeries` |
| `getMemberCountSeries` | `tenantProcedure` + `reports:read` | Daily active-member count (7/30/90 days) | `getMemberCountSeries` |
| `getChurnSeries` | `tenantProcedure` + `reports:read` | Daily churn % (7/30/90 days) | `getChurnSeries` |
| `getLtvSeries` | `tenantProcedure` + `reports:read` | Daily avg LTV in cents (7/30/90 days) | `getLtvSeries` |
| `getClassFillRateSeries` | `tenantProcedure` + `reports:read` | Daily class fill rate % (7/30/90 days) | `getClassFillRateSeries` |

### packages/api/src/routers/announcements.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | `tenantProcedure` + `announcement_management:read` | Paginated announcement list with scope/active filters | `listAnnouncements` |
| `listActive` | `tenantProcedure` + `announcement_management:read` | Active, in-window announcements for current user | `listActiveAnnouncements` |
| `create` | `tenantProcedure` + `announcement_management:create` | Create announcement with branch scopes | `createAnnouncement` |
| `update` | `tenantProcedure` + `announcement_management:update` | Update announcement fields + scope reassignment | `updateAnnouncement` |
| `delete` | `tenantProcedure` + `announcement_management:delete` | Soft-delete (sets `isActive=false`) | `deleteAnnouncement` |

### packages/api/src/routers/check-ins.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `recordCheckIn` | `tenantProcedure` + `attendance_management:create` | Record single check-in (member or walk-in, booking or drop-in) | `recordCheckIn` |
| `listTodaysBookings` | `tenantProcedure` + `attendance_management:read` | Today's appointment_clients with check-in status and package info | `listTodaysBookings` |
| `list` | `tenantProcedure` + `attendance_management:read` | Paginated check-in log with filters and enriched client names | `listCheckIns` |
| `recordBulkCheckIn` | `tenantProcedure` + `attendance_management:create` | Bulk check-in up to 100 booking IDs; per-row failures non-fatal | `recordBulkCheckIn` |
| `getActivePackageForMember` | `tenantProcedure` + `attendance_management:read` | Earliest-expiring active package for credit deduction UI | (inline query) |
| `deleteCheckIn` | `tenantProcedure` + `attendance_management:delete` | Hard-delete check-in row with credit revert + audit | `deleteCheckIn` |

### packages/api/src/routers/audit-logs.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | `tenantProcedure` + `audit_log:read` | Paginated audit log with RBAC scoping and actor-name enrichment | `listAudit` |
| `exportCsv` | `tenantProcedure` + `audit_log:read` | CSV export of audit rows (hard-capped 50k rows) | `exportAuditCsv` |

### packages/api/src/routers/scheduled-reports.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | `tenantProcedure` (no permission check) | List all scheduled reports for the org | `listScheduledReports` |
| `create` | `tenantProcedure` + `reports:export` | Create a new scheduled-email report | `createScheduledReport` |
| `delete` | `tenantProcedure` + `reports:export` | Hard-delete a scheduled report | `deleteScheduledReport` |
| `toggle` | `tenantProcedure` + `reports:export` | Toggle a scheduled report active/inactive | `toggleScheduledReportActive` |

### packages/api/src/routers/user-activity-log.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | `tenantProcedure` (session-scoped, no extra permission) | Recent activity log for the calling user | `listUserActivityLog` |

### packages/api/src/routers/package-instances/pending.procedures.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `listPending` | `tenantProcedure` (role check: admin or trainer only) | Pending packages awaiting trainer assignment; branch-scoped with JS post-filter | (inline query) |

### packages/api/src/routers/package-instances/assign.procedures.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `assignTrainer` | `tenantProcedure` (role check: admin assigns any, trainer self-assigns) | Assign trainer → status: pending → active; sends customer notification | (inline tx) |
| `bulkAssign` | `tenantProcedure` + `service_management:create` | Bulk-create active package instances for multiple customers | (inline tx per row) |

### packages/api/src/routers/package-instances/approve.procedures.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `reject` | `tenantProcedure` (role check: admin only) | Reject pending package → status: cancelled; notifies customer | (inline tx) |
| `bulkApprove` | `tenantProcedure` (role check: admin or self-assign trainer) | Bulk assign trainer to multiple pending packages | (inline tx per row) |

### packages/api/src/routers/package-instances/bulk-reject.procedures.ts (bonus)

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `bulkReject` | `tenantProcedure` (role check: admin only) | Bulk reject pending packages → status: cancelled; per-row audit written | (inline tx per row) |

---

## Logic Functions

### packages/services/src/analytics.service.ts

- `getPeriodDates()` — Converts named period to `{from, to}` dates; used by KPI functions [internal helper]
- `buildDateSpine()` — Returns `{from, to}` for a `days`-length window ending today [internal helper]
- `spineKeys()` — Generates array of YYYY-MM-DD strings for a date range [internal helper]
- `getDashboardKpis()` — Sales, appointments, member count, churn, LTV, class fill rate for a period
- `getStaffPerformance()` — Per-staff sessions + commission aggregates via `commissionSplits`
- `getRevenueSeries()` — Daily revenue with zero-fill for up to 365 days
- `getMemberCountSeries()` — Daily active-member count (generate_series SQL)
- `getChurnSeries()` — Daily churn % (generate_series + CTE SQL)
- `getLtvSeries()` — Daily avg LTV (generate_series + CTE SQL)
- `getClassFillRateSeries()` — Daily class fill rate from `classSlots` with JS zero-fill

### packages/services/src/announcements.service.ts

- `buildScopeFilter()` — Builds Drizzle WHERE clause for RBAC branch scoping [internal]
- `enrichWithScopes()` — Batch-fetches `announcementScopes` and merges onto row array [internal]
- `setAnnouncementScopes()` — Delete-and-reinsert branch scope rows in a transaction [internal]
- `listAnnouncements()` — Paginated announcement list with scope/status filters
- `listActiveAnnouncements()` — Active, time-valid announcements sorted by pin+priority
- `createAnnouncement()` — Transactional insert with scope rows
- `updateAnnouncement()` — Transactional update with scope replacement
- `deleteAnnouncement()` — Soft-delete (sets `isActive=false`, `updatedAt`)

### packages/services/src/check-ins.service.ts

- `resolveClientDisplayName()` — Single-record name resolution for member/walk-in
- `batchResolveDisplayNames()` — Batch cross-DB name resolution (1 CP query + 1 tenant query) [internal]
- `recordCheckIn()` — Transactional check-in with duplicate guard, credit deduction, audit
- `listTodaysBookings()` — Today's bookings enriched with check-in status + active package
- `recordBulkCheckIn()` — Per-booking check-in loop; already-checked-in skipped, not errored
- `listCheckIns()` — Paginated check-ins with RBAC + batch name enrichment
- `deleteCheckIn()` — Transactional hard-delete with credit revert and audit

### packages/services/src/audit-log.service.ts

- `getActionSeverity()` / `deriveSeverity()` — Derives `info|warning|danger` from action string
- `writeAudit()` — Insert one audit row; must be called inside a transaction
- `getSeverityActions()` — Returns action sets for SQL severity-filter [internal]
- `deriveInitials()` — Converts display name to initials [internal]
- `listAudit()` — Paginated audit rows with RBAC, severity post-filter, actor enrichment
- `exportAuditCsv()` — Cursor-paginated CSV export up to 50k rows
- `rowToCsv()` / `escapeCsv()` — CSV serialisation helpers [internal]

### packages/services/src/scheduled-reports.service.ts

- `computeNextRunAt()` — Computes next run date from frequency; used by mark-sent and create
- `createScheduledReport()` — Insert new scheduled report row
- `listScheduledReports()` — All reports for the tenant (no filters)
- `deleteScheduledReport()` — Hard-delete
- `toggleScheduledReportActive()` — Flip `isActive`
- `listDueScheduledReports()` — Active reports whose `nextRunAt <= now`; called by cron handler [ORPHAN from this router — only called from apps/server/src/services/scheduled-reports.service.ts]
- `markScheduledReportSent()` — Advances `nextRunAt`, clears `lastError`; called by cron handler [ORPHAN from this router]
- `markScheduledReportFailed()` — Bumps `nextRunAt` +1h, sets `lastError`; called by cron handler [ORPHAN from this router]

### packages/services/src/user-activity-log.service.ts

- `listUserActivityLog()` — Paginated activity log for a user; scoped to `userId` from session

### packages/services/src/branch-stats-cache.service.ts

- `refresh()` — Debounced (2s) UPSERT of one `StatKind` per branch node [ORPHAN — nothing in this domain calls it; presumably called from membership/sales triggers]
- `refreshNow()` — Immediate UPSERT; used by backfill scripts [ORPHAN in this domain]
- `executeRefresh()` — Internal query + UPSERT for members/staff/revenue stats [internal]

---

## Gaps (prioritized P1/P2/...)

### P1 — `scheduledReports.list` has no auth guard  (packages/api/src/routers/scheduled-reports.ts:32-37)  [status: partial | testable: true]

`list` is the only procedure in this router that skips both `requirePermissionOrpc` and `assertOrgContextMatch`. Any authenticated tenant member — including those with no `reports` permission — can enumerate all scheduled reports for the org (including recipient email addresses). The create/delete/toggle siblings correctly require `reports:export`.

**Persistence:** reads `scheduled_reports` table; no write.  
**Fix:** add `await requirePermissionOrpc(context.tenantDb, context.member, "reports", "read")` and `assertOrgContextMatch(context, input)` before the service call.

---

### P1 — `bulkReject` sends no customer notifications  (packages/api/src/routers/package-instances/bulk-reject.procedures.ts:74-103)  [status: partial | testable: true]

Single-row `reject` (approve.procedures.ts:116-126) calls `notifyCustomerPackageRejected` after the transaction. `bulkReject` writes audit + status-history but never sends any notification. Customers who purchase a package that is bulk-rejected receive no email or in-app notification.

**Persistence:** writes `package_instances.status='cancelled'`, `audit_logs`, `package_instance_status_history`.  
**Expected side-effect:** `notifyCustomerPackageRejected` per row (currently missing).

---

### P1 — `bulkApprove` (approve.procedures.ts) does not insert `package_instance_staff` rows  (packages/api/src/routers/package-instances/approve.procedures.ts:238-274)  [status: partial | testable: true]

Single-row `assignTrainer` (assign.procedures.ts:144-151) inserts a `package_instance_staff` record at slot 0 in the same transaction. `bulkApprove` sets `assignedTrainerId` on the package but never inserts the `package_instance_staff` row. This means packages approved via bulk path will have a trainer but no staff-slot record, breaking any downstream query that joins through `package_instance_staff`.

**Persistence:** writes `package_instances.assigned_trainer_id`, `audit_logs`, `package_instance_status_history`. Missing write to `package_instance_staff`.

---

### P1 — `bulkApprove` sends no customer notifications  (packages/api/src/routers/package-instances/approve.procedures.ts:238-289)  [status: partial | testable: true]

Same gap as bulk-reject: single `assignTrainer` calls `notifyCustomerPackageAssigned` and `clearPendingReviewNotifications` post-transaction. `bulkApprove` omits both. Customers who get bulk-approved receive no notification.

---

### P1 — `userActivityLog` table is never written to in this codebase  (packages/services/src/user-activity-log.service.ts)  [status: missing | testable: false]

`listUserActivityLog` reads from the `user_activity_log` table. A full-text search across the entire codebase finds zero `INSERT` statements targeting this table (the only match is the backfill doc in `zplan/`). The "Recent Activity" widget on the dashboard (`index.tsx` does NOT call `client.userActivityLog.list` — it calls `client.auditLogs.list` instead) will always return an empty array if any page ever uses this endpoint.

**Impact:** The router and service exist but the table is never populated, making the endpoint permanently empty.

---

### P2 — `listPending` applies branch filter in JS post-fetch, not in SQL  (packages/api/src/routers/package-instances/pending.procedures.ts:66-88, 130-140)  [status: partial | testable: true]

The query fetches ALL pending+purchased packages (`limit ?? 50`) without a SQL branch predicate, then filters in JS using the resolved effective-branch. For orgs with many pending packages this means the API returns at most 50 rows before filtering, so a trainer could silently see fewer packages than actually exist in their branch if the total pending count exceeds 50. The `limit` parameter becomes semantically incorrect (it limits pre-filter, not post-filter).

**Fix:** Push the branch filter into SQL using `inArray(services.branchId, branchFilterIds)` for service-bound packages.

---

### P2 — `announcements.list` does not check `assertOrgContextMatch`  (packages/api/src/routers/announcements.ts:28)  [status: partial | testable: true]

`list` has a comment block that appears to have been placeholder for the guard, but only `guardBranchAccessible` and `requirePermissionOrpc` are present. `assertOrgContextMatch` is missing (unlike `create`, `update`, `delete` which include it). A request with a mismatched `organizationId` in the body vs the session could bypass org isolation for the read path.

---

### P2 — `scheduledReports.list` returns all reports without org context validation  (packages/api/src/routers/scheduled-reports.ts:32-37)  [status: partial | testable: true]

Reported under P1 for the missing permission guard. Additionally, `listScheduledReports` takes only `tenantDb`, which is implicitly scoped to the org; however without `assertOrgContextMatch` a caller who can forge or reuse a different org's JWT could read another org's scheduled reports if the connection pool is shared across orgs (which it isn't in this architecture, but it's a defence-in-depth gap).

---

### P2 — `deleteAnnouncement` is a soft-delete but named `delete` — no hard-delete path exists  (packages/services/src/announcements.service.ts:278-295)  [status: partial | testable: true]

`deleteAnnouncement` sets `isActive=false` and `updatedAt`, returning the updated row. The router's `deleteHandler` calls it. The UI shows a "Delete" button that implies permanent removal. No hard-delete route exists (only the same soft-delete). Inactive announcements persist forever and pile up in the table with no purge mechanism.

---

### P2 — Announcement acknowledgement tracking is declared but unimplemented  (announcements/view.tsx:743-759)  [status: missing | testable: false]

The `requiresAcknowledgement` field is stored correctly. The UI renders "— acknowledged" as a stub with a comment `"Tracking arrives in a future release"`. There is no `announce.acknowledge` endpoint, no `announcement_acknowledgements` table (no such schema file exists), and no backend logic. The feature is a UI-level stub.

---

### P2 — "Views" count on announcements is hardcoded to `—` in the UI  (announcements/view.tsx:744-750)  [status: missing | testable: false]

The expanded row shows `— views` with an inline comment `// STUB: views count — not returned by API`. No view-tracking table, trigger, or procedure exists.

---

### P3 — `branch-stats-cache.service.ts` `refresh()` is never called from this domain  (packages/services/src/branch-stats-cache.service.ts)  [status: partial | testable: false]

`refresh` and `refreshNow` exist as write-through cache updaters but nothing in the Home/Operations/Announcements/Attendance domain calls them. The cache table (`branch_stats_cache`) likely remains stale unless another domain (sales, membership) triggers refreshes. The dashboard KPI tiles use live `analytics.service.ts` queries, bypassing this cache entirely — so the cache may be orphaned in this domain.

---

### P3 — `getRevenueSeries` and `getMemberCountSeries` / `getChurnSeries` / `getLtvSeries` use conflicting branch-scope logic  (packages/services/src/analytics.service.ts:402-448 vs 504-538)  [status: partial | testable: true]

`getRevenueSeries` accepts a `branchId` parameter and uses `resolveBranchFilter`. The four time-series functions (`getMemberCountSeries`, `getChurnSeries`, `getLtvSeries`, `getClassFillRateSeries`) accept `accessibleNodeIds` in their `TimeSeriesParams` type but the raw SQL queries do not apply any branch filter — they query all `package_instances`/`sales_orders`/`customer_profiles` globally. This means time-series data for staff-scoped members is unfiltered by RBAC.

**Persistence:** read-only.

---

### P3 — `listTodaysBookings` hardcodes `clientType: "member"` with a deferred walk-in limitation  (packages/services/src/check-ins.service.ts:523, 544)  [status: partial | testable: true]

Comment `§7.8` documents that walk-in booking linkage is not yet supported. The `TodaysBookingRow` interface declares `clientType: "member" | "walk_in"` but the implementation always returns `"member"`. Attendance view will never show walk-in bookings even if future schema changes add support.

---

### P3 — `requirePermission("package_management:approve")` in approvals route `beforeLoad` is a stub  (apps/web/src/routes/_authenticated/dashboard/_layout/operations/approvals.tsx:1614-1616)  [status: partial | testable: false]

`requirePermission` in `apps/web/src/lib/route-guards.ts` is documented as a stub that does not actually gate access. The page uses an in-component role check (`isAdmin || isTrainer`) as the real guard. Removing this stub guard causes the route to load for any authenticated user, showing an empty state rather than a proper 403.

---

### P3 — `handleApproveAllVisible` in approvals page selects rows but does not open the bulk-approve dialog  (apps/web/src/routes/_authenticated/dashboard/_layout/operations/approvals.tsx:1468-1472)  [status: partial | testable: false]

The "Approve all visible (N)" hero button calls `handleApproveAllVisible` which only runs `setCheckedIds(new Set(filtered.map(r => r.id)))`. It does NOT open `setBulkApproveOpen(true)`. Users must notice that rows are now selected and manually click "Approve N…" in the bulk-action bar. The UX implies a single click approves everything; the actual behaviour just selects them.

---

### P3 — `audit-log.service.ts` severity=info filter is approximate and skips `offset` pagination  (packages/services/src/audit-log.service.ts:281-310)  [status: partial | testable: true]

When `severity="info"` is requested, the service over-fetches `limit * 3` rows starting from `offset=0` (ignoring the caller-supplied `offset`), then slices `[offset..offset+limit]`. For large tables with many non-info rows this results in incorrect pagination — pages 2+ may repeat or skip rows. The `total` returned is also the pre-severity count, not the filtered count.

---

## Testable findings summary

| Priority | Finding | testable |
|---|---|---|
| P1 | `scheduledReports.list` missing auth guard | true |
| P1 | `bulkReject` no customer notification | true |
| P1 | `bulkApprove` missing `package_instance_staff` insert | true |
| P1 | `bulkApprove` no customer notification | true |
| P1 | `userActivityLog` table never written | false |
| P2 | `listPending` JS branch filter vs SQL limit | true |
| P2 | `announcements.list` missing `assertOrgContextMatch` | true |
| P2 | `scheduledReports.list` missing org context validation | true |
| P2 | `deleteAnnouncement` soft-delete only; no purge | true |
| P2 | Announcement acknowledgement tracking unimplemented | false |
| P2 | Announcement views count is a stub | false |
| P3 | `branch-stats-cache` never called from this domain | false |
| P3 | Time-series RBAC branch filter absent | true |
| P3 | Walk-in booking linkage hardcoded to "member" | true |
| P3 | `requirePermission` guard is a stub | false |
| P3 | "Approve all visible" UX only selects, doesn't open dialog | false |
| P3 | `severity=info` audit pagination skips `offset` | true |

# Audit: notifications-audit-platform
**Files inspected:** 6 routers, 9 services + cron handler, 1 schema, 1 migration
**Findings:** P1: 2, P2: 5, P3: 2, Total: 9

## Findings

### NAP-01 — Notification email dispatch is at-least-once with duplicate risk
- **Severity:** P2
- **Status:** implemented
- **Testable:** true
- **File:** `apps/server/src/services/notification-dispatch.service.ts:92-102`
- **Symptom:** If `sendEmail` succeeds but the subsequent `UPDATE notifications SET email_sent_at=now()` fails (transient Neon/network error), the recipient gets a second email on the next hourly cron tick. Same happens if the Worker is killed between the two awaits.
- **Evidence:**
  ```ts
  await sendEmail({ to: recipient.email, ... });

  await tenantDb
      .update(notifications)
      .set({ emailSentAt: sql`now()` })
      .where(eq(notifications.id, notification.id));
  ```
- **Why it's wrong:** Email is committed externally (Resend), then the local "I sent it" flag is written. The window between the two is unbounded and any failure causes a re-send. On CF Workers, scheduled handler isolates can be terminated; `ctx.waitUntil` continues but isn't transactional with Resend. There is no `attempts`/`lastAttemptedAt` column to break the retry storm — so a row that flapped on the DB update will re-email forever until it succeeds.
- **Suggested fix:** Set `email_sent_at` (or an `email_attempted_at` flag) BEFORE calling `sendEmail` (at-most-once), inside a `where email_sent_at IS NULL` UPDATE … RETURNING to atomically claim the row. If Resend fails, log it and accept the rare lost email — duplicates are worse than misses for an announcement bell. Alternative: add a `send_attempts smallint` column and cap retries at 3.
- **Owned files:** [`apps/server/src/services/notification-dispatch.service.ts`, `packages/db/src/migrations/tenant/0076_notifications_add_email_sent_at.sql`, `packages/db/src/schema/tenant/notifications.ts`]

### NAP-02 — Email dispatcher ignores user notification preferences
- **Severity:** P2
- **Status:** missing
- **Testable:** true
- **File:** `apps/server/src/services/notification-dispatch.service.ts:65-97`
- **Symptom:** A user who set `emailEnabled = false` (or any future per-channel pref) in `notification_preferences` will still receive announcement emails. The opt-out is non-functional.
- **Evidence:**
  ```ts
  const pending = await tenantDb
      .select()
      .from(notifications)
      .where(
          and(
              eq(notifications.type, "announcement"),
              isNull(notifications.emailSentAt),
              gte(notifications.createdAt, cutoff),
          ),
      );
  // ... no JOIN or filter on notification_preferences
  for (const notification of pending) {
      // ... sendEmail directly
  ```
- **Why it's wrong:** `packages/services/src/notification-preference.service.ts` exposes `emailEnabled` and the `notification_preferences` table is wired into the prefs router, but the dispatcher never reads from it. Compliance/CAN-SPAM expects "honor unsubscribes" — silent ignore is a regulatory exposure.
- **Suggested fix:** Left-join `notification_preferences` (on userId) inside the `select` and skip notifications where `emailEnabled = false` AND the row exists. Default (no prefs row) → send, matching `getNotificationPreferences` fallback.
- **Owned files:** [`apps/server/src/services/notification-dispatch.service.ts`]

### NAP-03 — Analytics raw-SQL aggregates bypass branch RBAC scope
- **Severity:** P1
- **Status:** partial
- **Testable:** true
- **File:** `packages/services/src/analytics.service.ts:215-256, 504-602, 609-647`
- **Symptom:** A staff member scoped to a single branch (`accessibleNodeIds = [branchX]`) calling `getDashboardKpis` sees org-wide churn, LTV, and member-count numbers — including data from branches they have zero access to. The Drizzle queries respect `branchFilter`, but every raw `sql\`…\`` block (churnResult, ltvResult, getMemberCountSeries, getChurnSeries, getLtvSeries) hits `customer_profiles`, `package_instances`, and `sales_orders` with no branch/scope predicate.
- **Evidence:**
  ```ts
  // Line 215 (getDashboardKpis - churn):
  const churnResult = await tenantDb.execute<{ churn_pct: string }>(sql`
      WITH active_at_start AS (
          SELECT DISTINCT cp.id AS customer_id
          FROM customer_profiles cp
          JOIN package_instances pi ON pi.client_id = cp.user_id
          WHERE pi.status = 'active' AND pi.starts_at < ${from}
      ), lapsed AS (
          SELECT DISTINCT cp.id AS customer_id
          FROM customer_profiles cp ...
      )
      SELECT ... FROM active_at_start a LEFT JOIN lapsed l ...
  `);
  // No filter on branch / hierarchy_scope_id / accessibleNodeIds.

  // Line 246 (avg LTV):
  const ltvResult = await tenantDb.execute<{ avg_ltv: string }>(sql`
      SELECT ROUND(AVG(customer_total)::numeric, 0) AS avg_ltv
      FROM ( SELECT customer_id, SUM(total_amount) AS customer_total
             FROM sales_orders
             WHERE date <= ${to} AND status IN ('confirmed', 'completed')
             GROUP BY customer_id ) t
  `);
  // No branch_id filter and no scope filter — sees the whole tenant.
  ```
- **Why it's wrong:** The router (`analytics.ts:42`) calls `guardBranchAccessible(input.branchId, accessibleNodeIds)` and the Drizzle aggregates honor `branchFilter`, but the four raw-SQL aggregates never receive `accessibleNodeIds`. A franchisee staff scoped to one location can read franchise-wide churn — a competitive-data leak. Combined with `getMemberCountSeries` / `getChurnSeries` / `getLtvSeries` which take no `branchId` input at all, low-privileged users see the whole org.
- **Suggested fix:** Thread `accessibleNodeIds` into each raw SQL via a join `JOIN sales_orders so ON … WHERE so.branch_id = ANY(${nodeIds})` (or via customer_profiles → members.hierarchy_scope_id), AND add a `branchId` input parameter to the three series endpoints. For LTV, join `sales_orders.branch_id`; for churn/membercount, derive scope via `members.hierarchy_scope_id`.
- **Owned files:** [`packages/services/src/analytics.service.ts`, `packages/api/src/routers/analytics.ts`]

### NAP-04 — Scheduled report email bypasses recipient validation and RBAC
- **Severity:** P1
- **Status:** implemented (but unsafe)
- **Testable:** true
- **File:** `apps/server/src/services/scheduled-reports.service.ts:95-114, 158`
- **Symptom:** A staff member with `reports:export` permission and access to a single branch can create a scheduled report whose `recipients` is an arbitrary external email (`attacker@evil.com`). The cron sender then emails them **org-wide KPIs** (revenue, member counts, branch revenue breakdown) because the sender hard-codes `accessibleNodeIds` to *every* node in the tenant.
- **Evidence:**
  ```ts
  // Line 95-101 (scheduled-reports.service.ts):
  const allNodes = await tenantDb
      .select({ id: hierarchyNodes.id })
      .from(hierarchyNodes);
  const accessibleNodeIds = allNodes.map((n) => n.id);
  // ...
  await sendSingleReport({ ..., accessibleNodeIds });
  ```
  And in the create router (line 47-71), no branch scoping is recorded with the report row — only `recipients`, `windowKey`, `format`, `frequency`. The `scheduled_reports` schema has no `branch_id` / `creator_accessible_nodes` column.
- **Why it's wrong:** RBAC is enforced at *creation* time (the create handler checks the caller's permission once), but the actual data extraction at *send* time deliberately escalates to org-wide scope. A branch-scoped staff creates the schedule, the cron sends them a report that includes branches they had no permission to read. Equivalent to a confused-deputy escalation — they're a deputy to the cron, which uses the cron's elevated scope.
- **Suggested fix:** Snapshot the creator's `accessibleNodeIds` and `creatorUserId` into the `scheduled_reports` row at create time; the cron should use *those* node IDs (not all-nodes) when calling `getDashboardKpis`. Also validate that report `recipients` are confined to tenant members or a vetted allowlist domain, OR re-check `creatorUserId` is still active/has the permission at send time.
- **Owned files:** [`apps/server/src/services/scheduled-reports.service.ts`, `packages/api/src/routers/scheduled-reports.ts`, `packages/services/src/scheduled-reports.service.ts`, `packages/db/src/schema/tenant/scheduled-reports.ts`]

### NAP-05 — `email_sent_at` index isn't unique-claim safe under concurrent dispatchers
- **Severity:** P2
- **Status:** partial
- **Testable:** true
- **File:** `packages/db/src/migrations/tenant/0076_notifications_add_email_sent_at.sql:1-6` + `apps/server/src/services/notification-dispatch.service.ts:65-102`
- **Symptom:** If two cron events fire concurrently (CF deploy boundary; or admin manually re-triggers the handler), both will SELECT the same un-emailed rows, both will send emails, then both will write `email_sent_at`. The migration adds a non-unique partial index, which speeds reads but doesn't prevent double-claim. Combined with NAP-01, this is the duplicate-email worst case.
- **Evidence:**
  ```sql
  CREATE INDEX IF NOT EXISTS notifications_email_sent_at_idx
    ON notifications (email_sent_at)
    WHERE email_sent_at IS NULL;
  ```
  And the dispatcher does a non-atomic read-then-write — no `FOR UPDATE SKIP LOCKED` and no row-claim CAS.
- **Why it's wrong:** Workers do not have a global mutex. The cron documentation for CF says crons "can fire more than once" at deploy/restart boundaries. The current code has no claim primitive; selecting `IS NULL` and then updating later does not exclude a parallel reader.
- **Suggested fix:** Replace the SELECT-loop with a single `UPDATE notifications SET email_sent_at = now() WHERE email_sent_at IS NULL AND type = 'announcement' AND created_at >= cutoff RETURNING …` — Postgres atomically claims each row. Then enqueue the returned rows for Resend. If Resend fails, accept the loss (or write a separate `email_failed_at` flag).
- **Owned files:** [`apps/server/src/services/notification-dispatch.service.ts`]

### NAP-06 — Audit-log severity filter for `info` loses pagination correctness and total count
- **Severity:** P3
- **Status:** partial
- **Testable:** true
- **File:** `packages/services/src/audit-log.service.ts:248-312`
- **Symptom:** When the caller filters by `severity = "info"`, the service over-fetches `limit*3` (cap 600) and post-filters in memory. Pages beyond ~200 info rows return incomplete data, and `total` reflects pre-severity-filter rows — so the UI paginator shows a `total` that doesn't match the visible result count.
- **Evidence:**
  ```ts
  const fetchLimit = severity === "info" ? Math.min(limit * 3, 600) : ...
  const fetchOffset = severity === "info" ? 0 : offset;
  // ... post-filter ...
  total = allRows.length; // pre-severity count
  ```
- **Why it's wrong:** The comment acknowledges this is an "acceptable approximation" but the UI consumer can't tell when the info bucket is sparse vs. when results were truncated. For audit logs (a security/compliance surface), a misleading total is a P3 — not a leak, but it breaks pagination guarantees.
- **Suggested fix:** Use `notInArray(auditLogs.action, [...DANGER_ACTIONS, ...WARNING_ACTIONS])` for the info case (Drizzle does export `notInArray`); push the filter into SQL and fix `total` to reflect the true filtered count.
- **Owned files:** [`packages/services/src/audit-log.service.ts`]

### NAP-07 — Audit-log CSV export has no separate permission gate
- **Severity:** P3
- **Status:** implemented
- **Testable:** false
- **File:** `packages/api/src/routers/audit-logs.ts:67`
- **Symptom:** Bulk CSV export (up to 50,000 rows) uses the same `audit_log:read` permission as a single-page list. A user with read access can dump the entire audit log to disk in one click and exfiltrate IPs, actor names, summaries for 50k actions.
- **Evidence:**
  ```ts
  exportCsv: tenantProcedure
      .input(sharedFilters.extend({ maxRows: z.number().min(1).max(50_000).optional() }))
      .handler(async ({ input, context }) => {
          assertOrgContextMatch(context, input);
          await requirePermissionOrpc(context.tenantDb, context.member, "audit_log", "read");
          // No "audit_log:export" check.
  ```
- **Why it's wrong:** Best-practice separation — read != bulk-export. Compare with other routers (e.g. `scheduled-reports.ts:63` uses `reports:export`). The pattern exists elsewhere in this codebase, just not here.
- **Suggested fix:** Add `audit_log:export` permission, gate `exportCsv` on it, default-grant to admin role only.
- **Owned files:** [`packages/api/src/routers/audit-logs.ts`]

### NAP-08 — Notification dispatch lookback can re-email after a 48h outage
- **Severity:** P2
- **Status:** implemented (by design, but bug-shaped)
- **Testable:** true
- **File:** `apps/server/src/services/notification-dispatch.service.ts:40, 63-74`
- **Symptom:** The `LOOKBACK_MS = 48h` window is computed against `notification.createdAt`. If the cron is offline for >48h (extended outage), all notifications outside the window are silently dropped — recipients never get them. Conversely, if a notification was created 47h ago and its previous dispatch attempt failed silently (no `email_sent_at` set), it gets re-attempted now.
- **Evidence:**
  ```ts
  const LOOKBACK_MS = 48 * 60 * 60 * 1000;
  // ...
  const cutoff = new Date(Date.now() - LOOKBACK_MS);
  const pending = await tenantDb.select().from(notifications).where(
      and(
          eq(notifications.type, "announcement"),
          isNull(notifications.emailSentAt),
          gte(notifications.createdAt, cutoff),
      ),
  );
  ```
- **Why it's wrong:** The 48h cap is a defensive heuristic, but it leaks the failure mode silently — there's no metric/log emitted for "skipped N notifications older than cutoff". A multi-day Resend outage means permanently lost emails with no observability.
- **Suggested fix:** Log a counter `report.skippedTooOld` so the cron output exposes the loss. Optionally widen to 7 days or thread the cutoff through env var. Long-term: add an explicit `expired_at` or terminal-state column instead of a sliding window.
- **Owned files:** [`apps/server/src/services/notification-dispatch.service.ts`]

### NAP-09 — Tenant-usage snapshot reads payments from inactive/cancelled tenant DBs
- **Severity:** P2
- **Status:** partial
- **Testable:** true
- **File:** `apps/server/src/services/tenant-usage-snapshot.service.ts:278-284`
- **Symptom:** Unlike `notification-dispatch.service.ts` and `installment-sweep.service.ts` (which both filter `paymentStatus = 'active'`), the usage snapshot iterates **every** organization — including suspended, cancelled, and soft-deleted tenants. It then opens their tenant DBs and writes snapshots. For tenants undergoing hard-delete (cron at 03:00 UTC writes to a Neon branch about to vanish 2h later), this races and emits noisy errors. Worse, the tenant data of cancelled customers gets re-read daily long after they should be quiesced — a soft-violation of "right to be forgotten" if the tenant requested deletion.
- **Evidence:**
  ```ts
  const orgs = await deps.controlPanelDb
      .select({ id: organizations.id, ghlProvisionedAt: organizations.ghlProvisionedAt, paymentStatus: organizations.paymentStatus })
      .from(organizations);
  // ← no .where() — every org row is selected.
  ```
- **Why it's wrong:** Inconsistent with the other two crons; snapshots of cancelled tenants have no business value; and there's a real race with `hardDeleteOverdueTenants` at 03:00 UTC. Also: line 168 sets `dailyActiveMembers30dAvg = null` always — the comment acknowledges this is a stub, so the snapshot's health score is permanently degraded for Activity factor (P3 sub-finding).
- **Suggested fix:** Add `.where(eq(organizations.paymentStatus, "active"))` or `.where(inArray(organizations.paymentStatus, ["active", "past_due"]))`. Skip soft-deleted (`deletedAt IS NOT NULL`) tenants explicitly.
- **Owned files:** [`apps/server/src/services/tenant-usage-snapshot.service.ts`]

## Summary

The notifications/audit/cron domain is generally well-scoped per-tenant via the `tenantDb` connection, but two architectural issues drive the P1 findings: (1) **`analytics.service.ts` mixes Drizzle queries that honor `accessibleNodeIds` with raw `sql\`\`` aggregates that don't** — branch-scoped staff can read org-wide churn, LTV, and member counts (NAP-03); and (2) **scheduled reports escalate to org-wide scope at send time** regardless of the creator's branch permissions, and recipients aren't validated to be tenant members (NAP-04). The recently-changed notification dispatcher (ST-02) has duplicate-email risk because `email_sent_at` is written *after* the Resend call (NAP-01) and there's no concurrent-cron claim primitive (NAP-05); it also ignores `notification_preferences.emailEnabled` (NAP-02), breaking opt-out compliance. Audit logs are correctly append-only (no delete/update procedures exposed) but bulk CSV export shares the `read` permission with single-page list (NAP-07), and severity-info filter does memory-side pagination with stale totals (NAP-06). Installment sweep is idempotent (NAP not raised). Tenant usage snapshot iterates all orgs including cancelled/deleted (NAP-09).

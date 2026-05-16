# Plan E — Tenant Management & Platform Operations Runbook

How to operate the Avantej platform-admin surface — list, drill-in,
lifecycle, comms, audit, provisioning, GDPR.

Companion to:
- `docs/plans/plan-e-tenant-management.md` (the original plan).
- `docs/runbook/plan-c-payment-integrity.md` (the payments-side runbook).

---

## 1. Mental Model

Plan E is the **platform-admin surface for tenants**. Plan C handles
payments operations (drift, disputes, reconciliation); Plan E handles
everything else about the tenant relationship — who they are, what
state they're in, how much they're using, how to talk to them, and how
to provision / retire them.

| Concern | Mechanism | Source |
|---------|-----------|--------|
| Cross-tenant inventory | `/platform-admin/tenants` list + drill-in (E.1) | `organizations`, `subscriptions`, `org_country_stripe_accounts` |
| Daily usage roll-up | `tenant_usage_snapshots` cron + Usage tab (E.2) | tenant DBs (cross-fan-out, c=5) |
| Lifecycle state changes | suspend / resume / forceCancel / issueCredit / reTrial (E.3) | `organizations.paymentStatus` + Stripe sub + `admin_session_actions` |
| Stuck-tenant visibility | Activation funnel tab (E.4) | tenant DB + `organizations.ghl_provisioned_at` |
| Tenant DM + announcements | Comms tab (E.5) | Resend + tenant `notifications` + tenant `announcements` |
| Audit forensics | `/platform-admin/audit` (E.6) | `admin_session_actions` joined to `admin_sessions` |
| New tenant onboarding | `/platform-admin/tenants/new` wizard (E.7) | Neon API + RBAC seed + invitation |
| GDPR / closure | Export + 30-day soft delete + nightly sweeper (E.8) | `tenant_deletions` + Neon project drop |

Mental shortcut: **Plan C = how money flows. Plan E = how tenants
flow.**

---

## 2. Crons

Declared in `apps/server/wrangler.jsonc`, dispatched from
`apps/server/src/index.ts` `scheduled` handler (ADR-0021 pattern).

```
0 * * * *    — Plan C C.1   webhook backfill
0 1 * * *    — Plan E E.2   tenant usage snapshot
30 2 * * *   — Plan C C.5   nightly reconciliation
0 3 * * *    — Plan E E.8   hard-delete sweeper for overdue tenants
0 9 * * *    — Plan C C.6   onboarding-stuck alerts
```

Manual triggers from admin UI:
- Usage snapshot: drill-in Usage tab → "Refresh now"
  (`runTenantUsageSnapshotsNow`).
- Hard-delete sweeper: `runHardDeleteSweeperNow` proc — super_admin
  only. No UI button by default; wire one in if/when ops want it.

---

## 3. Schemas (control panel)

| Table | Phase | Purpose |
|-------|-------|---------|
| `tenant_usage_snapshots` | E.2 | Daily UPSERT (org, date) — members/customers/appts/sales/storage/ghl |
| `tenant_deletions` | E.8 | Soft-delete row + 30-day countdown to hard delete |
| `admin_session_actions` (modified) | E.3 | `admin_session_id` nullable + new `admin_user_id` for direct (non-impersonation) actions |

DDL is in `docs/plans/plan-e-tenant-management.md` and migrations
`0022_tenant_usage_snapshots.sql`, `0023_admin_actions_direct_audit.sql`,
`0024_tenant_deletions.sql`.

---

## 4. Common Operations

### List + drill into a tenant
UI: `/dashboard/platform-admin/tenants`. Search by name / slug / owner
email. Filter by `paymentStatus`. Click name → drill-in.

Drill-in tabs:
- **Overview** — owner, sub, last ledger activity, per-country Connect accounts.
- **Usage** — last 30 days of `tenant_usage_snapshots` + "Refresh now".
- **Funnel** — 7 activation milestones (E.4), with `stuckAt` highlighted.
- **Comms** — DM owner or post a tenant announcement.
- **Actions** — suspend / resume / forceCancel / issueCredit / reTrial
  / export / soft-delete / restore.

### Suspend a tenant
Actions tab → Suspend card. Reason required (audit row stores it).
Effect: middleware returns HTTP 403 to non-admin traffic carrying that
`organizationId`. Stripe subscription is *not* paused —
`forceCancelTenant` is the explicit way to stop billing too. See
ADR-0024.

### Resume a suspended tenant
Actions tab → Resume card. Same reason requirement.
`paymentStatus` flips back to `active`; middleware stops returning 403.

### Force-cancel a tenant
Actions tab → Force cancel. Cancels the Stripe subscription
immediately, sets `paymentStatus='cancelled'`. **Destructive** — no
`uncancelTenant` proc. Recovery = create a fresh subscription.

### Issue a credit
Actions tab → Issue credit. Negative customer balance transaction on
Stripe (`customers.createBalanceTransaction`). Applied automatically
to next invoice. Audit row records `stripeBalanceTxId`.

### Re-trial a tenant
Actions tab → Re-trial. Extends `organizations.trialEndsAt` by N days,
clears suspension if any. Does **not** touch the Stripe subscription —
purely a control-panel concept.

### DM a tenant owner
Comms tab → "Direct message owner". Email + in-app notification fire
independently; either failing does NOT block the other or the audit
row. Errors surface as a toast warning.

### Broadcast a tenant announcement
Comms tab → "Broadcast announcement". Inserts directly into the
tenant's `announcements` table, picked up by their dashboard widget.

### Review admin audit log
`/dashboard/platform-admin/audit`. Filter by action type / admin user /
target org / date range. Impersonation actions and direct actions share
this table; the row has a `impersonation` badge when an
`admin_session_id` is present.

### Provision a new tenant
`/dashboard/platform-admin/tenants/new`. Form: name / slug / country /
ownerEmail / ownerName. On submit: Neon project create → run tenant
migrations → insert `organizations` row → seed RBAC → invitation email
to owner. Audit row records the action. If anything fails after Neon
project creation, the service best-effort drops the Neon project to
avoid orphaned databases.

### Export tenant data
Actions tab → TenantDeletionCard → "Request export". Synchronous in
v1 — returns a `data:` URL on the deletion row's `export_url`.
**Open TODO:** wire R2 upload + email-to-admin.

### Soft delete a tenant
Actions tab → TenantDeletionCard → "Request soft delete". Inserts
`tenant_deletions` row with `hard_delete_after = now + 30d`. Sets
`paymentStatus='cancelled'`. Tenant can be restored any time before the
deadline.

### Restore a soft-deleted tenant
Actions tab → TenantDeletionCard → "Restore". Stamps `restored_at`,
returns `paymentStatus='active'`.

### Hard-delete sweeper
Runs at 03:00 UTC daily. Selects `tenant_deletions` rows where
`hard_delete_after <= now AND hard_deleted_at IS NULL AND restored_at IS
NULL`. For each: drops the Neon project (DELETE
`https://console.neon.tech/api/v2/projects/{id}`), deletes the
`organizations` row (cascade), stamps `hard_deleted_at`. Errors per org
do not stop the sweep — they accumulate in the report.

---

## 5. Debugging Recipes

### "Tenant complains they can't log in"
1. Check `organizations.paymentStatus`. If `suspended` or `cancelled`,
   the middleware is doing its job — confirm there's an audit row in
   `admin_session_actions` explaining why.
2. If the status is `active` but they still 403, check the oRPC
   middleware logs for "suspension check failed" — a transient DB
   error in the lookup falls through. Re-attempt the request.

### "Usage chart shows zero / flat-lined"
1. Check the latest snapshot row for the org in
   `tenant_usage_snapshots`. If empty, the cron hasn't run yet — kick
   it manually via the drill-in Usage tab "Refresh now" button.
2. If the snapshot exists with zero counts, query the tenant DB
   directly. The snapshot service writes whatever the tenant DB says.
3. If the cron ran but errored for that org, look at the wrangler logs
   for `[tenant-usage-snapshot] org=X failed:`. Concurrency=5 means
   one failure doesn't stop the others.

### "Tenant is stuck at first_member forever"
1. Funnel tab shows `stuckAt: first_member`. Open the tenant DB and
   check `members` — if rows exist but `joined_at` is null, the
   funnel proxy is using `MIN(joined_at)` which will be null.
2. If members exist and joined_at is set, the funnel computation is
   wrong — file a bug, this should not happen.

### "Tenant says they didn't receive my DM"
1. Comms toast shows which channels delivered (`email + in-app` /
   `email only` / etc.). If it says `audit only`, both channels
   failed — error toast warning shows why.
2. Email failure: check Resend dashboard for the recipient. Common
   cause: bounced address (owner email outdated).
3. In-app failure: check the tenant DB `notifications` table for a row
   with `userId = ownerUserId` and `type='system'`. If missing, tenant
   DB write failed — check wrangler logs.

### "Hard-delete sweeper kept this row but didn't delete"
1. Inspect the row in `tenant_deletions` — has `restored_at` been set
   inadvertently? `hard_deleted_at` populated? Confirm `hard_delete_after`
   actually passed.
2. If row eligible but sweeper didn't touch it: Neon API call probably
   failed. Check wrangler logs for the cron firing at 03:00 UTC and the
   `errors` array in the report. Re-run via `runHardDeleteSweeperNow`.

### "Audit log is empty for a known admin action"
1. Confirm the admin action actually completed (the audit row is
   typically written *after* the side effect; a failure mid-action
   skips it).
2. Make sure your filter `actionType` matches — actions use snake_case
   strings (`tenant_suspend`, `tenant_dm`, etc.). The `listActionTypes`
   proc returns the live distinct set.

---

## 6. Per-Phase Reference

| Phase | Commit (squashed view) | What |
|-------|-------|------|
| Plan doc | `c4032a4` | Plan E scope + ADR list |
| E.1 | `458d317` | Tenant list + drill-in foundation |
| E.2 | `8a0d028` | Usage snapshots cron + Usage tab + ADR-0023 |
| E.3 | `dd0cecf` | Lifecycle ops + middleware suspension gate + ADR-0024 |
| E.4 | `bff25c2` | Activation funnel + ADR-0025 |
| E.5 | `7ab1fff` | Tenant comms (DM + announcements) |
| E.6 | `7ab1fff` (same commit) | Admin audit log UI |
| ADR-0022 | `4e6adf4` | Scope ADR (Plan E = admin-only) |
| E.7 | `24bb0c1` | Tenant provisioning wizard |
| E.8 | `69090a3` | Export + GDPR delete + ADR-0026 |

All on branch `tenant-management`, base `payment-integrity` tip.

---

## 7. Open Items (post-Plan-E)

Carried into a future plan (Plan F or beyond):

- **R2 upload + admin email for tenant exports** — v1 returns a
  base64 `data:` URL inline. Mailing the ZIP requires R2 binding +
  Resend attachment. (E.8 TODO.)
- **ZIP-per-table** export format — v1 is a single JSON. Auditor-
  friendly CSV-per-table is the eventual upgrade. (E.8 TODO.)
- **Slack alerts on critical events** — sweeper errors, suspended
  tenant lockouts, lifecycle ops by non-super_admin (currently
  refused; Slack would be nice). (cross-cutting.)
- **Self-serve tenant management** — own-sub cancel, own-data
  export, own-tenant audit, in-app announcements UI. Plan F per
  ADR-0022.
- **Cancelled-state middleware gate** — `suspended` is gated, but
  `cancelled` only stops billing (the Stripe sub is cancelled, so
  tenants effectively can't use the platform anyway). Tighten the
  middleware to explicitly 403 on `cancelled` too. (E.3 follow-up.)
- **Country column on organizations** — wizard records country in the
  audit metadata only. Promote to a real column if/when we need to
  query tenants by country at scale. (E.7 follow-up.)
- **Cross-tenant funnel aggregate** — current funnel is per-tenant
  on-demand. Daily snapshot of milestones (alongside
  `tenant_usage_snapshots`) would unlock "% of tenants reach
  first_payment in 30d" charts. (E.4 follow-up.)
- **Hard quota enforcement** — `TIER_LIMITS` is soft today; usage
  snapshots only tell us we crossed the limit, not what to do.
  Hardening belongs in Plan F.

Source of truth: this section + the Plan C runbook §7.

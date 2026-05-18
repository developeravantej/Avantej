# Plan C — Payment Integrity Operations Runbook

How to operate, debug, and triage the payment-integrity layer. Companion
to `plan-b-payments.md` (which covers the transactional path).

---

## 1. Mental Model

Plan C is the **operational integrity layer** on top of Plan B's
transactional flow. Three new responsibilities:

| Concern | Mechanism | Source |
|---------|-----------|--------|
| Webhook events we missed | Hourly backfill cron (C.1) | `stripe.events.list` |
| Customer chargebacks | Webhook handler + queue + email (C.2) | `charge.dispute.*` |
| Stripe-vs-DB drift | Nightly reconciler (C.5) | `stripe.charges/refunds/applicationFees.list` |
| Avantej revenue audit | Real-time ledger writes (C.7) | webhook handlers |
| Stuck tenant onboardings | Daily alert email (C.6) | `org_country_stripe_accounts` |
| Cross-tenant visibility | Platform admin UI (C.4) | All the above tables |

Mental shortcut: **Plan B = how money moves. Plan C = how we audit the money moved.**

---

## 2. Crons (CF Workers Triggers per ADR-0021)

Declared in `apps/server/wrangler.jsonc`:

```
0 * * * *    — C.1 webhook backfill          → runWebhookBackfill()
30 2 * * *   — C.5 nightly reconciliation    → runReconciliation()
0 9 * * *    — C.6 onboarding-stuck alerts   → runOnboardingAlerts()
```

Dispatched from the `scheduled` export in `apps/server/src/index.ts`.

**Local dev:** trigger a cron manually:
```bash
cd apps/server
wrangler dev --test-scheduled
# Then curl http://localhost:8787/__scheduled?cron=*+*+*+*+*
# (substitute the actual cron expression URL-encoded)
```

**Manual trigger via admin UI:** /dashboard/platform-admin/payments → header
buttons "Run backfill" / "Run reconciliation". Both call the same service
functions as the cron (super_admin only).

---

## 3. Schemas

All control-panel. See `docs/plans/plan-c-payment-integrity.md` for the full
DDL.

| Table | Phase | Purpose |
|-------|-------|---------|
| `platform_payment_ledger` | C.7 | Audit mirror, idempotent on `stripe_event_id` |
| `platform_dispute_queue` | C.2 | Open + closed disputes, UPSERT on `dispute_id` |
| `reconciliation_runs` | C.5 | One row per reconciler invocation |
| `payment_drift_log` | C.5 | One row per detected drift, FK → run |
| `reconciliation_state` | C.5 | Checkpoint per (org, country, resource_type) |

---

## 4. Common Operations

### Force-run reconciliation now

UI: `/dashboard/platform-admin/payments` → "Run reconciliation" header button (super_admin only).

Programmatic: invoke `client.platformAdminPayments.runReconciliationNow({})` from any super_admin session.

Behavior: synchronous (admin waits). Toast on completion shows `driftFound` + `criticalCount`. New drift rows visible in the Drift tab immediately.

### Force-run webhook backfill

Same UI + proc, button "Run backfill". `replayed` count in the toast tells you how many missed events were caught.

### Triage a critical-drift row

1. UI Drift tab → filter severity="critical", resolved="unresolved".
2. Click into the row to see `stripeValue` vs `dbValue` JSON.
3. Investigate root cause (was it a missed webhook? Bug in handler? Stripe-side adjustment?).
4. Make the DB match Stripe (or vice versa — but Stripe is source of truth per ADR-0011).
5. Click "Mark resolved" — stamps `resolved_at` + `resolved_by`.

### Triage a dispute

1. UI Disputes tab. Watch the deadline column — sorted ascending by deadline by default (TODO if not in v1).
2. Click "Stripe" link → opens the dispute in tenant's connected-acct Dashboard.
3. Tenant submits evidence (or chooses not to — they own the response per ADR-0001).
4. After Stripe rules: webhook fires `charge.dispute.closed` → status updates automatically.
5. Click "Mark handled" once Avantej ops considers it closed-out.

### Investigate a stuck onboarding

UI Stuck Onboardings tab. Row shows:
- Org slug + name
- Country
- Acct id (deep-linkable to Stripe Dashboard)
- Whether tenant submitted details
- Days since last update

Avantej ops should reach out to the tenant manually (out-of-band — call, email, in-app message).

---

## 5. Debugging Recipes

### "Drift count keeps growing every night"

Likely causes:
- **Bug in a webhook handler** — a specific event type or metadata shape isn't being persisted. Check the wrangler logs for handler errors during the same time window.
- **Stripe API changes** — a field rename or removal landed in a new API version we adopted. Check Stripe changelog.
- **A specific tenant is stuck in onboarding** — pi.succeeded events fire on their acct but our acct lookup fails. Should also show in Stuck Onboardings.

Investigation path:
1. Filter drift_log to severity="critical", recent N days.
2. Group by `resource_type` → tells you which resource lane is failing.
3. Group by `organization_id` → tells you if it's one tenant or all.
4. Pick a single drift row, copy `resource_id`, look up the event in Stripe Dashboard → reconcile manually + understand what was different.

### "Backfill cron replays the same events every hour"

Likely cause: ledger writes are failing silently (e.g. DB constraint violation, schema drift). The `processed_webhook_events` dedupe table isn't being populated for those events because the handler is throwing before `markEventProcessed`.

Investigation:
1. Pick a recently-replayed event id from the cron log.
2. Query `SELECT * FROM processed_webhook_events WHERE event_id = '...'` — if empty, the original webhook never claimed it (probably 500'd before claim).
3. Query `SELECT * FROM platform_payment_ledger WHERE stripe_event_id = '...'` — if also empty, the ledger write itself failed.
4. Check wrangler logs for the original webhook receipt.

### "Reconciler ran but found zero drift even though I know we have drift"

Likely cause:
- **Checkpoint advanced past the drift window.** Check `reconciliation_state` for the (org, country, resource_type) you're inspecting — if `last_reconciled_at` is after the drift's `created` time, the reconciler skipped it.
- **Resource is in a status the reconciler skips** (e.g. `charge.status="pending"` — only `succeeded` is reconciled).
- **Lookback exceeded the 24h+buffer window** — drift older than that won't be detected by the next nightly run unless you manually reset the checkpoint.

Manual reset:
```sql
UPDATE reconciliation_state
SET last_reconciled_at = '<EARLIER_DATE>'
WHERE organization_id = '<UUID>' AND country_code = '<CC>' AND resource_type = '<charge|refund|application_fee>';
```

Then run reconciliation again.

### "Tenant didn't get the dispute email"

Check in order:
1. `platform_dispute_queue` has the row → confirms webhook handler ran.
2. `organizations.owner_user_id` set → confirms owner is known.
3. `auth.user.email` set for the owner → confirms there's a recipient.
4. Resend logs (their dashboard) → confirms delivery attempt.
5. Tenant in-app notifications row exists → fallback channel worked.

If `platform_dispute_queue` is empty but Stripe shows the dispute, the
webhook didn't fire (or our handler errored before the queue write). Check:
- Stripe CLI listener was running at the time.
- `processed_webhook_events` for the event id → if missing, signature
  failure (rare) or claim insert failed.

---

## 6. Per-Phase Reference

| Phase | Commit | What |
|-------|--------|------|
| C.7 + C.2 + foundation | `907bc34` | platform_payment_ledger writes + dispute service + new tables (migration 0021) |
| C.1 + C.6 + crons | `493f010` | webhook backfill + onboarding alerts + scheduled handler dispatch |
| C.5 | `3c00390` | nightly reconciler + paymentDriftLog writes |
| C.4 | `f27c023` | platform admin UI + 8 oRPC procs |
| ADRs + this runbook | (current) | 0018-0021 |

All on branch `payment-integrity`, base `payment-backend@300c663`.

---

## 7. Open Items (post-Plan-C)

Carried forward to a future plan:

- **C.3 — Tenant-facing payout dashboard** (currently descoped). Admin-side
  payout visibility lives in the C.4 per-tenant drill-in once C.3 schema
  lands.
- **Stripe Subscriptions on Connect for memberships** (replaces
  chargeSavedCard for recurring revenue).
- **In-app dispute response UX** (currently Stripe Dashboard).
- **Auto-fix tier for safe drift kinds** (Plan C v2 candidate).
- **Slack alerts** for critical drift + opened disputes (currently email only).
- **Sales orders payment_status sync from connect webhook** — Plan B
  carry-over.

Source of truth for all open items: `docs/runbook/plan-b-payments.md` § 7 +
this section.

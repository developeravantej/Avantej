# Plan C — Payment Integrity

**Status:** Scoped, not yet implemented
**Branch (when started):** `payment-integrity` (from `payment-backend` tip)
**Estimated effort:** ~37h focused work (~1 week)
**Author:** Scoped 2026-05-15 via /grill-me session

## What Plan C is

The **operational integrity layer** for Plan B. Plan B shipped the transactional
path (charge → refund → cascade); Plan C ships the audit / recovery / oversight
path that makes Plan B production-safe at multi-tenant scale.

## Why now

Three concrete operational risks today:

1. **Webhook drift.** Cloudflare / wrangler downtime past Stripe's 3-day retry
   ceiling = events lost forever. Money sits "received" on Stripe but
   `appointments.payment_status='pending'` in our DB silently.

2. **Disputes (chargebacks).** `charge.dispute.created` fires but our webhook
   handler no-ops it. Tenant gets no notification, misses Stripe's ~7-day
   evidence deadline, loses the money + the customer relationship.

3. **Platform-admin blindness.** Avantej has no UI to see across tenants —
   who's stuck onboarding, who has open disputes, application fee totals,
   payout failures, fraudulent signups.

Without Plan C, Plan B is statistically reliable but not auditable.

## Primary persona

**Platform-ops-first** (Avantej as SaaS operator). Tenant-facing payout dashboard
and dispute response UX are deferred to Plan D.

## Locked design decisions

Captured via /grill-me on 2026-05-15. Detailed rationale in ADRs (to be authored
during implementation).

| Decision | Choice |
|----------|--------|
| Primary user | Platform-ops |
| Scheduled-job infrastructure | Cloudflare Workers Cron Triggers + `scheduled` handler dispatching to oRPC procs |
| Reconciliation scope | Payments + refunds + payouts + application_fees (4 resource types) |
| Drift remediation | Alert-only (no auto-fix in v1). Manual fix via admin UI "Force sync" |
| Reconciliation lookback | Checkpointed (`last_reconciled_at` per resource_type) + 24h buffer |
| Drift severity | Tiered (info / warn / critical) on a `severity` column |
| Webhook backfill cadence | Hourly, 24h lookback, `stripe.events.list` per acct, replay via existing handler |
| Dispute notification | Triple: tenant email (Resend) + tenant notifications row + platform_dispute_queue row |
| Onboarding-stuck threshold | `chargesEnabled=false` AND age > 7d, daily alert email |
| Application-fee ledger | Wire writes from existing schema (`platform_payment_ledger`) — table already exists but un-written |
| Admin UI scope | `/dashboard/platform-admin/payments` w/ 4 tabs (Overview / Drift / Disputes / Per-tenant) |
| Tenant-facing payout dashboard | DEFERRED to Plan D |

## Phase breakdown

Phases marked with explicit dependencies. Independent phases (C.1/C.2/C.6) can
parallelize after C.7 lands.

| # | Phase | What | Est | Deps |
|---|-------|------|-----|------|
| C.7 | Application-fee ledger writes | Wire `platform_payment_ledger` writes from connect + platform webhook handlers. Event kinds: `pi_succeeded`, `pi_refunded`, `saas_invoice_paid`, `application_fee_collected`. Idempotent on `stripe_event_id` UNIQUE. ADR-0018. | 5h | none — table exists schema-side |
| C.1 | Webhook backfill cron | Wrangler `scheduled` handler. Hourly. Per connected acct, `stripe.events.list({ types, created>=now-24h, stripe_account })`. For each event not in `processed_webhook_events`, dispatch through existing webhook handler so all side effects fire. ADR-0021. | 4h | C.7 (ledger as part of side effects) |
| C.2 | Dispute handler | Handle 5 events: `charge.dispute.created/updated/closed/funds_reinstated/funds_withdrawn`. New table `platform_dispute_queue`. Triple notification (email + tenant notifications row + platform queue row). ADR-0020. | 5h | none |
| C.6 | Onboarding-stuck alert | Daily 09:00 UTC cron. Query `org_country_stripe_accounts` rows where `chargesEnabled=false AND connect_account_updated_at < now - 7d`. Email super_admin platform admins with list + deeplink to per-tenant admin UI. | 3h | C.4 link target (loose — can ship without) |
| C.5 | Nightly reconciler | `stripe.charges.list` + `refunds.list` + `payouts.list` + `applicationFees.list` per acct since checkpoint - 24h. Cross-check vs DB. Write to `payment_drift_log` w/ severity. Tracks per-(org, country, resource) `last_reconciled_at`. No auto-fix. ADR-0019. | 10h | C.7 (ledger is fee source-of-truth) |
| C.4 | Platform admin UI | `/dashboard/platform-admin/payments` route, 4 tabs: Overview (KPI cards), Drift log (filterable table), Disputes (queue w/ deadlines), Per-tenant drill-in. Read-only + "Force sync" + "Mark dispute handled" actions. requirePlatformAdmin RBAC. | 10h | C.7 + C.1 + C.2 + C.5 (needs the data) |
| C.3 | Tenant-facing payout dashboard | **DEFERRED to Plan D.** Plan C ships only admin-side payout visibility via the per-tenant drill-in. | — | — |

## New schemas (control-panel)

```sql
-- C.2
CREATE TABLE platform_dispute_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL,
  dispute_id text NOT NULL UNIQUE,
  status text NOT NULL,           -- warning_needs_response | needs_response | under_review | won | lost | charge_refunded
  amount integer NOT NULL,
  currency text NOT NULL,
  reason text,                    -- fraudulent | duplicate | etc.
  deadline_at timestamp,          -- Stripe evidence deadline
  handled_at timestamp,
  handled_by text,                -- platform admin user id
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX dispute_queue_org_idx ON platform_dispute_queue (organization_id);
CREATE INDEX dispute_queue_status_idx ON platform_dispute_queue (status);
CREATE INDEX dispute_queue_deadline_idx ON platform_dispute_queue (deadline_at);

-- C.5
CREATE TABLE reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_started_at timestamp NOT NULL,
  run_completed_at timestamp,
  status text NOT NULL,           -- running | completed | failed
  drift_count integer DEFAULT 0,
  error text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE payment_drift_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  stripe_account_id text,
  resource_type text NOT NULL,    -- charge | refund | payout | application_fee
  resource_id text NOT NULL,      -- ch_/re_/po_/fee_ id
  severity text NOT NULL,         -- info | warn | critical
  drift_kind text NOT NULL,       -- missing_in_db | status_mismatch | amount_mismatch | etc.
  stripe_value jsonb,
  db_value jsonb,
  detected_at timestamp DEFAULT now(),
  resolved_at timestamp,
  resolved_by text                -- platform admin user id
);
CREATE INDEX drift_run_idx ON payment_drift_log (run_id);
CREATE INDEX drift_org_idx ON payment_drift_log (organization_id);
CREATE INDEX drift_severity_idx ON payment_drift_log (severity);
CREATE INDEX drift_unresolved_idx ON payment_drift_log (severity) WHERE resolved_at IS NULL;

CREATE TABLE reconciliation_state (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  resource_type text NOT NULL,
  last_reconciled_at timestamp NOT NULL,
  PRIMARY KEY (organization_id, country_code, resource_type)
);
```

`platform_payment_ledger` already exists from Plan A — only needs writes wired (C.7).

## ADRs to author during implementation

- **ADR-0018 — Platform payment ledger as audit mirror.** Writes from connect + platform webhooks, idempotent on `stripe_event_id`, source-of-truth remains Stripe (per ADR-0011). Event-kind taxonomy covers Layer 1 SaaS + Layer 2 Connect.
- **ADR-0019 — Reconciliation policy.** Alert-only in v1 (no auto-fix), checkpoint + 24h buffer, severity-tiered drift log, 4 resource types reconciled, nightly cadence with manual rerun via admin UI.
- **ADR-0020 — Dispute handling workflow.** Triple-notification (tenant email + tenant notifications row + platform queue row), deadline tracking from Stripe `evidence_due_by`, response submission stays in Stripe Dashboard (manual) for v1.
- **ADR-0021 — CF Cron Triggers as scheduled-job infrastructure.** Over external cron (auth + sync risk), DO alarms (overkill for platform-scoped jobs). `scheduled` handler dispatches to oRPC procs so cron path = admin-UI-button path.

## Wrangler config change

```jsonc
// apps/server/wrangler.jsonc
"triggers": {
  "crons": [
    "0 * * * *",      // C.1 hourly webhook backfill
    "30 2 * * *",     // C.5 daily reconciliation at 02:30 UTC
    "0 9 * * *"       // C.6 daily onboarding-stuck alert at 09:00 UTC
  ]
}
```

## Recommended commit sequence

1. `feat(plan-c): add schemas + migrations for drift_log, dispute_queue, reconciliation_state, reconciliation_runs`
2. `feat(plan-c): wire platform_payment_ledger writes from webhooks (C.7 + ADR-0018)`
3. `feat(plan-c): webhook backfill cron via scheduled handler (C.1 + ADR-0021)`
4. `feat(plan-c): dispute webhook handlers + platform_dispute_queue + notifications (C.2 + ADR-0020)`
5. `feat(plan-c): onboarding-stuck daily alert (C.6)`
6. `feat(plan-c): nightly reconciler — payments / refunds / payouts / fees (C.5 + ADR-0019)`
7. `feat(plan-c): /dashboard/platform-admin/payments UI w/ 4 tabs + force-sync actions (C.4)`
8. `docs(plan-c): runbook update — ops playbooks for drift response + dispute triage`
9. `test(plan-c): unit tests for reconciler diff functions + dispute deadline math`

## What's NOT in Plan C

Explicitly deferred to **Plan D** or beyond:

- Tenant-facing payout dashboard (admin-side stays in Plan C)
- Customer self-service portal (receipts, refund requests, card update)
- Stripe Subscriptions on Connect for membership renewals
- Pre-authorize / hold on booking
- SCA / 3DS challenge UI for off-session charges
- Multi-method card storage
- Partial refunds
- Gift cards / store credit
- Tipping at checkout
- Commission ledger entries on payment success (cross-table policy, separate ADR)
- `sales_orders.payment_status` sync (POS-orthogonal)
- SMS receipts (infra pick first)
- `purchasePackage` country-aware migration (Phase 4.4 TODO carried over)
- Per-country fee policy

## Open items deferred from Plan B

These don't block Plan C kickoff but should be considered when scoping Plan D:

| Item | Where it lives |
|------|----------------|
| `docs/runbook/plan-b-payments.md` § 7 | Full Plan B backlog |
| Phase 4.4 TODO in `purchasePackage` | Branch-country derivation from service_prices |
| ADR-0016 SCA punt | requires_action handling in chargeSavedCard |
| ADR-0015 Payment Link "regenerate orphans the old link" | Already mitigated by idempotency (Phase 4.6); only Stripe-side cleanup remains |

## When to start

Plan C is a pre-launch hardening project. Recommend starting when:
- Plan B is merged to `main` OR
- A real tenant is onboarding (which surfaces real disputes / drift)

Until then, Plan C is scoped and ready to pick up.

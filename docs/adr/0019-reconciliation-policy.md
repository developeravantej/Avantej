# ADR 0019 — Reconciliation Policy

Date: 2026-05-16
Status: Accepted

## Context

Plan B + Plan C webhooks land in our DB in real time. But Stripe is the system
of record (ADR-0011). Drift between Stripe and our DB will happen — webhook
gaps, race conditions, application bugs, schema migrations applied mid-flight.
Without a reconciliation policy, drift compounds silently until a tenant calls
support about a missing payout.

The C.5 nightly reconciler addresses this. The question is **how**.

Design decisions to lock:

1. **Which resources to reconcile?**
   - Payments only (cheapest, narrowest)
   - Payments + refunds
   - Payments + refunds + payouts + application_fees (full audit)
   - Everything Stripe knows (full event replay)

2. **What to do when drift is found?**
   - Auto-fix (bold, risky if the reconciler has bugs)
   - Alert-only (manual remediation)
   - Tiered (some safe auto-fixes, alert for the rest)

3. **Lookback window?**
   - Fixed (24h, 7d)
   - Checkpoint + buffer (resumes from last successful run)
   - Configurable per resource type

4. **Drift severity?**
   - Flat (all drift treated equal)
   - Tiered (info / warn / critical)

## Decision

1. **Resources reconciled:** Payments (`stripe.charges.list`) + Refunds
   (`stripe.refunds.list`) + Application fees (`stripe.applicationFees.list`).
   Payouts deferred to a follow-up phase (no `payouts` DB table exists yet —
   Plan C.3 was descoped to Plan D).

2. **Drift policy:** **Alert-only in v1.** No auto-fix. Drift rows are
   inserted into `payment_drift_log` with severity, surfaced in the
   platform-admin UI (C.4), and manually resolved via "Mark resolved" + manual
   data correction. Tiered auto-fix may land in a future Plan C v2 once we've
   observed real drift patterns for a few weeks.

   Rationale: a reconciler bug that auto-fixes is silent corruption at scale.
   Manual remediation is slow but safe. The C.4 UI makes manual review fast.

3. **Lookback:** Checkpoint + 24h buffer. A per-(org, country, resource_type)
   row in `reconciliation_state` stores `last_reconciled_at`. Each run scans
   from `last_reconciled_at - 24h`. First run with no checkpoint: 24h fixed
   lookback. After a successful pass, advance the checkpoint.

   Rationale: pure fixed-window misses drift that persisted past the window
   (e.g. 48h outage). Checkpoint guarantees never-miss. Buffer absorbs
   Stripe's eventual-consistency on resource listings.

4. **Severity:** Tiered (`info` / `warn` / `critical`) on a column. UI sorts
   by severity. Initial rules:
   - `missing_in_db` + age < 10min     → `info`  (webhook in flight; will resolve)
   - `missing_in_db` + age >= 10min    → `critical` (revenue gap)
   - `amount_mismatch`                  → `critical`
   - `currency_mismatch`                → `critical`
   - Non-succeeded Stripe charges/refunds → SKIPPED (we only ledger succeeded events)

## Consequences

Positive:
- Drift is observable. Avantej ops can see "we lost a charge for org X" in
  the admin UI within 24h.
- The reconciler is fail-safe by design — it can't make data worse, only
  worse-by-omission (a missed drift detection).
- Checkpoint keeps successive runs O(N) over recent activity, not O(N) over
  all history.

Negative:
- Manual remediation has latency. Critical drift sits until a human sees it.
  Mitigation: C.6 alerts + C.4 KPI cards in the admin UI Overview.
- Reconciler must be idempotent. Running twice on the same window should
  detect the same drift the same way (it does — `payment_drift_log` rows are
  identified by `run_id` so the same drift across two runs creates two rows,
  but admins can filter to unresolved).
- Application fee reconciliation is `O(all platform fees, client-side
  filter by acct)` — acceptable while volumes are low (<1000 fees/day);
  needs a different approach (Stripe `application_fees.list?charge=...` per
  charge) at higher volumes.

## Alternatives considered

- **Auto-fix for "safe" drift kinds** (e.g. `paid_at` timestamp off by webhook
  delay). Rejected for v1 — defining "safe" is the trap, and the cost of
  manual review is small compared to the risk of a buggy auto-fix.
- **Hourly reconciliation** instead of nightly. Rejected because Stripe API
  rate limits and our scale make nightly fine; the C.1 hourly webhook backfill
  closes the recovery gap for events.
- **Replay via `stripe.events.list`** as the reconciliation strategy. Rejected
  because it's effectively what C.1 already does. Reconciliation is a
  *resource-state* check (what does Stripe say a charge looks like NOW?), not
  an *event-log* replay (what events have fired?). The two are complementary.

## Related

- ADR-0011 — Reconciliation strategy (Stripe is source of truth).
- ADR-0018 — platform_payment_ledger as audit mirror (the diff target).
- ADR-0021 — CF Cron infrastructure (delivery mechanism).

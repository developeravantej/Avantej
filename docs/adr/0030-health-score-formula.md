# ADR 0030 — Tenant Health-Score Formula

Date: 2026-05-17
Status: Accepted

## Context

Plan F.1.5 surfaces "who should I call?" for Avantej platform ops:
mission-control home highlights at-risk tenants; tenant drill-in shows
a Risk tab with current score + active flags. Both read from a single
`health_score` integer (0-100) + `risk_flags jsonb` on
`tenant_usage_snapshots` that the existing daily cron writes.

We needed a formula that is:

- **Cheap to compute** — fits in the existing snapshot cron without
  measurable latency cost (snapshots fire once daily per tenant).
- **Stable** — small day-to-day input changes shouldn't oscillate the
  score wildly.
- **Interpretable** — ops should glance at the chips and know why a
  tenant is amber/red, not need to dig into a black-box ML output.
- **Pragmatic on data** — we don't yet have every input we'd ideally
  want (e.g. `last_admin_login_at`, `failed_webhooks_7d`); the formula
  must gracefully skip missing inputs instead of failing.

## Decision

**5-factor weighted composite, 0-100 scale, no backfill.**

| Factor | Weight | Input | Healthy if |
|---|---|---|---|
| Subscription status | 25 | `organizations.payment_status` | `active` or `trialing` |
| Payment recency | 20 | `last_successful_payment_at` (days ago) | < 35 days |
| Activity | 20 | `daily_active_members_30d_avg / member_count` | ratio ≥ 0.4 |
| Login recency | 15 | `last_admin_login_at` (days ago) | < 14 days |
| Webhook reliability | 20 | `failed_webhooks_7d` count | == 0 |

Per-factor scoring:

- **Subscription:** active/trialing = full points, past_due = half,
  unpaid = quarter, cancelled = 0.
- **Payment recency:** linear decay; 0 days = full, 35 days = 0; > 35 = 0.
- **Activity:** linear; ratio ≥ 0.4 = full, 0 = 0.
- **Login recency:** linear; 0 days = full, 14 days = 0; > 14 = 0.
- **Webhook reliability:** 0 failures = full, 1-2 = half, 3+ = 0.

Composite: `round(sum of weighted contributions)`, clamped to [0, 100].

### Risk flags emitted

Flags are an audit trail of *why* the score is what it is — ops reads
the flag chips on the Risk tab. Codes + default severities:

| Code | Severity | Condition |
|---|---|---|
| `subscription_cancelled` | critical | `payment_status = 'cancelled'` |
| `subscription_past_due` | warn | `payment_status` in `(past_due, unpaid)` |
| `payment_stale` | warn | `last_successful_payment_at > 35 days ago` |
| `low_activity` | warn | active/member ratio < 0.2 |
| `inactive_admin` | info | `last_admin_login_at > 14 days ago` |
| `webhook_failures` | warn (1-2) / critical (3+) | `failed_webhooks_7d > 0` |
| `no_data` | info | any required input is null (one per missing factor) |

### Backfill: NONE

Historical `tenant_usage_snapshots` rows stay NULL for `health_score`
and `risk_flags`. The cron writes enriched rows forward. Within 30
days, every tenant has a trend curve.

Rationale: backfill would either (a) require re-fetching historical
inputs (most of which we don't archive) or (b) compute synthetic scores
from current state, which would lie about history.

### Inputs available at F.1.5 ship

- Used live: `payment_status` (on `organizations`),
  `last_successful_payment_at` (joined from `platform_payment_ledger`).
- Emits `no_data` flag (factor skipped, weight effectively zero): the
  other three factors. Their snapshot columns don't exist yet.

Once the snapshot service grows the other columns (separate work item),
the formula automatically picks them up — the pure function in
`packages/services/src/health-score.ts` reads what's in the
`HealthScoreInput` interface and emits `no_data` only when an input is
null. No re-deploy or formula change needed.

## Why this shape

### Why a weighted-sum, not a multiplicative or ML model?

- **Auditability.** "Score is 38 because subscription is past_due (-12)
  and webhook failures are critical (-20)" is something ops can act on.
  A neural net's "0.38" is not.
- **Stability.** Weighted sum is monotonic per factor — fixing one
  thing always improves the score by a predictable amount.
- **Cheap to compute.** The whole thing runs in microseconds inside the
  existing cron. No model inference, no external service call.

### Why 5 factors with these weights?

The weights were chosen to match operational reality:

- Subscription (25) — the single biggest "is this tenant going to
  churn" signal. Above the other factors because a cancelled sub means
  the tenant *has* churned.
- Webhooks (20) — webhook failures correlate strongly with integration
  rot. Often the first sign a tenant has stopped using us.
- Payment recency (20) — payment skipping is usually upstream of churn
  by 30-60 days.
- Activity (20) — measures actual product usage; low ratio means the
  seat count is overstated.
- Login recency (15) — softer signal. Lots of healthy tenants don't
  log in often; weight is smaller to reflect higher false-positive
  rate.

Sum is 100 by design — the score IS the weighted percentage.

### Why this severity ladder?

- `info` — surfaces in UI, no action expected.
- `warn` — ops should investigate; appears as amber chips and counts
  toward `criticalFlagCount` for sort order only at the threshold.
- `critical` — ops should reach out same-day. Appears as red chips and
  drives the mission-control "top at-risk" widget ordering.

## Consequences

- New columns on `tenant_usage_snapshots` (additive ALTER, no DROP).
- The pure function lives in `packages/services/src/health-score.ts`
  so the cron, the read procs, and the unit tests share one
  implementation.
- 13 unit tests cover the formula at boundaries (healthy, cancelled,
  past-due, stale-payment, all-zero, missing-input).
- Risk tab and mission-control home both consume the same
  `platformAdminTenants.health` read procs — no second source of truth
  for "health".
- When the snapshot service gains the missing columns
  (`last_admin_login_at`, `failed_webhooks_7d`,
  `daily_active_members_30d_avg`), the existing formula picks them up.
  No ADR amendment needed; treat that as schema evolution.

## Alternatives considered

- **Multiplicative composite (score = product of factors).** Rejected:
  too sensitive (any factor at 0 → score 0 even if the rest is fine);
  hard to communicate.
- **ML / learned model.** Rejected for F.1.5: no labeled churn data,
  ops needs interpretable output, and the cost of operating an ML
  pipeline isn't justified at our tenant count. Revisit when we have a
  meaningful churn corpus.
- **Per-tenant custom weights.** Rejected: a global formula matches
  Avantej's single persona (platform ops). Custom weights add config
  complexity without operational payoff.
- **Hourly recompute.** Rejected: snapshots fire daily; the inputs
  don't move fast enough to justify higher frequency, and it'd 24×
  the compute for marginal gain.

## Open follow-ups

- Add `last_admin_login_at`, `failed_webhooks_7d`,
  `daily_active_members_30d_avg` to `tenant_usage_snapshots`. Until
  then those three factors emit `no_data` and don't influence the
  composite.
- Calibration: after 30 days of data, audit scores against actual
  churn outcomes. If false-positive rate is high, retune weights via
  an ADR amendment (not a code-only change).

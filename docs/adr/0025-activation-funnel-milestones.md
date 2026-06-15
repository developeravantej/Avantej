# ADR 0025 — Activation Funnel Milestone Definitions

Date: 2026-05-16
Status: Accepted

## Context

Plan E E.4 ships the activation funnel — a per-tenant checklist that
tells Avantej ops *where each new tenant is stuck before they reach
revenue*. Without this view, ops doesn't know whether to ping a tenant
about email verification or about Stripe onboarding, and a tenant
silently churning at "first customer" is indistinguishable from one
that just hasn't bought anything yet.

Choosing milestones requires balancing:

- **Coverage** — every step from "signed up" to "money landed" should
  be represented, with no large gap where a tenant can get stuck
  unobserved.
- **Cheap to compute** — the funnel runs on demand from the drill-in
  UI; cross-DB queries should be single roundtrip each and avoid
  expensive joins.
- **No new persistence** — milestone state is derived from existing
  tables (per the plan doc). Adding a `tenant_milestones` table would
  cost both a migration and a write path for every business event,
  which we don't need until cross-tenant aggregates become important.
- **Source proxies, not events** — we don't have an event-log table, so
  each milestone uses "row exists" / "boolean column true" as a proxy
  for the underlying business event. Imperfect, but the proxies are
  monotonic (once true, stays true), which is what we need.

## Decision

The funnel has **seven milestones**, in this order:

| # | Milestone | Definition | Source | Why this proxy |
|---|-----------|-----------|--------|----------------|
| 1 | `email_verified` | `user.email_verified = true` for `organizations.owner_user_id` | control-panel `auth.user` | Better-Auth gate; nothing happens until owner verifies |
| 2 | `hierarchy_seeded` | at least one row in tenant `hierarchy_nodes` | tenant DB | RBAC + branch scope needs hierarchy; first thing the onboarding wizard does |
| 3 | `first_member` | at least one row in tenant `members` | tenant DB | tenant has invited *someone* to their workspace |
| 4 | `first_customer` | at least one row in tenant `customer_profiles` | tenant DB | tenant has captured a real customer (vs. fake "test" data) |
| 5 | `ghl_connected` | `organizations.ghl_provisioned_at IS NOT NULL` | control panel | optional but high-signal step; tenant has wired their CRM integration |
| 6 | `first_appointment` | at least one row in tenant `appointments` | tenant DB | tenant is actually operating — scheduling work |
| 7 | `first_payment` | at least one row in tenant `payments` where `status='succeeded'` | tenant DB | revenue has landed — Stripe-confirmed, not just attempted |

Each milestone's `reachedAt` timestamp is `MIN(created_at)` of the
qualifying row (or `joined_at` for `members`), so the funnel also tells
us when a step was hit.

The first unreached milestone is reported as `stuckAt`. The UI
highlights it as "next step" and color-codes the rest.

### Why this ordering

The ordering is the **logical operational sequence**, not "what got
written first." `first_payment` could land before `first_appointment`
(walk-in cash sale), but we still surface `first_appointment` as
"reached" using its actual timestamp. The ordering matters only for
`stuckAt` — for a tenant who has `first_payment` but not
`first_appointment`, `stuckAt` will still be `first_appointment` (an
unusual but legitimate state to surface).

### What's not a milestone

Considered and rejected:

- **Stripe Connect onboarding completed** — already surfaced via the
  C.4 Stuck Onboardings tab; doesn't need a second home.
- **Subscription paid** — duplicates `first_payment` for SaaS revenue
  signal; payments table captures both SaaS and customer payments.
- **First refund / first dispute** — operational events, not activation.
- **Logged in within 7 days** — would need a `last_login_at` we don't
  reliably track. Better-Auth has session rows but no monotonic last-
  login column we can grep cheaply.

## Consequences

Positive:

- Funnel is a single drill-in tab with seven on-demand queries. Latency
  is bounded by the slowest of 5 parallel tenant-DB count queries (~50-
  150ms typical).
- No new schema. No write path. The funnel cannot drift from reality —
  it is the reality, derived at read time.
- `reachedAt` gives ops a "this tenant has been stuck at X for N days"
  signal without extra storage.
- Milestone ordering is fixed in code — every tenant's funnel uses the
  same definition, so ops can compare across tenants without per-
  tenant variation.

Negative:

- **Row-exists proxies are coarse.** A tenant who *deletes* their only
  customer would still register `first_customer = reached` because we
  use `MIN(created_at)`. Reasonable: the activation moment was real
  even if the data was deleted. We're not measuring current state, we
  are measuring whether the step was ever crossed.
- **No event log.** When we eventually need cross-tenant aggregates
  ("75% of tenants reach first_payment within 30 days"), the on-
  demand fan-out won't scale. Solution then: cache the funnel snapshot
  daily alongside `tenant_usage_snapshots`. Not needed yet for the
  drill-in view.
- **email_verified timestamp is approximate.** Better-Auth doesn't
  expose a verified-at column, so we use `user.created_at` as a proxy
  when verified. Off by minutes-to-days in pathological cases.
  Acceptable for the funnel.

## Alternatives considered

- **Event-sourced milestones (a `tenant_events` append-only log).**
  Rejected — adds a new persistence surface coupled to every business
  write, for a view that only the platform-admin UI consumes. The
  proxy-from-existing-tables approach is sufficient for v1.
- **Compute funnel during the daily usage snapshot.** Tempting (would
  enable cross-tenant aggregates), but doubles the work the cron does
  and adds a column-bloat risk. Defer until aggregate view is needed.
- **Different milestone count (5 vs 9).** 5 felt under-specified (no
  visibility into the gap between "tenant exists" and "tenant has
  members"). 9 felt over-specified (no operational difference between
  9 and 7 for ops). Seven is the natural sequence the onboarding flow
  actually produces.

## Related

- ADR-0023 — Usage snapshots (the future home of cached funnel
  aggregates).
- Plan E E.7 — Provisioning wizard. When E.7 lands, milestones 1-2 are
  hit during the wizard itself; the funnel becomes a 5-step "after
  signup" view in practice.

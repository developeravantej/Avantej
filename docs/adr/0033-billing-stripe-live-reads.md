# ADR 0033 — Billing Reads: Stripe Live (vs. Local Ledger Mirror)

Date: 2026-05-17
Status: Accepted

## Context

Plan F.3 surfaces billing details for platform ops: invoice history,
refunds, payment methods, customer balance. Plan F doc tentatively
proposed a `tenant_billing_events` mirror table (optional — "can use
Stripe API live").

This ADR locks the **live-reads** choice for F.3-A (invoices +
refunds) and explains when the mirror table is the right next step.

## Decision

**F.3-A reads billing data live from Stripe.** No
`tenant_billing_events` mirror table for this slice.

- `listInvoices` → `stripe.invoices.list({ customer: <stripeCustomerId> })`
- `getInvoice` → `stripe.invoices.retrieve(id)`
- `getCustomerSummary` → `stripe.customers.retrieve(id)`
- `refundInvoice` → `stripe.refunds.create({ payment_intent })` then audit-row

No local caching. No mirror table. No background sync job.

## Why live, not mirror

### Source of truth
Stripe IS the billing source of truth. Mirroring it locally creates
two-source-of-truth problems:
- Stripe processes a refund webhook 3s after we wrote our mirror row →
  short-window divergence.
- Ops issues a manual refund in Stripe Dashboard → our mirror doesn't
  know until the next sync.
- Stripe charge dispute changes invoice status → mirror misses it.

Reading live means ops always sees what Stripe actually thinks.

### Latency is fine for ops cadence
- `invoices.list({ limit: 20 })` is one Stripe API call, ~200-400ms.
- Ops loading the Billing tab once and clicking through invoices is a
  human-scale cadence — sub-second per click is acceptable.
- This is NOT a tenant-facing surface where 200ms × every page render
  is load-bearing. It's an admin tool used a few times per day per
  ops user.

### Stripe rate limits
- Stripe Live mode allows ~100 read req/sec, Write ~25 req/sec.
- Worst-case usage: 5 ops users × 50 tab opens/day = 250 reads/day.
  Three orders of magnitude under any rate limit.
- If volume ever became an issue, add a TTL cache (e.g. 60s) on the
  read procs before introducing a mirror table.

### Refund mutation pattern
- Single Stripe call (`stripe.refunds.create`) → audit row on success.
- Idempotency: the refund's audit row carries `refundId`; ops can see
  what was issued. Re-clicking the Refund button doesn't double-spend
  because the dialog blocks pending state + the invoice shows
  refunded after refresh.
- ADR-0033 follow-up: add Stripe idempotency keys (`Idempotency-Key`
  header) on the refunds.create call to make double-submits safe.
  Currently relies on UI gating + audit trail.

## When the mirror table becomes worth it

Open a separate ADR + migration when ANY of these become true:

1. **Tenant-facing billing surface** (Plan G+ — tenant self-serve).
   They'll hit a billing page on every dashboard load. Live calls →
   rate limit + slow tenant UX. Mirror with sub-second sync.

2. **Cross-tenant rollup analytics** (e.g. "$ refunded this month
   across all tenants" on the mission-control home, refresh every
   30s). Live calls won't scale; need a local table to aggregate.

3. **Offline / disconnected ops** — if ops needs to inspect billing
   while Stripe API is degraded. Today this isn't a stated
   requirement.

4. **Stripe API cost** — Stripe doesn't charge per API call today
   (within rate limits). If they ever do, mirror becomes economically
   compelled.

## Consequences

- New router `platformAdminTenantsBilling` mounted under
  `platformAdminTenants` namespace (per-tenant, not org-wide).
- Factory pattern with `stripeOverride?: StripeClientLike` DI hook
  (mirrors `subscriptions.ts`) for testability. Tests inject a stub;
  prod uses `getStripeClient()`.
- No new migration. No new schema. No new audit table changes.
- Refunds go through a single mutation proc gated to super_admin
  (NOT support — refunds move real money).
- One audit row per refund attempt that succeeds. Failed Stripe calls
  write no audit row (re-tryable).
- Bun unit test runs the refund path against a fake Stripe object via
  the DI hook — fast (1.16s), deterministic, no real API calls.

## Alternatives considered

- **Mirror table from day 1.** Rejected — see "When the mirror table
  becomes worth it" above. Premature given F.3-A's ops-only audience.
- **Cache reads at the oRPC procedure level with a TTL.** Rejected
  for v1; live is fine. Add later if rate-limit pressure appears.
- **Refund flow goes through Stripe Dashboard, not our app.**
  Rejected: the whole point of F.3-A is to keep ops in-app for the
  common case. Stripe Dashboard remains the escape hatch for edge
  cases (multi-refund, customer credits, etc.).
- **Refunds writable by support role.** Rejected: refunds move
  money. super_admin gate matches Agent T's bulkSuspend rationale
  (ADR-0029).

## Open follow-ups (defer to F.3.5+)

- Idempotency-Key header on refunds.create
- Coupons + tier-change mid-period (F.3.5)
- `/billing` global page — list invoices/refunds across all tenants
  with KPIs. This will likely need a mirror table for cross-tenant
  rollups — revisit then.
- Stripe webhook events that update local invoice state (e.g.,
  charge.refunded fired async). For now the Billing tab refetches on
  refund completion; webhook integration is a nice-to-have.

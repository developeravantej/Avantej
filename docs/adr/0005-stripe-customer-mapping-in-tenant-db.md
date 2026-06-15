# ADR 0005 — Stripe Customer Mapping Lives in Tenant DB

Date: 2026-05-13
Status: Accepted

## Context

Direct charges require a Stripe `Customer` object that lives on the specific connected account being charged. Stripe Customers are not cross-account: a single Avantej user who buys from two Tenants needs two separate Stripe Customer objects, one on each Tenant's connected account.

We must store a mapping between `(avantej user id, organization id) → stripe customer id` to avoid creating a fresh Stripe Customer on every purchase.

## Decision

Store the mapping in a **tenant-DB** table `stripe_customers`:

```
stripe_customers (
  id              uuid pk
  user_id         text   -- references control-panel users.id, no FK (cross-DB)
  stripe_customer_id text unique -- cus_xxx on this tenant's connected account
  email           text   -- denormalized for fallback
  created_at      timestamptz
)
unique index on (user_id)
```

A user has at most one Stripe Customer per Tenant. Lookup at PaymentIntent creation:
1. Query `stripe_customers` by `user_id`.
2. If missing, call `stripe.customers.create(..., {stripeAccount: tenantAcct})` and insert the row.
3. Pass the resulting `stripeCustomerId` to `paymentIntents.create`.

Walk-in customers (`walk_in_customers`) have no Stripe Customer object in v1; PaymentIntents are created without a `customer` parameter. Defer "upgrade walk-in to Stripe Customer" to v2.

## Consequences

Positive:
- Mapping co-located with payments, package_instances, and sales_orders in the same tenant DB — no cross-DB transactions.
- Matches the existing pattern (`partner_stripe_accounts` is also tenant-scoped).
- Cleaner isolation: when a Tenant is deactivated, their Stripe Customer mappings remain in the Tenant's DB and do not pollute the control-panel.

Negative:
- Cross-tenant lookups ("which Tenants is Sarah a Customer of, and what are her Stripe Customer ids?") require fan-out queries across Tenant DBs. Acceptable; not a v1 use case.
- A user deleted from the control-panel leaves an orphan row in tenant DBs. Mitigated by soft-delete on the control-panel side.

## Alternatives considered

- **Control-panel `stripe_customers` table** with `(userId, organizationId)` composite — rejected to avoid coupling cross-DB writes during payment flows.

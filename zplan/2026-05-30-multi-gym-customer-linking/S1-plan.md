# S-1: Multi-Gym Customer Account Linking

## Problem

`user.email` has a **global unique constraint** across all tenants (control-panel DB).
A customer who belongs to two gyms (Gym A + Gym B) has exactly one control-panel
`user` row. Today:

1. Gym A staff create a profile → placeholder user `unclaimed-<uuid>@avantej.placeholder`.
2. Customer claims → email becomes `ahmad@gmail.com`, emailVerified=true.
3. Gym B staff create a profile for the same Ahmad → a SECOND placeholder user.
4. Gym B staff `sendClaimLink` with `ahmad@gmail.com` →
   `collision.id !== existingUser.id` → **`CONFLICT` thrown**, dead end.

At scale (Malaysian SME gyms heavily share a customer base) this is frequent and
forces manual support every time.

## The cardinal constraint

> Multi-tenant isolation is critical: never let tenant A see tenant B's data.

Linking one `user` across tenants is fine **at the auth/identity layer** (that's how
one person logs into the native app and sees each gym they belong to). It is NOT fine
if it leaks business data. The key invariant to preserve:

- One control-panel `user` MAY have `members` rows in multiple tenant DBs.
- Each tenant DB only ever exposes ITS OWN members/profiles. The tenant middleware
  already scopes every query to one tenant DB, so a shared userId does not cross data.
- The ONLY shared surface is the control-panel `user` row (email, name) — already shared
  by design.

So linking is safe IF we only re-point this tenant's `members.userId` /
`customer_profiles.userId` to the existing real user and never copy data across tenant DBs.

## Proposed flow (sendClaimLink, collision branch)

When `sendClaimLink` detects the target email already belongs to a DIFFERENT real user:

```
existingUser   = the placeholder user currently linked to THIS tenant's profile
collidingUser  = the real user that already owns ahmad@gmail.com (another tenant / prior claim)
```

Instead of throwing CONFLICT:

1. Verify `collidingUser.emailVerified === true` (it's a real claimed identity, not another placeholder).
2. **Re-point this tenant's records** from the placeholder user to the real user:
   - `UPDATE members SET user_id = collidingUser.id WHERE user_id = existingUser.id` (tenant DB)
   - `UPDATE customer_profiles SET user_id = collidingUser.id WHERE user_id = existingUser.id` (tenant DB)
   - Any other tenant tables keyed by `user_id` for this customer (appointments.client_id,
     package_instances.client_id, payments, sales_orders, installments, credit ledger…)
     — **AUDIT REQUIRED**: enumerate every tenant table that stores the customer's userId.
3. Delete (or soft-orphan) the now-unused placeholder `user` row in control-panel
   (only if it has no members in ANY tenant — check first).
4. Do NOT send a claim link — the customer already has credentials. Instead send a
   plain "you've been added to <Gym B>" notification (optional).
5. Clear/derive isUnclaimed as already handled by C-3 (emailVerified=true → claimed).

## Open product decisions (NEED SIGN-OFF before coding)

1. **Identity matching key.** Match on email only? Or email OR phone? Emails get
   mistyped; phone is the better canonical key (see the earlier phone-OTP discussion).
   Recommendation: match on **verified email** for now; revisit phone later.

2. **Re-point vs. dual-profile.** Re-pointing merges the placeholder into the real user
   (chosen above). Alternative: keep separate userIds and add a `linkedUserId` mapping.
   Re-pointing is cleaner but irreversible and touches many tenant tables. Confirm
   appetite for the table audit + migration.

3. **Consent / privacy.** Gym B linking to Ahmad's existing identity means Gym B staff
   can now send sign-in links to an account Ahmad created with Gym A. Acceptable? In the
   trusted front-desk model, probably yes, but it's a cross-business identity touch.

4. **Trainer/staff accounts.** A `collidingUser` might be a STAFF member elsewhere, not a
   customer. Must refuse to re-point if `collidingUser` has any non-`client` member role
   in any tenant (prevents turning a staff login into a customer profile).

## Required pre-implementation audit

Enumerate EVERY tenant-DB column that stores a customer's control-panel userId:
- `members.user_id`
- `customer_profiles.user_id`
- `appointment_clients.client_id` / `appointments.*`
- `package_instances.client_id`
- `payments.*`, `sales_orders.*`, `installments.*`
- `credit_point_ledger.*` (new), `stock_movements.actor_user_id` (N/A for customers)
- audit log actor/entity refs

Re-pointing must update ALL of them atomically (single tenant-DB transaction) or the
customer's history fragments across two userIds.

## Risk

HIGH — touches multi-tenant identity + a cross-table userId migration per claim.
Must be done in a transaction, with the full table audit, and ideally behind a
feature flag with a dry-run/report mode first. This is NOT a quick fix; it is a
small project. Recommend: separate session, plan reviewed by a second pass, then
implement with integration tests against a seeded two-gym fixture.

## Interim mitigation (ship now, low risk)

Until the full link flow exists, improve the dead-end UX: when `sendClaimLink` hits the
CONFLICT, return a clearer message — "This email already belongs to an existing Avantej
account. Account linking across gyms isn't available yet; use a different email or contact
support." This is a 1-line message change, no data risk.

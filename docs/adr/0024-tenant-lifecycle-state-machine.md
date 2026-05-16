# ADR 0024 — Tenant Lifecycle State Machine

Date: 2026-05-16
Status: Accepted

## Context

Plan E E.3 adds platform-admin lifecycle ops: suspend, resume, force
cancel, issue credit, re-trial. Before adding the procedures, we need
shared agreement on:

1. What states a tenant can be in.
2. Which transitions are legal, and from which states.
3. What "suspended" actually does (block charges? block login? both?
   read-only?).
4. Where the state lives (and the source of truth between Stripe and us).

Without this, ops can land a tenant in an undefined state — e.g. Stripe
sub `active` but our `paymentStatus='suspended'`, which means the
tenant gets billed but can't log in.

## Decision

The tenant lifecycle states live on `organizations.paymentStatus`
(control panel) as the **authoritative state**. Stripe state is
synchronized via webhooks (ADR-0006) but our app-level gating uses our
column.

States:

```
   created
      │
      ▼
   trial ────────────► active ─────► past_due ────► suspended ────► cancelled ────► deleted
                          ▲              │              │              │
                          │              │              │              │
                          └──── re_trial └── webhook ───┘              │
                                          (auto-recovers when invoice                  
                                           is paid)                                    
                                                                       │
                                                                       └─ (E.8 soft delete)
```

Transitions:

| From | To | Trigger | Audited via |
|------|----|---------|-------------|
| (none) | trial | tenant signup | trial provisioning code |
| trial | active | first paid invoice (webhook) | webhook handler |
| active | past_due | invoice.payment_failed webhook | webhook handler |
| past_due | active | invoice.paid webhook (retry succeeded) | webhook handler |
| past_due | suspended | grace period expires (future Plan F cron) | cron audit |
| any non-deleted | suspended | admin suspendTenant | admin_session_actions |
| suspended | active | admin resumeTenant | admin_session_actions |
| any non-deleted | cancelled | admin forceCancelTenant | admin_session_actions |
| trial / suspended | active | admin reTrialTenant (extends trial) | admin_session_actions |
| cancelled | deleted | Plan E.8 soft-delete hard-delete cron | tenant_deletions |

### Suspend semantics

**`suspended` = block charges + block app login.** Read-only mode would
mean a tenant whose customers can still book appointments but staff
can't process them — a worse experience than a clean cut.

Enforcement:

1. **Block app login** — `tenant.middleware.ts` and
   `orpc-tenant.middleware.ts` return HTTP 403
   `{ paymentStatus: "suspended" }` for any non-platform-admin request
   carrying a suspended `organizationId`. Web UI surfaces the suspension
   notice (future ADR-pending).
2. **Block charges** — same middleware blocks oRPC calls into the
   payments router, so `chargeSavedCard` / `createPaymentIntent` cannot
   run. The Stripe-side subscription is *not* automatically paused —
   `forceCancelTenant` is the explicit way to also stop billing.
3. **Platform-admin bypass** — admin paths (`/platformAdmin*`,
   `/admin.*`) bypass the suspension gate so ops can resume / cancel /
   inspect. Tenant data remains accessible to admins.

### Force-cancel semantics

`forceCancelTenant` is destructive. It:

1. Calls `stripe.subscriptions.cancel()` on the linked Stripe sub
   (prorates per Stripe defaults — billing halts immediately).
2. Sets `paymentStatus='cancelled'`. The tenant is now blocked from app
   access (cancelled is treated identically to suspended at the
   middleware layer — though the explicit check is on `suspended` only
   today; ADR-followup: extend gate to cancelled).
3. Records an `admin_session_actions` row with the Stripe sub id and
   reason for audit.

Recovery from `cancelled` requires manual ops — there is no
`uncancelTenant` proc. If the tenant returns, ops creates a fresh
subscription via the standard checkout flow.

### Issue credit semantics

`issueTenantCredit` is non-destructive. It adds a negative customer
balance transaction in Stripe, which Stripe automatically applies to
the next invoice. No local state changes.

### Re-trial semantics

`reTrialTenant` is a recovery action used when a churned trial-tenant
returns or when ops grants a sales concession. It:

1. Sets `organizations.trialEndsAt = now() + extendDays`.
2. Sets `paymentStatus='active'` (clears any prior suspension /
   past_due).
3. Audits with the day count + reason.

It does **not** modify the Stripe subscription — re-trial is a
control-panel concept; Stripe's trial state is separate. If a tenant
has a paid sub already, re-trial just extends our trial column (effect
on UX = "trial banner reappears"). Most re-trials are for tenants in
`trial` or `suspended` who never converted.

## Consequences

Positive:

- Single column (`paymentStatus`) is the source of truth for gating —
  middleware doesn't need to consult Stripe.
- Audit row required on every admin transition (lifecycle ops only
  accept `reason` length ≥ 3) — no silent state changes.
- Suspend is a clean cut; tenant and customer expectations match.
- Force-cancel ties our state to Stripe state via direct cancel call
  (no drift via webhook race).
- Re-trial is cheap; ops can liberally extend without Stripe
  side-effects.

Negative:

- Webhook-driven transitions (past_due, auto-recovery) and
  admin-driven transitions write to the same column. Race possible if
  an admin suspends while a `invoice.paid` webhook is in flight — the
  admin write wins (last-writer). Acceptable: webhook arriving later
  would set us active again, which a reasonable ops would re-suspend.
  An optimistic-lock column is overkill for now.
- `cancelled` is not yet gated explicitly by the middleware (only
  `suspended` is). Filed as a follow-up — for now, cancellation also
  cancels Stripe so the tenant has nothing to do app-side anyway.
- `forceCancelTenant` doesn't refund. Refunds belong in a separate
  proc (none yet) — ops uses the Stripe Dashboard for refunds.

## Alternatives considered

- **Stripe as source of truth.** Rejected: every gate check would
  require a Stripe API call (latency + rate limits). Webhook-synced
  local column is what we have.
- **Half-suspend (block charges only, allow login).** Rejected: the
  tenant's staff could still book appointments customers couldn't pay
  for, surfacing the suspension to the *customer* in the worst possible
  context.
- **Hard delete on cancel.** Rejected: ops sometimes needs the tenant
  data after cancellation (legal hold, dispute, refund). 30-day soft
  delete is Plan E.8.

## Related

- ADR-0006 — Webhook architecture (drives past_due / active
  transitions).
- ADR-0023 — Usage snapshots (suspended tenants still snapshot — usage
  trend is needed for re-trial decisions).
- Plan E E.8 — Will add `cancelled → deleted` via soft-delete cron.

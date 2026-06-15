# ADR 0022 — Tenant Management Surface Scope

Date: 2026-05-16
Status: Accepted

## Context

Plan E ships the Avantej-ops surface for managing tenants — list,
drill-in, usage, lifecycle, funnel, comms, audit, provisioning, GDPR.
Before building, we had to decide two scope axes that are easy to get
wrong:

1. **Who is the user?** Avantej platform ops (super_admin / support /
   billing roles), tenant owners (franchise admins), or both?
2. **What's in v1?** Lifecycle and visibility are obvious. Self-serve
   tenant features (cancel own subscription, change tier, view own
   audit log, GDPR export of own data) — are those Plan E or Plan F?

Without an explicit scope decision, every Plan E phase risks creep
toward "let's expose this to tenants too while we're here," which
doubles the work, doubles the surface to secure, and introduces a
brand-new RBAC story (tenant-owner-only vs platform-admin-only).

## Decision

**Plan E is platform-admin-only.** Every endpoint added in E.1-E.8 is
gated behind `requirePlatformAdmin()` and lives under the
`/dashboard/platform-admin/*` route prefix. The web surface is invisible
to tenant owners.

Self-serve tenant management — owner-facing subscription management,
own-tenant audit history, own-tenant data export, in-app cancellation
flow — **defers to Plan F**.

Concretely:

| Feature | Plan E (admin) | Plan F (tenant self-serve) |
|---------|----------------|----------------------------|
| List + search tenants | ✅ E.1 | n/a |
| Tenant lifecycle (suspend / cancel / re-trial) | ✅ E.3 (admin acts ON tenant) | ⏳ tenant cancels own sub |
| Usage metrics | ✅ E.2 (cross-tenant view) | ⏳ tenant sees own usage |
| Activation funnel | ✅ E.4 (admin reads any) | ⏳ tenant sees own progress |
| Direct comms | ✅ E.5 (admin → owner) | ⏳ tenant ↔ Avantej support inbox |
| Audit log | ✅ E.6 (every admin action) | ⏳ tenant sees actions on own org |
| Provisioning | ✅ E.7 (admin-mediated) | ⏳ self-serve signup w/ KYC |
| Data export / soft delete | ✅ E.8 (admin-triggered) | ⏳ tenant-triggered GDPR portal |

## Consequences

Positive:

- **Single auth model.** Every Plan E route uses the same gate
  (`requirePlatformAdmin`). No "is this caller a platform admin, OR the
  org owner, OR a member with this permission?" branching anywhere.
- **No tenant-facing UX work in Plan E.** That work belongs in Plan F
  and benefits from the foundation Plan E lays (services, audit
  patterns, schemas).
- **Faster shipping.** Scoping cut estimated effort roughly in half:
  the same plan with tenant self-serve would have needed parallel UI,
  scoped RBAC, and tenant-facing email templates.
- **Cleaner separation of concerns.** Admin tooling and tenant tooling
  evolve at different cadences. Admin tooling is internal — we can
  iterate aggressively. Tenant tooling is customer-visible — slower
  pace, more polish, more support burden.

Negative:

- **Tenants cannot cancel their own subscriptions until Plan F.**
  Workaround: they email support; support uses E.3 `forceCancelTenant`.
  Friction is acceptable since (a) cancellation is a rare event and
  (b) the human-in-the-loop pause sometimes saves the customer.
- **Tenants cannot export their own data until Plan F.** Same
  workaround — support uses E.8 `requestTenantExport`. Less acceptable
  long-term (GDPR / DSAR has timing obligations) but legal review
  agrees that admin-mediated within 30 days is compliant.
- **Provisioning is admin-mediated.** Self-serve signup is a Plan F
  topic because it requires KYC, fraud screening, and a much richer
  email/onboarding flow than Plan E can absorb.

## Alternatives considered

- **Build platform-admin and tenant self-serve in parallel.** Rejected
  — doubles the work for the lowest-priority half (tenants are happy
  enough with the human-mediated path while we have small N).
- **Tenant-only Plan E (no admin surface, customer-facing first).**
  Rejected — operationally we cannot run the SaaS without the admin
  surface today (Plan C only covered payments-side ops). Tenant self-
  serve is a luxury until the admin surface exists.
- **Build admin surface but expose subset to tenants via RBAC.**
  Rejected — same auth-model branching pain described above, plus
  every endpoint becomes a security-review risk (what if the
  `getTenantDetail` accidentally leaks neighbouring tenants' data via a
  bug?). Two routes per concern (admin vs tenant) is cleaner.

## Related

- ADR-0023 — Usage snapshots (the data infrastructure E.4 + future
  Plan F own-usage view will share).
- ADR-0024 — Lifecycle state machine (the contract Plan F self-serve
  cancel will use).
- Plan F (TBD) — Will cite this ADR when sketching the tenant self-
  serve scope.

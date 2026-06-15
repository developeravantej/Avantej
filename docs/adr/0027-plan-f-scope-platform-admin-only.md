# ADR 0027 — Plan F Scope (Platform-Admin Only)

Date: 2026-05-17
Status: Accepted
Supersedes: extends ADR-0022 (tenant-management surface scope)

## Context

Plan E shipped the platform-admin tenant-management surface: provision,
suspend, restore, delete, audit, comms, snapshots. ADR-0022 framed that
as "ops sees and acts on tenants; tenants do not self-serve". Plan F is
the **operational UX layer** on top — discovery, segmentation, deeper
revenue/billing/ops surfaces. Same persona; richer tooling.

The question this ADR locks: **what is and is not in Plan F's scope?**

## Decision

Plan F adds, for Avantej platform ops (super_admin / support / billing):

- F.1: ⌘K cross-tenant search palette + tenant Notes tab + Tags & bulk
  ops on `/tenants` list. (F.1.5 patch: mission-control home + health
  score + Risk tab — deferred until F.1 lands cleanly.)
- F.2: `/revenue` MRR/ARR/churn page + cohort retention + `/comms`
  outbox + template library + bulk DM/announcement composer.
- F.3: Billing tab on drill-in (invoice history, refund, payment
  method) + global `/billing` + tier change mid-period + coupons.
- F.4: `/renewals` calendar + `/health` scoreboard + `/webhooks` log +
  `/migrations` runner + Members & Feature-flags tabs.

Explicitly **out of scope** for Plan F (deferred to Plan G+):

- Tenant self-serve management (own-sub cancel, own-data export,
  own-audit). ADR-0022 still holds: tenants do not see this surface.
- Self-serve tenant signup with KYC.
- Cross-tenant analytics for Avantej growth (Mixpanel-style).
- Referral / affiliate program.
- Hard quota enforcement (TIER_LIMITS stays soft).
- Per-tenant Neon region migration.
- In-app dispute response UI.
- Slack alerts (email-only stays).

## Consequences

- All new routes mount under `/dashboard/platform-admin/*` and gate on
  `platform_admins` membership via existing middleware.
- All new mutating procs go through the existing platform-admin audit
  log (one row per mutated target — see `platform-admin-tenants-comms.ts`
  pattern; bulk ops emit one row per target tenant, not one row per
  call).
- No tenant-side route mounts a Plan F component. The ⌘K palette is
  pathname-gated on `/dashboard/platform-admin/*` to prevent hotkey
  collision with tenant-side flows.
- Authoring `/dashboard/platform-admin/*` features stays cheap: pages
  are server-thin (oRPC proc + Drizzle query) and client-thick
  (TanStack Query + shadcn primitives). No new tenant-side dependency.

## Migration slot usage

F.1 reserves:
- `0026_tenant_notes.sql` — Agent N
- `0027_tenant_tags.sql` — Agent T

F.1.5 (deferred): `0028_health_score_on_snapshots.sql` (adds two columns
to existing `tenant_usage_snapshots` — additive, no new table).

F.3 / F.4: slots assigned at phase kickoff.

## Alternatives considered

- **Single mega-phase.** Rejected: ~21h of focused work, too long for a
  single PR review cycle; phasing keeps each PR scoped to one user
  outcome ("discovery", "revenue", etc).
- **Mix tenant-side surfaces into Plan F.** Rejected: ADR-0022 already
  decided self-serve is a separate later plan with different threat
  model (RBAC, account takeover, scoping). Coupling them slows both.
- **Build tags as `jsonb` on `organizations`.** Rejected — see ADR-0029.

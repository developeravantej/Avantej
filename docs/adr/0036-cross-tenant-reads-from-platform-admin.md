# ADR 0036 — Cross-Tenant Reads from Platform-Admin Procs

Date: 2026-05-17
Status: Accepted

## Context

Plan F.4 introduces UI surfaces that need to read **per-tenant** data
(members on the drill-in's Members tab) from a **platform-admin**
context. The existing tenant middleware
(`apps/server/src/middleware/tenant.middleware.ts`) is designed for
tenant users hitting their own org's API — it opens the tenant DB
connection scoped to a single `organizationId` from the URL/session.

Platform-admin procs are different:
- They take `organizationId` as an **input parameter**, not from the
  user's own session.
- A single platform-admin proc call may want to read MANY tenant DBs
  (e.g. Agent G's `/billing` global page already fans out invoices
  across all tenants).
- The platform-admin user often doesn't have a `member` row in the
  target tenant DB at all.

How should a platform-admin proc open a tenant DB connection?

## Decision

Reuse the existing **`getTenantDb(controlPanelDb, organizationId)`
helper** that Plan E.8 (`tenant-export.service.ts`) + Plan F.2
(`tenant-deletion.service.ts`) already use for service-layer
cross-tenant work.

`apps/server/src/lib/db.ts` exports `getTenantDb(orgId)` —
- Looks up the org's encrypted `tenantDatabaseUrl` in control-panel
  DB
- Decrypts via the existing encryption key
- Opens a Neon serverless connection
- Returns a Drizzle client typed against tenant schema

In platform-admin procs:
```ts
const { getTenantDb } = await import("@/lib/db");
const tenantDb = await getTenantDb(input.organizationId);
const members = await tenantDb.select().from(membersTable)...
```

Wrap in `tryOpenTenantDb` (a tolerant variant that returns `null` if
the org has no encrypted URL, can't decrypt, or connection fails) —
return empty result gracefully instead of throwing 500.

## Why this pattern

### Reuse, don't reinvent
`getTenantDb` already exists, already tested, already handles encryption
+ Neon-branch lookup. Building a parallel API for platform-admin
would diverge over time.

### Tolerant by default
Platform-admin reads should NEVER 500 because one tenant's branch is
broken or unreachable. Members tab on org X shouldn't fail because
org Y has a corrupted tenant DB URL. `tryOpenTenantDb` returns null
instead of throwing — UI shows "no data" placeholder, ops can
investigate why later.

### One connection per proc call
Don't pool tenant connections across calls. Each platform-admin proc
that needs tenant data:
1. Opens connection on entry
2. Does its reads
3. Connection closes when proc returns (Neon serverless handles GC)

This is correct for ops-cadence usage (a few tab opens per minute,
not per-second).

### Don't fan out tenant connections in tight loops
Agent G's `/billing` page does fan-out cautiously: `Promise.allSettled`
over distinct active stripeCustomerIds, ≤50 in parallel, documented in
ADR-0033 as the trigger threshold for a mirror table.

For tenant-DB fan-out (e.g. "show members across all tenants"), the
same caveat applies — Plan F.4 doesn't ship this kind of fan-out
because no current feature requires it. If F.4.5+ does, open a new
ADR + likely a mirror table.

## Consequences

- `platformAdminTenants.members` (Agent Mb) uses `tryOpenTenantDb` and
  returns empty roster if the tenant DB can't be opened. UI surfaces
  "No members" placeholder.
- Members proc joins control-panel `user` table (for name/email) with
  tenant `members` table (for role/joinedAt) — cross-DB stitch in JS,
  not a single SQL query. Acceptable at member-count granularity per
  tenant (~tens to low hundreds).
- The same pattern applies if F.4.5+ adds tabs reading other
  tenant-side data (appointments, services, classes). Each new proc
  uses `tryOpenTenantDb`.
- No new schema. No new connection-pool infrastructure.

## Alternatives considered

- **Extend tenant middleware to accept platform-admin context** —
  rejected. The middleware is currently safe-by-default (tenant users
  can only access their own org). Loosening it for platform-admin
  creates a foot-gun for tenant routes that mistakenly inherit the
  loosened gate.
- **New dedicated `platformAdminTenantDb(orgId)` helper** — rejected.
  Same behavior as `getTenantDb`; pure duplication.
- **Connection pool keyed by orgId** — rejected for v1. Workers
  serverless model + Neon's connection management makes per-call open
  the right default. Add pooling only if profiling shows it's needed.
- **Mirror tenant data into control-panel** — rejected. Doubles
  write-path cost (denormalized cache); breaks the "tenant DB is the
  single source of truth for tenant data" invariant from ADR-0001
  (multi-tenant Neon branch architecture).

## Open follow-ups

- If F.4.5+ adds cross-tenant aggregations over tenant-side data
  (e.g. "all appointments across all tenants this month"), revisit:
  - May need a per-tenant fan-out helper with pagination/throttling
  - May need a control-panel-side analytics aggregator table
- Connection lifecycle observability: today we don't log/measure how
  long per-call tenant connections live. If `/billing` global page
  ever feels slow due to fan-out, add timing instrumentation before
  introducing a mirror table.

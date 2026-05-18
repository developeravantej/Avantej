# ADR 0035 — Migrations Surface is Read-Only

Date: 2026-05-17
Status: Accepted

## Context

Plan F.4 doc proposed a `/migrations` "runner" — letting platform-admin
ops apply pending migrations from the web UI. Agent Mi shipped this as
a **read-only viewer** instead. This ADR explains why.

## Decision

The `/dashboard/platform-admin/migrations` surface is **read-only**:

- `listMigrations({ schema })` — merges Drizzle `_journal.json` with
  the `drizzle.__drizzle_migrations` applied table to compute per-tag
  status (applied / pending / orphaned).
- `getMigrationFile({ schema, tag })` — returns SQL file content for
  inspection. Tag regex `^\d{4}_[a-z0-9_]+$` rejects path traversal +
  uppercase.

NO apply proc exists. NO mutation possible from the web UI.

To apply a migration, ops must run `bun db:push` / `bun db:migrate`
from a CLI on a trusted machine with `DATABASE_URL` set.

## Why read-only

### Migration apply has irreversible blast radius
A bad migration on the control-panel DB can:
- Drop a column needed by every tenant connection (cascading 500s)
- Corrupt audit history
- Trigger Drizzle migration tracking divergence that's hard to recover
  without manual `__drizzle_migrations` surgery

There's no "undo" button for ALTER / DROP. Production needs a human
operator at a CLI prompt with the option to run `--dry-run`, inspect
the planned SQL, gate on staging-run first, etc. A web button hides
all those affordances.

### Web UI authentication doesn't add safety
Even with super_admin RBAC + confirmation modal, a compromised admin
session would let an attacker run migrations. CLI access requires
shell + env-var possession — strictly higher bar.

### Journal drift is already a problem
Dev DBs at Avantej have repeatedly drifted from the Drizzle journal
(F.1, F.1.5, F.2 agents all worked around this by applying migrations
via raw SQL pool calls when `bun db:push` no-op'd). Adding a UI apply
button would make drift WORSE — ops would click "apply" expecting
drizzle-managed apply, get raw SQL apply that bypasses journal, and
end up with the same orphaned state we already saw.

The viewer surfaces orphaned migrations as a warning banner —
informational only, no apply.

### Read-only is genuinely useful
Without any apply functionality, the viewer still solves real ops
problems:
- "Did migration 0029 land in prod?" — view applied status
- "What's in 0024_tenant_deletions.sql exactly?" — view file content
- "Is the dev DB out of sync?" — orphaned banner

Those questions previously required SSH-into-prod + `psql` + manual
journal inspection.

## Consequences

- New top-level router `platformAdminMigrations` with 2 read procs.
- Build-time SQL bundling: tenant migrations already had a generated
  bundle via `scripts/gen-tenant-migrations.ts`; Agent Mi added the
  mirror `scripts/gen-control-panel-migrations.ts` for control-panel.
  No `fs` access at runtime — Workers-safe.
- Journal JSON imports via `packages/db/src/journals.ts` re-export
  (resolveJsonModule).
- Tag regex validates path-traversal at the proc layer.
- Drift detection surfaced in UI — banner only, no auto-remediation.

## Alternatives considered

- **Apply with confirmation modal** — rejected. Confirmation modals
  prevent typo-mistakes, not security or CLI-affordance gaps. The risk
  is structural, not human-error.
- **Apply gated to super_admin only** — rejected. Same reasoning;
  super_admin compromise scenario remains plausible. CLI access is
  fundamentally a higher bar.
- **Dry-run apply (show planned SQL)** — partial implementation now
  via `getMigrationFile` (you can read the SQL). True dry-run requires
  a temporary connection + transaction rollback — overlaps with `bun
  db:push --dry-run` in CLI. Don't reinvent.
- **Schedule a migration via the UI to run at a specific time** —
  rejected. Sleep-button-and-pray UX is worse than CLI scheduling via
  cron / GitHub Actions / Cloudflare Workers cron triggers (which can
  be locked down via separate secrets).

## Open follow-ups (defer to Plan G+)

- **Migration runner proc** with these safety properties (if ever
  reconsidered): runs inside a single transaction with auto-rollback
  on first error; requires a "type the migration tag to confirm"
  modal; emits a structured audit row; sends email to all super_admins
  on apply. Probably still not worth the complexity.
- **Drift auto-remediation** — proc that registers orphaned applied
  migrations into `__drizzle_migrations`. Useful for cleaning up
  legacy drift in dev DBs. Defer until ops asks for it.
- **Per-tenant migration view** — currently the tenant tab shows the
  bundled tenant journal but doesn't query any specific tenant's
  `__drizzle_migrations`. To do that, you'd open every tenant DB
  connection — slow + brittle. Open a separate ADR if needed.

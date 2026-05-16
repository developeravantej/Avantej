# Runbook — Plan F (Control-Panel Ops UX)

Operational reference for the Plan F surfaces. Phases land incrementally;
this runbook grows with them.

---

## F.1 — Quick wins (LANDED)

Branch: `plan-f-ops-ux`
Commits: `17ef6ec` (Notes), `89ce2a8` (Tags+Bulk), `065a19d` (Search)
ADRs: 0027 (scope), 0028 (notes), 0029 (tags)

### What shipped

| Feature | Where | Router | Migration |
|---|---|---|---|
| ⌘K cross-tenant search palette | Mounted in `dashboard/_layout.tsx`, gated on `/dashboard/platform-admin/*` | `platformAdminTenants.search` | — |
| Notes tab on tenant drill-in | `tenants.$id.tsx` Tabs block | `platformAdminTenants.notes` (CRUD) | `0026_tenant_notes.sql` |
| Tags + bulk ops on `/tenants` list | `tenants.tsx` list page | `platformAdminTenants.tags` (7 procs) | `0027_tenant_tags.sql` |

### Common ops

**Find a tenant fast.**
1. From any `/dashboard/platform-admin/*` page, press `⌘K` (Mac) or
   `Ctrl+K` (Win/Linux).
2. Type any of: org id (UUID), org name, slug, or member email.
3. Click result row → drilled into `/dashboard/platform-admin/tenants/<id>`.

Search ranks `id > slug > name > email`. Returns up to 10 results,
deduped by org.

**Add an internal note.**
1. Drill into tenant → Notes tab.
2. Compose + optionally pin → "Add note".
3. The note is editable by you for 60 minutes; after that, frozen.
   Super_admin can soft-delete any note at any time.

**Tag a tenant.**
1. `/dashboard/platform-admin/tenants` → row action → "Add tag".
2. Type label (create new) or pick existing. Color persists per label.

**Bulk-apply a tag.**
1. Check rows in the list (up to 100).
2. Bulk actions bar appears → "Apply tag" → label.
3. Audit log gets one row per target tenant.

**Bulk suspend (super_admin only).**
1. Select rows.
2. Bulk actions bar → "Suspend" (only visible to super_admin).
3. Each org goes through the standard suspend flow (Stripe sub cancel +
   payment_status update).

### Debugging recipes

**"Search returns nothing for an org I know exists."**
- Query is ILIKE — `%query%`. If you typed an email, the match is
  through the `organization_members` join — confirm the user is a
  member, not an outside contact.
- Search proc has `protectedProcedure` + platform-admin gate. If
  you're impersonating a tenant-side user, you'll get FORBIDDEN. Log
  back in as a platform admin.

**"Note edit button is greyed out."**
- The note is older than 60 minutes. Only the author can edit within
  the window. Super_admin can soft-delete at any time but cannot
  re-edit a frozen note.

**"Bulk apply failed with 'Max 100 tenants per bulk op'."**
- The 100-row cap is enforced at zod validation. Paginate the bulk
  in client-side batches if you need to span >100.

**"Tag chip color changed unexpectedly."**
- `tenant_tags.color` is per-row. First-time create sets the color;
  subsequent `add` procs reuse the existing row's color. If you see
  inconsistency, look for two attachments of the same label with
  different colors — UNIQUE constraint should prevent that. If it
  happened, it's a pre-existing data issue worth opening a ticket on.

### Tables added

`tenant_notes`:
```
id uuid pk
organization_id uuid → organizations.id ON DELETE CASCADE
author_user_id text
body text
is_pinned boolean
created_at, updated_at timestamp
deleted_at timestamp (soft-delete)
```

`tenant_tags`:
```
id uuid pk
organization_id uuid → organizations.id ON DELETE CASCADE
label text
color text
created_by_user_id text
created_at timestamp
UNIQUE (organization_id, label)
```

### Audit trail

Every mutating proc (notes create/update/delete, tags add/remove/bulk*)
writes to the existing platform-admin audit log. Bulk ops write one
row **per target tenant**, not one row per call — so a bulkAdd to 50
orgs produces 50 audit rows.

Query example:
```sql
SELECT * FROM admin_session_actions
WHERE action LIKE 'tenant_notes_%' OR action LIKE 'tenant_tags_%'
ORDER BY created_at DESC LIMIT 50;
```

### Known issues to clean up post-merge

These surfaced during F.1 development; none block merge but should be
tracked as follow-ups:

1. **Migration journal drift on local dev DB.** `drizzle/meta/_journal.json`
   on the local control-panel branch stops at `idx 18`; migrations
   `0019..0025` were applied via SQL pool but not registered in the
   journal. Agents N + T worked around by applying their slots manually.
   **Action:** sync the journal on every dev machine, or rebuild the
   local control-panel branch from a fresh snapshot.
2. **`listTenants` aggregation cast bug.** Pre-existing error in
   `platform-admin-tenants.ts` (`cannot cast type record to uuid[]`)
   under `@neondatabase/serverless`. Blocks the `/tenants` list render
   in some environments. Not introduced by F.1. **Action:** open ticket
   to refactor the aggregation.
3. **Better-Auth Resend sandbox rejection.** Non-`developer.avantej@gmail.com`
   signups fail in dev. Tests work around with direct `emailVerified =
   true` updates. **Action:** add a non-sandbox staging Resend key OR
   bypass email verification under `NODE_ENV=test`.

### Per-feature reference

| Agent | Files | Spec | Video |
|---|---|---|---|
| **N** (Notes) | `apps/server/src/routers/platform-admin-tenants-notes.ts`, `packages/db/src/schema/control-panel/tenant-notes.ts`, `apps/web/src/components/platform-admin/tenant-notes-tab.tsx` | `apps/web/e2e/tests/ship/plan-f-1/N-notes-tab.spec.ts` | `verification/plan-f-1/N-notes-tab.webm` |
| **T** (Tags + Bulk) | `apps/server/src/routers/platform-admin-tenants-tags.ts`, `packages/db/src/schema/control-panel/tenant-tags.ts`, `apps/web/src/components/platform-admin/{tag-chip,tag-filter-strip,bulk-actions-bar}.tsx` | `apps/web/e2e/tests/ship/plan-f-1/T-tags-bulk.spec.ts` | `verification/plan-f-1/T-tags-bulk.webm` |
| **S** (Search) | `apps/server/src/routers/platform-admin-tenants-search.ts`, `apps/web/src/components/platform-admin/command-palette.tsx`, `apps/web/src/hooks/use-command-palette.ts` | `apps/web/e2e/tests/ship/plan-f-1/S-search-palette.spec.ts` | `verification/plan-f-1/S-search-palette.webm` |

---

## F.1.5 — Stretch patch (LANDED)

Branch: `plan-f-1-5-stretch` (based on `plan-f-ops-ux` tip)
Commits: `af73381` (Health), `561ae3c` (Risk tab), `3d656d7` (Mission), `<docs>` (ADR-0030 + this section)
ADR: 0030 (health-score formula)
Migration: 0028 (health_score + risk_flags on tenant_usage_snapshots)

### What shipped

| Feature | Where | Router | Migration |
|---|---|---|---|
| Health score + risk flags on snapshots | `tenant_usage_snapshots.health_score` + `.risk_flags` | `platformAdminTenants.health` (get / history / listAtRisk) | `0028_health_score_on_snapshots.sql` |
| Risk tab on tenant drill-in | `tenants.$id.tsx` Tabs block | (reads health router) | — |
| Mission-control home page | `/dashboard/platform-admin/` (new index route) | `platformAdminDashboard.getOverview` | — |

### Common ops

**See "what should I look at today?"**
1. Hit `/dashboard/platform-admin/` directly — Mission Control is the
   new index route.
2. 4 KPI cards at top: Total Tenants, Active Subs, MRR, Cancelled.
3. At-Risk widget (top 5 by lowest health score) on the left.
4. Recent admin activity feed (last 10) on the right.
5. Recent signups list at the bottom.

**Read a tenant's health.**
1. Drill into tenant → Risk tab.
2. Big score 0-100 with color band (green 80+, amber 50-79, red <50,
   grey for "no snapshot yet").
3. Risk-flag chips with severity colors.
4. 30-day sparkline shows the trend (appears once 2+ days of snapshots
   exist).

**How is the score computed?**
See `docs/adr/0030-health-score-formula.md`. Weighted 5-factor
composite over snapshot inputs. Pure function at
`packages/services/src/health-score.ts`.

### Debugging recipes

**"Score is grey 'No data'."**
- No `tenant_usage_snapshots` row exists for that org yet. The daily
  cron will write one within 24h. If it's stuck, check the cron
  output for that org.

**"Score is full 100 but I know the tenant is on fire."**
- Some of the 5 factors emit `no_data` — their snapshot columns aren't
  yet populated. Score is computed only from available factors. Once
  the snapshot service gains `last_admin_login_at`,
  `failed_webhooks_7d`, `daily_active_members_30d_avg` columns, the
  formula picks them up automatically. Tracked as ADR-0030 open
  follow-up.

**"Sparkline says 'Not enough data'."**
- Need ≥2 days of snapshots. New tenants will see this for the first
  day or two of their existence.

**"Recent activity feed is empty."**
- The local dev `admin_session_actions` table is often empty. In
  prod, this surfaces the latest 10 platform-admin actions across all
  tenants.

**"MRR shows '—'."**
- `TIER_PRICES` constant doesn't exist in code yet. The aggregator
  returns `mrrEstimateAvailable: false` and the UI shows "—". F.1.5
  TODO comment in `platform-admin-dashboard.ts`. Wire up via Stripe
  price lookup or hardcoded TIER_PRICES in Plan F.3 (billing depth)
  when prices land in a shared constant.

### Tables added

`tenant_usage_snapshots` — two new columns (additive ALTER):
```
health_score integer NULL
risk_flags jsonb NULL  -- array of { code, severity, observedAt }
```
Historical rows stay NULL. Cron writes forward.

### Audit trail

F.1.5 procs are all read-only. No new audit rows.

### Per-feature reference

| Agent | Files | Spec | Video |
|---|---|---|---|
| **H** (Health) | `apps/server/src/routers/platform-admin-tenants-health.ts`, `apps/server/src/services/tenant-usage-snapshot.service.ts` (extended), `packages/services/src/health-score.ts`, `packages/db/src/schema/control-panel/tenant-usage-snapshots.ts` (extended) | `apps/web/e2e/tests/ship/plan-f-1-5/H-health-score.spec.ts` | `verification/plan-f-1-5/H-health-score.webm` |
| **R** (Risk tab) | `apps/web/src/components/platform-admin/{tenant-risk-tab,health-score-gauge,risk-flag-list,health-sparkline}.tsx` | `apps/web/e2e/tests/ship/plan-f-1-5/R-risk-tab.spec.ts` | `verification/plan-f-1-5/R-risk-tab.webm` |
| **M** (Mission) | `apps/server/src/routers/platform-admin-dashboard.ts`, `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/index.tsx`, `apps/web/src/components/platform-admin/{big-number-card,recent-activity-feed,at-risk-widget}.tsx` | `apps/web/e2e/tests/ship/plan-f-1-5/M-mission-control.spec.ts` | `verification/plan-f-1-5/M-mission-control.webm` |

---

## F.2 — Revenue + segmentation (PENDING)
## F.3 — Billing depth (PENDING)
## F.4 — Operational depth (PENDING)
## F.5 — Final ADRs + this runbook expansion (PENDING)

Sections to be filled as phases land via subsequent `/ship` runs.

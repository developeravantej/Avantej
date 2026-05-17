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

## F.2 — Revenue (LANDED, partial — comms/bulk-composer deferred)

Branch: `plan-f-2-revenue` (based on `plan-f-1-5-stretch` tip)
Commits: `7dd36a3` (P prep), `1f34556` (V revenue), `<docs>` (ADR-0031 + runbook)
ADR: 0031 (revenue rollup approach)
Migration: none — derived views only

### What shipped

| Feature | Where | Router |
|---|---|---|
| TIER_PRICES_USD_CENTS constant | `packages/types/src/tiers.ts` | `getTierPriceUsdCents(tier)` helper |
| listTenants cast bug fix | `apps/server/src/routers/platform-admin-tenants.ts` | drizzle `inArray()` replaces array cast |
| Mission-control MRR wiring | `apps/server/src/routers/platform-admin-dashboard.ts` | `platformAdminDashboard.getOverview` now returns live MRR cents |
| /revenue page | `/dashboard/platform-admin/revenue` (new route) | `platformAdminRevenue` (getKpis / getCohortRetention / getRecentChurn) |

### What's deferred (rest of F.2)

- `/comms` outbox + template library — defer to F.2.5
- Bulk DM / announcement composer — defer to F.2.5 (builds on Agent T's bulk-actions-bar.tsx pattern)

Reason: F.2 doc estimated 5d; trimmed to revenue + prep to keep PR review tractable.
Comms + bulk-composer don't block F.3/F.4. F.2.5 patch when reviewer queue clears.

### Common ops

**Eyeball revenue.**
1. Navigate to `/dashboard/platform-admin/revenue`.
2. 4 KPI cards: MRR, ARR, Active Subs, Cancelled (30d) with churn rate.
3. 30d MRR delta waterfall: starting → +new → -churn → ending.
4. Recent-churn list (last 30d, ≤100 events).
5. 12-month cohort retention grid — recent cohort at top.

**Read mission-control MRR.**
- `/dashboard/platform-admin/` MRR card now shows real cents (was "—" before F.2-P).

### Debugging recipes

**"MRR shows wrong dollar amount."**
- TIER_PRICES_USD_CENTS values in `packages/types/src/tiers.ts` are PLACEHOLDERS ($49/$199/$499 monthly). Replace with real Stripe Dashboard prices. No code change needed — every call site reads from the constant.

**"Cohort grid is empty for recent months."**
- The grid only counts orgs with `createdAt >= oldestCohortStart`. If you signed up no new orgs in those months, cohorts will be size 0 (placeholder cells).

**"Recent churn is empty."**
- No subs with `canceledAt IS NOT NULL` in the last 30d. Normal for low-churn periods.

**"ARR is exactly MRR × 12 — is that right?"**
- Yes by design (ADR-0031). ARR projection assumes no churn / no growth. For weighted ARR forecasts, use Stripe Sigma or a dedicated finance pipeline — out of scope here.

**"/tenants list no longer 500s — anything I should know?"**
- Agent P (F.2-prep) fixed the `cannot cast type record to uuid[]` aggregation bug by switching `sql\`= ANY(${orgIds}::uuid[])\`` to drizzle `inArray()`. Root cause: `@neondatabase/serverless` binds JS arrays as `record` type which PG can't cast to `uuid[]`. drizzle `inArray()` expands to per-element placeholders.

### Per-feature reference

| Agent | Files | Spec | Video |
|---|---|---|---|
| **P** (prep) | `packages/types/src/tiers.ts` (extended), `apps/server/src/routers/platform-admin-tenants.ts` (cast fix), `apps/server/src/routers/platform-admin-dashboard.ts` (MRR wiring) | `apps/web/e2e/tests/ship/plan-f-2/P-prep.spec.ts` | `verification/plan-f-2/P-prep.webm` |
| **V** (/revenue) | `apps/server/src/routers/platform-admin-revenue.ts`, `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/revenue.tsx`, `apps/web/src/components/platform-admin/{revenue-kpi-row,churn-waterfall,cohort-retention-grid}.tsx` | `apps/web/e2e/tests/ship/plan-f-2/V-revenue.spec.ts` | `verification/plan-f-2/V-revenue.webm` |

### Pipeline note

Agent V crashed mid-flight at ~4min (API 500 error, 26 tool uses). Server router + 3 components were on disk; UI route + e2e spec were missing. Per `~/.claude/skills/ship-pipeline/references/failure-recovery.md` fallback: orchestrator took the slice in-thread, wrote the missing files, expanded `getKpis` return shape to include discrete `newMrrLast30dCents` + `churnedMrrLast30dCents` (waterfall needs both, not just net), and updated the type stub. Total time-to-recovery: ~5min. No need to redispatch agent.

---

## F.2.5 — Comms + bulk composer (LANDED)

Branch: `plan-f-2-5-comms` (based on `plan-f-2-revenue` tip)
Commits: `04945e8` (C comms + templates), `432a7e8` (B bulk composer), `<docs>` (ADR-0032 + this section)
ADR: 0032 (templates + bulk fan-out)
Migration: 0029 (comms_templates)

### What shipped

| Feature | Where | Router |
|---|---|---|
| /comms outbox + template library | `/dashboard/platform-admin/comms` (new route, Outbox + Templates tabs) | `platformAdminComms` (listOutbox + listTemplates/getTemplate/createTemplate/updateTemplate/archiveTemplate/unarchiveTemplate) |
| Bulk DM + bulk announcement | `/tenants` bulk-actions-bar (Send DM + Send announcement buttons, super_admin only) | `platformAdminTenantsComms.bulkSendDirectMessage` + `bulkSendAnnouncement` (extends existing E.5 router) |

### Common ops

**Send a one-off DM to one tenant.**
- Drill into the tenant → existing E.5 DM action. Unchanged.

**Send a DM to many tenants.**
1. `/dashboard/platform-admin/tenants` → check rows (up to 100).
2. Bulk actions bar appears → "Send DM" button (super_admin only).
3. Composer opens → pick template OR compose from scratch → preview → "Send to N tenants".
4. Toast confirms "Sent to X / N. Y failures." Failures are partial — successful sends stay sent.

**Send a bulk announcement.**
- Same as DM but "Send announcement" → adds priority radio + targetAudience.

**Review what's been sent.**
1. `/dashboard/platform-admin/comms` → Outbox tab.
2. Filter by Kind (DM/Announcement), Actor, Target org, Days.
3. Each row shows actor, kind chip, target org (link), subject/title, sent timestamp.

**Manage templates.**
1. `/dashboard/platform-admin/comms` → Templates tab.
2. "New template" (super_admin only) → editor dialog with kind toggle, subject, body, preview.
3. Templates show in the bulk composer's picker.
4. Archive a template to retire it (audit history still references it).

### Debugging recipes

**"Bulk send to 100 tenants only completed 87."**
- Check `result.failed[]` — each failure includes `{ orgId, error }`. Common causes: tenant DB unreachable, missing owner email. Audit log only writes on success per target; failures aren't audited.
- For DM: Resend sandbox in dev rejects most addresses. Production should work cleanly.

**"Template I expected to see in the picker isn't there."**
- Check `archived_at` — archived templates don't show in the picker by default. Toggle "include archived" in Templates tab.
- Kind mismatch — composer filters by current `kind` (DM/announcement); switching the composer's kind switches the picker.

**"Outbox shows the bulk send as one row per target — is that right?"**
- Yes by design (ADR-0032). Bulk fan-out writes one audit row per target tenant. `metadata.kind` distinguishes bulk (`bulk_dm`/`bulk_announcement`) from single (`null`/absent).

**"Action strings I see in outbox don't match the plan doc."**
- Plan doc had dot-separated placeholders (`tenant.direct_message_sent`). Actual Plan E.5 code uses underscore variants (`tenant_dm`, `tenant_announcement_create`). Agent C / B / F.2.5 docs all use the underscore variants — source-of-truth is the code.

**"Announcement priority enum is low/normal/high/urgent, not info/warning/critical."**
- Existing `announcements` table on tenant DB uses `low/normal/high/urgent` + `targetAudience all/staff/clients`. Templates store `info/warning/critical` for the picker UI; the bulk composer maps template priority to the announcements-table enum at send time. This avoids breaking the existing single-tenant announcement flow.

### Tables added

`comms_templates`:
```
id uuid pk
name text
subject text
body_markdown text
kind text                  -- 'direct_message' | 'announcement'
priority text NULL         -- announcement only
target_audience text NULL  -- announcement only
created_by_user_id text
created_at, updated_at timestamp
archived_at timestamp NULL -- soft-delete
```

### Audit action strings

Both bulk and single sends use the SAME action strings (uniform outbox):
- `tenant_dm` — DM sent (single or bulk; `metadata.kind` distinguishes)
- `tenant_announcement_create` — announcement created (single or bulk)
- `comms_template_create` / `comms_template_update` / `comms_template_archive` / `comms_template_unarchive` — template mutations

### Per-feature reference

| Agent | Files | Spec | Video |
|---|---|---|---|
| **C** (outbox + templates) | `apps/server/src/routers/platform-admin-comms.ts`, `packages/db/src/schema/control-panel/comms-templates.ts`, `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/comms.tsx`, `apps/web/src/components/platform-admin/{comms-outbox-list,template-library-panel,template-editor-dialog}.tsx` | `apps/web/e2e/tests/ship/plan-f-2-5/C-comms.spec.ts` | `verification/plan-f-2-5/C-comms.webm` |
| **B** (bulk composer) | `apps/web/src/components/platform-admin/bulk-comms-composer.tsx`, `apps/server/src/routers/platform-admin-tenants-comms.ts` (extended) | `apps/web/e2e/tests/ship/plan-f-2-5/B-bulk-comms.spec.ts` | `verification/plan-f-2-5/B-bulk-comms.webm` |
## F.3-A — Billing tab (LANDED, partial — tier-change + coupons + /billing global deferred to F.3.5)

Branch: `plan-f-3-a-billing` (based on `f-integrated` tip, which is the `plan-f-2-5-comms` tip)
Commits: `cc6fa92` (I billing tab + invoices + refund), `<docs>` (ADR-0033 + this section)
ADR: 0033 (live Stripe reads, no mirror table)
Migration: none — pure Stripe-API integration

### What shipped

| Feature | Where | Router |
|---|---|---|
| Billing tab on tenant drill-in | `tenants.$id.tsx` Tabs block (after Risk tab) | `platformAdminTenants.billing` (listInvoices / getInvoice / refundInvoice / getCustomerSummary) |
| Invoice list with refunded badges | `<InvoiceList />` component | Reads live from Stripe per tenant |
| Refund mutation | `<RefundConfirmDialog />` | `stripe.refunds.create` on payment_intent + audit row |
| Customer summary card | Top of Billing tab | `stripe.customers.retrieve` |

### What's deferred (F.3.5)

- Tier change mid-period (proration via Stripe)
- Coupons (Stripe `coupon` + `customer.balance_transaction`)
- `/billing` global page (cross-tenant invoice list + KPIs — may need mirror table per ADR-0033)

### Common ops

**Read a tenant's invoice history.**
1. Drill into tenant → Billing tab.
2. Customer summary card shows Stripe customer ID, default payment method, balance.
3. Invoice list shows last 20 invoices (paginated). Click invoice number → opens hosted Stripe invoice URL in new tab.

**Issue a refund.**
1. Billing tab → find the invoice → Refund button (super_admin only, hidden if not paid or already fully refunded).
2. Dialog: enter partial amount or accept full default. Pick reason (duplicate / fraudulent / requested_by_customer). Optional notes (audit only).
3. Warning displayed: "real Stripe refund — cannot be undone."
4. Confirm → Stripe API call → audit row written → toast "Refund issued." → list refetches and shows refunded badge.

### Debugging recipes

**"No Stripe customer record."**
- Tenant hasn't been charged yet (trialing). `listInvoices` returns empty, customer summary section hidden. Normal for new tenants.

**"Refund button disabled / hidden."**
- Possible causes: not super_admin (button hidden), invoice status != paid, invoice already fully refunded. Hover for tooltip.

**"Refund failed with Stripe error."**
- Stripe-side rejection (e.g., charge too old, dispute pending). Error message surfaces from Stripe directly. NO audit row written on failure — retry is safe.

**"Refund succeeded but invoice still shows 'paid' not 'refunded'."**
- List refetched after refund. If still stale, Stripe webhook for `charge.refunded` may not have fired yet. Manual refresh resolves.

**"Refund showed up in audit log but not in Stripe Dashboard."**
- Should not happen. Audit row is only written AFTER Stripe returns success. If you see this, check `metadata.refundId` in the audit row and look that up in Stripe Dashboard.

### Audit action strings (new)

- `tenant_invoice_refund` — refund successfully issued. Metadata: `{ invoiceId, paymentIntentId, amountCents, reason, notes?, refundId, status }`.

### Per-feature reference

| Agent | Files | Spec | Video |
|---|---|---|---|
| **I** (Billing tab) | `apps/server/src/routers/platform-admin-tenants-billing.ts` + `.test.ts`, `apps/web/src/components/platform-admin/{tenant-billing-tab,invoice-list,refund-confirm-dialog}.tsx` | `apps/web/e2e/tests/ship/plan-f-3-a/I-billing-tab.spec.ts` | `verification/plan-f-3-a/I-billing-tab.webm` |

### Testing approach (ADR-0033 follow-up)

Factory pattern: `createPlatformAdminTenantsBillingRouter(stripeOverride?: StripeClientLike)` mirrors `subscriptions.ts`. Tests inject a fake Stripe client; prod uses `getStripeClient()`. No real Stripe API calls in CI. Unit test (bun) covers refund happy path + audit row + no-row-on-failure. Playwright e2e covers RPC shape + RBAC + UI tolerant render.

---

## F.3.5 — Billing depth (tier change + coupons + /billing global) — PENDING
## F.4 — Operational depth (PENDING)
## F.5 — Final ADRs + this runbook expansion (PENDING)

Sections to be filled as phases land via subsequent `/ship` runs.

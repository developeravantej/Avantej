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

## F.3.5 — Billing depth (LANDED)

Branch: `plan-f-3-5-billing-depth` (based on `plan-f-3-a-billing` tip)
Commits: `5c8b0ba` (T2 tier change), `6573d8a` (C2 coupons), `68fd70d` (G /billing global), `<docs>` (ADR-0034 + this section)
ADR: 0034 (tier change proration + coupon mechanism)
Migration: none — live Stripe reads per ADR-0033/0034

### What shipped

| Feature | Where | Router |
|---|---|---|
| Tier change mid-period | `<TierChangeCard />` on Billing tab | `platformAdminTenants.billing.changeTier` (super_admin) |
| Coupons CRUD | `<CouponListPanel />` (used by /billing) | `platformAdminCoupons` (list / create / delete) |
| Apply / remove coupon on customer | `<CouponApplyCard />` on Billing tab | `platformAdminCoupons.{applyCoupon, removeCoupon, getCustomerCoupon}` |
| /billing global page | `/dashboard/platform-admin/billing` | `platformAdminBilling.{getOverview, listInvoicesCrossTenant}` |

### Common ops

**Change a tenant's tier.**
1. Drill into tenant → Billing tab → "Current tier: BASIC" card.
2. Pick new tier from dropdown → "Change tier" (super_admin only).
3. Dialog: review price diff, pick proration behavior (default: create prorations), optional notes.
4. Confirm → Stripe updates the subscription → proration invoice items added to next invoice → local subscriptions.tier + stripePriceId updated → audit row.

**Create a coupon.**
1. `/dashboard/platform-admin/billing` → Coupons tab.
2. "+ New coupon" (super_admin only).
3. Form: name, discount kind (percent / amount), value, currency (amount only), duration (once / repeating / forever), durationInMonths (repeating only), maxRedemptions (optional).
4. Confirm → Stripe coupons.create → audit row → coupon visible in list.

**Apply coupon to a tenant.**
1. Tenant Billing tab → `<CouponApplyCard />`.
2. Pick from dropdown of active coupons → Apply (super_admin only).
3. Stripe customers.update with coupon → audit row → "Currently attached: <coupon name>" shows.

**Remove coupon from tenant.**
1. Same card → "Remove coupon" (super_admin only) → Stripe customers.deleteDiscount → audit row.

**Eyeball cross-tenant billing.**
1. `/dashboard/platform-admin/billing` → 4 KPI cards (Active Subs / MRR / Refunds 30d / Active Coupons).
2. Tabs: Recent invoices (cross-tenant, top 20), Refund queue (audit-table view), Coupons (catalog).
3. Click any org name → drills into tenant Billing tab.

### Debugging recipes

**"Tier change failed with Stripe error."**
- Pre-existing Stripe subscription in unusual state (e.g., paused, incomplete). Error message surfaces from Stripe. NO audit row written on failure — retry is safe after fixing root cause in Stripe Dashboard.

**"Proration invoice amount shows null / unavailable."**
- Stripe upcoming-invoice retrieve failed (best-effort). The tier change itself succeeded — proration items WILL show on next invoice. Audit row carries what we could fetch.

**"Coupon I just created isn't showing in the apply dropdown."**
- Stripe coupon list cache via Stripe's API; usually fresh on next refetch. Refresh page or wait ~5s.

**"Coupon attach fails: 'coupon expired'."**
- Stripe-side rejection (coupon has reached max redemptions or expired). NO audit row on failure. List the coupon to confirm validity.

**"/billing page shows '— Stripe unavailable' banner."**
- Stripe API key missing OR Stripe outage. KPIs from local DB still render; coupons + recent-invoices panels degrade. Restore key → refresh.

**"Recent invoices in /billing page is slow."**
- Cross-tenant fan-out via Promise.allSettled. At >50 tenants this gets sluggish. Per ADR-0034: open `tenant_billing_events` mirror table when needed. Slot reserved (TBD when scheduled).

### Audit action strings (new)

- `tenant_tier_change` (Agent T2): `{ fromTier, toTier, stripeSubscriptionId, prorationBehavior, notes?, prorationInvoiceId?, prorationAmountCents? }`
- `coupon_create` / `coupon_delete` / `coupon_apply` / `coupon_remove` (Agent C2)

### Tier constants

- `TIER_PRICES_USD_CENTS` (Agent P, F.2 — basic $49 / professional $199 / enterprise $499 monthly USD cents — PLACEHOLDER)
- `TIER_STRIPE_PRICE_IDS` (Agent T2 — `price_placeholder_basic` / `..._professional` / `..._enterprise` — PLACEHOLDER)

Both replace with real Stripe Dashboard values when ready. Single-file edit in `packages/types/src/tiers.ts`. No code change required at call sites.

### Per-feature reference

| Agent | Files | Spec | Video |
|---|---|---|---|
| **T2** (tier change) | `platform-admin-tenants-billing.ts` (extended), `tier-change-card.tsx`, `tier-change-confirm-dialog.tsx`, `tenant-billing-tab.tsx` (extended) | `T2-tier-change.spec.ts` | `T2-tier-change.webm` |
| **C2** (coupons) | `platform-admin-coupons.ts` + `.test.ts`, `coupon-list-panel.tsx`, `coupon-create-dialog.tsx`, `coupon-apply-card.tsx` | `C2-coupons.spec.ts` | `C2-coupons.webm` |
| **G** (/billing global) | `platform-admin-billing.ts` + `.test.ts`, `billing.tsx` (route), `recent-invoices-panel.tsx`, `refund-queue-panel.tsx` | `G-billing-global.spec.ts` | `G-billing-global.webm` |

(All under `apps/web/e2e/tests/ship/plan-f-3-5/` + `verification/plan-f-3-5/`.)
## F.4 — Operational depth (LANDED)

Branch: `plan-f-4-ops` (based on `plan-f-3-5-billing-depth` tip)
Commits: `2e54c96` (Re), `7cc9b84` (He), `c2e8b8b` (Wh), `2700384` (Mi), `14900fd` (Mb), `43be8f4` (Ff), `419d662` (tsc cleanup), `<docs>` (ADRs 0035 + 0036 + this section)
ADRs: 0035 (migrations read-only), 0036 (cross-tenant reads from platform-admin)
Migration: none — all features are reads over existing tables or compile-time bundled

### What shipped

| Feature | Where | Router | Notes |
|---|---|---|---|
| /renewals 90-day calendar | `/dashboard/platform-admin/renewals` | `platformAdminRenewals.getCalendar` | ISO-week buckets, past-due section, MRR pass/at-risk split |
| /health scoreboard | `/dashboard/platform-admin/health` | `platformAdminHealth.getScoreboard` | Histogram (5 bands), flag rollup, 30d trend sparkline |
| /webhooks log | `/dashboard/platform-admin/webhooks` | `platformAdminWebhooks.{getOverview, listEvents}` | Reads existing `processed_webhook_events` (Plan C) |
| /migrations viewer (read-only) | `/dashboard/platform-admin/migrations` | `platformAdminMigrations.{listMigrations, getMigrationFile}` | NO apply proc — see ADR-0035 |
| Members tab on drill-in | `tenants.$id.tsx` (between Billing and Actions) | `platformAdminTenants.members.{list, getCounts}` | Cross-DB stitch via tryOpenTenantDb — see ADR-0036 |
| Feature flags tab on drill-in | `tenants.$id.tsx` (between Members and Actions) | `platformAdminTenants.featureFlags.get` | Read-only v1, derives from TIER_LIMITS |
| tsc baseline cleanup | (various test files + payment.service.ts) | — | 57 errors → 0, CI gate ready to flip on |

### Common ops

**See who's renewing this week.**
- `/dashboard/platform-admin/renewals` → first week card shows orgs renewing within 7 days.
- "Cancel at period end" warning chip → org won't actually renew; outreach now.
- Past-due section at top — orgs already in trouble, ordered oldest first.

**Triage at-risk tenants.**
- `/dashboard/platform-admin/health` → histogram shows how many orgs are in each band.
- Top-at-risk list (default 20) — click into Risk tab for details.
- Flag rollup tells you which signals are most common ("12 orgs have webhook_failures").

**Audit Stripe webhooks.**
- `/dashboard/platform-admin/webhooks` → 4 KPIs (24h, 7d, duplicates, unique event types).
- By-event-type list shows volume distribution.
- Recent-events table for forensics. Filter by eventType + days window.

**Inspect migrations.**
- `/dashboard/platform-admin/migrations` → tabs for Control Panel / Tenant schemas.
- 4 KPI cards: journal count, applied, pending, orphaned.
- Orphaned banner → some migrations were applied outside Drizzle (manual SQL pool). Investigate via journal drift recipes.
- Click row → view SQL content in dialog. NO apply button per ADR-0035.

**View tenant members.**
- Tenant drill-in → Members tab.
- KPI strip: total + role breakdown.
- Search by name/email, filter by role, paginated.

**Check tenant's feature set.**
- Tenant drill-in → Feature flags tab.
- Tier chip + 5 feature cards (ghl, googleCalendar, commissionSplits, memberships, apiAccess) + tier limits panel.
- To change features → use Billing tab → Tier change (F.3.5).

### Debugging recipes

**"/renewals shows wrong MRR numbers."**
- TIER_PRICES_USD_CENTS values are still placeholders. Replace in `packages/types/src/tiers.ts` with real Stripe Dashboard prices. Single-line edit, no code change at call sites.

**"/health scoreboard shows mostly 'no_data' flags."**
- Plan F.1.5 launched the formula with only 2 of 5 factors wired (payment_status + last_successful_payment_at). The other 3 (admin login recency, webhook failures, daily active members) emit `no_data` until snapshot service writes those columns. Open separate ticket.

**"/webhooks 'duplicates' KPI is high."**
- `duplicates = events where attempts > 1`. Either Stripe is retrying (acceptable transient) OR our handler is throwing repeatedly on the same event. Drill into Recent events with `eventType` filter + check `error` column for repeated failures.

**"/migrations orphaned banner is up."**
- Some migrations applied via raw SQL pool outside Drizzle. Dev DB hits this regularly (F.1/F.1.5/F.2 agents documented working around journal drift). Decision: leave it — ops awareness via banner. ADR-0035 open follow-up has the auto-remediation idea.

**"Members tab shows empty for org I know has members."**
- `tryOpenTenantDb` failed (encryption key mismatch, tenant DB URL null, Neon branch missing). Open server logs for the proc to see the underlying error. Pre-existing data issue, not a Members tab bug.

**"Feature flags shows BASIC for a tenant on PROFESSIONAL."**
- Fallback rules: org missing → NOT_FOUND. No sub → basic. Cancelled sub → basic. Active/trialing/past_due → sub.tier. If you see basic when expecting professional → check subscriptions table directly; the sub may be in cancelled state.

### Audit action strings

F.4 procs are all read-only. No new audit action strings.

### Per-feature reference

| Agent | Files | Spec | Video |
|---|---|---|---|
| **Re** (renewals) | `platform-admin-renewals.{ts, test.ts}`, `renewals.tsx`, `renewals-calendar-grid.tsx` | `Re-renewals.spec.ts` | `Re-renewals.webm` |
| **He** (health scoreboard) | `platform-admin-health.{ts, test.ts}`, `health.tsx`, `health-histogram.tsx`, `risk-flag-rollup.tsx` | `He-health-scoreboard.spec.ts` | `He-health-scoreboard.webm` |
| **Wh** (webhooks log) | `platform-admin-webhooks.{ts, test.ts}`, `webhooks.tsx`, `webhooks-log-table.tsx` | `Wh-webhooks.spec.ts` | `Wh-webhooks.webm` |
| **Mi** (migrations) | `platform-admin-migrations.{ts, test.ts}`, `migrations.tsx`, `migration-status-table.tsx`, `packages/db/src/journals.ts`, `packages/db/src/generated/control-panel-migrations.generated.ts`, `scripts/gen-control-panel-migrations.ts` | `Mi-migrations.spec.ts` | `Mi-migrations.webm` |
| **Mb** (members) | `platform-admin-tenants-members.{ts, test.ts}`, `tenant-members-tab.tsx`, `members-roster-table.tsx` | `Mb-members.spec.ts` | `Mb-members.webm` |
| **Ff** (feature flags) | `platform-admin-tenants-feature-flags.{ts, test.ts}`, `tenant-feature-flags-tab.tsx`, `feature-flag-card.tsx` | `Ff-feature-flags.spec.ts` | `Ff-feature-flags.webm` |

(All under `apps/web/e2e/tests/ship/plan-f-4/` + `verification/plan-f-4/`.)

---

## F.6 — Extensions (LANDED — closes open follow-ups)

Branch: `plan-f-6-extensions` (based on `plan-f-4-ops` tip)
Commits: `f111240` (Sn snapshot factors), `11ceadc` (Fo feature overrides), `<docs>` (ADRs 0037+0038 + this section)
ADRs: 0037 (snapshot factor expansion, closes ADR-0030 follow-up), 0038 (per-tenant feature overrides)
Migrations: 0030 (snapshot factor columns), 0031 (tenant_feature_overrides)

### What shipped

| Feature | Where | Closes |
|---|---|---|
| Snapshot service writes 3 new factor columns | `tenant-usage-snapshot.service.ts` extended | ADR-0030 open follow-up — health score now scores 4 of 5 factors live |
| `lastAdminLoginAt` populated | Cron computes via Better-Auth user.last_login_at join | F.1.5 no_data gap |
| `failedWebhooks7d` populated (global count) | Cron reads processed_webhook_events | F.1.5 no_data gap (per-org attribution deferred) |
| `dailyActiveMembers30dAvg` null (deferred) | Tenant schema needs last_active_at first | F.1.5 no_data gap remains for activity factor |
| Per-tenant feature overrides | New tenant_feature_overrides table + 3 procs | F.4 open follow-up |
| Override toggle UI on Feature flags tab | Super_admin gate, confirm dialog with notes | F.4 read-only limitation |

### Common ops

**See full health score with 4 factors live.**
- Drill into tenant → Risk tab → score now reflects login recency + global webhook health alongside payment status + recency.
- Activity factor still emits `no_data` until tenant `members.last_active_at` lands (ADR-0037 open follow-up).
- /health scoreboard flag rollup now shows `inactive_admin` + `webhook_failures` counts when real data exists.

**Override a feature for a tenant (super_admin only).**
1. Drill into tenant → Feature flags tab.
2. Click the toggle button on a feature card (e.g., commissionSplits on a basic-tier org).
3. Confirm dialog: "Override commissionSplits to ENABLED for this tenant? (Tier default is DISABLED.) Notes (optional)."
4. Submit → audit row written → card shows amber ring + "overridden" badge with metadata (set-by, notes).

**Reset an override.**
1. Same tab → overridden card → "Reset to tier default" link.
2. Confirm → row deleted from `tenant_feature_overrides` → effective value reverts to TIER_LIMITS.

### Debugging recipes

**"Health score still shows no_data for everything."**
- Migration 0030 must be applied to the control-panel branch. If `bun db:push` no-op'd due to journal drift, apply manually via psql (Agents Sn + Fo precedent).
- Cron runs once daily — wait for next run OR invoke `snapshotOne` manually for testing.

**"failedWebhooks7d shows same number for every tenant."**
- Working as designed. Currently a GLOBAL count, not per-org. Per-org attribution requires adding `organization_id` to `processed_webhook_events` (ADR-0037 open follow-up). Decision: ops awareness via this note; ship per-org when demanded.

**"Override didn't take effect — feature still shows tier default."**
- `get` proc merges automatically. If you set the override but `get` returns tier default: check `tenant_feature_overrides` table directly; UNIQUE constraint may have hit (look for stale row in inconsistent state).
- Source field should be `'mixed'` when ≥1 override active.

**"Toggle button hidden even though I'm super_admin."**
- The `isSuperAdmin` prop reaches the tab via the route's `admin.me` resolution. Refresh the page if your role changed during the session.

### Audit action strings (new)

- `tenant_feature_override_set` — metadata `{ featureKey, enabled, notes? }`
- `tenant_feature_override_clear` — metadata `{ featureKey }`

### Tables added

`tenant_feature_overrides`:
```
id uuid pk
organization_id uuid → organizations.id ON DELETE CASCADE
feature_key text (ghl|googleCalendar|commissionSplits|memberships|apiAccess)
enabled boolean
set_by_user_id text
notes text NULL
created_at, updated_at timestamp
UNIQUE (organization_id, feature_key)
```

### Per-feature reference

| Agent | Files | Spec | Video |
|---|---|---|---|
| **Sn** (snapshot factors) | `0030_snapshot_factor_columns.sql`, `tenant-usage-snapshots.ts` (extended), `tenant-usage-snapshot.service.ts` (extended), `health-score.test.ts` (extended) | `Sn-snapshot-factors.spec.ts` | `Sn-snapshot-factors.webm` |
| **Fo** (feature overrides) | `0031_tenant_feature_overrides.sql`, `tenant-feature-overrides.ts`, `platform-admin-tenants-feature-flags.{ts, test.ts}` (extended), `feature-flag-card.tsx` + `tenant-feature-flags-tab.tsx` (extended) | `Fo-feature-overrides.spec.ts` | `Fo-feature-overrides.webm` |

(Under `apps/web/e2e/tests/ship/plan-f-6/` + `verification/plan-f-6/`.)

### Open follow-ups NOT shipped (per /ship triage)

| Item | Why not shipped via /ship |
|---|---|
| Real Stripe Dashboard prices for `TIER_PRICES_USD_CENTS` + `TIER_STRIPE_PRICE_IDS` | Needs user input — inventing values would break MRR + tier-change billing |
| Tenant self-serve (own-sub cancel, own export) | Different threat model, needs Plan G scope doc first (ADR-0022 boundary) |
| Migration runner (apply via UI) | ADR-0035 explicitly rejects; CLI is structurally safer |
| `tenant_billing_events` mirror table | Premature — live reads still fine at current tenant count (ADR-0033/0034 condition #2 not triggered) |
| Per-org webhook attribution | ADR-0037 follow-up — needs `organization_id` on `processed_webhook_events` |
| Tenant activity tracking | ADR-0037 follow-up — needs `last_active_at` on tenant `members` schema |

---

## F.5 — Closeout (DONE — rolled into F.4 wrap)

F.5 was scoped as "ADRs + runbook" in the original Plan F doc. ADRs 0027-0036 + runbook sections have been authored inline with each phase, so F.5 is effectively rolled into F.4's wrap commit.

### ADR index for Plan F

| ADR | Title | Author |
|---|---|---|
| 0027 | Plan F scope — platform-admin only | F.1 |
| 0028 | Tenant notes as soft-state, append-only audit | F.1 |
| 0029 | Tenant tags as dedicated table (not jsonb) | F.1 |
| 0030 | Tenant health-score formula | F.1.5 |
| 0031 | Revenue rollup approach (live + cohort retention) | F.2 |
| 0032 | Comms templates + bulk fan-out | F.2.5 |
| 0033 | Billing reads: Stripe live (vs local mirror) | F.3-A |
| 0034 | Tier change proration + coupon mechanism | F.3.5 |
| 0035 | Migrations surface is read-only | F.4 |
| 0036 | Cross-tenant reads from platform-admin procs | F.4 |

### Plan F final commit list

- F.1: 4 commits (N, T, S, docs)
- F.1.5: 4 commits (H, R, M, docs)
- F.2: 3 commits (P, V, docs)
- F.2.5: 3 commits (C, B, docs)
- F.3-A: 2 commits (I, docs)
- F.3.5: 4 commits (T2, C2, G, docs)
- F.4: 8 commits (Re, He, Wh, Mi, Mb, Ff, tsc cleanup, docs)

Plus 5 stacked PRs (#10, #12-16) + 1 cleanup PR (this F.4 PR) representing the full Plan F surface area: discovery → segmentation → revenue → billing depth → operational depth.

Sections to be filled as phases land via subsequent `/ship` runs.

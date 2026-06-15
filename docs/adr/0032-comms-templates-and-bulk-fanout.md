# ADR 0032 — Comms Templates as Table + Bulk Fan-Out

Date: 2026-05-17
Status: Accepted

## Context

Plan F.2.5 ships `/comms` outbox + template library + bulk
DM/announcement composer. Three intertwined decisions:

1. **Template storage** — dedicated table vs. hardcoded constants vs.
   jsonb config?
2. **Bulk fan-out shape** — one audit row per call vs. per target?
3. **Action-string consistency** — bulk and single sends use the
   same audit action strings, or distinct ones?

## Decision

### 1. Templates: dedicated `comms_templates` table

```sql
CREATE TABLE comms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body_markdown text NOT NULL,
  kind text NOT NULL,                 -- 'direct_message' | 'announcement'
  priority text,                       -- nullable, only meaningful for announcements
  target_audience text,                -- nullable, only meaningful for announcements
  created_by_user_id text NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  archived_at timestamp                -- soft-delete
);
```

**Why a table:**
- Templates need to be **searchable** by name + filterable by kind in
  the composer picker — `jsonb` on a config row doesn't index that
  well.
- Templates **evolve**: ops will iterate on subject lines + bodies
  weekly. A table gives them update + edit-history naturally (via
  `updated_at`); hardcoded constants force a redeploy per tweak.
- Templates carry **per-template metadata** (priority for
  announcements, target audience, kind). Easy as columns; awkward as
  jsonb keys.
- Soft-delete (`archived_at`) lets ops retire a template without
  breaking outbox history that references it via `metadata.templateId`
  in audit rows.
- No volume concern: typical org has 5-50 templates, never thousands.

**Why super_admin-only CRUD:**
- Templates are the literal words customers see. A junior support
  agent shouldn't unilaterally change "official" subject lines.
- Read (`listTemplates` / `getTemplate`) is open to any platform-admin
  role — the composer picker needs it.

### 2. Bulk fan-out: ONE audit row per target tenant

For `bulkSendDirectMessage({ organizationIds: [A, B, C], ... })`:
- 3 individual tenant DB writes (notifications)
- 3 individual Resend email calls
- **3 audit rows** in `admin_session_actions`, each with `targetOrgId`
  set to A, B, C respectively
- Returns `{ ok, succeeded, failed: [{ orgId, error }] }` — partial
  failure tolerated, audit only on success per target

**Why per target, not per call:**
- The outbox view filters by `targetOrgId`. A bulk send that wrote
  ONE audit row with `targetOrgId: null` would vanish from any
  per-tenant outbox filter — ops looking at "what did we send tenant
  X" would miss the bulk send.
- Per-target audit rows are **identical in shape** to single-send
  audit rows (see decision #3) — uniform outbox query, no
  union-of-two-shapes special-casing.
- Per-target rows give granular audit: "X bulk-sent at 14:32, Y bulk-
  sent at 14:32" is exactly the same shape as "X single-sent at 14:30
  by support-admin Y".

**Cost:** 100 targets = 100 audit rows for one bulk action. The
`admin_session_actions` table is already partitioned/indexed for high
write volume from the existing audit pattern. 100 rows is trivial.

### 3. Action strings: bulk + single share the SAME strings

Bulk DM writes audit rows with `action = 'tenant_dm'`. Single-tenant
DM does the same. The bulk send is distinguished only by
`metadata.kind: 'bulk_dm'`.

Similarly: `tenant_announcement_create` for both single + bulk;
`metadata.kind: 'bulk_announcement'` flags bulk.

**Why uniform strings:**
- The outbox view is a flat list — ops wants to see "all DMs sent in
  the last 7 days" without OR-ing two action strings.
- Filters in the outbox UI (kind dropdown) operate on `metadata.kind`
  if the user wants to drill into "bulk only" or "single only".
  Action string remains stable.
- Reports / dashboards downstream don't need to know about
  bulk-vs-single dichotomy — they just count "DMs sent".

**Caveat:** plan doc originally proposed `tenant.direct_message_sent`
+ `tenant.announcement_created` (dot-separated). Actual Plan E.5 code
used `tenant_dm` + `tenant_announcement_create` (underscore). Agent C
discovered this on first sight and locked the underscore variant as
source of truth (primary-source evidence trumps plan doc). Agent B
followed.

## Consequences

- New table (`comms_templates`, slot 0029, additive ALTER-style only).
- New top-level router `platformAdminComms` (outbox + templates) —
  NOT under `platformAdminTenants` (templates aren't tenant-scoped;
  outbox spans all tenants).
- Two new procs on EXISTING `platformAdminTenantsCommsRouter`
  (`bulkSendDirectMessage`, `bulkSendAnnouncement`). Kept on the
  existing router because they're per-target sends (still
  tenant-scoped per row).
- BulkCommsComposer modal extends Agent T's bulk-actions-bar pattern.
  Two new buttons ("Send DM", "Send announcement") visible only to
  super_admin.
- `Promise.allSettled` chunked at 10 concurrent per bulk call.
  Trades latency vs. resource pressure: 100 targets at chunk-size 10
  means 10 round-trips of ~1-2s each ≈ ~10-20s end-to-end. Acceptable
  for an explicit "send" action where ops sees a spinner.
- 100-row cap enforced by zod (`.max(100)`); HTTP 400 on overflow,
  same shape as Agent T's bulk procs.

## Alternatives considered

- **Templates as TS constants.** Rejected — see template-storage
  reasoning above.
- **Single audit row per bulk call with `targetOrgIds: uuid[]` in
  metadata.** Rejected: breaks per-tenant outbox filter; harder to
  do downstream analytics.
- **New action strings for bulk** (`tenant.bulk_dm_sent`, etc.).
  Rejected: forces outbox queries to OR two strings; metadata.kind
  is the cleaner discriminator.
- **Sequential fan-out (no concurrency).** Rejected: 100 sequential
  Resend calls = ~2 minutes. Chunked allSettled is 10× faster with
  minimal extra code.
- **Unlimited bulk size.** Rejected: same reasoning as ADR-0029
  (Agent T tags) — protects audit log + Resend rate limits.

## Open follow-ups

- **Markdown rendering**: templates store `body_markdown`, but v1
  composer + outbox show plain text. Add markdown render when a real
  customer email demands it.
- **Template variables** (e.g., `{{ orgName }}`): not in v1. When
  needed, add a `variables jsonb` column + render helper. Each call
  site to the proc interpolates per target tenant.
- **Scheduled sends**: bulk fan-out is immediate. Defer "send at X
  time" until F.4 (operational depth).
- **Bounce / undeliverable tracking**: Resend webhooks for bounce
  events already exist (see `processed_webhook_events` in Plan C);
  thread them into the outbox row as a delivery-status badge in
  F.2.6+.

# Announcements — Read receipts & acknowledgement tracking

## Problem

The Announcements admin UI shows `—` for **views**, **acknowledged count**, and **read rate**. The `requires_acknowledgement` boolean already exists on the announcement row (added in Tier 3) and the admin form can set it, but nothing actually records who has read or acknowledged an announcement.

## Why deferred

This is not just a column add — it requires:
- Two new tenant tables (views + acknowledgements)
- A member-facing API surface (`markRead`, `acknowledge`) — most of the current oRPC procedures are admin-only
- A member-facing UI to actually display announcements (currently they only show in the admin list)
- Backfill strategy for existing announcements
- Aggregate query patterns to avoid N+1 when listing announcements with counts

## Scope

### Schema (`packages/db/src/schema/tenant/announcements.ts`)

New tables:

```ts
// announcement_views
{
  announcementId: uuid (FK announcements.id)
  memberId: uuid (FK members.id)
  viewedAt: timestamp
  // unique (announcementId, memberId)
}

// announcement_acknowledgements
{
  announcementId: uuid (FK announcements.id)
  memberId: uuid (FK members.id)
  acknowledgedAt: timestamp
  // unique (announcementId, memberId)
}
```

Tenant migration (idempotent SQL + regenerate the bundle per `docs/TENANT_MIGRATION_WORKFLOW.md`).

### Services / API

`packages/services/src/announcements.service.ts`:
- `markAnnouncementViewed(tenantDb, { announcementId, memberId })` — UPSERT on the view table
- `acknowledgeAnnouncement(tenantDb, { announcementId, memberId })` — UPSERT on the ack table
- Extend `listAnnouncements` to LEFT JOIN aggregate counts: `viewsCount`, `acknowledgedCount`, plus audience-size denominator (members in scope) so `readRatePct` can be computed admin-side
- Compute `audienceSize` per row: count of `members` matching `targetAudience` + `scopedBranchIds`

`packages/api/src/routers/announcements.ts`:
- New mutations `markViewed` and `acknowledge` — both `protectedProcedure`, scoped to the calling member
- Existing `list` returns the new fields

### Frontend — admin

`apps/web/src/routes/_authenticated/dashboard/_layout/announcements/view.tsx`:
- Expanded row meta: replace the two `—` placeholders with real `viewsCount` / `acknowledgedCount` values
- Add a read-rate progress bar (`width: readRatePct%`) below the counts
- "Pending acks" callout in the audience rail when `requiresAcknowledgement && readRatePct < 100`

### Frontend — member

NEW page or surface (currently no member-facing announcements view exists):
- Most likely a banner/drawer on the member dashboard when there are unread/unacknowledged announcements
- An "Acknowledge" button per item when `requiresAcknowledgement`
- Auto-fires `markViewed` mutation on render via `useEffect`

## Out of scope

- Push notifications when an announcement is published
- Email digests of unread announcements
- Branch manager "reach reports" — handled by the Reports module (Tier 3A series already covers org-wide read-rate trends if/when desired)

## Acceptance criteria

- [ ] Admin can see real view + ack counts for every announcement
- [ ] Read rate progress bar matches `acknowledgedCount / audienceSize`
- [ ] A member visiting the platform when an unread announcement targets them auto-marks it viewed
- [ ] Member can click Acknowledge on a `requires_acknowledgement` announcement and the count increments on the admin side within one query refresh
- [ ] No N+1: listing 100 announcements should execute ≤2 SQL statements total
- [ ] Migration is idempotent (re-running on a partially-migrated tenant is safe)
- [ ] `bun verify:migrations` passes, `bun check-types` passes

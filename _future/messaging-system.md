# Internal messaging system

## Problem

The Customers page bulk action bar has a "Send message" button currently disabled. Multiple other pages would also benefit from sending targeted messages to members (announcements aside — those are broadcast-only and don't track per-recipient conversations).

There is currently NO messaging infrastructure in the codebase.

## Why deferred

This is a multi-week feature, not a stub. It needs:
- A thread/conversation model (1:1 admin↔member, plus broadcast threads)
- A message body model (text, attachments, possibly templates)
- Real-time delivery (websocket / SSE / push)
- A member-facing inbox UI
- An admin composer UI with template support
- Read receipts at message + thread level
- Search across thread history
- Notification fanout (email + in-app)
- Compliance (audit log, retention policy, opt-out per recipient)

Each of these is its own project. Even the "minimal viable bulk message" still requires schema + composer + member inbox + at least email-fallback delivery.

## Scope (V1 minimum viable)

### Schema (tenant DB)

```ts
// message_threads
{
  id: uuid
  organizationId: uuid
  kind: text                       // "direct" | "broadcast"
  subject: text | null
  createdBy: text                  // userId (control-panel)
  createdAt: timestamp
  lastMessageAt: timestamp
}

// message_thread_participants
{
  threadId: uuid (FK)
  memberId: uuid (FK members)      // customer-side participant
  unreadCount: int default 0
  lastReadAt: timestamp | null
  // unique (threadId, memberId)
}

// messages
{
  id: uuid
  threadId: uuid (FK)
  senderUserId: text               // null for system messages
  senderRole: text                 // "admin" | "member" | "system"
  body: text
  isSystemNote: boolean
  createdAt: timestamp
  // index on (threadId, createdAt)
}

// message_attachments  (optional in v1, table reserved)
{
  id: uuid
  messageId: uuid (FK)
  url: text                        // R2 signed URL
  filename: text
  sizeBytes: int
  mimeType: text
}
```

Tenant migration (idempotent + bundle regen).

### Backend

`packages/services/src/messaging.service.ts`:
- `createDirectThread(tenantDb, { memberId, subject, body, senderUserId })`
- `createBroadcastThread(tenantDb, { memberIds[], subject, body, senderUserId })` — bulk path for the customer page
- `replyToThread(tenantDb, { threadId, body, senderUserId, senderRole })`
- `markThreadRead(tenantDb, { threadId, memberId })`
- `listThreadsForMember(tenantDb, { memberId, cursor, limit })`
- `listThreadsForAdmin(tenantDb, { branchId?, cursor, limit })`

`packages/api/src/routers/messaging.ts`:
- Admin: `threads.list / get`, `messages.send`, `messages.bulkBroadcast`
- Member: `inbox.list`, `inbox.get`, `inbox.reply`, `inbox.markRead`

### Bulk customer-page integration

`packages/api/src/routers/messaging.ts` — `bulkBroadcast`:
- Input: `{ customerIds[], subject, body }`
- Creates one broadcast thread + N participants in a single transaction
- Returns `{ succeeded, failed, succeededCount, failedCount }`

`apps/web/src/components/pages/customers/registered-page.tsx`:
- Enable "Send message" button, open a `<Dialog>` with subject + body fields
- Submit via `client.messaging.bulkBroadcast`
- Toast with counts, invalidate cache

### Member-facing UI

NEW route `_authenticated/inbox/index.tsx`:
- Thread list with unread badges
- Click → thread view with message history + reply composer

This route does not exist yet — defining the member surface is itself a design decision.

### Delivery

V1: in-app only (thread updates via React Query polling every 30s — no realtime yet)
- Future: websocket subscription, email fallback, push notifications

## Out of scope (V1)

- Real-time delivery (polling is fine for V1)
- Attachments (table reserved, UI deferred)
- Message templates (just freeform body for V1)
- Search within threads
- Group threads (admin↔multiple members in one thread)
- Email notifications when a member is messaged
- Member opt-out preferences
- Retention / GDPR-style deletion

## Acceptance criteria (V1)

- [ ] Admin can select N customers on the customers page and send a single broadcast message
- [ ] Each selected customer gets a new thread participant row
- [ ] Member can see the thread in their inbox the next time they open it
- [ ] Member can reply; admin sees the reply via thread refresh
- [ ] `unreadCount` increments correctly on each side
- [ ] `markRead` zeroes the unread badge
- [ ] No N+1 on inbox list (≤2 queries for 50 threads)
- [ ] `bun verify:migrations` passes, `bun check-types` passes
- [ ] Estimated 2+ weeks of work end-to-end

## Recommendation

Build this last. Lower-priority pages (audit log, etc.) can replace placeholders without needing messaging. The current bulk-message disabled state is honest — users can see the feature is coming but not lied to about its existence.

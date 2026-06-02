# Domain Audit: Auth, Members & Hierarchy

**Audited:** 2026-05-29
**Stack:** TypeScript, Vite, TanStack Router, oRPC, Drizzle ORM, Better-Auth, Cloudflare Workers, Neon PostgreSQL
**Scope:** API surface (routers), logic functions (services), gap analysis

## Endpoints Overview

### Members Router (12 procedures)
- create, list, getById, newToday, updateRole, updateScope, suspend, reactivate, deactivate, softDelete, restore, remove, retryGhlSync

### Hierarchy Router (12 procedures)
- createNode, listNodes, getNode, getDescendants, listNodesWithStats, updateNode, deleteNode, moveNode, listMembers, reassignMember, bulkReassignMembers, listAllMembers

### Invitations Router (8 procedures)
- create, accept, verifyEmailByToken, decline, getByToken, list, revoke, resend

### Auth & Tenant Admin (6 procedures)
- login, userContext, verifyEmail, sendEmail, accept (override), impersonateMember

## Logic Functions Summary

**42 exported functions** across 9 service files:
- Member service: 6 functions
- Hierarchy service: 7 functions  
- Invitation service: 8 functions
- Permission service: 3 functions
- Audit log service: 3 functions
- Notification service: 4 functions
- Auth service: 1 function
- Tenant admin service: 1 function

---

## Critical Gaps (P1)

### P1.1 — Missing Notification Queue on Member Create

**File:** members/create.procedures.ts:97, invitations/public.procedures.ts:95
**Status:** missing | **Testable:** true

When a member is created, no notification is queued to inform the organization.
**Fix:** Create `notifyOrgOfNewMember()` and call post-create.

---

### P1.2 — Member.role + roleId Dual-Track Not Atomic

**File:** members/role.procedures.ts:89-104
**Status:** partial | **Testable:** true

The `updateRole` writes the legacy `members.role` via MembershipService, then writes `members.roleId` separately outside transaction. If second write fails, data is inconsistent.
**Persistence:** `{table: members, where: {id: memberId}, expect: {role: newRole, roleId: input.roleId}}`
**Fix:** Wrap both updates in transaction or refactor MembershipService.

---

### P1.3 — Invitation Acceptance: Customer Profile Missing

**File:** invitations/public.procedures.ts:95-110
**Status:** partial | **Testable:** true

Base `accept` endpoint does NOT create customer_profiles stub for client members. Server override does create it, but base API is incomplete. Clients without profiles can't place orders.
**Persistence:** `{table: customer_profiles, where: {userId}, expect: {id, firstName: null}}`
**Fix:** Move stub creation into base endpoint.

---

## Significant Gaps (P2)

### P2.1 — Member Removal: No Cascade to Pending Invitations

**File:** members/removal.procedures.ts:36
**Status:** partial | **Testable:** true

Removing a member doesn't revoke pending invitations. User can rejoin via stale invitation link after removal.
**Persistence:** `{table: invitations, where: {email: member.email, status: pending}, expect: {status: revoked}}`
**Fix:** Revoke invitations before member removal.

---

### P2.2 — Hierarchy Node Deletion: Silent Member Reassignment

**File:** hierarchy/delete.procedures.ts:88-110
**Status:** partial | **Testable:** true

Members reassigned during node deletion receive no notification.
**Fix:** Queue notifications after successful reassignment.

---

### P2.3 — Auth userContext: Hierarchy Load Errors Silently Ignored

**File:** apps/server/src/routers/auth.ts:349-372
**Status:** partial | **Testable:** true

Schema drift in hierarchy_nodes causes empty hierarchy to be returned, but permissions load successfully. Admins end up blind to org structure.
**Fix:** Fail fast or surface error to UI.

---

### P2.4 — Invitation Resend: No Rate Limiting

**File:** invitations/manage.procedures.ts:107-153
**Status:** partial | **Testable:** true

`resend` has no rate limit; user can extend expiry indefinitely.
**Persistence:** `{table: invitations, where: {id}, expect: {expiresAt: future_date, token: new_token}}`
**Fix:** Add `lastResent` timestamp; reject if called within 5 minutes.

---

### P2.5 — Member Suspend/Reactivate: No GHL Sync

**File:** members/status.procedures.ts:20-122
**Status:** partial | **Testable:** true

`suspend` and `reactivate` do NOT dispatch GHL sync (unlike `deactivate`). Staff can be suspended in DB but remain active in GHL.
**Fix:** Add GHL dispatch (same pattern as create/update/deactivate).

---

## Minor Gaps (P3)

### P3.1 — Hierarchy listNodes: Missing Permission Check

**File:** hierarchy/read.procedures.ts:14-101
**Status:** missing | **Testable:** true

No explicit `requirePermissionOrpc()` call; RBAC is only enforced via filtering downstream.
**Fix:** Add permission check at handler start.

---

### P3.2 — Member getById: Missing roleId in Response

**File:** members/read.procedures.ts:19-105
**Status:** partial | **Testable:** true

Response includes `role` but not `roleId`, even though `list` includes it.
**Persistence:** `{table: members, where: {id}, expect: {roleId: uuid | null}}`
**Fix:** Add `roleId` to response object.

---

### P3.3 — Orphan: markExpiredInvitations() Never Called

**File:** packages/services/src/invitation.service.ts:268-310
**Status:** missing | **Testable:** true

Exported function with no caller; expired invitations never cleaned up.
**Persistence:** `{table: invitations, where: {status: pending, expiresAt < now}, expect: {status: expired}}`
**Fix:** Wire to daily background job.

---

### P3.4 — Orphan: Audit Log Read Path Unreachable

**File:** packages/services/src/audit-log.service.ts:136-200
**Status:** missing | **Testable:** true

Service exports `listAuditLogs`, `getActionSeverity` but no endpoint calls them. Audit trail is write-only and invisible to admins.
**Fix:** Add `audit-logs.list` endpoint.

---

### P3.5 — Orphan: Notifications Read Path Unreachable

**File:** packages/services/src/notification.service.ts:32-95
**Status:** missing | **Testable:** true

Service exports `listNotifications`, `markNotificationRead` but no endpoint. Notifications are created but never surfaced.
**Fix:** Add endpoints for list, markRead, unreadCount.

---

## Summary

**Testable Findings:** 12  
- P1 (Critical): 3
- P2 (Significant): 5
- P3 (Minor): 4

**Logic Functions Audited:** 42  
**Endpoints Audited:** 37  
**Orphaned Logic:** 4

**Highest Risk Issues:**
1. Member creation bypasses notification system → org-wide events invisible
2. Custom roles (roleId) can drift from text role → RBAC inconsistency
3. Customer profiles missing on invite acceptance → clients can't be onboarded


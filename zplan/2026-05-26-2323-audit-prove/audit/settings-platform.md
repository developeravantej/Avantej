# settings-platform Domain Audit

**Date:** 2026-05-26  
**Scope:** API surface + backing logic (read-only analysis)

## Summary

**Total Gaps:** 11 | **Testable:** 6  
**P1 (Blocking):** 3 | **P2 (High):** 5 | **P3 (Medium):** 3

### Top 3 Risks (P1):
1. Notifications never delivered (no email/SMS/push dispatcher)
2. Scheduled reports never execute (cron handler not wired)
3. Announcements not pushed (scope logic OK, delivery missing)

---

## P1 Gaps (Blocking)

### P1a — Notifications Never Delivered
**File:** packages/api/src/routers/notifications.ts  
**Status:** partial | **Testable:** false

The notifications table is written but router only reads/marks. No dispatcher sends email/SMS/push.

- Gap: No email queue, SMS provider, or push service integration
- Impact: Admin sees notifications in UI but users never receive them
- Fix: Implement notification dispatcher; enqueue on creation

### P1b — Scheduled Reports: Cron Not Wired
**File:** packages/services/src/scheduled-reports.service.ts (lines 101-117)  
**Status:** partial | **Testable:** false

listDueScheduledReports() defined but no cron handler calls it.

- Gap: No report generation; no email dispatch
- Impact: Scheduled reports never execute
- Fix: Wire cron handler in apps/server; implement PDF/CSV export; send email

### P1c — Announcements: Scopes Created but Not Delivered
**File:** packages/api/src/routers/announcements.ts (lines 88-102)  
**Status:** partial | **Testable:** true

Announcement_scopes M-to-M created but no notification dispatch. requiresAcknowledgement never enforced.

- Persistence: announcements, announcement_scopes tables written
- Gap: No dispatch to members in scopes; no ack tracking
- Impact: Announcements stored but never reach users
- Fix: Trigger notification dispatcher; implement announcement_acknowledgements table

---

## P2 Gaps (High Priority)

### P2a — Org Settings: No Key Validation
**File:** packages/api/src/routers/organization-settings.ts  
**Status:** partial | **Testable:** true

Key-value store accepts any string key; no enum, no validation.

- Gap: Typos in setting keys; no schema
- Fix: Define enum of valid keys; add type coercion

### P2b — Analytics KPIs: Formulas Not Documented
**File:** packages/services/src/analytics.service.ts  
**Status:** partial | **Testable:** true

churnRatePct, avgLtvCents, classFillRatePct computed but formulas not documented; no unit tests.

- Gap: Edge cases (zero members, leap years) not tested
- Fix: Document formulas; add unit tests

### P2c — Member Reassignment: No Target Scope Validation
**File:** packages/api/src/routers/hierarchy/members.procedures.ts (lines 91-96)  
**Status:** partial | **Testable:** true

Reassign accepts any newHierarchyScopeId without validating target is peer/ancestor.

- Persistence: members table, where={id}, expect={hierarchyScopeId}
- Gap: RBAC bypass possible
- Fix: Validate target scope hierarchy

### P2d — Role Permissions: No Bulk / No Audit
**File:** packages/api/src/routers/role-permissions.ts  
**Status:** missing | **Testable:** true

add/remove one-at-a-time; no audit_log on permission changes.

- Gap: 50-permission role needs 50 calls; no accountability
- Fix: Add bulkAddPermissions; wire audit-log hook

### P2e — Branch Invites: Max-Uses Not Atomic
**File:** packages/services/src/onboarding.service.ts  
**Status:** partial | **Testable:** false

usesCount can exceed maxUses under concurrent redeems.

- Gap: No SELECT FOR UPDATE; transaction isolation unclear
- Fix: Serialize concurrent redeems with SELECT FOR UPDATE

---

## P3 Gaps (Medium Priority)

### P3a — Announcements: Ack Never Tracked
**File:** packages/api/src/routers/announcements.ts (line 75)  
**Status:** missing | **Testable:** false

requiresAcknowledgement flag never tracked or enforced.

- Gap: No announcement_acknowledgements table
- Fix: Implement ack tracking table + endpoints

### P3b — Org Settings: No Audit Trail
**File:** packages/api/src/routers/organization-settings.ts (line 29)  
**Status:** partial | **Testable:** true

upsertSetting stores updatedBy but no audit_log entry.

- Gap: No audit trail for settings changes
- Fix: Wire audit-log entry on upsert

### P3c — Hierarchy: Branch Details Not Validated
**File:** packages/api/src/routers/hierarchy/read.procedures.ts (line 103-108)  
**Status:** partial | **Testable:** true

If branchDetails row missing, address/picUserId silently null.

- Gap: Data inconsistency not detected
- Fix: Add NOT NULL constraint or ensure atomic write

---

## Testable Issues (6)

1. Announcements delivery missing (scopes created, not pushed)
2. Org settings validation (no key enum)
3. Analytics KPI formulas (churn, LTV, fill rate)
4. Member reassignment scope validation
5. Role permission audit logging
6. Hierarchy branch details validation

---

## Endpoints Summary (by file)

**roles.ts:** list, create, update, delete  
**role-permissions.ts:** list, add, remove  
**permissions.ts:** list  
**announcements.ts:** list, listActive, create, update, delete  
**notifications.ts:** list, getUnreadCount, markRead, markAllRead  
**notification-preferences.ts:** get, update  
**audit-logs.ts:** list, exportCsv  
**organization-settings.ts:** get, upsert  
**analytics.ts:** getDashboardKpis + 6 series endpoints  
**scheduled-reports.ts:** list, create, delete, toggle  
**onboarding.ts:** getInviteContext, redeemInvite  
**registration.ts:** listCountries, listBranches, complete  
**branch-invites.ts:** create, listAll, list, revoke, regenerate  
**hierarchy/*.ts:** createNode, listNodes, getNode, getDescendants, listNodesWithStats, updateNode, deleteNode, moveNode, listMembers, reassignMember, bulkReassignMembers, listAllMembers


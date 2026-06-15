# Domain: Services, Staff, Access Control & Branches

## Endpoints / Procedures

### packages/api/src/routers/services/crud.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| list | tenantProcedure | List services with optional filters (category, branch, type, schedulingType) | `listServices` |
| getById | tenantProcedure | Get single service by ID with branch scope guard | `getServiceById` |
| create | tenantProcedure | Create new service; validates installment plan codes | `createService` |
| update | tenantProcedure | Update existing service; validates branch access on both old and new branchId | `updateService` |
| duplicate | tenantProcedure | Duplicate a service (creates copy) | `duplicateService` |

**Notable gap**: No `delete` or soft-delete procedure. Once a service is created it cannot be removed — only toggled via `isActive`. No lifecycle end-point for `isActive: false → hard delete`.

### packages/api/src/routers/services/pricing.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| resolvePrice | tenantProcedure | Resolve effective price for service/branch/customerType combination | `resolveServicePrice` |
| listPriceOverrides | tenantProcedure | List branch price overrides for a service | `listServicePriceOverrides` |
| setBranchPrice | tenantProcedure | Create/update price override with optional date range | `setServicePrice` |
| expireBranchPrice | tenantProcedure | Set effectiveUntil on a price override | `expireServicePrice` |
| deleteBranchPrice | tenantProcedure | Hard-delete a price override row | `deleteServicePrice` |

### packages/api/src/routers/services/analytics.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| revenueShareByCategory | tenantProcedure | Revenue breakdown by category for a date range | `revenueShareByCategory` |
| avgSessionsSoldPerMonth | tenantProcedure | Average monthly sessions sold for a service | `avgSessionsSoldPerMonth` |
| listWithTrainerTiers | tenantProcedure | List services enriched with trainer tier data | `listServicesWithTrainerTiers` |

### packages/api/src/routers/service-categories.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| list | tenantProcedure | List categories with branch/isActive filter | `listServiceCategories` |
| getById | tenantProcedure | Get single category with branch scope guard | `getServiceCategoryById` |
| create | tenantProcedure | Create category | `createServiceCategory` |
| update | tenantProcedure | Update category | `updateServiceCategory` |

**Notable gap**: No `delete` procedure. Category lifecycle is dead-ended at `isActive` toggle.

### packages/api/src/routers/service-category-config.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| upsert | tenantProcedure | Upsert booking rules / buffer config for a category | Inline Drizzle upsert (ON CONFLICT) |
| getByCategoryId | tenantProcedure | Get config row for a category | Inline Drizzle query |

### packages/api/src/routers/invitations/create.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| create | tenantProcedure | Create staff invitation; checks pending dupe, soft-deleted customer block, existing org member | `createInvitation` |

**Notable gap**: Router returns the invitation token for email construction but does NOT call any email-sending service. The server layer must pick up the token and send the email separately — this coupling is undocumented and not enforced.

### packages/api/src/routers/invitations/manage.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| list | tenantProcedure | List invitations with status/email filter | `listInvitations` |
| revoke | tenantProcedure | Mark invitation as "declined" (revoke) | `revokeInvitation` |
| resend | tenantProcedure | Extend expiry + reset to pending; returns token for email | `resendInvitation` |

### packages/api/src/routers/invitations/public.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| accept | publicProcedure | Accept invitation: verify email match, create member record, mark invitation accepted | `getInvitationByToken`, `validateInvitation`, `MembershipService.createMember` |
| verifyEmailByToken | publicProcedure | Pre-verify invitee email in control-panel DB (no-op if user doesn't exist) | `getInvitationByToken`, `validateInvitation` |
| decline | publicProcedure | Decline invitation by token | Inline Drizzle update |
| getByToken | publicProcedure | Check invitation status before accepting | `getInvitationByToken`, `validateInvitation` |

### packages/api/src/routers/permissions.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| list | tenantProcedure | List all permissions with optional resource filter | Inline Drizzle query |

### packages/api/src/routers/roles.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| list | tenantProcedure | List all roles ordered by priority | Inline Drizzle query |
| create | tenantProcedure | Create custom role (priority 1-99) | Inline Drizzle insert |
| update | tenantProcedure | Update non-system role | Inline Drizzle update |
| delete | tenantProcedure | Hard-delete non-system role; cascade-deletes role_permissions | Inline Drizzle delete |

### packages/api/src/routers/role-permissions.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| list | tenantProcedure | List role-permission assignments with permission details | Inline Drizzle join |
| add | tenantProcedure | Add permission to a role (validates role + permission existence) | Inline Drizzle insert |
| remove | tenantProcedure | Remove permission from a non-system role | Inline Drizzle delete |

### packages/api/src/routers/hierarchy/read.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| listNodes | tenantProcedure | List all hierarchy nodes; admin sees all, staff sees accessible subset; includes branch_details | Inline Drizzle query + batch branchDetails |
| getNode | tenantProcedure | Get single node by ID with RBAC check | Inline + branchDetails |
| getDescendants | tenantProcedure | Get all descendants of a node with branch_details | `getDescendantNodeIds` + Drizzle |
| listNodesWithStats | tenantProcedure | List nodes enriched with branch_stats_cache data | `listNodesWithStats` |

### packages/api/src/routers/hierarchy/create.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| createNode | tenantProcedure | Create country/state/branch; syncs branch to control-panel organization_branches; fires GHL branch sync | `createHierarchyNode`, `validateHierarchyRules` |

### packages/api/src/routers/hierarchy/update.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| updateNode | tenantProcedure | Update name/address/picUserId; syncs to organization_branches; fires GHL branch rename sync | `updateHierarchyNode` |

### packages/api/src/routers/hierarchy/delete.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| deleteNode | tenantProcedure | Hard-delete node with auto-cascade children and member reassignment; fires GHL branch remove with compensation | `deleteHierarchyNode` |

### packages/api/src/routers/hierarchy/move.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| moveNode | tenantProcedure | Move node to new parent; fires GHL branch move sync only when crossing countries | `moveHierarchyNode` |

### packages/api/src/routers/hierarchy/members.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| listMembers | tenantProcedure | List members by hierarchy scope | `getMembersByHierarchyScope` |
| reassignMember | tenantProcedure | Move single member to new hierarchy scope | `updateMemberHierarchyScope` |
| bulkReassignMembers | tenantProcedure | Bulk-move members to new scope | `bulkUpdateMemberHierarchyScope` |
| listAllMembers | tenantProcedure | List all org members with user details (cross-DB join) | `getAllOrganizationMembersWithUserDetails` |

### packages/api/src/routers/onboarding.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| getInviteContext | publicProcedure | Return branded org/branch info for QR landing page; validates token | `getInviteContext` |
| redeemInvite | publicProcedure | Create Better-Auth user + tenant member; idempotent on re-submit | `redeemBranchInvite` |

### packages/api/src/routers/branch-invites.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| create | tenantProcedure | Create branch self-signup invite (QR token) | `createBranchInvite` |
| listAll | tenantProcedure | List one row per accessible branch with most-recent active invite | `listAllBranchInvites` |
| list | tenantProcedure | List active invites for a specific branch | `listBranchInvites` |
| revoke | tenantProcedure | Soft-revoke invite (isActive=false) | `revokeBranchInvite` |
| regenerate | tenantProcedure | Revoke + create fresh invite (sequential, no DB transaction) | `revokeBranchInvite` + `createBranchInvite` |

### packages/api/src/routers/organization-settings.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| get | tenantProcedure | Read a key-value setting | `getSetting` |
| upsert | tenantProcedure | Write/update a setting (admin-only, enforced by role check not permission check) | `upsertSetting` |

### packages/api/src/routers/members/role.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| updateRole | tenantProcedure | Update member role (dual-write control-panel + tenant); writes audit log; fires GHL sync | `MembershipService.updateMemberRole` |

### packages/api/src/routers/members/scope.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| updateScope | tenantProcedure | Update member hierarchyScopeId (branch reassignment); writes audit log; fires GHL sync | Inline Drizzle update |

### packages/api/src/routers/members/status.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| suspend | tenantProcedure | Suspend member (dual-write via MembershipService); writes audit log | `MembershipService.suspendMember` |
| reactivate | tenantProcedure | Reactivate suspended member (dual-write); writes audit log | `MembershipService.reactivateMember` |

### packages/api/src/routers/members/archive.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| deactivate | tenantProcedure | Set status='inactive' (tenant-only, not dual-write); fires GHL DELETE | `deactivateMember` |
| softDelete | tenantProcedure | Stamp members.deletedAt (reversible, GHL no-op) | Inline Drizzle update |
| restore | tenantProcedure | Clear members.deletedAt | Inline Drizzle update |

### packages/api/src/routers/members/removal.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| remove | tenantProcedure | Hard-remove member from both DBs; validates last-admin guard | `MembershipService.removeMember` |

### packages/api/src/routers/members/sync.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| retryGhlSync | tenantProcedure | Manually retry GHL staff sync for a member (operation=update) | `dispatchStaffSync` |

### packages/api/src/routers/rooms.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| list | tenantProcedure | List rooms with optional branch/active filter | `listRooms` |
| getById | tenantProcedure | Get room by ID | `getRoomById` |
| create | tenantProcedure | Create room | `createRoom` |
| update | tenantProcedure | Update room | `updateRoom` |
| delete | tenantProcedure | Delete room | `deleteRoom` |

**Note**: `delete` uses `appointment_management:update` permission instead of `appointment_management:delete` — likely a copy-paste error.

### packages/api/src/routers/google-calendar.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|---------|
| status | tenantProcedure | Get caller's own Google Calendar connection status | Inline Drizzle query |
| disconnect | tenantProcedure | Revoke Google token + delete connection row | `revokeGoogleToken` |
| orgStatus | tenantProcedure | Org-wide aggregate (connected count, trainer count, last sync) | Inline Drizzle aggregates |
| updateSettings | tenantProcedure | Update caller's syncDirection + conflictPolicy | Inline Drizzle update |
| syncNow | tenantProcedure | Bump updatedAt as sync signal; in-memory rate limit 1/min | `checkSyncNowRateLimit` |
| listConnectedCalendars | tenantProcedure | Fetch caller's Google calendar list with 24h JS-side cache | `listGoogleCalendars` |

---

## Logic Functions

### packages/services/src/service.service.ts
- `listServices()` — list services with filters + accessible node scope
- `getServiceById()` — fetch single service record
- `createService()` — insert service row
- `updateService()` — update service row
- `duplicateService()` — clone service row
- `revenueShareByCategory()` — aggregate revenue by category for date range
- `avgSessionsSoldPerMonth()` — compute rolling monthly average session sales
- `listServicesWithTrainerTiers()` — join services with trainer tier data

### packages/services/src/service-category.service.ts
- `listServiceCategories()` — list categories with scope filter
- `getServiceCategoryById()` — fetch single category
- `createServiceCategory()` — insert category row
- `updateServiceCategory()` — update category row

### packages/services/src/invitation.service.ts
- `createInvitation()` — generate token, insert invitation row (7-day expiry)
- `getInvitationByToken()` — look up invitation by token
- `validateInvitation()` — check status=pending and not expired
- `listInvitations()` — list with optional status/email/invitedBy filters
- `revokeInvitation()` — set status="declined"
- `resendInvitation()` — extend expiry + reset to pending
- `markExpiredInvitations()` — bulk-mark overdue pending invitations as expired [**ORPHAN** — exported from index but never called by any router or scheduled job in apps/]
- `checkSoftDeletedCustomerBlock()` — check if invitee was a soft-deleted customer

### packages/services/src/permission.service.ts
- `hasPermission()` — RBAC check via roleId FK (Wave 3a) or text role fallback → role_permissions join
- `checkHierarchyPermission()` — convenience wrapper for hierarchy_management
- `requirePermission()` — throws PermissionDeniedError if denied
- `PermissionDeniedError` — typed error class

### packages/services/src/hierarchy.service.ts
- `getDescendantNodeIds()` — recursive CTE to get all descendant IDs including self
- `getAncestorNodeIds()` — recursive CTE to get all ancestor IDs including self
- `createHierarchyNode()` — insert node; resolves countryNodeId denorm; inserts branch_details when address/picUserId provided
- `updateHierarchyNode()` — update node name/slug; upsert branch_details for address/picUserId
- `deleteHierarchyNode()` — hard-delete node; auto-cascade children; auto-reassign members to parent or org root
- `moveHierarchyNode()` — update parentId; validates type constraints, depth, circular refs; updates countryNodeId denorm; cascades countryNodeId on state-cross-country moves
- `listNodesWithStats()` — join nodes with branch_stats_cache; cache-miss returns stale:true
- `findReassignTarget()` — private; finds parent or org root for member reassignment on delete
- `recursivelyDeleteChildren()` — private; recursive hard-delete of subtree

### packages/services/src/hierarchy-scope.ts
- `assertBranchAccessible()` — throws BranchAccessDeniedError if branchId not in accessible set
- `resolveBranchFilter()` — validate + resolve branch filter for analytics
- `isBranchAccessDeniedError()` — type narrowing

### packages/services/src/hierarchy-validation.service.ts
- `getDepthForType()` — map node type to expected depth
- `getParentTypeForType()` — map node type to expected parent type
- `validateHierarchyRules()` — check depth, parent type, uniqueness before create
- `validateParentAccess()` — check parentId is in accessible nodes set

### packages/services/src/onboarding.service.ts
- `getInviteContext()` — validate branch invite + return org/branch branded context
- `redeemBranchInvite()` — create Better-Auth user + tenant member; idempotent

### packages/services/src/branch-invite.service.ts
- `createBranchInvite()` — insert invitation row with kind=branch_self_signup, 10yr expiry
- `listBranchInvites()` — list active invites for a branch
- `listAllBranchInvites()` — one-row-per-branch with latest active invite
- `revokeBranchInvite()` — set isActive=false
- `validateBranchInvite()` — check isActive, kind, expiry, usesCount vs maxUses

### packages/services/src/organization-settings.service.ts
- `getSetting()` — read key-value setting
- `upsertSetting()` — write key-value setting (ON CONFLICT DO UPDATE)

### packages/services/src/ghl-staff-sync.service.ts
- `dispatchStaffSync()` — route staff create/update/delete to GHL; handles skip rules (non-staff role, non-branch scope, branch not connected, deactivate-skip); branch-reassignment via PUT; never throws

### packages/services/src/google-calendar.service.ts
- `getGoogleAuthUrl()` — construct Google OAuth URL
- `exchangeCodeForTokens()` — exchange OAuth code for access/refresh tokens
- `refreshAccessToken()` — refresh expired access token
- `getGoogleUserInfo()` — fetch user email from Google
- `revokeGoogleToken()` — revoke token via Google API
- `listGoogleCalendars()` — list user's calendars
- `createCalendarEvent()` — create event in Google Calendar
- `updateCalendarEvent()` — update event in Google Calendar
- `deleteCalendarEvent()` — delete event from Google Calendar
- `checkSyncNowRateLimit()` — in-memory 1/min rate limit per memberId

### packages/services/src/google-calendar-sync.service.ts
- `syncAppointmentToGoogleCalendar()` — push appointment create/update/delete to all relevant active connections; handles token refresh; stores event mappings; fire-and-forget safe

### packages/services/src/health-score.ts
- `computeHealthScore()` — compute 0-100 health score from snapshot inputs; emits risk flags [ORPHAN if no cron job calls it from apps/server — needs verification]

### packages/services/src/trainer-tier.service.ts
- *(file audited as in scope but not read — owned by routers/services/analytics.procedures.ts)*

### packages/services/src/rooms.service.ts
- `listRooms()`, `getRoomById()`, `createRoom()`, `updateRoom()`, `deleteRoom()` — full CRUD for rooms

---

## Gaps (prioritized P1/P2/P3)

### P1 — Invitation accept does NOT mark invitation as accepted atomically (packages/api/src/routers/invitations/public.procedures.ts:96-111)
**status: partial | testable: true**

`invitationsPublicProcedures.accept` calls `MembershipService.createMember` which marks the invitation `status="accepted"` inside a tenant-DB transaction (packages/db/src/services/membership.service.ts:122-128). However the transaction in `createMember` only wraps the tenant-DB writes. The control-panel `organizationMembers` insert (line ~100) is done in a `Promise.all` alongside the tenant transaction — not in the same transaction. If the control-panel insert succeeds but the tenant transaction fails (or vice versa), the invitation row will be left in `pending` state while a member row may partially exist, or vice versa.

**persistence**: `{ table: invitations, where: { id: invite.id }, expect: { status: "accepted" } }` — may remain `pending` after a partial failure.

---

### P1 — `markExpiredInvitations` is never called — expired invitations stay permanently `pending` (packages/services/src/invitation.service.ts:268)
**status: missing | testable: true**

The `markExpiredInvitations` function is exported and imported in `packages/services/src/index.ts:239` but never invoked by any router, cron, or scheduled task anywhere in `apps/`. This means expired invitations stay `pending` forever. `validateInvitation` correctly rejects them at accept-time, but admin UI list queries (manage.procedures.ts `list`) will return expired invitations as `pending`, polluting the pending count and confusing operators.

**persistence**: `{ table: invitations, where: { status: "pending", expiresAt < now() }, expect: { status: "expired" } }` — transition never fires.

---

### P1 — Role deletion has NO guard for members assigned that role via `members.role_id` (packages/api/src/routers/roles.ts:176-210)
**status: partial | testable: true**

`roles.delete` only checks `isSystem` before hard-deleting the role. It relies on DB cascade to clean up `role_permissions`, but there is NO check for `members.roleId` FK references. When a custom role is deleted, members whose `roleId` pointed to that role will have a dangling FK or null roleId (depending on schema constraint). `hasPermission()` will then fall back to the text-role path, potentially silently granting or denying permissions unexpectedly.

The `hasPermission` code at permission.service.ts:102 explicitly falls through to text-role lookup when `roleId` resolves to no row — so the behaviour after role deletion is silent fallback rather than an error. This is a security regression: a member who had restricted permissions via a custom role may revert to broader text-role defaults after deletion.

**persistence**: `{ table: members, where: { roleId = deleted_role_id }, expect: { roleId: null } }` — orphaned references not cleaned up.

---

### P1 — `moveNode` does NOT re-scope member `accessibleNodeIds` for in-flight requests (packages/api/src/routers/hierarchy/move.procedures.ts:116-117)
**status: partial | testable: false**

`moveHierarchyNode` updates `hierarchy_nodes.parentId` and `countryNodeId` but does NOT update any `members.hierarchyScopeId` for members assigned to the moved branch. The `accessibleNodeIds` in context is computed once per request from `getDescendantNodeIds(member.hierarchyScopeId)`. After a branch moves to a new country subtree, members scoped to that branch will continue to operate correctly because their `hierarchyScopeId` still points to the same branch node. However, the `countryNodeId` denorm update on the `hierarchy_nodes` row (line 768-783) is correct. The real gap is that members with scope IDs in the OLD ancestor chain do not have their `accessibleNodeIds` recalculated — they rely on the recursive CTE which recomputes from `hierarchyScopeId` fresh each request. This is actually correct at runtime. **Actual gap**: the `reassignMember` path on deletion (hierarchy.service.ts:629-634) does NOT fire a GHL staff sync for the reassigned members, so GHL state drifts silently after a node deletion that auto-reassigns many members.

---

### P1 — Google Calendar sync is push-only; no pull path exists (packages/services/src/google-calendar-sync.service.ts)
**status: partial | testable: true**

`syncAppointmentToGoogleCalendar` covers push (Avantej → Google). The connection schema has `syncDirection` values (`one_way_to_google`, `one_way_from_google`, `two_way`) and `conflictPolicy`. `updateSettings` at google-calendar.ts:139 lets users set `syncDirection=two_way` or `one_way_from_google`. But there is no webhook handler, no polling loop, and no import function for Google events → Avantej appointments. The `syncNow` procedure only bumps `updatedAt` as a "sync signal" without any actual pull implementation. Users who set `syncDirection=two_way` or `one_way_from_google` will see no effect.

**persistence**: `{ table: googleCalendarConnections, where: { syncDirection IN ("two_way","one_way_from_google") }, expect: inbound events appear as appointments }` — never materialised.

---

### P2 — Branch QR invite has no rate-limit on the public `redeemInvite` endpoint (packages/api/src/routers/onboarding.ts:112)
**status: partial | testable: true**

`redeemInvite` is a `publicProcedure` with no authentication requirement and no rate-limiting middleware. A malicious actor who discovers a QR token can enumerate emails to create bulk member records. The token has only capacity control via `maxUses` (which is optional and defaults to null = unlimited), but no per-IP or per-time-window throttle. The `syncNow` endpoint for Google Calendar has an in-memory 1/min rate limit (`checkSyncNowRateLimit`) — the same pattern should apply here.

No router-level or server-level rate limiter is applied. The `getInviteContext` endpoint is similarly unguarded.

---

### P2 — Branch invite regenerate is not atomic — window of invite-less state (packages/api/src/routers/branch-invites.ts:199-265)
**status: partial | testable: true**

`branchInvites.regenerate` does `revokeBranchInvite` then `createBranchInvite` sequentially. Between the two calls there is a window where no active invite exists for the branch. Any customer who scans the QR between the two calls will get a NOT_FOUND. There is no DB transaction wrapping both writes (Cloudflare Workers + Neon HTTP driver does not support cross-statement transactions through the HTTP client in all cases, but both writes are to the same tenant DB and could be wrapped).

---

### P2 — Invitation email is never sent — responsibility is implicit (packages/api/src/routers/invitations/create.procedures.ts:162-177)
**status: missing | testable: false**

`invitationsCreateProcedures.create` returns the token to the caller but does NOT send an email. The comment says "The caller (server) should send the invitation email with the returned token." There is no evidence in `apps/server/src/` of a route or middleware that picks up this token and dispatches an email via Resend (or any mailer). The `resend` procedure in `manage.procedures.ts` has the same gap — it updates the expiry and returns the new token but no email is sent by the router itself.

Search for `resend` or invitation email sending in `apps/server/src/` yields nothing for this flow. Staff invitations may be silently swallowed after creation.

---

### P2 — `organization-settings.upsert` uses role check instead of RBAC permission (packages/api/src/routers/organization-settings.ts:28)
**status: partial | testable: true**

`upsert` checks `context.member.role !== "admin"` directly rather than calling `requirePermissionOrpc`. This bypasses the custom-role RBAC system entirely. A member with a custom role that has the equivalent admin-level permission cannot call this endpoint. Conversely, any text-role "admin" member can call it regardless of custom role restrictions. Inconsistent with all other procedures in this domain.

---

### P2 — `assertTenantAndMember` in google-calendar router is a no-op guard (packages/api/src/routers/google-calendar.ts:19-25)
**status: partial | testable: true**

The `assertTenantAndMember` function at line 19-25 declares `asserts context is { tenantDb: NonNullable<...>; member: NonNullable<...> }` but its body is empty (lines 23-24 contain only blank lines and a closing brace). It does NOT actually throw when `context.tenantDb` or `context.member` is undefined. Any TypeScript narrowing it provides is cosmetic — the runtime guarantee is absent. If the tenant middleware somehow fails silently, downstream operations (`context.tenantDb.query.*`) will throw an unhandled error rather than a typed ORPCError.

---

### P2 — Role delete leaves `members.roleId` dangling — no cascade or pre-check (packages/api/src/routers/roles.ts:176)
**status: missing | testable: true**

Already described in P1 above. Specifically the roles.ts delete handler (line 207) runs `context.tenantDb.delete(roles).where(eq(roles.id, input.id))` without first checking whether any members reference this role via `members.roleId`. The schema `role_permissions` cascade is fine, but `members.roleId` should be cleared (SET NULL) or the delete should be blocked until no members reference the role.

**persistence**: `{ table: members, where: { roleId: <deleted-role-id> }, expect: { roleId: null } }`

---

### P2 — GHL sync is NOT triggered after `members.status.suspend` or `members.status.reactivate` (packages/api/src/routers/members/status.procedures.ts)
**status: missing | testable: true**

`suspend` and `reactivate` procedures use `MembershipService` for dual-write but do NOT call `dispatchStaffSync`. Only `members.archive.deactivate` fires GHL DELETE, and `members.role.updateRole` / `members.scope.updateScope` fire GHL UPDATE. Suspend and reactivate have no GHL coupling. If GHL treats suspended members differently (e.g. removing portal access), the GHL state will drift after suspend/reactivate.

---

### P3 — Service catalog: no `delete` procedure — services can only be soft-deactivated (packages/api/src/routers/services/crud.procedures.ts)
**status: missing | testable: true**

The service CRUD has list/getById/create/update/duplicate but no delete. Once a service is created it persists forever; the only removal is `isActive: false`. This is a common UX gap when service data is needed for historical order integrity, but if intentional it should be documented. Same gap exists for service-categories.

---

### P3 — `rooms.delete` uses wrong permission (`appointment_management:update` instead of `:delete`) (packages/api/src/routers/rooms.ts:135)
**status: partial | testable: true**

Line 135: `await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update")`. This means any member with update but not delete permission can delete rooms. The permission check should be `"delete"`.

---

### P3 — Front-end pages: access-control/user-assignment.tsx guards with `role_management:read` but `role_management` is not in the `Resource` union (apps/web/src/routes/_authenticated/dashboard/_layout/access-control/user-assignment.tsx:11)
**status: partial | testable: true**

The route `beforeLoad` calls `requirePermission("role_management:read")`. However `role_management` is in the `Resource` union (permission.service.ts:27) so the resource name itself is valid. BUT the RBAC routers (`roles.ts`, `role-permissions.ts`) use `user_management` as the required permission resource — not `role_management`. This mismatch means a member granted `role_management:read` via the RBAC table can reach the `/access-control/roles` route but cannot call the `roles.list` API (which requires `user_management:read`). The two permission resources are misaligned between UI guards and API guards.

---

### P3 — `moveHierarchyNode` does not update `branchDetails.picUserId` or sync to control-panel `organization_branches.countryTenantNodeId` (packages/api/src/routers/hierarchy/move.procedures.ts)
**status: partial | testable: false**

When a branch moves across countries, the update handler (update.procedures.ts:112-122) updates `country` in `organization_branches` only for country renames, not for branch moves. The move router does fire GHL sync but the control-panel `organization_branches.countryTenantNodeId` and `organization_branches.country` are NOT updated after a branch moves to a different country. The branch stats cache would also be stale.

---

### P3 — Branch QR invite `expiresAt` is 10 years but no per-invite rate-limit on redemptions in a burst window (packages/services/src/branch-invite.service.ts:68)
**status: partial | testable: true**

Invites have `maxUses` for total capacity, but there is no burst protection (e.g. 10 redemptions/second). A compromised QR token could be rapidly redeemed by a bot before the admin notices. The `usesCount` increment happens inside a non-atomic read-then-write pattern (validateBranchInvite reads usesCount, redeemBranchInvite increments it separately), creating a race condition where concurrent redemptions can exceed maxUses.

---

## Summary Statistics

- Total procedures audited: 61
- Total logic functions audited: 50+
- Orphaned functions: `markExpiredInvitations` (never called from apps/)
- Stub/empty guard: `assertTenantAndMember` in google-calendar.ts (empty body)

### testable:true findings count: 11

P1 findings (critical): 3 (invitation partial-failure, markExpiredInvitations never called, role deletion leaves dangling roleId)
P2 findings (high): 5 (Google Calendar push-only, QR rate-limit missing, invite email never sent, org-settings role bypass, assertTenantAndMember no-op)
P3 findings (medium): 5 (service/category no delete, rooms wrong permission, role_management vs user_management mismatch, branch move missing org_branches sync, QR redemption race)

# Domain Staff, Access, Branches & Onboarding

Read-only audit. Repo root `C:\Project\Avantej`. Covers routers/services backing
Trainers, Employees (members), Roles, Staff Access (permissions/invitations),
Branches (hierarchy), and Onboarding QR (branch self-signup + registration).

Cross-cutting note on guards (`packages/api/src/guards.ts`):
- `assertOrgContextMatch` — rejects cross-tenant `organizationId` spoofing.
- `requirePermissionOrpc` — RBAC gate (maps `PermissionDeniedError` → FORBIDDEN).
- `guardBranchAccessible` — branch-scope gate against `accessibleNodeIds`.
- `resolveAccessibleNodeIds` — context cache or descendant walk.
The recurring gaps below are about which procedures *omit* these.

All non-public procedures are `tenantProcedure` (session + tenant context). Branch-invite
public flow uses `publicProcedure`.

---

## Endpoints / Procedures

### trainers.ts (`packages/api/src/routers/trainers.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `weeklyStats` | protected | Weekly stats for one trainer (sessions, util%, commissionYTD, revenue). Gate: `user_management:read` + (self OR `user_management:approve`). | `getTrainerWeeklyStats` |
| `weeklySchedule` | protected | Next-7-days appointments + class slots. Gate: `appointment_management:read`. | `getTrainerWeeklySchedule` |
| `weeklyStatsBatch` | protected | Batch stats up to 100 trainers. Gate: `user_management:approve`. | `getTrainerWeeklyStatsBatch` |

NOTE: not catalogued in `zhub/shared/api-overview.md` (no `trainers` section). [discrepancy]

### trainer-tiers.ts (`packages/api/src/routers/trainer-tiers.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected | List tiers (`includeInactive`). Gate: `trainer_tier_management:read`. | `listTrainerTiers` |
| `create` | protected | Create tier. Gate: `...:create`. | `createTrainerTier` |
| `update` | protected | Update tier. Gate: `...:update`. | `updateTrainerTier` |
| `deactivate` | protected | Soft-deactivate tier (`isActive=false`). Gate: `...:delete`. | `deactivateTrainerTier` |
| `reactivate` | protected | Reactivate tier. Gate: `...:update`. | `reactivateTrainerTier` |
| `assignToMember` | protected | Assign/clear tier FK on a trainer member. Gate: `...:update`. | `assignTierToMember` |

NOTE: api-overview lists `trainer-tiers` with create/delete/list/update only — `delete` is
actually `deactivate`, and `reactivate`/`assignToMember` are undocumented. [discrepancy]

### members/* (`packages/api/src/routers/members/`)  — `members.ts` is a re-export shim
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` (list.procedures) | protected | List members + cross-DB user enrichment + GHL sync status; RBAC scope filter for non-admins; `scope='self'` short-circuit; `includeDeleted` toggle. Gate: `user_management:read`. | inline (Drizzle) |
| `getById` (read.procedures) | protected | Member detail + accessibleNodeIds + control-panel user. Gate: `user_management:read`; node-scope check. | inline |
| `newToday` (read.procedures) | protected | Members joined today (KPI). Gate: `user_management:read`. | `getMembersNewToday` |
| `create` (create.procedures) | protected | Dual-write member (control-panel + tenant); GHL create dispatch. Gate: `user_management:create`; parent-access validation. | `createMember` |
| `updateRole` (role.procedures) | protected | Dual-write role + optional `roleId` FK; audit; GHL update dispatch. Gate: `user_management:update`. | `MembershipService.updateMemberRole` + `writeAudit` |
| `updateScope` (scope.procedures) | protected | Reassign `hierarchyScopeId`; audit; GHL update (branch move). Gate: `user_management:update`; src+dest scope check. | inline + `writeAudit` |
| `suspend` (status.procedures) | protected | Dual-write suspend; audit. Gate: `user_management:update`. | `MembershipService.suspendMember` |
| `reactivate` (status.procedures) | protected | Dual-write reactivate; audit. Gate: `user_management:update`. | `MembershipService.reactivateMember` |
| `deactivate` (archive.procedures) | protected | Tenant-only `status='inactive'` + audit (tx); GHL delete dispatch. Gate: `user_management:update`. | `deactivateMember` |
| `softDelete` (archive.procedures) | protected | Stamp `deletedAt=now()`; GHL no-op. Gate: `user_management:delete`; node-scope check. | inline |
| `restore` (archive.procedures) | protected | Clear `deletedAt`; throws on not-deleted. Gate: `user_management:update`. | inline |
| `remove` (removal.procedures) | protected | Dual-write hard remove; last-admin guard. Gate: `user_management:delete`. | `MembershipService.removeMember` |
| `retryGhlSync` (sync.procedures) | protected | Re-dispatch GHL `update`. **No permission gate.** | `dispatchStaffSync` (env-bound) |

### roles.ts (`packages/api/src/routers/roles.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected | List roles by priority desc. Gate: `user_management:read`. **No `assertOrgContextMatch`.** | inline |
| `create` | protected | Create custom role (priority 1-99). Gate: `user_management:create`. | inline |
| `update` | protected | Update custom role; blocks system roles. Gate: `user_management:update`. | inline |
| `delete` | protected | Delete custom role; blocks system roles. Gate: `user_management:delete`. | inline |

NOTE: gated on `user_management`, not a `role_management` resource (which exists in the
`Resource` union but is unused here). [discrepancy]

### role-permissions.ts (`packages/api/src/routers/role-permissions.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected | List role↔permission joins (optional `roleId`). Gate: `user_management:read`. | inline |
| `add` | protected | Assign permission to role (scope enum). Gate: `user_management:update`. | inline |
| `remove` | protected | Remove permission from role; blocks system roles. Gate: `user_management:update`. | inline |

### permissions.ts (`packages/api/src/routers/permissions.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected | List permission rows (optional `resource`). Gate: `user_management:read`. | inline |

### hierarchy/* (`packages/api/src/routers/hierarchy/`) — `hierarchy.ts` is a re-export shim
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `listNodes` (read) | protected | All nodes filtered to accessible; branch_details join. **No `requirePermissionOrpc`.** | inline |
| `getNode` (read) | protected | Single node + branch details. Node-scope check only; **no permission gate.** | inline |
| `getDescendants` (read) | protected | Descendant nodes of a node. Node-scope check only; **no permission gate.** | `getDescendantNodeIds` |
| `listNodesWithStats` (read) | protected | Nodes + cached branch stats. Gate: `hierarchy_management:read`. | `listNodesWithStats` |
| `createNode` (create) | protected | Create node; sync to `organization_branches`; GHL branch sync. Gate: `hierarchy_management:create`. | `createHierarchyNode` |
| `updateNode` (update) | protected | Update node + branch_details; CP sync; GHL rename. Gate: `hierarchy_management:update`; node-scope check. | `updateHierarchyNode` |
| `deleteNode` (delete) | protected | Hard delete + auto child-delete/member-reassign; CP cleanup; GHL remove + compensation. Gate: `hierarchy_management:delete`. | `deleteHierarchyNode` |
| `moveNode` (move) | protected | Reparent node; GHL branch move on cross-country. Gate: `hierarchy_management:update`; both-node scope check. | `moveHierarchyNode` |
| `listMembers` (members) | protected | Members in a scope. Gate: `user_management:read`; node-scope check. | `getMembersByHierarchyScope` |
| `reassignMember` (members) | protected | Reassign one member. Gate: `user_management:update`; src+dest scope check. | `updateMemberHierarchyScope` |
| `bulkReassignMembers` (members) | protected | Bulk reassign. Gate: `user_management:update`; **dest-only scope check.** | `bulkUpdateMemberHierarchyScope` |
| `listAllMembers` (members) | protected | ALL org members + user details. Gate: `user_management:read`; **no scope filter.** | `getAllOrganizationMembersWithUserDetails` |

### branch-invites.ts (`packages/api/src/routers/branch-invites.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `create` | protected | Create branch self-signup invite + QR URL. Gate: `hierarchy_management:create`; `guardBranchAccessible`. | `createBranchInvite` |
| `listAll` | protected | One row per accessible branch w/ latest invite. Gate: `hierarchy_management:read`. **No `assertOrgContextMatch`.** | `listAllBranchInvites` |
| `list` | protected | Active invites for a branch. Gate: `...:read`; `guardBranchAccessible`. | `listBranchInvites` |
| `revoke` | protected | Soft-revoke (`isActive=false`). Gate: `...:delete`. **No `guardBranchAccessible` on the target invite.** | `revokeBranchInvite` |
| `regenerate` | protected | Revoke + create fresh invite for same branch. Gate: `...:create`. **No `guardBranchAccessible`.** | `revokeBranchInvite` + `createBranchInvite` |

NOTE: entire `branchInvites` router (registered in `base-router.ts:135`) is absent from
`zhub/shared/api-overview.md`. [discrepancy]

### invitations/* (`packages/api/src/routers/invitations/`) — `invitations.ts` is a re-export shim
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `create` (create) | protected | Create staff/member invite; soft-deleted-customer block; existing-member block. Gate: `user_management:create`; parent-access validation. | `createInvitation` (+ `checkSoftDeletedCustomerBlock`) |
| `accept` (public) | public | Accept invite when logged in: verify email, dual-write member, mark email verified. | `MembershipService.createMember` |
| `verifyEmailByToken` (public) | public | Pre-verify invited email in control-panel. | inline |
| `decline` (public) | public | Set invite `status='declined'`. | inline |
| `getByToken` (public) | public | Fetch invite + validity for the landing page. | `getInvitationByToken` + `validateInvitation` |
| `list` (manage) | protected | List invites (status/email filters), token withheld. Gate: `user_management:read`. | `listInvitations` |
| `revoke` (manage) | protected | Set `status='declined'`. Gate: `user_management:delete`. | `revokeInvitation` |
| `resend` (manage) | protected | Extend expiry + reset to pending. Gate: `user_management:create`. | `resendInvitation` |

NOTE: api-overview lists `invitations.verifyEmail` (public) — actually lives on the `auth`
router; the invitations one is `verifyEmailByToken`. [minor discrepancy]

### onboarding.ts (`packages/api/src/routers/onboarding.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `getInviteContext` | public | Branded org/branch info for QR landing; validates active/not-expired/has-capacity. | `getInviteContext` |
| `redeemInvite` | public | Create Better-Auth user + tenant member + increment uses; idempotent re-login. | `redeemBranchInvite` |

### registration.ts (`packages/api/src/routers/registration.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `listCountries` | public | Distinct countries with registered branches. | inline |
| `listBranches` | public | Branches in a country. | inline |
| `complete` | protected | Profile update + dual-write `client` member; sets control-panel `user.role='user'`. | `MembershipService.createMember` |

### organization-settings.ts (`packages/api/src/routers/organization-settings.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `get` | protected | Read a setting by key (any member). | `getSetting` |
| `upsert` | protected | Write a setting; **inline `member.role==='admin'` check, no permission/role table consulted.** | `upsertSetting` |

---

## Logic Functions

### trainer.service.ts
- `getTrainerWeeklyStats()` — single-trainer weekly aggregates (sessions/util/commissionYTD/revenue).
- `getTrainerWeeklySchedule()` — next-7-days appointments + class slots, merged & sorted.
- `getTrainerWeeklyStatsBatch()` — same metrics for ≤100 trainers, no N+1.
- `getWeekBounds()` / `getYtdStart()` — internal date helpers (not exported).

### trainer-tier.service.ts
- `listTrainerTiers()` — list tiers by rank (active-only unless `includeInactive`).
- `createTrainerTier()` — create tier (unique name) + report missing rate categories.
- `updateTrainerTier()` — update tier (unique-name re-check).
- `deactivateTrainerTier()` — `isActive=false`.
- `reactivateTrainerTier()` — `isActive=true` + missing-rate report.
- `assignTierToMember()` — set/clear `members.trainerTierId` (trainer-only).
- `getConfigsMissingRateForTier()` — find commission configs lacking a rate for tier.

### member.service.ts
- `getMembersByHierarchyScope()` — members at one node.
- `updateMemberHierarchyScope()` — single reassign + branch-stats-cache refresh.
- `bulkUpdateMemberHierarchyScope()` — bulk reassign (validates all exist).
- `getAllOrganizationMembersWithUserDetails()` — all org members + CP user details.
- `createMember()` — dual-write create + stats refresh.
- `deactivateMember()` — tenant `status='inactive'` in tx + audit + stats refresh.

### permission.service.ts
- `hasPermission()` — RBAC check (roleId FK → text-role fallback; priority≥100 = admin all).
- `checkHierarchyPermission()` — convenience wrapper. **ORPHAN** (no caller outside this file).
- `requirePermission()` — throws `PermissionDeniedError` (used everywhere via `requirePermissionOrpc`).
- Exports `PermissionDeniedError`, `Resource`, `Action`.

### hierarchy.service.ts
- `getDescendantNodeIds()` — recursive CTE down-tree (used broadly for RBAC).
- `getAncestorNodeIds()` — recursive CTE up-tree. Used only by `notification.service`; no direct procedure in this domain.
- `createHierarchyNode()` — insert node + lazy branch_details.
- `updateHierarchyNode()` — rename/branch-details upsert + uniqueness checks.
- `deleteHierarchyNode()` — hard delete + recursive child delete + member reassign.
- `moveHierarchyNode()` — reparent + depth/type/circular validation + country denorm cascade.
- `listNodesWithStats()` — nodes + cached stats; enqueues refresh on cache miss.
- `findReassignTarget()` / `recursivelyDeleteChildren()` — internal (not exported).

### hierarchy-validation.service.ts
- `getDepthForType()` — type→depth map.
- `getParentTypeForType()` — type→expected-parent-type map.
- `validateHierarchyRules()` — full create-time validation.
- `validateParentAccess()` — throws if parent not in accessibleNodeIds.

### hierarchy-scope.ts
- `assertBranchAccessible()` — throws `BranchAccessDeniedError` when branchId out of scope.
- `resolveBranchFilter()` — validate + resolve branch filter for analytics.
- `isBranchAccessDeniedError()` — type guard. Exports `BranchAccessDeniedError`.

### branch-invite.service.ts
- `createBranchInvite()` — insert email-less, 10-year, multi-use `branch_self_signup` invite.
- `listBranchInvites()` — active invites for a branch.
- `listAllBranchInvites()` — one row per accessible branch + latest invite.
- `revokeBranchInvite()` — `isActive=false`.
- `validateBranchInvite()` — NOT_FOUND/REVOKED/EXPIRED/MAX_USES_REACHED.
- `incrementBranchInviteUses()` — atomic `uses_count+1`. **ORPHAN-ish**: redeem path increments inline inside its own tx (`onboarding.service.ts:229`); this standalone fn has no caller.
- `generateBase64UrlToken()` — internal.

### invitation.service.ts
- `createInvitation()` — 7-day hex-token staff invite (validates email/role/dup).
- `getInvitationByToken()` — lookup by token.
- `validateInvitation()` — status==='pending' + not expired.
- `listInvitations()` — filtered list.
- `revokeInvitation()` — `status='declined'`.
- `resendInvitation()` — extend expiry + reset to pending.
- `markExpiredInvitations()` — bulk `pending`→`expired` for past-due. **ORPHAN** (exported in `services/index.ts:239`; no caller; NOT wired into the CF scheduled handler at `apps/server/src/index.ts:357`).
- `checkSoftDeletedCustomerBlock()` — pre-flight block for re-inviting soft-deleted customers.

### onboarding.service.ts
- `getInviteContext()` — branded landing context (validates branch invite).
- `redeemBranchInvite()` — create/sign-in BA user + member row + increment uses (tx) + non-fatal CP org_members sync.
- `signUpViaBetterAuth()` / `signInViaBetterAuth()` / `forwardableHeaders()` / `errorMessage()` — internal.

### tenant-admin.service.ts
- `assertTenantAdminCanImpersonate()` — precondition guard for tenant-admin impersonation. Consumed by the SERVER-ONLY `tenantAdmin` router (`appRouter.tenantAdmin`, not in this domain's owned router files).

### organization-settings.service.ts
- `getSetting()` — read key.
- `upsertSetting()` — upsert key (onConflictDoUpdate).

### ghl-staff-sync.service.ts
- `dispatchStaffSync()` — single source of truth for GHL staff sync skip-rules + create/update/delete/reassign. Never throws. Injected into context as `dispatchStaffSync` by `dbMiddleware`.
- `dispatchProfileSync()` — cross-org name/email propagation from better-auth user.update hook.

---

## Gaps (prioritized)

### P1 — Invite expiry automation is dead (orphan + unwired cron)  (packages/services/src/invitation.service.ts:268)  [partial | testable]
`markExpiredInvitations()` flips overdue `pending` invites to `expired`, but nothing calls it.
The CF scheduled handler (`apps/server/src/index.ts:357-450`) dispatches backfill,
scheduled-reports, onboarding-alerts, reconciliation, tenant-hard-delete, usage-snapshot,
installment-sweep — never invitation expiry. Effect: `invitations.list` never shows
`status='expired'`; expired invites remain `pending` and `getByToken`/`accept` rely on the
inline `validateInvitation()` runtime expiry check (which DOES block acceptance), so the
lifecycle dead-end is cosmetic + reporting, not a security hole. Branch self-signup invites
(10-year expiry) are unaffected.
- persistence: { tenant, table: invitations, where: "status='pending' AND expires_at < now()", expect: "status→'expired'" }
- testable: call `markExpiredInvitations(tenantDb)` directly against a seeded past-due pending invite and assert the count + status change. (Wiring the cron is the fix; the fn itself is unit-testable.)

### P1 — `hierarchy.listAllMembers` returns ALL org members with no scope filter for non-admins  (packages/api/src/routers/hierarchy/members.procedures.ts:186)  [implemented | testable]
Gate is `user_management:read` only. The backing `getAllOrganizationMembersWithUserDetails`
(member.service.ts:208) loads EVERY member in the tenant and does NOT filter by
`accessibleNodeIds`. A non-admin staff member with `user_management:read` can therefore
enumerate members across branches outside their hierarchy scope (including names/emails from
the control-panel DB). Contrast `members.list` (list.procedures.ts:89-103) which DOES apply
`inArray(members.hierarchyScopeId, accessibleNodeIds)` for non-admins. RBAC hole / scope leak.
- persistence: read-only (no write). Reads: members (tenant) + user (control-panel).
- testable: staff context scoped to branch B; assert `listAllMembers` does not return members from sibling branch C.

### P1 — `members.retryGhlSync` has no permission gate  (packages/api/src/routers/members/sync.procedures.ts:17)  [implemented | testable]
Every other members procedure calls `requirePermissionOrpc(... "user_management", ...)`.
`retryGhlSync` only calls `assertOrgContextMatch` then dispatches a GHL `update` for an
arbitrary `memberId`. Any authenticated tenant member (e.g. a `client`) can trigger GHL
write traffic / re-sync for any member id in the org. No hierarchy/permission check.
- persistence: side-effect only — may mutate ghl_user_links (tenant) and remote GHL via dispatcher; no direct DB write in the handler.
- testable: client-role context; call `retryGhlSync` for an admin's memberId; expect FORBIDDEN (currently succeeds/dispatches).

### P2 — `hierarchy.bulkReassignMembers` skips source-scope check on the members being moved  (packages/api/src/routers/hierarchy/members.procedures.ts:136)  [implemented | testable]
`reassignMember` (single) validates BOTH the destination node AND the target member's CURRENT
scope (lines 90-116). `bulkReassignMembers` validates ONLY the destination
(`accessibleNodeIds.includes(input.newHierarchyScopeId)`); it never confirms the actor can
access each `memberId`'s current scope. A non-admin can sweep members out of branches they
don't control into a branch they do. Inconsistent RBAC vs the single-reassign path.
- persistence: { tenant, table: members, where: "id IN (memberIds)", expect: "hierarchyScopeId→newHierarchyScopeId" }
- testable: staff scoped to branch B; pass a memberId currently in branch C + dest B; single-reassign forbids, bulk allows → assert parity.

### P2 — Hierarchy read procedures lack `requirePermissionOrpc`  (packages/api/src/routers/hierarchy/read.procedures.ts:14, :116, :185)  [implemented | testable]
`listNodes`, `getNode`, `getDescendants` enforce node-level accessibility (filter / FORBIDDEN
on out-of-scope node) but never check `hierarchy_management:read`. `listNodesWithStats` (same
file, :293) DOES. So a member with zero hierarchy permissions but a valid scope can still read
the branch tree (names, addresses, picUserId, parentage). Likely intentional (tree is needed
for many UIs), but it is an inconsistency worth flagging: read perms are unenforced on 3 of 4
read procedures.
- persistence: read-only.
- testable: member whose role lacks `hierarchy_management:read`; assert `listNodes` returns nodes (current) vs whether a gate is desired.

### P2 — `branchInvites.revoke` and `regenerate` do not re-check branch accessibility  (packages/api/src/routers/branch-invites.ts:153, :199)  [implemented | testable]
`create` and `list` call `guardBranchAccessible(input.branchId, accessibleNodeIds)`. `revoke`
takes an invite `id` (not branchId) and only checks `hierarchy_management:delete`; `regenerate`
looks up the old invite's `hierarchyScopeId` but never guards it against `accessibleNodeIds`.
A non-admin with hierarchy delete/create perms can revoke/regenerate invites for branches
outside their scope. `listAll` is scoped correctly (filters by `accessibleNodeIds`), but
`revoke`/`regenerate` operate by id without the branch guard.
- persistence: { tenant, table: invitations, where: "id=:id AND kind='branch_self_signup'", expect: "revoke→isActive=false; regenerate→old isActive=false + new row inserted" }
- testable: staff scoped to branch B; revoke an invite belonging to branch C; expect FORBIDDEN (currently succeeds).

### P2 — `branchInvites.listAll` missing `assertOrgContextMatch`; `roles.list` missing it too  (packages/api/src/routers/branch-invites.ts:92; packages/api/src/routers/roles.ts:21)  [implemented | testable]
Both procedures accept `organizationId` in input but skip `assertOrgContextMatch(context,input)`
that their sibling procedures call. Cross-tenant spoofing is still blocked because
`orpcTenantMiddleware` resolves `tenantDb` from the request `organizationId` and RBAC runs on
that tenant's `context.member` — so a mismatched `input.organizationId` would query the wrong
tenant but with the caller's real member, not escalate. Low impact, but a consistency gap that
defeats the purpose of the C.2 guard convention.
- persistence: read-only.
- testable: pass `organizationId` ≠ authenticated org; sibling procedures throw FORBIDDEN, these two do not.

### P2 — `organizationSettings.upsert` bypasses the RBAC tables  (packages/api/src/routers/organization-settings.ts:24)  [implemented | testable]
Uses a hard-coded `context.member.role !== "admin"` check instead of
`requirePermissionOrpc(...)`. Custom roles with elevated permissions (the whole point of the
roles/role_permissions tables this domain manages) cannot be granted settings-write access,
and the check ignores `member.roleId`. Functional but inconsistent with the permission model;
also there is no dedicated settings resource in the `Resource` union.
- persistence: { tenant, table: organization_settings, where: "key=:key", expect: "upsert value + updatedBy" }
- testable: member with a custom admin-equivalent role but text-role≠'admin'; assert upsert is forbidden (current) — flags the model gap.

### P3 — `registration.complete` writes control-panel `user.role='user'` while tenant member role is `'client'`  (packages/api/src/routers/registration.ts:151, :171)  [implemented | testable]
The dual-write creates the tenant member with `role:'client'` (line 151) but sets the
control-panel `user.role` to the string `'user'` (line 171) as the "registration complete"
marker. These are two different role namespaces (CP user.role gate vs tenant member.role RBAC),
so it is intentional, but the literal `'user'` is a magic value that does not appear in the
member role enum and could confuse future readers / any code that assumes the two are aligned.
No functional defect found.
- persistence: { control-panel, table: user, where: "id=:userId", expect: "role='user' + profile fields" } ; { tenant+control-panel, table: members/organization_members, expect: "client member created" }
- testable: complete registration; assert CP user.role='user' AND tenant member.role='client' (asserts the intended split, not a bug).

### P3 — `incrementBranchInviteUses` is an unused duplicate of inline logic  (packages/services/src/branch-invite.service.ts:272)  [implemented | testable]
Exported but never called: `redeemBranchInvite` increments `uses_count` inline inside its own
tenant transaction (`onboarding.service.ts:229-232`) to keep the member-insert + use-increment
atomic. The standalone fn (non-transactional) would be the wrong tool if ever wired in. Dead
code, not a defect.
- persistence: { tenant, table: invitations, where: "id=:inviteId", expect: "uses_count+1" }
- testable: unit-callable, but no production path exercises it.

### P3 — `checkHierarchyPermission` orphan  (packages/services/src/permission.service.ts:157)  [implemented | testable]
Convenience wrapper around `hasPermission(... "hierarchy_management", ...)` with no caller.
Dead code. Harmless.
- persistence: read-only.
- testable: unit-callable.

### P3 — `getInviteContext` returns hardcoded null branchAddress / brandLogoUrl  (packages/services/src/onboarding.service.ts:84-86)  [partial | testable]
The QR onboarding landing context always returns `branchAddress: null` and
`brandLogoUrl: null` (org logo "not yet stored in schema"; branch address available in
`branch_details` but not fetched here). The landing page therefore cannot show address/branding
even though `branch_details.address` exists. Feature gap, not a bug.
- persistence: read-only. (branch_details.address exists but is not read.)
- testable: redeem-context for a branch with an address set; assert returned `branchAddress` is null (current) vs populated (desired).

### P3 — Audit-write orphan window on role/suspend/reactivate (documented DEVIATION)  (packages/api/src/routers/members/role.procedures.ts:118; status.procedures.ts:97, :207)  [implemented | testable]
`MembershipService` does the dual-write (control-panel + tenant) and exposes no tx hook, so
`writeAudit` runs AFTER the membership change on a separate query. If the process dies in
between, the role/status change persists but the audit row is missing. Self-documented as a
known deviation from §4.8. `deactivate` (member.service.ts:371) does NOT have this problem —
it wraps status change + audit in one `tenantDb.transaction`. Low risk; flagged for parity.
- persistence: { tenant, table: members + audit_logs, expect: "both rows; rare orphan: member updated, audit missing" }
- testable: hard to fault-inject in unit tests; assert the happy-path writes both rows.

### P3 — `members.create` requires the invitee to already be a registered user  (packages/api/src/routers/members/create.procedures.ts:79)  [implemented | false]
`create` looks up the user by email in the control-panel and throws NOT_FOUND if absent
("User must be registered first"). There is no path in this procedure to provision a brand-new
user — that is the job of `invitations.create` → `accept`, or branch self-signup. This is by
design (two distinct journeys), noted so it is not mistaken for missing CRUD. No gap.
- persistence: { tenant+control-panel, expect: "member dual-write only for pre-existing user" }
- testable: false (intentional precondition; covered by invitation flow).

---

## Lifecycle summary (no true dead-ends found)

- Staff invitation: `create`(pending) → `accept`(→member, status accepted via MembershipService) | `decline`(declined) | `revoke`(declined) | `resend`(re-pending) | expiry via `validateInvitation` at read-time (bulk `expired` stamp orphaned — P1). All states reachable/leaveable.
- Branch self-signup invite: `create`(active) → `redeemInvite`(uses_count++, member created) → `revoke`(isActive=false) / `regenerate`(replace). `validateBranchInvite` enforces REVOKED/EXPIRED/MAX_USES at redeem time.
- Member status: active ⇄ suspend ⇄ reactivate ; active → deactivate(inactive) ⇄ reactivate ; active → softDelete(deletedAt) ⇄ restore ; → remove(hard, last-admin guarded). No orphan states.
- Side-effects verified present: invite accept → member row (✓), member create/role/scope/deactivate → GHL dispatch (✓ best-effort), branch create/update/move/delete → organization_branches sync + GHL branch sync (✓), branch create → in hierarchy + CP registry (✓). Note: deactivate fires GHL `delete` but does NOT revoke Better-Auth sessions (no session-revocation side-effect in suspend/deactivate/remove — potential follow-up, but session validity is governed by Better-Auth cookie/session lifetime, not flagged as a finding since no session table write exists in these paths).

# Domain 05 — People, RBAC, Hierarchy, Org & Service-Catalog

Audit of People/RBAC/Hierarchy/Org/Service-Catalog routers + services. All routers wired in `packages/api/src/routers/base-router.ts` (lines 75–137). `members.ts`, `hierarchy.ts`, `services.ts` are re-export shims over the same-named folders. All procedures use `tenantProcedure` (protected) unless noted `publicProcedure`. `requirePermissionOrpc` = oRPC wrapper over `requirePermission(tenantDb, member, resource, action)` (permission.service.ts:189). Most handlers also call `assertOrgContextMatch` (org-id body guard) and several call `guardBranchAccessible`.

## Routers & Procedures

### members/ (folder; `members:`) — `members/index.ts`
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `list` | user_management:read | List members (+user enrich, GHL sync status); `scope:'self'` short-circuit; RBAC node filter | inline + `getDescendantNodeIds` (`list.procedures.ts:22`) |
| `getById` | user_management:read | Member + accessibleNodeIds + user details | inline + `getDescendantNodeIds` (`read.procedures.ts:19`) |
| `newToday` | user_management:read | Members joined today widget | `getMembersNewToday` (`read.procedures.ts:114`) |
| `create` | user_management:create | Dual-write member (cp+tenant), GHL create | `createMember`, `validateParentAccess` (`create.procedures.ts:20`) |
| `updateRole` | user_management:update | Role + nullable roleId FK, audit, GHL update | `MembershipService.updateMemberRole` (`role.procedures.ts:21`) |
| `updateScope` | user_management:update | Branch reassignment, audit, GHL update | inline tenant update (`scope.procedures.ts:24`) |
| `suspend` | user_management:update | Dual-write suspend + audit | `MembershipService.suspendMember` (`status.procedures.ts:20`) |
| `reactivate` | user_management:update | Dual-write reactivate + audit | `MembershipService.reactivateMember` (`status.procedures.ts:130`) |
| `deactivate` | user_management:update | Tenant-only status='inactive', GHL delete | `deactivateMember` (`archive.procedures.ts:22`) |
| `softDelete` | user_management:delete | Stamp `deletedAt`, GHL no-op | inline (`archive.procedures.ts:102`) |
| `restore` | user_management:update | Clear `deletedAt` (BAD_REQUEST if not deleted) | inline (`archive.procedures.ts:163`) |
| `remove` | user_management:delete | Dual-write remove, last-admin guard | `MembershipService.removeMember` (`removal.procedures.ts:20`) |
| `retryGhlSync` | (none — tenantProcedure only) | Re-dispatch GHL staff sync | dispatcher (`sync.procedures.ts:17`) |

### hierarchy/ (folder; `hierarchy:`) — `hierarchy/index.ts`
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `listNodes` | (node-scope filter; no requirePermission) | All accessible nodes + branch_details | inline (`read.procedures.ts:14`) |
| `getNode` | node-scope check | Single node | inline (`read.procedures.ts:116`) |
| `getDescendants` | node-scope check | Descendant nodes | `getDescendantNodeIds` (`read.procedures.ts:185`) |
| `listNodesWithStats` | hierarchy_management:read | Nodes + cached branch stats | `listNodesWithStats` (`read.procedures.ts:293`) |
| `createNode` | hierarchy_management:create | Create node + cp branch registry + GHL sync | `createHierarchyNode`,`validateHierarchyRules` (`create.procedures.ts:23`) |
| `updateNode` | hierarchy_management:update | Update + cp sync + GHL rename | `updateHierarchyNode` (`update.procedures.ts:21`) |
| `deleteNode` | hierarchy_management:delete | Soft-delete w/ auto child-delete + member reassign, GHL removal + compensation | `deleteHierarchyNode` (`delete.procedures.ts:17`) |
| `moveNode` | hierarchy_management:update | Re-parent, GHL cross-country move sync | `moveHierarchyNode` (`move.procedures.ts:15`) |
| `listMembers` | user_management:read | Members at a node | `getMembersByHierarchyScope` (`members.procedures.ts:19`) |
| `reassignMember` | user_management:update | Single member scope change | `updateMemberHierarchyScope` (`members.procedures.ts:66`) |
| `bulkReassignMembers` | user_management:update | Bulk scope change | `bulkUpdateMemberHierarchyScope` (`members.procedures.ts:136`) |
| `listAllMembers` | user_management:read | All org members + user details | `getAllOrganizationMembersWithUserDetails` (`members.procedures.ts:186`) |

### invitations/ (folder; `invitations:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `create` | user_management:create | Create invite; soft-deleted/dup guards | `createInvitation`,`checkSoftDeletedCustomerBlock` (`create.procedures.ts:17`) |
| `list` | user_management:read | List invites (token stripped) | `listInvitations` (`manage.procedures.ts:14`) |
| `revoke` | user_management:delete | Mark declined/revoked | `revokeInvitation` (`manage.procedures.ts:67`) |
| `resend` | user_management:create | Refresh token/expiry | `resendInvitation` (`manage.procedures.ts:105`) |
| `accept` | **public** | Create member, verify email | `MembershipService.createMember`,`validateInvitation` (`public.procedures.ts:21`) |
| `verifyEmailByToken` | **public** | Pre-verify invited email | `getInvitationByToken` (`public.procedures.ts:121`) |
| `decline` | **public** | Status→declined | inline (`public.procedures.ts:194`) |
| `getByToken` | **public** | Status check | `getInvitationByToken`,`validateInvitation` (`public.procedures.ts:261`) |

### member-profiles.ts (`memberProfiles:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `get` | user_management:read | Get profile | `getMemberProfile` (:11) |
| `upsert` | user_management:update | Upsert profile | `upsertMemberProfile` (:29) |

### customer-profiles.ts (`customerProfiles:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `get` | self (session user) | Own profile | `getCustomerProfile` (:23) |
| `upsert` | self | Own profile partial upsert | `upsertCustomerProfile` (:43) |
| `upsertForCustomer` | customer_management:update + scope | Admin edits any client | `upsertCustomerProfile` (:124) |
| `listLeadSources` | (none) | Lead-source picker | inline (:200) |

### customer-directory.ts (`customerDirectory:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `list` | customer_management:read + branch guard | Directory w/ metrics | `listCustomerDirectory` (:27) |
| `getStats` | customer_management:read | KPI tiles | `getCustomerStats` (:70) |
| `getById` | customer_management:read + row RBAC | Customer detail | `getCustomerDetail` (:101) |

### walk-in-customers.ts (`walkInCustomers:`) — MOSTLY DEPRECATED
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `list` | (none) | **Stub: returns `{items:[],total:0}`** | none (:16) |
| `getById`/`create`/`update`/`deactivate` | — | **All throw BAD_REQUEST "removed"** | `deprecated()` (:19–24) |
| `convertToPackage` | walk_in_customer_management:update | Convert drop-in payment→package | `convertWalkInPaymentToPackage` (:32) |

### households.ts (`households:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `create` | customer_management:update | Create household + bind primary contact | inline tx (:54) |
| `addMember` | customer_management:update | Set `customerProfiles.householdId` | inline (:98) |
| `removeMember` | customer_management:update | Clear householdId (+primary unlink) | inline (:140) |
| `get` | customer_management:read | Household + member profiles | inline (:190) |
| `list` | customer_management:read + branch guard | Households (RBAC-scoped) | inline (:238) |

### coach-intake.ts (`coachIntake:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `listSlots` | (none) | Recurring intake slots | `listCoachIntakeSlots` (:29) |
| `upsertSlots` | appointment_management:update OR self | Replace slots | `upsertCoachIntakeSlots` (:43) |
| `getOpenSlots` | (none) | Open slots in range | `computeOpenIntakeSlots` (:89) |
| `claimSlot` | appointment_management:update OR self | Block a slot | `claimIntakeSlot` (:110) |
| `unclaimSlot` | (none) | Delete exception | `unclaimIntakeSlot` (:155) |
| `listExceptions` | (none) | Exceptions in range | `listIntakeExceptions` (:170) |
| `listByBranch` | (none) + branch guard | Coaches+slots by branch | `listCoachIntakeByBranch` (:191) |

### branch-invites.ts (`branchInvites:`) — QR self-signup
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `create` | hierarchy_management:create + branch guard | Create invite + QR URL | `createBranchInvite` (:41) |
| `listAll` | hierarchy_management:read | One row/accessible branch | `listAllBranchInvites` (:92) |
| `list` | hierarchy_management:read + branch guard | Invites for one branch | `listBranchInvites` (:109) |
| `revoke` | hierarchy_management:delete | isActive=false | `revokeBranchInvite` (:153) |
| `regenerate` | hierarchy_management:create | revoke+create new | `revokeBranchInvite`+`createBranchInvite` (:199) |

### roles.ts (`roles:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `list` | user_management:read | List roles by priority | inline (:21) |
| `create` | user_management:create | Custom role (priority 1–99) | inline (:48) |
| `update` | user_management:update | Update non-system role | inline (:101) |
| `delete` | user_management:delete | Delete non-system role | inline (:176) |

### role-permissions.ts (`rolePermissions:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `list` | user_management:read | role↔perm joins (+resource/action) | inline (:22) |
| `add` | user_management:update | Assign perm (scope enum) | inline (:65) |
| `remove` | user_management:update | Unassign perm (blocks system roles) | inline (:138) |

### permissions.ts (`permissions:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `list` | user_management:read | List permissions (opt. resource filter) | inline (:20) |

### service-members.ts (`serviceMembers:`) — buffer overrides + assignment
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `listMine` | self (no gate) | Own assigned services + buffers | inline (:33) |
| `updateMyBuffer` | self + assignment check | Set/clear own service buffer | inline (:78) |
| `listForMember` | user_mgmt OR service_mgmt:update | **NAME/BODY MISMATCH — does an INSERT/assign, not a list; see Gaps** | inline (:149) |
| `remove` | user_mgmt OR service_mgmt:update | Remove member from service | inline (:192) — **broken, see Gaps** |
| `listForService` | user/service/appt_mgmt:read | Members on a service | inline (:275) |

### services/ (folder; `services:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `list` | service_management:read (skip for client) | List services | `listServices` (`crud.procedures.ts:27`) |
| `getById` | service_management:read (skip client) + branch guard | Service detail | `getServiceById` (`crud:61`) |
| `create` | service_management:create + branch guard | Create | `createService`,`validateInstallmentPlanCodes` (`crud:91`) |
| `update` | service_management:update + branch guard | Update | `updateService` (`crud:192`) |
| `duplicate` | service_management:create | Clone | `duplicateService` (`crud:307`) |
| `resolvePrice` | (none) | Resolve effective price | `resolveServicePrice` (`pricing:22`) |
| `listPriceOverrides` | service_management:read (skip client) | Price overrides | `listServicePriceOverrides` (`pricing:42`) |
| `setBranchPrice` | service_management:update + branch guard | Set override | `setServicePrice` (`pricing:62`) |
| `expireBranchPrice` | service_management:update + scope | Expire override | `expireServicePrice` (`pricing:100`) |
| `deleteBranchPrice` | service_management:delete + scope | Delete override | `deleteServicePrice` (`pricing:148`) |
| `revenueShareByCategory` | service_management:read | Category revenue share | `revenueShareByCategory` (`analytics:17`) |
| `avgSessionsSoldPerMonth` | service_management:read (skip client) | Sessions/month | `avgSessionsSoldPerMonth` (`analytics:61`) |
| `listWithTrainerTiers` | service_management:read (skip client) | Services + tier rates | `listServicesWithTrainerTiers` (`analytics:83`) |

### service-categories.ts (`serviceCategories:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `list` | service_management:read (skip client) | List categories | `listServiceCategories` (:21) |
| `getById` | service_management:read (skip client) + branch guard | Category detail | `getServiceCategoryById` (:60) |
| `create` | service_management:create + branch guard | Create | `createServiceCategory` (:99) |
| `update` | service_management:update + branch guard | Update | `updateServiceCategory` (:146) |

### service-category-config.ts (`serviceCategoryConfig:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `upsert` | service_management:create OR update | Booking rules + buffer (ON CONFLICT) | inline (:23) |
| `getByCategoryId` | service_management:read | Config row or null | inline (:102) |

### category-buffer-overrides.ts (`categoryBufferOverrides:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `listForMember` | user OR service_mgmt:read | Member's category buffers | `listCategoryBufferOverridesForMember` (:48) |
| `upsert` | user OR service_mgmt:update | Set member category buffer | `upsertCategoryBufferOverride` (:67) |
| `listMine` | (none) | Own category buffers | `listCategoryBufferOverridesForMember` (:90) |
| `updateMine` | self + assignment check | Set own category buffer | `upsertCategoryBufferOverride` (:99) |

### trainers.ts (`trainers:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `weeklyStats` | user_management:read + self-or-approve | Single trainer week stats | `getTrainerWeeklyStats` (:29) |
| `weeklySchedule` | appointment_management:read | 7-day schedule | `getTrainerWeeklySchedule` (:83) |
| `weeklyStatsBatch` | user_management:approve | ≤100 trainers stats | `getTrainerWeeklyStatsBatch` (:121) |

### trainer-tiers.ts (`trainerTiers:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `list` | trainer_tier_management:read | List tiers | `listTrainerTiers` (:15) |
| `create` | trainer_tier_management:create | Create tier | `createTrainerTier` (:33) |
| `update` | trainer_tier_management:update | Update tier | `updateTrainerTier` (:64) |
| `deactivate` | trainer_tier_management:delete | Soft-disable | `deactivateTrainerTier` (:98) |
| `reactivate` | trainer_tier_management:update | Re-enable | `reactivateTrainerTier` (:123) |
| `assignToMember` | trainer_tier_management:update | Assign/clear member tier | `assignTierToMember` (:148) |

### organization-settings.ts (`organizationSettings:`)
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `get` | (any member) | Read setting by key | `getSetting` (:15) |
| `upsert` | role==='admin' (hard-coded) | Upsert setting | `upsertSetting` (:24) |

## Service Functions

**member.service.ts** — `getMembersByHierarchyScope`(node members), `updateMemberHierarchyScope`(reassign), `bulkUpdateMemberHierarchyScope`(bulk reassign), `getAllOrganizationMembersWithUserDetails`(cross-DB enrich), `createMember`(dual-write), `deactivateMember`(status=inactive+audit). All exposed.
**member-profile.service.ts** — `getMemberProfile`, `upsertMemberProfile`. Both exposed.
**member-stats.service.ts** — `getMembersNewToday`(dashboard). Exposed via `members.newToday`.
**customer-profile.service.ts** — `getCustomerProfile`, `upsertCustomerProfile`. Both exposed.
**customer-directory.service.ts** — `listCustomerDirectory`, `getCustomerStats`, `getCustomerDetail`. All exposed.
**walk-in.service.ts** — `convertWalkInPaymentToPackage`. Exposed (only live walk-in proc).
**hierarchy.service.ts** — `getDescendantNodeIds`(exposed broadly), `getAncestorNodeIds`(used by notification.service — not orphan to API but no direct proc), `createHierarchyNode`, `updateHierarchyNode`, `deleteHierarchyNode`, `moveHierarchyNode`, `listNodesWithStats`. All exposed except `getAncestorNodeIds` (indirect).
**hierarchy-validation.service.ts** — `getDepthForType`, `getParentTypeForType`(both internal helpers, `ORPHAN` from API surface — used inside validateHierarchyRules), `validateHierarchyRules`(used by createNode), `validateParentAccess`(used by create/scope/invite). 
**hierarchy-scope.ts** — `assertBranchAccessible`, `resolveBranchFilter`, `isBranchAccessDeniedError`. Consumed by `guards.ts` + `analytics.service.ts`. Not orphan.
**permission.service.ts** — `hasPermission`(used by trainers.ts + guards), `checkHierarchyPermission` `ORPHAN` (no caller outside its own file), `requirePermission`(used everywhere via guard). Also exports `PermissionDeniedError`, `Resource`, `Action` types.
**service.service.ts** — `listServices`, `getServiceById`, `createService`, `revenueShareByCategory`, `avgSessionsSoldPerMonth`, `listServicesWithTrainerTiers`, `duplicateService`, `updateService`. All exposed.
**service-category.service.ts** — `listServiceCategories`, `getServiceCategoryById`, `createServiceCategory`, `updateServiceCategory`. All exposed.
**trainer.service.ts** — `getTrainerWeeklyStats`, `getTrainerWeeklySchedule`, `getTrainerWeeklyStatsBatch`. All exposed.
**trainer-tier.service.ts** — `listTrainerTiers`, `createTrainerTier`, `updateTrainerTier`, `deactivateTrainerTier`, `reactivateTrainerTier`, `assignTierToMember`(all exposed), `getConfigsMissingRateForTier` **`ORPHAN`** (only re-exported in index.ts; no proc/source caller).
**category-buffer-overrides.service.ts** — `listCategoryBufferOverridesForMember`, `upsertCategoryBufferOverride`. Both exposed (4 procs).
**organization-settings.service.ts** — `getSetting`, `upsertSetting`. Both exposed.
**coach-intake.service.ts** — `listCoachIntakeSlots`, `upsertCoachIntakeSlots`, `computeOpenIntakeSlots`, `claimIntakeSlot`, `unclaimIntakeSlot`, `listIntakeExceptions`, `listCoachIntakeByBranch`. All exposed.
**branch-invite.service.ts** — `createBranchInvite`, `listBranchInvites`, `listAllBranchInvites`, `revokeBranchInvite`(all exposed); `validateBranchInvite` + `incrementBranchInviteUses` consumed by `onboarding.service.ts` (self-signup flow, outside this domain) — not orphan.
**invitation.service.ts** — `createInvitation`, `getInvitationByToken`, `validateInvitation`, `listInvitations`, `revokeInvitation`, `resendInvitation`, `checkSoftDeletedCustomerBlock`(all exposed); `markExpiredInvitations` **`ORPHAN`** — implements the invite "expire" lifecycle stage but has NO caller (no cron/scheduled job, no proc). See Gaps.

## Gaps (prioritized)

### P0 — Definitely broken

1. **`serviceMembers.listForMember` is mis-implemented (copy-paste bug).** `service-members.ts:149-186`. Doc + name say "list services for a member", but the handler body does `INSERT INTO serviceMembers ... onConflictDoNothing()` referencing `input.serviceId` — a field NOT in its Zod input (input is `{organizationId, memberId}`). At runtime `input.serviceId` is `undefined`, so this either type-errors or inserts a row with a null serviceId. It returns `{success:true}`, never a list. This is effectively a broken/missing `assign` procedure masquerading as `listForMember`. The documented `serviceMembers.assign` and `serviceMembers.updateBuffer` (api-overview.md:429,434) **do not exist** as keys.

2. **`serviceMembers.remove` references undefined input fields.** `service-members.ts:192-269`. Input schema is `{organizationId, memberId, serviceId}` but the body branches on `input.bufferTimeMinutes` (lines 238, 255) and `input.bufferTimeMinutes === null` — that field is not in the schema (always `undefined`), so the delete-override branch is dead and the else-branch upserts a buffer with `undefined`. The "remove member from service" intent (delete from `serviceMembers`) is never actually executed — it only ever touches `memberServiceBufferOverrides`. The actual unassign is missing.

### P1 — Lifecycle dead-ends / missing pieces

3. **Invitation "expire" stage is never triggered.** `invitation.service.ts:268 markExpiredInvitations` is fully written but has zero callers (no cron, no scheduled job in `apps/server`, no proc). `validateInvitation` does compute expiry on read, so expired invites are rejected lazily — but their `status` is never flipped to `"expired"`, so `invitations.list?status=expired` will always return [] and the "expired" enum value is dead in practice. Lifecycle create/accept/decline/revoke/resend/getByToken are all complete; only the proactive expire sweep is unwired.

4. **`walk-in-customers` is a hollow router.** `walk-in-customers.ts:16-24`. `list` returns a hard-coded empty `{items:[],total:0}`; `getById/create/update/deactivate` all throw `BAD_REQUEST "Walk-in customers have been removed"`. Only `convertToPackage` is live. This is *intentional* (deprecation, per the comments) but the api-overview.md:522 still documents `walk-in-customers.list` as a real "List walk-in customers" — a stale doc + the schema for walk_in_customers still exists. Decide: remove the router or document the deprecation. Not a code bug, but a misleading surface.

### P2 — Completeness / coverage

5. **`households` missing update + delete.** `households.ts` has create/addMember/removeMember/get/list but no `update` (rename household, change primaryContactProfileId without delete) and no `delete` (dissolve a household). The `households` table exists with `name`, `notes`, `primaryContactProfileId` columns that can only be set at create time. Likely-intentional thin v1, but flagged as missing CRUD vs schema.

6. **`coach-intake` has no permission gate on most reads/mutations.** `listSlots`, `getOpenSlots`, `unclaimSlot`, `listExceptions`, `listByBranch` have NO `requirePermissionOrpc` (comments say "no permission gate"). `unclaimSlot` (`coach-intake.ts:155`) deletes an intake exception for ANY authenticated tenant member with zero gate and no self-check — looser than `claimSlot`/`upsertSlots` which at least enforce admin-or-self. Possible privilege gap (any member can unblock any coach's slot).

7. **No member-level permission grants — RBAC is role-level only.** `permissions.list` is read-only (correct). Permission *assignment* is exclusively via `rolePermissions.add/remove` against a role; there is no procedure to grant/revoke a permission to an individual member (member↔permission). `role_permissions.scope` enum includes `"own"|"team"|"branch"|"organization"` but `hasPermission` (`permission.service.ts:93-145`) **never reads `scope`** — it only checks existence of the role→permission row. So scope-narrowing (own/team/branch) is stored but not enforced; all granted perms behave as org-wide. Row-level scoping is instead done ad-hoc per-router via `accessibleNodeIds`. Flag if member-level grants or scope enforcement is a requirement.

8. **`organizationSettings.upsert` bypasses the RBAC system.** `organization-settings.ts:28` hard-codes `if (context.member.role !== "admin") throw FORBIDDEN` instead of `requirePermissionOrpc`. A custom role with org-admin-equivalent permissions but `role !== "admin"` (text) cannot write settings. Inconsistent with the rest of the domain.

### P3 — Doc drift (zhub/shared/api-overview.md)

9. **api-overview.md badly understates the members router.** Documents 8 procs (members.ts:245-252); actual = 13 (`members/index.ts`): missing `updateScope`, `softDelete`, `restore`, `retryGhlSync`, `newToday`. (Doc was written pre folder-split.)
10. **`service-members` doc lists `assign` + `updateBuffer`** (api-overview.md:429,434) which **do not exist**; omits the fact that `listForMember`/`remove` are mis-wired (#1,#2).
11. **`services` doc omits** `duplicate`, `resolvePrice`, `listPriceOverrides`, `setBranchPrice`, `revenueShareByCategory`, `avgSessionsSoldPerMonth`, `listWithTrainerTiers` (only 6 of 13 listed; api-overview.md:437).
12. **`trainer-tiers` doc lists a `delete` proc** (api-overview.md:494) — code has `deactivate`+`reactivate`+`assignToMember` instead, no hard `delete`.
13. **`hierarchy` doc omits** `listNodesWithStats`; node-type labels say "country/region/area/branch" but schema/code use `country/state/branch` (create.procedures.ts:27).
14. **No api-overview sections** for `households`, `coach-intake`, `branch-invites`, `trainers` at all — four wired routers undocumented.
15. **MEMORY note is STALE:** `route-guards.ts requirePermission is a stub` is no longer true — `apps/web/src/lib/route-guards.ts:85` is fully implemented (reads userContext, system-admin bypass, fails closed). Safe to use in `beforeLoad`.

### Notes (possibly-intentional, not bugs)
- `services` router has no hard `delete` — deactivation is via `update{isActive:false}`. Consistent across service-categories too.
- `members.list` self-row returns `name/email: "Unknown"` (`list.procedures.ts:65`) — deliberate (skips cross-DB enrich for the self short-circuit).
- The audit-after-write "rare orphan window" comments in members status/role/scope procedures are acknowledged deviations (`status.procedures.ts:97`), not defects.

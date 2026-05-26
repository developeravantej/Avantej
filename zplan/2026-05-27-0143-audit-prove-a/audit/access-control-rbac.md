# Audit: access-control-rbac
**Files inspected:** 9 routers, 5 services
**Findings:** P1: 4, P2: 4, P3: 2, Total: 10

## Findings

### AC-A-01 — `role-permissions.add` allows privilege escalation via permission grant
- **Severity:** P1
- **Status:** missing
- **Testable:** true
- **File:** `packages/api/src/routers/role-permissions.ts:65-131`
- **Symptom:** Any caller holding `user_management:update` can grant ANY permission to ANY non-admin custom role — including their own role. A manager with that permission can self-grant `commission_payout:approve`, `audit_log:read`, `tax_configuration:update`, etc.
- **Evidence:**
  ```ts
  add: tenantProcedure
    .input(z.object({ /* roleId, permissionId */ }))
    .handler(async ({ input, context }) => {
      assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "update")
      // ... validates role & permission exist, then inserts rolePermissions row
      // NO check that caller already holds the target permission
      // NO check that caller is admin/owner-equivalent
      // NO check that target role priority < caller's priority
  ```
- **Why it's wrong:** Permission-grant is itself a sensitive operation that should be gated by "you can only grant permissions you already hold" (the standard "non-escalating" rule). `user_management:update` is meant for managing *users* (assign role, invite, deactivate) — not for redefining the privilege set of a role. A non-admin manager with `user_management:update` becomes a de-facto super-admin.
- **Suggested fix (do NOT apply):** Restrict `role-permissions.add` and `role-permissions.remove` to `role_management:update` (a distinct resource that exists in `permission.service.ts` Resource union but is unused), and additionally verify the caller currently has that resource:action before granting it to another role. Reject inserts when target role priority ≥ caller's effective role priority.
- **Owned files:** `packages/api/src/routers/role-permissions.ts`, `packages/services/src/permission.service.ts`
- **Notes:** This is the highest-impact finding in the domain. `roles.create/update/delete` also use `user_management:*` — those should move to `role_management:*` for the same reason (AC-A-02 covers this).

---

### AC-A-02 — `roles.create/update/delete` and `permissions.list` mis-gated under `user_management` instead of `role_management`
- **Severity:** P1
- **Status:** missing
- **Testable:** true
- **File:** `packages/api/src/routers/roles.ts:32,63,117,189`; `packages/api/src/routers/permissions.ts:31`
- **Symptom:** All role CRUD operations and the permission catalog query gate on `user_management:*` instead of `role_management:*`. A staff member granted "manage users" (invite/deactivate) inadvertently gets "rewrite the role definitions for the org".
- **Evidence:**
  ```ts
  // roles.ts line 63 (create)
  await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "create")
  // roles.ts line 117 (update)
  await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "update")
  // roles.ts line 189 (delete)
  await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "delete")
  // permissions.ts line 31
  await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "read")
  ```
  `role_management` is declared as a valid `Resource` in `permission.service.ts:27` but never gated against in the routers.
- **Why it's wrong:** Conflates two different administrative scopes. The CLAUDE.md / Phase 3 plan explicitly added `role_management` as a distinct resource; routers ignore it.
- **Suggested fix:** Switch the four call sites to `role_management:create|read|update|delete`. Compounds with AC-A-01.
- **Owned files:** `packages/api/src/routers/roles.ts`, `packages/api/src/routers/permissions.ts`, `packages/api/src/routers/role-permissions.ts`
- **Notes:** Easy mechanical change but requires backfilling `role_management:*` rows into the system "admin" role's `role_permissions` so existing admins don't lose access.

---

### AC-A-03 — `branch-invites.revoke` / `regenerate` don't validate branch scope
- **Severity:** P1
- **Status:** missing
- **Testable:** true
- **File:** `packages/api/src/routers/branch-invites.ts:153-192` (revoke), `199-266` (regenerate)
- **Symptom:** A user with `hierarchy_management:delete`/`create` scoped to branch A can revoke or regenerate branch B's QR-signup invite. Only the org match and permission are checked; the invite's `hierarchyScopeId` is never compared against `context.accessibleNodeIds`.
- **Evidence:**
  ```ts
  // revoke (line 153)
  assertOrgContextMatch(context, input);
  await requirePermissionOrpc(... "hierarchy_management", "delete");
  const updated = await revokeBranchInvite(context.tenantDb, input.id) // no scope check
  ```
  ```ts
  // regenerate (line 207-244)
  assertOrgContextMatch(context, input);
  await requirePermissionOrpc(... "hierarchy_management", "create");
  const oldInvite = await context.tenantDb.query.invitations.findFirst({
    where: and(eq(invitations.id, input.id), eq(invitations.kind, "branch_self_signup")),
  });
  // oldInvite.hierarchyScopeId NOT validated against accessibleNodeIds
  await revokeBranchInvite(context.tenantDb, input.id);
  const newInvite = await createBranchInvite(context.tenantDb, { branchId: oldInvite.hierarchyScopeId, ... });
  ```
  Contrast with `create` and `list` on the same router, which both call `guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? [])`.
- **Why it's wrong:** A regional manager can disable signup for branches outside their region (denial-of-service against another branch), or rotate the QR token without authorization. Regenerate is doubly bad — it also lets them spawn a new invite for a branch they shouldn't see.
- **Suggested fix:** After loading the invite row (or via a join inside `revokeBranchInvite`), call `guardBranchAccessible(invite.hierarchyScopeId, context.accessibleNodeIds ?? [])` before the revoke/create.
- **Owned files:** `packages/api/src/routers/branch-invites.ts`, optionally `packages/services/src/branch-invite.service.ts`
- **Notes:** Identical to the prior ST-04 hierarchy-reassign fix pattern but applied to invites.

---

### AC-A-04 — Soft-deleted members are not filtered by tenant middleware → keep full permissions after deactivation
- **Severity:** P1
- **Status:** missing
- **Testable:** true
- **File:** `apps/server/src/middleware/orpc-tenant.middleware.ts:191-201`; `packages/services/src/permission.service.ts:93-145`
- **Symptom:** When an admin deactivates a member via `members.deactivate` (which sets `deletedAt`), the user's existing session continues to function. The tenant middleware loads the member row without filtering on `deletedAt IS NULL`, so `hasPermission` evaluates as if the member were active. A revoked admin can still call any mutation until their session cookie expires.
- **Evidence:**
  ```ts
  // orpc-tenant.middleware.ts:191
  const member = await tenantDb.query.members.findFirst({
    where: eq(members.userId, user.id),
    // Missing: isNull(members.deletedAt) — schema declares deletedAt at members.ts:51
  });
  if (member) {
    /* set context.member, accessibleNodeIds — no status/deletedAt check */
  }
  ```
  Schema confirms `deletedAt` is the soft-delete marker:
  ```ts
  // packages/db/src/schema/tenant/members.ts:51
  deletedAt: timestamp("deleted_at"),
  ```
- **Why it's wrong:** The deactivation flow promises to revoke access but actually just hides the user from list queries. Any sensitive mutation (financial, RBAC, customer PII export) keeps working for the deactivated user until their Better-Auth session naturally expires. Combined with AC-A-01, a deactivated former-admin could still grant new permissions.
- **Suggested fix:** Add `and(eq(members.userId, user.id), isNull(members.deletedAt))` to the middleware lookup; also reject `status !== 'active'`. Optionally invalidate the user's Better-Auth sessions at deactivation time.
- **Owned files:** `apps/server/src/middleware/orpc-tenant.middleware.ts`
- **Notes:** Pairs with members-management remediation. Should also check `status === 'active'`, not only soft-delete.

---

### AC-A-05 — `registration.complete` lets any authenticated user join any org as `client` without invitation or email verification
- **Severity:** P2
- **Status:** missing
- **Testable:** true
- **File:** `packages/api/src/routers/registration.ts:71-180`
- **Symptom:** Public `listBranches` exposes branch IDs and their `organizationId` for every org with a published branch. Any logged-in user (after Better-Auth sign-up, which by default doesn't require email verification in this codebase) can call `registration.complete` with arbitrary `branchId` + `organizationId` and instantly become a client member of that org with `hierarchyScopeId` = branch's tenantNodeId.
- **Evidence:**
  ```ts
  // line 45-64 (public, no auth)
  listBranches: publicProcedure.input(...).handler(/* returns id, name, address, organizationId */)
  // line 71 — only requires protectedProcedure (any session)
  complete: protectedProcedure.input(/* branchId, organizationId, … */).handler(...)
    // No invitation token, no email-verified check, no admin approval.
    // Branch ↔ org check exists (line 119) but doesn't restrict which orgs accept signups.
  ```
  Compare with `onboarding.redeemInvite` which requires a valid `branch_self_signup` token gated by admin-issued QR.
- **Why it's wrong:** Either (a) this is dead/legacy code superseded by the QR-invite flow and should be removed, or (b) it's an intentional self-signup but it bypasses the `branch_self_signup` lifecycle (no `usesCount` cap, no `isActive` revocation, no per-branch QR control). It also creates `members` rows + control-panel `organization_members` rows without invoking the tenant `branch-invite` audit trail.
- **Suggested fix:** Require either (a) a valid branch_self_signup token threaded through registration, or (b) an organization-level `allowOpenRegistration` setting that's false by default. Also gate behind `emailVerified=true` on the user record.
- **Owned files:** `packages/api/src/routers/registration.ts`
- **Notes:** Worth getting product confirmation — this might be intentional, but if so it needs the same rails as the QR flow.

---

### AC-A-06 — Invitation tokens stored in plaintext and returned in list responses
- **Severity:** P2
- **Status:** partial
- **File:** `packages/services/src/invitation.service.ts:80,99-103`; `packages/api/src/routers/branch-invites.ts:78,144,257`
- **Symptom:** Both staff (`createInvitation`) and branch-invite tokens are stored as raw hex/base64url in `invitations.token`. The `branchInvites.create`, `list`, `listAll`, and `regenerate` procedures return the raw token to the API client and embed it in URLs. Anyone with DB read (compromised credentials, backup leak) gets reusable invitation links. The staff-invitation `manage.procedures.list` correctly omits the token, but `invitations.create` and `invitations.resend` return it (line 169, 144 in their respective files).
- **Evidence:**
  ```ts
  // invitation.service.ts:80
  const token = randomBytes(32).toString("hex"); // stored as-is
  // create.procedures.ts:169
  token: invitation.token, // returned to caller
  // branch-invites.ts:78
  return { token: invite.token, url, ... };
  // manage.procedures.ts:50 deliberately omits token, leaving the others inconsistent
  ```
- **Why it's wrong:** Standard practice is to store a SHA-256 hash of the token; the raw token is shown to the admin once (or embedded in email) and never persisted in plaintext. Token-bearer model means anyone with read access to `invitations.token` can accept the invite as the invitee (and trigger `verifyEmailByToken` to pre-verify their account).
- **Suggested fix:** Store `tokenHash = sha256(token)`. Lookups (`getInvitationByToken`, `validateBranchInvite`) hash the input then compare. Branch-invite QR URLs can still embed the raw token (admin holds it), but DB stores only the hash. Staff-invitation tokens must never be returned from `list*`.
- **Owned files:** `packages/services/src/invitation.service.ts`, `packages/services/src/branch-invite.service.ts`, `packages/api/src/routers/invitations/create.procedures.ts`, `packages/api/src/routers/invitations/manage.procedures.ts`, `packages/api/src/routers/branch-invites.ts`
- **Notes:** Larger refactor; suggest hashing for new tokens and dual-reading until backfill completes.

---

### AC-A-07 — Branch-invite usesCount race: validate-then-increment is not atomic
- **Severity:** P2
- **Status:** partial
- **Testable:** true
- **File:** `packages/services/src/onboarding.service.ts:133-233`; `packages/services/src/branch-invite.service.ts:238-280`
- **Symptom:** `redeemBranchInvite` calls `validateBranchInvite` (reads `usesCount`, compares to `maxUses`) and only later, inside a tenant-DB transaction, runs `UPDATE … SET uses_count = uses_count + 1`. Two concurrent redemptions of an invite with `maxUses=1` both pass validation, both insert member rows, both increment — resulting in `usesCount=2`. The transaction protects against partial writes but not against TOCTOU on `maxUses`.
- **Evidence:**
  ```ts
  // onboarding.service.ts:133 (read-only validation)
  const { isValid, invite } = await validateBranchInvite(tenantDb, token);
  // … several async steps later …
  // onboarding.service.ts:202 (separate transaction)
  await tenantDb.transaction(async (tx) => {
    await tx.insert(members).values(...).returning();
    await tx.update(invitations).set({ usesCount: sql`uses_count + 1` }).where(eq(invitations.id, invite.id));
  });
  ```
  No `SELECT … FOR UPDATE` and no `WHERE uses_count < max_uses` clause on the increment.
- **Why it's wrong:** A branch admin who sets `maxUses=1` to limit signup to a single person can have the limit exceeded by two simultaneous form submissions. Low-likelihood in practice but trivially exploitable for QR-codes shared with a known crowd.
- **Suggested fix:** Make the increment conditional inside the same SQL: `UPDATE invitations SET uses_count = uses_count + 1 WHERE id = ? AND is_active = true AND (max_uses IS NULL OR uses_count < max_uses) RETURNING uses_count`. Then check `rows.length === 1` and abort the member insert if not.
- **Owned files:** `packages/services/src/onboarding.service.ts`, `packages/services/src/branch-invite.service.ts`
- **Notes:** Same race likely exists in concurrent staff-invite acceptance, but staff invites are single-use by token uniqueness so less impactful.

---

### AC-A-08 — `organization-settings.upsert` uses text-only admin check that bypasses RBAC tables
- **Severity:** P2
- **Status:** partial
- **File:** `packages/api/src/routers/organization-settings.ts:28`
- **Symptom:** `upsertSetting` is gated by `context.member.role !== "admin"` (legacy text column) rather than `requirePermissionOrpc(... "role_management"|"hierarchy_management", "update")` or the `hasPermission`-based check. This bypasses the entire `roleId → role_permissions` model.
- **Evidence:**
  ```ts
  // organization-settings.ts:28
  if (context.member.role !== "admin") throw new ORPCError("FORBIDDEN", { message: "Admin only" });
  ```
- **Why it's wrong:** Org settings (grace period days, feature flags) are sensitive but the rest of the codebase moved to RBAC-driven gating. A user with a custom role whose priority is 100 (admin-equivalent) is incorrectly blocked, while a member whose text `role='admin'` but whose `roleId` points to a custom "support" role with no permissions still passes. The two checks can disagree.
- **Suggested fix:** Either define a new resource (e.g. `organization_settings:update`) and gate on `requirePermissionOrpc`, or at minimum mirror `hasPermission`'s priority-based admin check: load `member.roleId`, look up the role row, accept when `role.priority >= 100`.
- **Owned files:** `packages/api/src/routers/organization-settings.ts`
- **Notes:** Same text-role pattern likely lives elsewhere — would be worth a follow-up grep for `member.role !== "admin"` across all routers.

---

### AC-A-09 — `getInvitationByToken` / `getByToken` are unauthenticated and leak invitation metadata
- **Severity:** P3
- **Status:** partial
- **Testable:** true
- **File:** `packages/api/src/routers/invitations/public.procedures.ts:261-298` (getByToken); `packages/services/src/invitation.service.ts:114-123`
- **Symptom:** `invitations.getByToken` is `publicProcedure` and returns `{ email, role, status, expiresAt, createdAt }` for any caller who possesses the token. Combined with AC-A-06, anyone holding the raw token can enumerate the invitee's email and role without authentication.
- **Evidence:**
  ```ts
  // public.procedures.ts:261
  getByToken: publicProcedure.input(z.object({ token, organizationId })).handler(async ({...}) => {
    const invitation = await getInvitationByToken(input.token, context.tenantDb);
    return { invitation: { id, email, role, status, expiresAt, createdAt }, isValid, error };
  });
  ```
- **Why it's wrong:** Required for the accept-flow UX, but the response surface is broader than needed (email exposure to anyone who scrapes plaintext tokens). A scoped response — e.g. masked email `j***@example.com` plus role label — would still meet the UX requirement.
- **Suggested fix:** Mask the email in the response (`maskEmail(invitation.email)`) and consider returning only the inviter's organization name + role label.
- **Owned files:** `packages/api/src/routers/invitations/public.procedures.ts`
- **Notes:** Low impact on its own; meaningful in combination with AC-A-06.

---

### AC-A-10 — `requirePermissionOrpc` wrapped in try/catch in branch-invites swallows error message granularity
- **Severity:** P3
- **Status:** cosmetic
- **File:** `packages/api/src/routers/branch-invites.ts:57-64, 97-102, 124-131, 166-173, 213-220`
- **Symptom:** Each call to `requirePermissionOrpc` (which already throws `ORPCError("FORBIDDEN", …)`) is wrapped in `try { … } catch { throw new ORPCError("FORBIDDEN", { message: "…" }) }`. The catch discards the underlying error entirely (no `error` parameter), replacing the precise `PermissionDeniedError` message with a generic string and losing any future error-mapping logic added to `mapToOrpcForbidden`.
- **Evidence:**
  ```ts
  try {
    await requirePermissionOrpc(context.tenantDb, context.member, "hierarchy_management", "create");
  } catch {
    throw new ORPCError("FORBIDDEN", {
      message: "You do not have permission to create branch invites.",
    });
  }
  ```
- **Why it's wrong:** Defensive code that silences upstream errors. If `requirePermissionOrpc` ever throws something other than `FORBIDDEN` (e.g. a DB error during role lookup), it gets re-mapped to FORBIDDEN here, masking the real failure in logs.
- **Suggested fix:** Drop the wrapping try/catch; let `requirePermissionOrpc` throw directly. If a custom message is desired, pass it via a parameter to `requirePermissionOrpc` rather than catching and rethrowing.
- **Owned files:** `packages/api/src/routers/branch-invites.ts`
- **Notes:** Same anti-pattern repeated 5x in this file; one fix covers all.

---

## Summary

The access-control-rbac domain has four P1 issues centered on the gap between the legacy text-role model and the newer `roles`/`role_permissions` RBAC tables. The most severe is **AC-A-01**: any holder of `user_management:update` can self-escalate via `role-permissions.add`, because the gate is on user management (intended for inviting/deactivating users) rather than on managing role definitions. **AC-A-02** is the same conflation across `roles.*` and `permissions.list` — the codebase declares a `role_management` resource that is never used. **AC-A-03** mirrors prior ST-04 fixes but for branch invites: revoke/regenerate skip `guardBranchAccessible` and let cross-branch destructive ops through. **AC-A-04** is the loudest operational gap: the tenant middleware loads members without an `isNull(deletedAt)` filter, so deactivation does not revoke access until the Better-Auth session expires. P2 findings cluster around token handling (plaintext storage, leaky `getByToken`, registration without invite/verification, race on `usesCount`), and `organization-settings.upsert` continues to use a text-role admin check that disagrees with the rest of the RBAC system. P3 entries are a metadata leak on `getByToken` and a repeated try/catch anti-pattern around `requirePermissionOrpc` in `branch-invites.ts`. All findings cite exact file:line evidence and are independently testable.

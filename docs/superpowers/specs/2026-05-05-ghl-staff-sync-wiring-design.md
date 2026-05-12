# GHL Staff Sync — Router Wiring Design

**Status:** Draft for review
**Date:** 2026-05-05
**Branch:** TBD (likely `feat/ghl-staff-sync-wiring`)
**Predecessor spec:** `2026-04-30-ghl-sync-design.md`

## Goal

Wire the existing `syncStaffToGhl` orchestrator into Avantej staff CRUD flows so that every create / role change / branch reassignment / profile change on a staff member (`role IN admin|staff|trainer`) propagates to the corresponding GHL User in the connected branch's GHL location.

This is the **"Phase 7.4 wiring"** referenced in project memory. The orchestrator (`apps/server/src/services/ghl/sync-staff.ts`), schema (`ghl_user_links`, `ghl_branch_links`), payload builders, and HTTP client are already built. Only the call sites are missing.

## Out of scope

- Customer sync (covered by predecessor spec)
- Inbound webhooks
- Cron-based retry (manual retry only; deferred)
- New GHL resources (appointments, opportunities, conversations)

## Decisions locked in

| # | Question | Choice | Rationale |
|---|---|---|---|
| Q1a | Behavior on Avantej `members.deactivate` | **Skip GHL DELETE; mark `ghl_user_links.syncStatus='inactive'` locally** | Preserve GHL history. GHL has no soft-delete concept. |
| Q1b | Behavior on branch reassignment (`hierarchyScopeId` changes to a different branch) | **PUT existing GHL user**: update `locationIds` + custom field `existingBranch`, preserve `ghlUserId`. Update `ghl_user_links.branchNodeId` + `ghlLocationId`. | Matches user's GHL convention: one GHL user per person across branches, branch tracked via custom field. Preserves identity + external refs. |
| Q1c | User profile changes (firstName/lastName/email in control panel `user`) | **Sync — PUT all linked GHL users for that user** | Profile drift in GHL is unacceptable. |
| Q2/Q3 | Execution model + failure mode | **Inline call, soft fail.** Avantej DB write commits first. GHL call awaited in same request. On failure: store `lastError` in `ghl_user_links`, return success with `ghlSync: { status: 'error', error }` field in response. | Simple model; failures observable. No outbox infra needed for v1. |
| Q4 | Compensation on cross-system failure | **None (Avantej canonical, GHL eventually consistent).** Effectively downgrades earlier "hard fail" intent because no retry infra. | Avoids distributed-transaction complexity. |
| Q5 | Retry mechanism | **Manual button per row in UI.** Reads `lastError`, calls new `members.retryGhlSync` procedure. | Simplest. Cron-driven retry can be added later. |
| Q6 | Staff member assigned to non-branch scope (region/area) | **Skip GHL sync; mark `syncStatus='skipped'`, reason='non-branch-scope'`.** | Preserves single-identity model. Sync resumes if scope later changes to a branch. |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Router layer (oRPC + invitation flow + auth profile hook) │
│  - members.create                                          │
│  - members.updateRole                                      │
│  - members.updateScope (branch reassignment)               │
│  - members.deactivate                                      │
│  - members.retryGhlSync (new)                              │
│  - invitations.acceptWithSignup                            │
│  - users.updateProfile (or better-auth hook)               │
└──────────────┬──────────────────────────────────────────────┘
               │ await dispatchStaffSync(args)
               │ await dispatchProfileSync(args)
               ▼
┌─────────────────────────────────────────────────────────────┐
│  packages/services/src/ghl-staff-sync.service.ts (NEW)     │
│                                                             │
│  Single source of truth for staff-sync rules:              │
│   1. Resolve branchNodeId from member.hierarchyScopeId     │
│   2. Apply skip rules (Q1a, Q6, role gate)                 │
│   3. Detect branch reassignment (Q1b)                      │
│   4. Build AvantejUser from control panel user             │
│   5. Call syncStaffToGhl                                   │
│   6. Catch all errors → return StaffSyncResult             │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  apps/server/src/services/ghl/sync-staff.ts (EXISTING)     │
│  POST/PUT/DELETE /users/  + ghl_user_links upsert          │
└─────────────────────────────────────────────────────────────┘
```

## Component contracts

### `packages/services/src/ghl-staff-sync.service.ts` (new)

```ts
export type StaffSyncOperation = "create" | "update" | "delete";

export interface DispatchStaffSyncArgs {
  controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
  tenantDb: NeonDatabase<typeof tenantSchema>;
  organizationId: string;
  memberId: string;          // tenant member.id
  operation: StaffSyncOperation;
  env: { GHL_AGENCY_ID: string; ENCRYPTION_KEY: string };
}

export type StaffSyncSkipReason =
  | "non-staff-role"
  | "non-branch-scope"
  | "branch-not-connected"
  | "deactivate-skip";

export interface StaffSyncResult {
  status: "synced" | "skipped" | "error";
  reason?: StaffSyncSkipReason;
  ghlUserId?: string;
  error?: string;
}

export async function dispatchStaffSync(
  args: DispatchStaffSyncArgs,
): Promise<StaffSyncResult>;

export interface DispatchProfileSyncArgs {
  controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
  userId: string;
  env: { GHL_AGENCY_ID: string; ENCRYPTION_KEY: string };
}
export async function dispatchProfileSync(
  args: DispatchProfileSyncArgs,
): Promise<StaffSyncResult[]>;
```

### Internal flow — `dispatchStaffSync`

1. Load member from `tenantDb.members` where `id = memberId`. Missing → `{status:'error', error:'member not found'}`.
2. Skip if `role NOT IN (admin, staff, trainer)` → return `{status:'skipped', reason:'non-staff-role'}`.
3. If `operation = 'delete'` (deactivate) → if existing `ghl_user_links` row, set `syncStatus='inactive'`. Return `{status:'skipped', reason:'deactivate-skip'}`. **Do not call GHL.**
4. Resolve branch from `member.hierarchyScopeId`:
   - Load hierarchy node. If `node.type !== 'branch'` → `{status:'skipped', reason:'non-branch-scope'}`.
5. Load `user` from control panel by `member.userId`. Missing → error.
6. Look up `ghl_branch_links` for (organizationId, branchNodeId). Missing or `isActive=false` → `{status:'skipped', reason:'branch-not-connected'}`.
7. **Branch reassignment detection (Q1b):** if `operation='update'` AND existing `ghl_user_links` row has `branchNodeId !== resolvedBranchNodeId`:
   - Build payload with new `locationIds = [newLocation]` AND custom field `existingBranch = newBranchName`.
   - Call `syncStaffToGhl({operation:'update'})`. Existing orchestrator already PUTs and upserts the link row by `(memberId, branchNodeId)`. **Plan-phase note:** verify upsert behavior handles branchNodeId change correctly; may require service to first update the link's branchNodeId, or to delete-old/insert-new in a transaction. Decision deferred to plan phase.
8. Otherwise call `syncStaffToGhl({...})` as-is.
9. All errors caught → `{status:'error', error: msg}`. Function never throws.

### Internal flow — `dispatchProfileSync`

1. Query control panel `organization_members` where `userId = X` to find all orgs.
2. For each org:
   - Decrypt `organizations.connectionString`, open tenant DB pool.
   - Query tenant `ghl_user_links` where `userId = X` AND `syncStatus IN ('active','error')`.
   - For each link, call `dispatchStaffSync({memberId: link.memberId, operation:'update'})`.
3. Return aggregated `StaffSyncResult[]`.

**Caveat:** Per-request connection cost is high (one pool per org). Acceptable for v1 since profile updates are infrequent. Optimize later if needed.

## Router wiring sites

### `packages/api/src/routers/members.ts`

| Procedure | Wiring |
|---|---|
| `create` | After `createMember()` returns, await `dispatchStaffSync({ memberId, operation:'create' })`. Attach result as `ghlSync` field in response. |
| `updateRole` | After `updateMemberRole()` returns, await `dispatchStaffSync({ memberId, operation:'update' })`. |
| `updateScope` (branch reassignment) | New or existing procedure. Same wiring with `operation:'update'`. Service detects branch change. |
| `deactivate` | After `deactivateMember()` returns, await `dispatchStaffSync({ memberId, operation:'delete' })`. Service handles skip per Q1a. |
| `retryGhlSync` (new) | Input: `{ memberId }`. Calls `dispatchStaffSync({ operation:'update' })`. Returns result. |

All `dispatchStaffSync` calls wrapped in try/catch at router level for defense-in-depth (service shouldn't throw, but if it does, don't fail the parent CRUD).

### `apps/server/src/routers/invitations.ts`

In `acceptWithSignup` flow, after the new member row is inserted, await `dispatchStaffSync({ memberId, operation:'create' })`.

### Profile-update hook

Better-Auth manages user profile updates. Plan-phase task: identify whether to:
- (a) Add `users.updateProfile` oRPC procedure that wraps better-auth + calls `dispatchProfileSync`, OR
- (b) Use a Better-Auth event hook (if SDK exposes one).

Spec records this as: **"Profile-update hook calls `dispatchProfileSync(userId)` after better-auth user record updated. Choice between (a) and (b) deferred to plan phase based on better-auth hook availability."**

### UI (web app)

| Surface | Behavior |
|---|---|
| Members list table | Add `GHL Sync` column. Reads `ghl_user_links.syncStatus` for the member. Badge: `synced` (green) / `inactive` (gray) / `skipped` (gray with tooltip showing reason) / `error` (red). |
| Error badge tooltip | Shows `lastError` text. |
| Retry button | Visible only when `syncStatus = 'error'`. Calls `members.retryGhlSync({ memberId })`. On success, refresh row. |

## Error handling + edge cases

| Edge case | Behavior |
|---|---|
| GHL 401 (bad / expired API key) | `lastError = "auth: ..."`. UI surfaces "Reconnect branch" CTA. |
| GHL 409 (email already exists in GHL) | `lastError = "dup-email: ..."`. Manual resolution required (admin must merge in GHL). |
| GHL 5xx / network timeout | `lastError = msg`. Manual retry button works. |
| Member created with non-staff role (e.g. `client`) | Skip. No `ghl_user_links` row written. Response includes `ghlSync: {status:'skipped', reason:'non-staff-role'}`. |
| Role transition `non-staff → staff` | `dispatchStaffSync({operation:'update'})` detects no existing link → POSTs new GHL user. |
| Role transition `staff → non-staff` | Skip (non-staff-role). No GHL DELETE. Existing link stays as-is (or could be marked `inactive`; plan-phase decision). |
| Branch link removed by admin | Existing GHL users in that location become orphans. No automatic action. |
| `dispatchProfileSync` partial failure (3 orgs, 1 fails) | Returns array of results. UI surfaces per-org status. |
| Concurrent `members.create` race | `ghl_user_links` unique index `(memberId, branchNodeId)` + `onConflictDoUpdate` makes second insert idempotent. |
| `GHL_AGENCY_ID` env missing | `dispatchStaffSync` throws config error → caller's try/catch returns 500 with clear message. Surface in admin UI. |

## Testing

| Layer | Test |
|---|---|
| `packages/services/src/ghl-staff-sync.service.test.ts` (new) | Unit. Mock `syncStaffToGhl` + DB queries. Coverage: all skip reasons (non-staff-role, non-branch-scope, branch-not-connected, deactivate-skip), happy path create/update, branch reassignment, profile bulk dispatch. |
| `packages/api/src/routers/members.test.ts` (extend) | Integration. Mock GHL HTTP layer. Verify `dispatchStaffSync` is called per CRUD op + that response includes `ghlSync` field. |
| `apps/server/src/routers/invitation-acceptance.test.ts` (extend) | Add case: acceptWithSignup → dispatch fired with `operation:'create'`. |
| `apps/server/src/services/ghl/sync-staff.test.ts` | Existing. Unchanged. |
| Manual e2e (GHL sandbox) | Create staff member → verify GHL user appears with correct role + locationIds. Branch reassign → verify locationIds + `existingBranch` custom field updated, ghlUserId preserved. |

## Open items (plan-phase decisions)

1. **Profile-update hook strategy** — wrap better-auth in oRPC procedure vs use better-auth event hook.
2. **Branch reassignment link-row behavior** — verify `syncStaffToGhl`'s upsert correctly handles `branchNodeId` change. May need to delete-old + insert-new transactionally.
3. **`ghl_user_links` "inactive" `syncStatus` value** — confirm schema permits this string (currently default is "active"; column is plain `text` so any string accepted).
4. **`existingBranch` custom field id** — must be created in GHL location and id stored somewhere (likely extend `ghl_branch_links` or a per-location custom-field map similar to `CustomFieldIdMap` in `payload-builders.ts`).
5. **Members router response schema** — adding `ghlSync` field is non-breaking only if frontend tolerates extra fields. Verify.

## Dependencies

- `GHL_AGENCY_ID` already in env (memory: `iDgsCeSnq9lA4PWPSTFI`).
- `ENCRYPTION_KEY` already in env.
- No new packages required. No schema changes required for v1.

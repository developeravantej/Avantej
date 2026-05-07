# API Surface Audit — Pass 1

**Auditor:** api-surface-auditor
**Date:** 2026-05-07

## Summary

The plan proposes adding one new procedure `serviceMembers.listForService`. All other procedures claimed to be "already wired" are confirmed. One significant finding: the OR-check permission claim for `listForService` does not include `appointment_management`, but the plan's stated rationale requires it.

## Verified: Existing procedures in `baseRouter`

File: `packages/api/src/routers/index.ts`

| Key | Router | Status |
|---|---|---|
| `serviceMembers` | `serviceMembersRouter` | CONFIRMED at line 122 |
| `serviceCategoryConfig` | `serviceCategoryConfigRouter` | CONFIRMED at line 92 |
| `members` | `memberRouter` | CONFIRMED at line 79 |

All three routers are registered. The `listForService` procedure does NOT yet exist in the router file — plan correctly identifies this as the one addition needed.

## Verified: Existing procedures in `serviceMembersRouter`

File: `packages/api/src/routers/service-members.ts`

| Procedure | Permission gate | Status |
|---|---|---|
| `listMine` | None (scoped to caller) | EXISTS |
| `updateMyBuffer` | None (scoped to caller) | EXISTS |
| `listForMember` | `user_management\|service_management:read` | EXISTS |
| `assign` | `user_management\|service_management:update` | EXISTS |
| `remove` | `user_management\|service_management:update` | EXISTS |
| `updateBuffer` | `user_management\|service_management:update` | EXISTS |

## Finding F1 — HIGH: `listForService` permission OR-check missing `appointment_management`

### Plan claim (Section 3):
> Permission gate: `user_management OR service_management OR appointment_management` (read). The `appointment_management` grant is required so schedulers (Phase 3 users) can call this procedure.

### Plan code snippet (Task 2.1):
```typescript
for (const resource of ["user_management", "service_management", "appointment_management"] as const) {
```

This is correct in the code snippet but the **table in Section 3** only says:
> `user_management\|service_management\|appointment_management:read`

The code snippet matches the stated intent. No gap in the snippet itself. **The plan is internally consistent here.** Marking as verified.

## Finding F2 — LOW: `getByCategoryId` permission gate is `service_management:read` only

The plan (Phase 3, appointment form trainer filter) calls `serviceMembers.listForService` from the scheduler context, where the scheduler has `appointment_management:read`. But `serviceCategoryConfig.getByCategoryId` — used in Phase 1's category detail dialog — is gated on `service_management:read` only (confirmed in router). 

The Phase 1 category detail dialog is admin-only context. Schedulers don't open the category detail dialog. **No gap for Phase 1.**

However, Phase 3 does NOT call `getByCategoryId` — it calls `listForService`. So this is a non-issue for Phase 3 as well. Verdict: **no change needed**.

## Finding F3 — MEDIUM: `assign` procedure signature takes `memberId` not `serviceId` as primary identifier

The plan's `TrainersTab` calls:
```typescript
client.serviceMembers.assign({ organizationId, serviceId, memberId })
```

The actual `assign` procedure input is:
```typescript
z.object({
  organizationId: z.string().uuid(),
  memberId: z.string().uuid(),
  serviceId: z.string().uuid(),
})
```

**Match confirmed** — all three fields are accepted. The plan's usage is correct.

## Finding F4 — MEDIUM: `remove` procedure takes `memberId` not just a junction ID

The plan calls:
```typescript
client.serviceMembers.remove({ organizationId, serviceId, memberId })
```

The actual `remove` procedure input accepts `{ organizationId, memberId, serviceId }` and deletes by `(memberId, serviceId)` compound condition. The plan correctly passes `memberId` from the `assigned` list items. **Match confirmed.**

## Finding F5 — LOW: `members.list` return shape mismatch in TrainersTab `unassigned` filtering

The `members.list` response returns items with shape:
```typescript
{ id, userId, role, roleId, hierarchyScopeId, status, joinedAt, trainerTierId, name, email }
```

The plan's `TrainersTab` code references:
```typescript
m.displayName ?? m.name ?? m.email ?? m.id
```

`m.displayName` does not exist on the `members.list` response — only `m.name` and `m.email` exist. The `?? m.displayName` is dead code but harmless (undefined falls through). The plan should drop `m.displayName` from this expression to avoid confusion. **LOW — cosmetic.**

## Finding F6 — MEDIUM: `unassigned` filtering uses `m.id` but `serviceMembers.memberId` is also `members.id`

The plan filters `allTrainers.filter((m) => !assignedIds.has(m.id))`. The `assigned` list from `listForService` returns `memberId` which is `service_members.member_id` (FK → `members.id`). The `allTrainers` list from `members.list` returns `id` = `members.id`. **The comparison is correct — both sides use `members.id` (UUID).**

## Finding F7 — LOW: No `listForService` in baseRouter update needed

Plan says "No change needed — `serviceMembers: serviceMembersRouter` is already registered." CONFIRMED — adding the procedure to the router object automatically includes it.

## Summary table

| ID | Severity | Finding | Auto-fix in plan? |
|---|---|---|---|
| F1 | VERIFIED | OR-check includes appointment_management — plan is correct | N/A |
| F2 | LOW | getByCategoryId is admin-only — not used by schedulers in Ph3 | No fix needed |
| F3 | VERIFIED | assign signature matches plan usage | N/A |
| F4 | VERIFIED | remove signature matches plan usage | N/A |
| F5 | LOW | `m.displayName` dead code in unassigned picker label | Fix in plan |
| F6 | VERIFIED | ID comparison is correct | N/A |
| F7 | VERIFIED | No index.ts change needed | N/A |

# API Surface Audit — Pass 1

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** api-surface-auditor

---

## Summary

The plan introduces ONE new router (`categoryBufferOverrides`) with 4 procedures. All other routers referenced (`preferredTimes`, `serviceMembers`, `coachIntake`, `trainerAvailability`) already exist and are registered in `baseRouter`.

---

## Findings

### CRITICAL — A1: `requirePermission` is NOT exported from `@avantej-core/services` in the router import

**Rating:** CRITICAL

The plan's router file (T1.3) has this import:
```typescript
import {
  listCategoryBufferOverridesForMember,
  upsertCategoryBufferOverride,
  requirePermission,   // ← THIS IS THE PROBLEM
} from "@avantej-core/services";
```

Checking `packages/services/src/index.ts`: `requirePermission` IS exported (it appears at line 176 of `permission.service.ts` and the function is exported). Let me verify:
- `permission.service.ts` exports `requirePermission` ✓
- `packages/services/src/index.ts` re-exports from `./permission.service` — **needs verification**

The service index file was partially read. The pattern `export * from "./permission.service"` or a named export would be needed.

However, the existing `packages/api/src/routers/preferred-times.ts` already does:
```typescript
import { ..., requirePermission } from "@avantej-core/services";
```
This import works in a file that compiles successfully today. Therefore `requirePermission` IS exported from `@avantej-core/services`. ✓

**Revised rating: INFO** — Import is valid, proven by existing usage in preferred-times.ts.

---

### CRITICAL — A2: Router also imports `eq`, `and` from `drizzle-orm` and `serviceMembers`, `services` schemas directly in router file

**Rating:** HIGH

The plan's router file (T1.3) imports:
```typescript
import { eq, and } from "drizzle-orm";
import { serviceMembers } from "@avantej-core/db/schema/tenant/service-members";
import { services } from "@avantej-core/db/schema/tenant/services";
```

These are used in `updateMine` for the category-assignment verification query. This is valid — routers in this codebase do import schema directly when needed (e.g., `preferred-times.ts` imports from `@avantej-core/services`).

However, the pattern in this codebase is to put DB queries in service files, not router files. The `updateMine` verification query is done directly in the router handler, bypassing the service layer. This is a style deviation but not a bug.

**Rating: MEDIUM** — Consider extracting the verification query into the service file (e.g., `listCategoryBufferOverridesForMember` already establishes if a member has categories). But functionally correct.

---

### HIGH — A3: `categoryBufferOverrides` router NOT registered in `baseRouter` yet

**Rating:** HIGH (but this is NEW work — it's what the plan creates)

Checking `packages/api/src/routers/index.ts`: `categoryBufferOverrides` is NOT present (confirmed by reading the file). The plan correctly calls for adding it at T1.4. This is expected — the plan creates this work.

**Not a gap in the plan — the plan correctly identifies the registration step at T1.4.** ✓

---

### MEDIUM — A4: `listMine` handler ignores `input` parameter (uses `context.member.id` correctly but `organizationId` goes unused)

**Rating:** MEDIUM

```typescript
listMine: protectedProcedure
  .input(z.object({ organizationId: z.string().uuid() }))
  .handler(async ({ context }) => {   // ← input not destructured
    if (!context.tenantDb || !context.member) throw new ORPCError("FORBIDDEN");
    return listCategoryBufferOverridesForMember(context.tenantDb, context.member.id);
  }),
```

The handler destructures only `{ context }`, not `{ input, context }`. The `organizationId` from input is unused. This is INTENTIONAL — tenant DB is already scoped by `orpcTenantMiddleware` from the body, so no additional scoping is needed. This is consistent with how other `listMine`-style procedures work. However the unused `input` destructure looks odd.

**This is consistent with codebase pattern.** Rating: INFO.

---

### HIGH — A5: `upsert` procedure — permission check uses try/catch loop pattern that silently swallows errors

**Rating:** HIGH

```typescript
for (const resource of ["user_management", "service_management"] as const) {
  try {
    await requirePermission(context.tenantDb, context.member, resource, "read");
    hasPermission = true;
    break;
  } catch { /* try next */ }
}
```

The bare `catch { }` (no error variable) discards the error. This is valid TypeScript and intentional — checking OR permissions. However it swallows non-permission errors too (e.g., DB connection failure would result in `hasPermission = false` and a 403 instead of a 500). 

**Rating: MEDIUM** — Low risk in practice but could mask DB errors.

---

### INFO — A6: `preferredTimes.upsert` signature matches usage in plan

**Rating:** INFO

Plan at T2.2 calls:
```typescript
client.preferredTimes.upsert({
  organizationId,
  packageInstanceId: pkg.id,
  items,
})
```

Actual router input:
```typescript
z.object({
  organizationId: z.string().uuid(),
  packageInstanceId: z.string().uuid(),
  items: z.array(preferredTimeItemSchema).max(4),
})
```
✓ Match confirmed.

---

### INFO — A7: `client.serviceMembers.listForMember` — procedure name confirmed

**Rating:** INFO

Plan references `client.serviceMembers.listForMember`. Checking router index: `serviceMembers: serviceMembersRouter` ✓. The procedure `listForMember` is listed in META.md as existing. ✓

---

### MEDIUM — A8: `upsert` response type mismatch — returns `result!.bufferTimeMinutes` but schema has `bufferTimeMinutes: integer NOT NULL`

**Rating:** MEDIUM

In the service code:
```typescript
const [result] = await tenantDb
  .insert(...)
  .returning();

return { categoryId, bufferTimeMinutes: result!.bufferTimeMinutes };
```

`memberCategoryBufferOverrides.bufferTimeMinutes` is `integer().notNull()` — so the type is `number`, never null. But the return type says `number | null`. The TypeScript type will be `number` from Drizzle inference, not `number | null`. This is harmless (TypeScript won't error — returning a `number` for a `number | null` field is fine), but the declared response type `CategoryOverrideRow.bufferTimeMinutes: number | null` should be `number` for the non-null upsert case.

**Rating: LOW** — No runtime issue.

---

## Status Table

| Finding | Rating | Issue |
|---|---|---|
| A1: requirePermission import valid | INFO | Proven by existing preferred-times.ts usage |
| A2: DB query in router handler | MEDIUM | Style deviation; consider moving to service |
| A3: Router not yet registered | HIGH (expected) | Plan step T1.4 covers this |
| A4: listMine unused input | INFO | Consistent with codebase pattern |
| A5: try/catch swallows all errors | MEDIUM | Could mask DB errors as 403 |
| A6: preferredTimes.upsert signature match | INFO | ✓ |
| A7: serviceMembers.listForMember confirmed | INFO | ✓ |
| A8: Return type wider than necessary | LOW | No runtime issue |

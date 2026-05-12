# Type Safety Audit — Pass 1

## Files checked
- `packages/services/src/announcements.service.ts`
- `packages/api/src/routers/announcements.ts`
- `apps/web/src/routes/_authenticated/dashboard/_layout/announcements/view.tsx`
- `apps/server/src/tests/helpers/context.factory.ts`

---

## Finding TS-01: Drizzle inArray with empty array — runtime crash — CRITICAL

**Plan §3 Drizzle snippet:**
```typescript
exists(
  tenantDb.select().from(announcementScopes)
    .where(and(
      eq(announcementScopes.announcementId, announcements.id),
      inArray(announcementScopes.branchId, accessibleNodeIds),
    ))
)
```

Drizzle `inArray(col, [])` (empty array) throws: `Error: inArray requires at least one value`. This is a **runtime crash** that TypeScript does not catch at compile time.

**When it occurs:**
- Any call to `listActiveAnnouncements` or `listAnnouncements` with `accessibleNodeIds: []`
- This is the exact value the widget sends: `accessibleNodeIds: context.accessibleNodeIds ?? []` where the `?? []` fallback means an empty array can reach the service

**Fix (must be added to plan):**
```typescript
const scopeFilter = accessibleNodeIds.length === 0
  ? notExists(
      tenantDb.select().from(announcementScopes)
        .where(eq(announcementScopes.announcementId, announcements.id))
    )
  : or(
      notExists(
        tenantDb.select().from(announcementScopes)
          .where(eq(announcementScopes.announcementId, announcements.id))
      ),
      exists(
        tenantDb.select().from(announcementScopes)
          .where(and(
            eq(announcementScopes.announcementId, announcements.id),
            inArray(announcementScopes.branchId, accessibleNodeIds),
          ))
      ),
    );
```

When `accessibleNodeIds = []`, only NOT EXISTS (org-wide) announcements are returned — which is semantically correct for an empty scope (sees only org-wide). But see TS-02 for admin caveat.

---

## Finding TS-02: Admin with empty accessibleNodeIds sees only org-wide — CRITICAL

**Context:** The test factory sets `accessibleNodeIds: []` for admins. If the fix from TS-01 is applied (empty = only org-wide), then admins in unit tests see only org-wide announcements — wrong.

**Production reality:** Real admins always have `hierarchyScopeId` pointing to a root node, so `getDescendantNodeIds` returns all nodes. `accessibleNodeIds` is never empty in production for a valid member. But the error path in `createContext` sets `accessibleNodeIds = []` on failure:
```ts
} catch (descError) {
  accessibleNodeIds = [];
}
```

So a transient DB error during context creation causes all admins to silently see only org-wide announcements. This is a pre-existing architectural issue worsened by the new EXISTS filter.

**Required fix in plan:** Add `isAdmin` param to both service functions, skip the scope filter entirely when `isAdmin: true`:
```typescript
export async function listActiveAnnouncements(
  tenantDb: TenantDb,
  params: {
    accessibleNodeIds: string[];
    isAdmin?: boolean;  // ADD THIS
    memberType?: "staff" | "clients";
    limit?: number;
  },
)
// In body:
if (!params.isAdmin) {
  // apply scope filter
}
```

Router passes: `isAdmin: context.member?.role === "admin"`

---

## Finding TS-03: listAnnouncements return type — additive change, TypeScript OK — LOW

Current type: `Promise<(typeof announcements.$inferSelect)[]>`
New type: `Promise<(typeof announcements.$inferSelect & { scopedBranchIds: string[] })[]>`

This is an additive change. Callers that spread or destructure only known fields are unaffected. Callers that explicitly type the return as `typeof announcements.$inferSelect` would error. Currently the only caller is the router handler which returns the result directly (oRPC infers the return type). Safe.

---

## Finding TS-04: AnnouncementRow type in view.tsx must be updated in Phase 1 — HIGH

`AnnouncementRow` in `view.tsx` currently:
```ts
type AnnouncementRow = {
  id: string;
  branchId: string | null;
  ...
};
```

The `filteredData` map:
```ts
.map((item) => ({
  branchId: item.branchId ?? null,
  // No scopedBranchIds mapping
}))
```

After Phase 1, `item` from the API has `scopedBranchIds: string[]`. TypeScript won't flag this as an error (item has more fields than you pick), but `item.scopedBranchIds` in Phase 2 will be available. The issue is:

When Phase 2's `openEdit` does `scopedBranchIds: row.scopedBranchIds ?? []` and `row` is typed as `AnnouncementRow`, TypeScript will error because `AnnouncementRow` doesn't have `scopedBranchIds`. This must be fixed in Phase 2 Task 2.2. The plan addresses it there. Acceptable.

---

## Finding TS-05: Zod schema for scopedBranchIds — correct as planned — LOW

Plan's Zod: `z.array(z.string().uuid()).optional()` — correct. Optional array of UUIDs. When undefined, don't touch scopes; when `[]`, clear all scopes. Type-safe.

---

## Finding TS-06: setAnnouncementScopes transaction typing — LOW

Plan's `setAnnouncementScopes` wraps in `tenantDb.transaction(async (tx) => { ... })`. The `tx` parameter in Drizzle transactions has the same type as `tenantDb` (it's `NeonDatabase<typeof tenantSchema>`). No type issue expected.

---

## Finding TS-07: scopeMap construction has TypeScript error in plan — MEDIUM

Plan Task 1.8 shows:
```typescript
const scopeMap = Map<string, string[]>; // announcementId -> branchId[]
```

Missing `new`. TypeScript error: `'Map' refers to a value, but is being used as a type here.` The plan's code snippet is wrong and will fail type-check.

Correct:
```typescript
const scopeMap = new Map<string, string[]>();
for (const scope of scopes) {
  const existing = scopeMap.get(scope.announcementId) ?? [];
  existing.push(scope.branchId);
  scopeMap.set(scope.announcementId, existing);
}
```

---

## Finding TS-08: null-scope (org-wide) typed correctly — CORRECT (LOW)

The plan's null-scope handling: `scopedBranchIds: string[]` where `[]` means org-wide (no rows). TypeScript typing is correct — an empty array is unambiguous. The alternative (null) would require `string[] | null` which is more complex. Empty array is cleaner.

---

## Summary

| ID | Severity | Action |
|---|---|---|
| TS-01 | CRITICAL | Add empty-array guard to EXISTS branch in plan |
| TS-02 | CRITICAL | Add `isAdmin` bypass param to service functions |
| TS-04 | HIGH | Note Phase 2 must update AnnouncementRow type (already planned) |
| TS-07 | MEDIUM | Fix `Map<string, string[]>` → `new Map<string, string[]>()` in plan code |
| TS-03,05,06,08 | LOW | Correct, no action |

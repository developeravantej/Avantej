# Type Safety Audit — Pass 2

## Changes since Pass 1
- TS-01 (CRITICAL): buildScopeFilter with empty-array guard — RESOLVED ✓
- TS-02 (CRITICAL): isAdmin bypass param — RESOLVED ✓
- TS-07 (MEDIUM): new Map fix — RESOLVED ✓
- TS-04 (HIGH): AnnouncementRow type updated in Phase 1 via Task 1.8b — RESOLVED ✓

---

## Re-check of TS findings

### TS-01, TS-02: RESOLVED ✓
### TS-07: RESOLVED ✓
### TS-04: RESOLVED via Task 1.8b ✓

---

## New finding P2-TS-01: buildScopeFilter return type — MEDIUM

`buildScopeFilter` returns `undefined | SQL<boolean> | ...`. The plan uses:
```typescript
const scopeFilter = buildScopeFilter(tenantDb, isAdmin, accessibleNodeIds);
```

When `scopeFilter` is `undefined` (admin bypass), it must NOT be added to the `conditions` array (adding `undefined` would cause a Drizzle type error or unexpected behavior). The plan says "use the result as an additional condition only when non-undefined" but doesn't show the guard in the task description.

**Required implementation pattern:**
```typescript
const scopeFilter = buildScopeFilter(tenantDb, isAdmin, accessibleNodeIds ?? []);
const conditions = [...existingConditions];
if (scopeFilter !== undefined) {
  conditions.push(scopeFilter);
}
```

This pattern is standard and correct. The plan should show it explicitly in Task 1.1 to avoid an implementor inadvertently pushing `undefined` into the conditions array.

---

## New finding P2-TS-02: isAdmin param type vs runtime value — LOW

Router passes:
```typescript
isAdmin: context.member?.role === "admin"
```

If `context.member` is null/undefined (e.g., context setup failure), `context.member?.role` is `undefined`. `undefined === "admin"` is `false`. So `isAdmin` is `false`. The scope filter applies with the member's `accessibleNodeIds`. If `accessibleNodeIds` is also empty/undefined in this error state, the guard in `buildScopeFilter` returns `notExistsClause` (org-wide only). This is safe — broken context → sees only org-wide announcements. Acceptable degradation.

---

## New finding P2-TS-03: AnnouncementRow filteredData map — scopedBranchIds passthrough type — LOW

Task 1.8b adds to `filteredData` map:
```typescript
scopedBranchIds: item.scopedBranchIds ?? [],
```

`item` is the oRPC response type which now includes `scopedBranchIds: string[]` (after Task 1.8). The `??` fallback is technically redundant since the service always returns `scopedBranchIds: string[]` (never undefined). But it's defensive and harmless. TypeScript may warn about redundant `??` if the type is `string[]` (not `string[] | undefined`). Minor.

**Recommendation:** Use `item.scopedBranchIds ?? []` if the type is optional (`string[] | undefined`), or just `item.scopedBranchIds` if the type is always `string[]`. The plan's Task 1.8 return type is `& { scopedBranchIds: string[] }` (not optional), so the `??` is technically redundant. Either is fine.

---

## New finding P2-TS-04: setAnnouncementScopes delete return type — LOW

In Drizzle, `.delete().where(...)` without `.returning()` returns `{ rowCount: number }` or void (varies by driver). The plan doesn't specify handling the return. This is fine — we don't need the rowCount for delete-then-insert. No type issue.

---

## New finding P2-TS-05: scopedBranchIds in create/update service — undefined vs array semantics — MEDIUM

Plan Task 1.5: "If `scopedBranchIds` is `undefined` (not passed), do NOT touch `announcement_scopes` rows."

The param type is `scopedBranchIds?: string[]`. The distinction:
- `undefined`: partial update, don't touch scopes
- `[]`: empty array, clear all scopes (make org-wide)
- `[id1, id2]`: set these specific scopes

This tri-state is correctly typed as `string[] | undefined`. TypeScript will NOT distinguish between "caller explicitly passed `undefined`" and "caller didn't pass the field" — both appear as `undefined` in the function body. This is correct behavior for optional params.

**Potential issue:** If a caller destructures `input` and spreads it: `updateAnnouncement(tenantDb, id, { ...input })` — if `input.scopedBranchIds` is not in the spread (key doesn't exist), it's `undefined`. This is the same as not passing it. Correct behavior.

---

## Summary

| ID | Severity | New? | Action |
|---|---|---|---|
| P2-TS-01 | MEDIUM | Yes | Add explicit `if (scopeFilter !== undefined)` guard pattern to Task 1.1 |
| P2-TS-05 | MEDIUM | Yes | Verify tri-state semantics in service implementation (already correct by design) |
| P2-TS-02,03,04 | LOW | — | No action or minor |
| TS-01,02,04,07 | CRITICAL/HIGH | Resolved | ✓ |

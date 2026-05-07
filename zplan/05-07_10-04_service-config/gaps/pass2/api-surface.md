# API Surface Audit — Pass 2

**Auditor:** api-surface-auditor
**Date:** 2026-05-07 (Pass 2)

## Pass 1 Fixes Verified

- F5 (dead `m.displayName` reference) — FIXED: plan now shows `{m.name ?? m.email ?? m.id}`
- All other API surface verifications unchanged

## New Findings (Pass 2)

### P2-API1 — MEDIUM: `service-category-form.tsx` invalidation pattern uses `useApiMutation`

The plan (Task 1.3) says:
> Add this line to the `onSuccess` callback:
> `qc.invalidateQueries({ queryKey: orpc.serviceCategoryConfig.getByCategoryId.key() });`

But `service-category-form.tsx` uses the `useApiMutation` helper, which accepts an `invalidate` array, NOT a manual `qc.invalidateQueries` call. The `useApiMutation` hook handles invalidation via its `invalidate` option using the shared `queryClient` instance.

The correct fix for Task 1.3 is:
```typescript
// WRONG (as written in plan):
qc.invalidateQueries({ queryKey: orpc.serviceCategoryConfig.getByCategoryId.key() });

// CORRECT (matching useApiMutation pattern):
invalidate: [
  orpc.serviceCategories.list.key(),
  orpc.serviceCategoryConfig.getByCategoryId.key(),
],
```

No `useQueryClient()` import is needed. The `useApiMutation` hook uses the module-level `queryClient` singleton from `@/utils/orpc`.

**This is a plan error — the fix direction is right but the code pattern is wrong for this file.**

### P2-API2 — LOW: `listForService` comment in plan Section 3 mentions `members.userId`

The inline comment in the plan's `listForService` snippet:
```typescript
// SELECT serviceMembers.*, members.userId, memberProfiles.displayName
```

This comment is stale — the actual query does NOT select from `members` at all. The fix for DC1 correctly removed the `members` import, but this comment in Section 3 (the overview snippet, not the full code) still says `members.userId`. **Cosmetic — should be removed.**

### P2-API3 — VERIFIED: `serviceMembers.assign` — `isPrimary` defaults to `false`

The plan notes in Q1 that `isPrimary` is always `false` on assign. The actual `assign` procedure inserts with `isPrimary: false`. The `listForService` response includes `isPrimary` — so the "Primary" badge in `TrainersTab` will never show unless a row was manually set to `isPrimary: true` in the DB. Plan acknowledges this and defers `isPrimary` setting. **VERIFIED — no gap.**

### P2-API4 — MEDIUM: `TrainersTab` uses `useMutation` (from tanstack) but `service-detail-dialog.tsx` currently has no tanstack imports

The current `service-detail-dialog.tsx` imports only: `useState`, `useEffect`, `Badge`, lucide icons, `Button`, `Dialog` components, `StatusBadge`, `StatusCallout`, `toast`, `client`, `formatPrice`.

To implement `TrainersTab` in the same file, the plan requires importing:
- `useQuery` from `@tanstack/react-query`
- `useMutation` from `@tanstack/react-query`
- `useQueryClient` from `@tanstack/react-query`
- `useState` (already used)
- `Badge` (already imported)
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs`
- `orpc` from `@/utils/orpc`

**The plan's Task 2.2 does not list all required new imports.** This is not a blocker but will cause TypeScript errors during implementation if the implementor only follows the listed imports.

**Recommendation:** Add a complete import list to Task 2.2.

## Summary

| ID | Severity | Finding |
|---|---|---|
| P2-API1 | MEDIUM | Task 1.3 uses wrong invalidation pattern — must use `useApiMutation`'s `invalidate` array |
| P2-API2 | LOW | Stale comment in Section 3 overview snippet |
| P2-API3 | VERIFIED | `isPrimary` behavior acknowledged and deferred |
| P2-API4 | MEDIUM | Task 2.2 missing complete import list for TrainersTab |

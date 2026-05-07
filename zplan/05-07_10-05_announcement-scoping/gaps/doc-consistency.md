# Document Consistency Audit — Pass 1

## Files verified
- `zplan/05-07_10-05_announcement-scoping/plan/plan.md`
- All referenced source files (confirmed to exist)

---

## Finding DC-01: File path for service — CORRECT (LOW)

Plan references `packages/services/src/announcements.service.ts`. Confirmed: file exists at that path.

---

## Finding DC-02: File path for router — CORRECT (LOW)

Plan references `packages/api/src/routers/announcements.ts`. Confirmed: file exists.

---

## Finding DC-03: File path for view — CORRECT (LOW)

Plan references `apps/web/src/routes/_authenticated/dashboard/_layout/announcements/view.tsx`. Confirmed: file exists (692 lines).

---

## Finding DC-04: Test file path convention mismatch — MEDIUM

Plan references:
- `apps/server/src/tests/unit/announcements.service.test.ts` — uses `.service.test.ts` suffix
- `apps/server/src/tests/integration/announcements-scope.test.ts` — uses `-scope.test.ts` suffix

Existing test file: `apps/server/src/tests/integration/announcements.integration.test.ts` uses `.integration.test.ts` suffix.

The plan uses inconsistent naming conventions for the new files:
- Unit test suffix `.service.test.ts` is not the observed pattern for other unit tests (no unit test files found for announcements previously; need to check)
- Integration test `-scope.test.ts` should be `announcements-scope.integration.test.ts`

---

## Finding DC-05: Import path for announcementScopes — MEDIUM

Plan §3 Drizzle snippet shows:
```typescript
import { announcementScopes } from "@avantej-core/db/schema/tenant/announcement-scopes";
```

**Reality:** The barrel (`@avantej-core/db/schema/tenant-schema`) re-exports everything from `./tenant` which includes `./announcement-scopes`. The import should work via the barrel. However, the plan uses a direct file import, not the barrel import. The service currently imports via direct file path (`@avantej-core/db/schema/tenant/announcements`). This pattern is consistent.

**Actual import path to use:** `@avantej-core/db/schema/tenant/announcement-scopes` — this is a valid path because the package exports from individual files too (check `packages/db/package.json` exports). Needs verification during implementation.

---

## Finding DC-06: scopeMap type definition has syntax error in plan — MEDIUM

Plan Task 1.8 contains:
```typescript
const scopeMap = Map<string, string[]>; // announcementId -> branchId[]
```

This is **invalid TypeScript** — `Map` without `new` is not an assignment. The correct syntax is:
```typescript
const scopeMap = new Map<string, string[]>();
```

This is a documentation error in the plan that would cause a compile error if copy-pasted.

---

## Finding DC-07: Phase dependency not explicit — LOW

Plan §5 says Phase 2 depends on Phase 1. This is documented implicitly but not stated as a hard dependency in the phase headers. No issue for a plan-only document, but worth clarifying for implementors.

---

## Finding DC-08: AnnouncementWithScopes export name vs usage — LOW

Plan Task 1.8 defines:
```typescript
AnnouncementWithScopes = typeof announcements.$inferSelect & { scopedBranchIds: string[] }
```

But plan Task 2.2 says "Update `AnnouncementRow` type... populated from the enriched API response after Task 1.8." The plan doesn't show where `AnnouncementWithScopes` is exported from. Implementors need to know: exported from `announcements.service.ts` and used in `view.tsx` via the oRPC client's inferred type, not directly imported.

In practice, the oRPC client automatically infers the return type, so `view.tsx` will get `{ ...announcement fields..., scopedBranchIds: string[] }[]` from the query without needing to import `AnnouncementWithScopes` directly.

---

## Finding DC-09: hierarchy.listNodes procedure name — CORRECT (LOW)

Plan Task 2.1 references `client.hierarchy.listNodes({ organizationId })`. Confirmed in `packages/api/src/routers/hierarchy.ts` line 188: `listNodes: protectedProcedure`. Returns `{ id, name, type, depth, ... }`. Correct.

---

## Finding DC-10: Plan mentions `branchId` filter remains in listAnnouncements — needs verification

Plan Task 1.2: "Keep the existing `branchId` param filter (used by the router's optional `branchId` input) unchanged as an additional filter stacked on top."

**Reality check:** The current `listAnnouncements` service has:
```ts
if (branchId !== undefined) {
  conditions.push(eq(announcements.branchId, branchId));
}
```
This filters by the legacy `announcements.branchId` column. After Phase 1, scope filtering uses `announcement_scopes`. Stacking both makes sense for admin-only tools that want to filter by legacy branchId. However, the `list` router passes `input.branchId` to the service. After Phase 1, if an admin calls `list` with `branchId = X`, it filters by `announcements.branchId = X` (legacy) AND applies the EXISTS/NOT EXISTS filter. An announcement with `announcements.branchId = X` but zero `announcement_scopes` rows will still appear (org-wide via NOT EXISTS). This is correct but potentially confusing. Documented in plan §6.

---

## Summary

| ID | Severity | Action |
|---|---|---|
| DC-06 | MEDIUM | Fix `Map<string, string[]>` → `new Map<string, string[]>()` in plan |
| DC-04 | MEDIUM | Correct test file naming convention in plan |
| DC-05 | MEDIUM | Note that direct file import is fine; verify during impl |
| DC-07,08,09,10 | LOW | Informational, no correction needed |
| DC-01,02,03 | INFO | Verified correct |

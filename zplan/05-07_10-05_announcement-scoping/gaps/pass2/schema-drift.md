# Schema Drift Audit — Pass 2

## Changes since Pass 1
Pass 1 fixes applied to plan: `buildScopeFilter` helper added, `isAdmin` bypass added, `new Map()` fix, file name fix, staleTime, cascade delete risk documented.

## Re-check of schema findings

### SD-01 (Pass 1): uniqueIndex vs constraint — RESOLVED
Still a non-issue. The unique index is sufficient for this plan's upsert-by-delete-insert pattern.

### SD-03/SD-05 (Pass 1): cascade delete risks — RESOLVED
Now documented in §6 of plan. ✓

### SD-09 (Pass 1): Missing withTimezone on timestamps — STILL PRESENT
Pre-existing issue, not introduced or worsened by this plan. Out of scope. Noted.

---

## New finding P2-SD-01: buildScopeFilter references `announcements` table without import context — MEDIUM

The `buildScopeFilter` helper in the plan's §3 code snippet references `announcements.id`:
```typescript
.where(eq(announcementScopes.announcementId, announcements.id))
```

But `announcements` is a Drizzle table reference that must be imported:
```typescript
import { announcements } from "@avantej-core/db/schema/tenant/announcements";
```

The service file already imports `announcements` at line 2, so this is not a gap in the implementation — it's a gap in the code snippet's completeness. The snippet shows `announcementScopes` import but does not show the `announcements` import (already in the file). Implementors following the snippet will have it since the existing import is preserved. Low risk.

**Recommendation:** Add a comment to the snippet: `// 'announcements' is already imported in the existing service file`

---

## New finding P2-SD-02: buildScopeFilter uses `announcements` as a table alias in a subquery context — MEDIUM

In Drizzle, when using `notExists` / `exists` with a subquery, the outer table (`announcements`) must be correlated. Drizzle handles this correctly when you reference `announcements.id` inside the subquery `.where()` — it generates a correlated subquery. This is correct behavior and does not require an alias.

**Verification:** The Drizzle pattern `tenantDb.select().from(announcementScopes).where(eq(announcementScopes.announcementId, announcements.id))` — here `announcements.id` refers to the outer query's `announcements` table (the one being filtered). This is standard SQL correlated subquery behavior that Drizzle supports. No issue.

---

## New finding P2-SD-03: setAnnouncementScopes — transaction wrapping with NeonDatabase — LOW

The plan's Task 1.3 says to wrap `setAnnouncementScopes` in `tenantDb.transaction(async (tx) => { ... })`. NeonDatabase with `neon-serverless` supports transactions via `db.transaction()`. However, the service's `TenantDb` type is `NeonDatabase<typeof tenantSchema>`. Drizzle's `.transaction()` for Neon serverless is supported, but the `tx` callback receives a `NeonDatabase` with the same schema — the type is compatible.

**Verification needed during implementation:** Confirm `tenantDb.transaction()` works in the Cloudflare Workers/Neon serverless context. Some Neon serverless deployments have limitations with explicit transactions (connection pooling mode may not support multi-statement transactions). If `transaction()` fails in Cloudflare Workers, fall back to sequential delete + insert with application-level idempotency (acceptable since the delete + insert is fast and the scope rows are not shared with other concurrent operations on the same announcement).

**Plan gap:** Add a note that `tenantDb.transaction()` should be tested in the dev environment before assuming it works in the deployed runtime.

---

## Summary

| ID | Severity | New? | Action |
|---|---|---|---|
| P2-SD-01 | MEDIUM | Yes | Add comment to buildScopeFilter snippet |
| P2-SD-02 | MEDIUM | Yes | Verified OK — no action |
| P2-SD-03 | LOW | Yes | Add transaction compatibility note to plan |
| SD-09 | HIGH | Pre-existing | Out of scope, already noted |

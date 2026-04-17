# Codebase Health Remediation Plan

**Date:** 2026-04-16
**Branch:** Customer-app
**Based on:** `zanalyse/` audit (196 findings across 6 dimensions)

---

## 1. Overview

### Problem Statement

A comprehensive codebase health audit identified 196 findings, including 12 CRITICAL and 35 HIGH severity issues. Key problems include:

- **Security exploits**: `creditPoints` field exploitable via API, spoofable audit fields
- **Runtime crashers**: Native app sends wrong field names, null constraint violations
- **Duplicated business logic**: 3 service files exist in both `packages/services/` and `apps/server/src/services/`, diverged
- **RBAC gaps**: 25 of 39 dashboard pages have no route guards; 10 routers missing `accessibleNodeIds` filtering
- **Data integrity**: Sequence number race conditions, wrong currency defaults, missing unique constraints
- **Dead code**: 19 orphan components, 4 legacy routes, mock/stub artifacts

### Goals & Success Criteria

1. Zero CRITICAL findings remaining
2. All HIGH security/data-integrity findings resolved
3. No duplicated service files
4. All dashboard pages have appropriate route guards
5. Currency defaults changed from USD to MYR with data migration

### Scope

**In scope:** All 47 CRITICAL + HIGH findings from the audit.

**Out of scope:** MEDIUM and LOW findings are catalogued in the backlog appendix (`05-backlog.md`) for future sprints.

---

## 2. Result (What Changes for the User)

**Before:** Platform has exploitable API endpoints, runtime crashes on native app purchase flow, wrong currency labels, and staff users can access admin pages (though API blocks mutations).

**After:** API endpoints are secured against exploitation, native app purchase/booking flows work without crashes, all monetary values correctly show MYR, and staff users only see pages they have permission to access.

**Key differences:**
- Credit points can no longer be set by any user — only admins can adjust credits
- Sales orders show correct creator identity (not spoofable)
- Native app "Buy Package" flow completes without Zod validation errors
- Expenses, payments, and payouts display "MYR" instead of "USD"
- Staff users are redirected when navigating to pages outside their permissions
- Duplicate booking numbers are prevented under concurrent load

**No user-visible changes for:** Dead code cleanup, service deduplication, type safety fixes. These improve developer velocity and code maintainability.

---

## 3. Technical Architecture

### Service Deduplication (Phase 0)

```
BEFORE:
apps/server/src/services/hierarchy.service.ts        ← used by server routes
apps/server/src/services/hierarchy-validation.service.ts
apps/server/src/services/permission.service.ts (4 resources)
packages/services/src/hierarchy.service.ts            ← used by oRPC routers
packages/services/src/hierarchy-validation.service.ts
packages/services/src/permission.service.ts (11+ resources)

AFTER:
packages/services/src/hierarchy.service.ts            ← single source of truth
packages/services/src/hierarchy-validation.service.ts
packages/services/src/permission.service.ts           ← canonical, with proper RBAC
apps/server/src/services/ ← these three files DELETED
```

### Sequence Number Fix (Phase 1)

```
BEFORE (race-prone):
const count = await db.select({ count: sql`COUNT(*)` })
  .from(table)
  .where(sql`number LIKE ${prefix + "%"}`);
const next = count + 1;
// Two concurrent requests can get same count

AFTER (retry with MAX):
async function generateSequenceNumber(db, table, numberCol, prefix, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const [result] = await db.select({ maxNum: sql`MAX(${numberCol})` })
      .from(table)
      .where(sql`${numberCol} LIKE ${prefix + "%"}`);
    const lastNum = result?.maxNum ? parseInt(result.maxNum.replace(prefix, "")) : 0;
    const next = `${prefix}${String(lastNum + 1).padStart(6, "0")}`;
    try {
      // insert will fail on unique constraint if race occurs → retry
      return next;
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
    }
  }
}
```

### Currency Migration (Phase 2)

```sql
-- Migration: change defaults and fix existing data
ALTER TABLE expenses ALTER COLUMN currency SET DEFAULT 'myr';
ALTER TABLE payments ALTER COLUMN currency SET DEFAULT 'myr';
ALTER TABLE payouts ALTER COLUMN currency SET DEFAULT 'myr';

UPDATE expenses SET currency = 'myr' WHERE currency = 'usd';
UPDATE payments SET currency = 'myr' WHERE currency = 'usd';
UPDATE payouts SET currency = 'myr' WHERE currency = 'usd';
```

---

## 4. User Journeys

### Journey 1: Attacker attempts credit point manipulation (Phase 1)

```
Trigger: Malicious user calls POST /rpc/customerProfiles/upsert with { creditPoints: 99999 }
BEFORE:
  1. API accepts creditPoints in Zod input → writes to DB → user has free credits
AFTER:
  1. API rejects creditPoints — field not in Zod input schema
  2. Request succeeds for other fields, creditPoints silently dropped
  3. Admin can adjust credits via new dedicated admin-only procedure
Where it lives: packages/api/src/routers/customer-profiles.ts
```

### Journey 2: Customer buys package on native app (Phase 2)

```
Trigger: Customer taps "Buy Package" → selects package → taps "Pay"
BEFORE:
  1. Pay screen sends { packageId: "..." } → Zod rejects (expects serviceId) → crash
AFTER:
  1. Pay screen sends { serviceId: "..." } → Zod validates → package instance created
  2. Done screen shows correct total using fetched tax rate (not hardcoded 1.1)
  3. branchId is always resolved before API call → no NOT NULL violation
Where it lives: apps/native/app/(app)/dashboard/buy-package/pay.tsx, done.tsx
```

### Journey 3: Staff creates expense (Phase 2)

```
Trigger: Staff clicks "Create Expense" on expenses page
BEFORE:
  1. Expense saved with currency = "usd" (DB default)
  2. Display shows "USD" on a Malaysian platform
AFTER:
  1. Expense saved with currency = "myr" (new DB default)
  2. Display shows "MYR" / "RM"
Where it lives: packages/db/src/schema/tenant/expenses.ts, apps/web/.../expenses/view.tsx
```

### Journey 4: Staff navigates to admin page (Phase 3)

```
Trigger: Staff member (non-admin) navigates to /dashboard/promotions/view
BEFORE:
  1. Page loads → API calls fail with permission errors → broken UI with error states
AFTER:
  1. beforeLoad guard checks permission → redirect to /dashboard with "Access denied" message
  2. Sidebar hides links to pages the user can't access (future enhancement)
Where it lives: apps/web/src/routes/_authenticated/dashboard/_layout/promotions/view.tsx
```

### Journey 5: Dead code cleanup (Phase 4)

No user-visible changes. Internal metric improvements:
- 19 fewer unused component files
- 4 fewer duplicate route files
- Cleaner import graph, faster IDE indexing

---

## 5. Phased Implementation

See individual phase files:
- [Phase 0: Service Deduplication](01-phase-0-deduplication.md)
- [Phase 1: Security Fixes](02-phase-1-security.md)
- [Phase 2: Runtime Crashers & Data Integrity](03-phase-2-data-integrity.md)
- [Phase 3: RBAC Hardening](04-phase-3-rbac.md)
- [Phase 4: Dead Code Cleanup](04-phase-4-cleanup.md)
- [Backlog: MEDIUM & LOW findings](05-backlog.md)

---

## 6. Impact & Breakage Analysis

### Deployment Coupling

| Phase | Deploy independently? | Notes |
|-------|----------------------|-------|
| Phase 0 (dedup) | Yes | Internal refactor, no API contract changes |
| Phase 1 (security) | Yes (backend only) | Removing Zod fields is backwards-compatible — frontend never sent them |
| Phase 2 (crashers) | **Coupled** | Native app `packageId→serviceId` fix requires simultaneous native + server deploy |
| Phase 3 (RBAC) | Yes (frontend only) | Route guards are client-side; API already enforces permissions |
| Phase 4 (cleanup) | Yes | Deleting unused files has no runtime impact |

### Currency Migration Risk

- Existing rows with `currency = 'usd'` will be updated to `'myr'`
- If any reporting or analytics code groups by currency, results will shift
- **Mitigation:** Run migration in a transaction; verify row counts before/after

### Sequence Number Fix Callers

Files using COUNT-based sequence generation (all must be updated together):
1. `packages/services/src/sales-order.service.ts:28-42`
2. `packages/services/src/purchase-orders.service.ts:12-26`
3. `packages/services/src/invoice.service.ts:32-46`
4. `packages/services/src/stock-requests.service.ts:26-39`
5. `packages/services/src/transfer-orders.service.ts:28-42`

---

## 7. Cross-Cutting Concerns

### Error Handling
- Sequence number retries: max 3 attempts, then throw with descriptive message
- UoM/brand/category delete: check references first, throw user-friendly error
- Currency migration: wrapped in transaction with rollback on failure

### Testing Approach
- Phase 1: Unit tests for credit adjustment admin procedure, sequence number generation
- Phase 2: Integration test for native purchase flow end-to-end
- Phase 3: Frontend tests for route guard redirects
- Phase 4: No tests needed (deletions)

### Migration Plan
- Currency defaults: Drizzle migration + data UPDATE in same migration file
- No schema column additions/removals in this plan (those are backlog items)

### Rollback Strategy
- Phase 0: Re-add deleted service files from git history
- Phase 1-2: Revert commits (no destructive changes)
- Phase 3: Remove `beforeLoad` guards (pages become accessible again)

---

## 8. Open Questions / Risks

1. **Currency migration timing:** Should existing USD expenses be converted to MYR, or were they genuinely in USD? Need business confirmation.
2. **Sequence number approach:** MAX+1 with retry vs PostgreSQL sequences. Sequences are more robust but harder to reset/format with prefixes. Recommendation: MAX+1 with retry + unique constraint as safety net.
3. **Permission service stub:** Phase 0 deletes the server copy and uses the packages copy. But the packages copy also has `hasPermission` returning `true` for admin and `false` for everyone else. Full RBAC implementation against `role_permissions` table is a separate, larger effort (backlog item).
4. **Route guard permission keys:** The 25 pages need specific permission keys. The mapping in the RBAC audit assumes these permissions exist in the tenant DB's `role_permissions` table. If they don't, guards will block all non-admin users. Need to verify seeded permissions match.

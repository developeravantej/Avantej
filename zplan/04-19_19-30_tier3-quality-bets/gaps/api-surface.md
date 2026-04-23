# API Surface Audit
**Session:** 04-19_19-30_tier3-quality-bets
**Lens:** api-surface
**Findings:** 4 (0 critical · 2 high · 1 medium · 0 low · 1 info)

## Findings

### [HIGH] Commission router name inconsistency in plan (§6 Impact vs §3.6)
**Plan claims:** §3.6 specifies `orpc.commissionSplits.list.key()` but §6 (line 607) mentions `orpc.commissions.list.key()`.
**Actual:** The router is named `commissionSplits` in baseRouter (line 102 of `packages/api/src/routers/index.ts`). There is no `commissions` router. The exported `commissionSplitsRouter` has procedures: `list`, `getByAppointment`, `getMyCommissions`, `listLedger`, `approve`, `markPaid`, `void`, `createManualAdjustment`, `liabilitySummary`, `markPaidBatch`.
**File:** /c/Project/Avantej/zplan/04-19_19-30_tier3-quality-bets/plan/plan.md:607
**Fix:** Change line 607 from `orpc.commissions.list.key()` to `orpc.commissionSplits.list.key()` to match §3.6 and baseRouter registration.

---

### [HIGH] useUserContext query key is wrong in plan
**Plan claims:** §3.6 says to replace `{ queryKey: ["user-context"] }` with "the same key constant the hook uses"
**Actual:** The hook at line 105 of `apps/web/src/hooks/useUserContext.ts` defines `queryKey: ["user-context"]`. This is already correct; the plan is asking for the replacement to match what the hook uses. The hook IS using `["user-context"]`. No change is needed — the current string key matches the hook definition.
**File:** /c/Project/Avantej/apps/web/src/hooks/useUserContext.ts:105
**Fix:** The plan is internally consistent; no code fix needed. The `["user-context"]` string key in component files already matches the hook. Clarify in documentation that this specific key does not have an oRPC equivalent and should remain as a string constant.

---

### [MEDIUM] MFA routes not yet created
**Plan claims:** Phase 3.6 requires two new route files: `apps/web/src/routes/_authenticated/mfa-setup.tsx` and `apps/web/src/routes/mfa-verify.tsx`
**Actual:** Neither file exists. The plan lists them as new deliverables (§3.10, lines 366-367) and tasks 3.6.5-3.6.6 require creating them.
**File:** /c/Project/Avantej/apps/web/src/routes/ (missing files)
**Fix:** Files are intended to be created by phase 3.6 execution; this is not a gap but a future deliverable. No audit action required — expected in implementation.

---

### [INFO] twoFactorClient not yet imported in auth-client.ts
**Plan claims:** Task 3.6.3 requires adding `twoFactorClient` from `better-auth/client/plugins` to `apps/web/src/lib/auth-client.ts`
**Actual:** The current file (line 1-8) imports only `adminClient` and `inferAdditionalFields` from better-auth plugins. No `twoFactorClient` import or plugin registration is present.
**File:** /c/Project/Avantej/apps/web/src/lib/auth-client.ts
**Fix:** Task 3.6.3 must execute before MFA routes can function. This is an expected phase 3.6 change, not a current gap. Pre-implementation check: verify `better-auth/client/plugins` exports `twoFactorClient` in the installed version.

---

## Verified Findings (All Correct)

### Router & Procedure Names — All Present
- **checkIns router**: exists with procedures `recordCheckIn`, `listTodaysBookings`, `list`, `recordBulkCheckIn`, `getActivePackageForMember`, `deleteCheckIn` ✓
- **commissionSplits router**: exists with `list`, `listLedger`, and all other claimed procedures ✓
- **brands router**: exists with `list` ✓
- **suppliers router**: exists with `list` ✓
- **unitsOfMeasure router**: exists with `list` ✓
- **customerDirectory router**: exists with `list` and `getById` ✓
- **invitations router**: exists with `list` ✓
- **appointments router**: exists with `list` ✓
- All routers registered in baseRouter (lines 59-122) ✓

### oRPC Import Path
- **apps/web/src/utils/orpc.ts**: correctly exports `client` and `orpc` from `createORPCClientConfig` ✓

### Query Key Usage
- **useUserContext hook** (line 105): correctly defines `queryKey: ["user-context"]` ✓
- Current plan is self-consistent on the commission names within its execution path ✓

---

## Summary

Four findings identified: one cross-section inconsistency in the plan document (§3.6 vs §6 on commission router naming—both refer to `commissionSplits` but §6 incorrectly states `commissions`), one clarification needed on the user-context query key (it is already correct and needs no change), one expected future deliverable (MFA routes), and one pre-implementation dependency to verify (better-auth version support for `twoFactorClient`). All oRPC routers, procedures, and query keys referenced in the plan exist and are properly registered. No breaking API changes are required; phase 3.6 tasks must verify better-auth plugin availability before execution.


# Documentation Consistency Audit

**Plan:** `zplan/05-09_15-30_web-debt-cleanup/plan/plan.md`
**Audited:** 2026-05-09
**Verdict:** Plan is largely accurate. 3 MEDIUM issues (stale line refs, mischaracterized casts), 1 HIGH (missing eslint-disable files at claimed lines), rest confirmed correct.

---

## 1. File Existence Check

All 17 key files referenced in the plan exist on disk. No CRITICAL issues.

| File | Status |
|------|--------|
| `apps/web/src/routes/subscribe.tsx` | EXISTS |
| `apps/web/src/lib/api.ts` | EXISTS |
| `apps/web/src/lib/auth-debug.ts` | EXISTS |
| `apps/web/src/hooks/usePermissions.ts` | EXISTS |
| `apps/web/src/hooks/useAuth.ts` | EXISTS |
| `apps/web/src/hooks/useAppointmentFormState.ts` | EXISTS |
| `apps/web/src/components/app-sidebar.tsx` | EXISTS |
| `apps/web/src/components/appointments/appointment-list.tsx` | EXISTS |
| `apps/web/src/components/forms/category-commission-form.tsx` | EXISTS |
| `apps/web/src/components/calendar/appointment-form/TestDataDialog.tsx` | EXISTS |
| `apps/web/src/components/tables/copyable-cell.tsx` | EXISTS |
| `apps/web/src/components/tables/sales/view/columns.tsx` | EXISTS |
| `apps/web/src/components/ui/label.tsx` | EXISTS |
| `apps/web/src/__tests__/helpers/mock-client.ts` | EXISTS |
| `apps/web/vitest.config.ts` | EXISTS |
| `apps/web/vite.config.ts` | EXISTS |
| `biome.json` (root) | EXISTS |

---

## 2. Line Number Verification

### subscribe.tsx — console.log lines
**Plan claims:** lines 105, 115, 145, 152, 163, 182
**Actual:** All six confirmed exactly at those lines. CORRECT.
- Line 105: `console.log(` (auth fail fallback)
- Line 115: `console.log(` (guest session success)
- Line 145: `console.log("Payment processed successfully data:", data);`
- Line 152: `console.log("User needs password setup - getting setup token");`
- Line 163: `console.log("Got setup token:", tokenData);`
- Line 182: `console.log(`

**Severity:** INFO — all correct.

### useAuth.ts — `as any` casts
**Plan claims (Task 2.2 title):** "as any casts" at lines 88, 112, 136
**Plan claims (Task 2.3 body):** line 88 is `permissions: [] as any[]`, lines 112/136 are `catch (error: any)`
**Actual:**
- Line 88: `permissions: [] as any[]` — CORRECT
- Line 112: `catch (error: any)` — CORRECT
- Line 136: `catch (error: any)` — CORRECT

The Task 2.2 heading says "Fix Category A casts" but lines 112/136 are actually covered in Task 2.3 (Category B). The plan body is internally consistent; the section header ("as any casts") is slightly misleading since `error: any` is annotation-any not cast-any.

**Severity:** LOW — body text is correct, only section title is imprecise.

### usePermissions.ts — fake async pattern
**Plan claims:** lines 38-57 contain fake async useState/useEffect pattern
**Actual:** Lines 38-57 confirmed — `useState(true)` on line 40, `useEffect(() => setLoading(false), [])` on lines 42-45. CORRECT.
**Plan also claims:** `useRole` at line 65, `useIsSystemAdmin` at line 87 — same pattern.
**Actual:** `useRole` at line 65 (CORRECT), `useIsSystemAdmin` at line 87 (CORRECT). Both have identical fake-async pattern.

**Severity:** INFO — all correct.

### auth-debug.ts — `any` types and console.group
**Plan claims:** lines 11, 20 have `any` types; lines 69-79 have `console.group`
**Actual:**
- Line 11: `decoded?: any;` — CORRECT
- Line 20: `export function decodeJWT(token: string): any` — CORRECT
- Line 69: `console.group('...')` — CORRECT
- Line 83: `console.groupEnd()` (plan says 69-79; actual block ends at 83)

**Severity:** LOW — block extends to line 83, not line 79. Minor; does not affect implementation.

### app-sidebar.tsx — `as any` on session
**Plan claims:** line 269
**Actual:** Line 269: `const sessionUser = session?.user as any;` — CORRECT.

**Severity:** INFO — exact match.

### appointment-list.tsx — `as any` on appt
**Plan claims:** line 912
**Actual:** Line 912: `userId: (appt as any).client?.userId ?? null,` — CORRECT.

**Severity:** INFO — exact match.

### category-commission-form.tsx — `as any` casts
**Plan claims:** lines 84 and 411
**Actual:**
- Line 84: `existingConfig as any` — CORRECT
- Line 411: `(tier: any)` — this is a parameter type annotation, not an `as any` cast. The plan says "as any casts" but line 411 is `tiers.map((tier: any) =>`.

**Severity:** MEDIUM — line 411 is annotation-any, not a cast. The plan also claims two `as any` casts in Task 2.2, but only line 84 is a cast. Line 411 is a callback parameter annotation. The fix approach differs (cast removal vs. typing the `tiers` array source). Plan should distinguish.

Additionally, the plan only lists line 84 as an `as any` cast. A grep shows line 411 has `(tier: any)` but there is also `(s: any)` at line 89 (within the same useEffect). The plan does not mention line 89.

### TestDataDialog.tsx — untyped callback
**Plan claims:** line 111 has untyped callback
**Actual:** Line 111: `{data.appointments.map((appointment: any, index: number) => (` — CORRECT. The `appointment: any` is the untyped parameter. Note: it has an `eslint-disable` comment at line 110.

**Severity:** INFO — correct.

### mock-client.ts — 203 lines total
**Plan claims:** 203 lines
**Actual:** 203 lines — CORRECT.

**Severity:** INFO — exact match.

---

## 3. File Size Verification

| File | Plan claims | Actual | Status |
|------|-------------|--------|--------|
| `purchase-orders/view.tsx` | 1481 lines | 1481 lines | CORRECT |
| `customers/$id.tsx` | 1442 lines | 1442 lines | CORRECT |
| `installments-page.tsx` | 1350 lines | 1350 lines | CORRECT |
| `appointment.tsx` | 966 lines | 966 lines | CORRECT |
| `appointment-list.tsx` | 921 lines | 921 lines | CORRECT |
| `service-form.tsx` | 936 lines | 936 lines | CORRECT |

All file sizes are exact. CORRECT.

### Additional size note:
The plan (Task 4.5) describes `useAppointmentFormState.ts` as a "god-hook (review finding: 400+ lines)". Actual line count: **868 lines**. The "400+" characterization significantly understates the file size. The plan should say "860+ lines" to set correct expectations for the split scope.

**Severity:** MEDIUM — understated by 2x. Splitting an 868-line hook is more work than splitting a 400-line hook.

---

## 4. Phase Dependency Verification

| Phase | Plan says depends on | Correct? |
|-------|---------------------|----------|
| Phase 1 | None | CORRECT — no dependencies |
| Phase 2 | Phase 1 complete | CORRECT — plan says "no security distractions during type work" |
| Phase 3 | Phase 2 | CORRECT — CI gate requires type-check to pass first |
| Phase 4 | Phase 3 | CORRECT — needs stable test baseline for safe refactor |
| Phase 5 | Phase 4 | CORRECT — refactored feature files lazy-load cleaner |
| Phase 6 | Phase 5 | CORRECT — measure post-dep-removal bundle size separately |

However, the "Deployment coupling" table in section 6 says:
- Phase 2: "INDEPENDENT" — contradicts "depends on Phase 1" stated in Phase 2's Dependencies line.
- Phase 5: "Backend independent" — doesn't mention Phase 4 dependency.

**Severity:** LOW — the per-phase Dependencies lines are the authoritative source and those are correct. The summary table is slightly inconsistent but describes deployment coupling (can deploy independently) vs. implementation ordering (should implement in order).

---

## 5. Open Questions

Four open questions listed. None marked as "resolved". All are genuinely open and have recommendations attached. No blank resolved items.

**Severity:** INFO — no issues.

---

## 6. eslint-disable Suppression References (Task 2.4)

**Plan claims 7 files with eslint-disable for react-hooks/exhaustive-deps:**

| File:Line | Actual | Status |
|-----------|--------|--------|
| `attendance/today-bookings.tsx:221` | Line 221 has `eslint-disable-next-line @typescript-eslint/no-explicit-any` (NOT `react-hooks/exhaustive-deps`) | WRONG RULE |
| `attendance/drop-in-form.tsx:54` | Line 54 has `eslint-disable-next-line @typescript-eslint/no-explicit-any` (NOT `react-hooks/exhaustive-deps`) | WRONG RULE |
| `hooks/usePermissionMatrixState.ts:153` | CORRECT — `react-hooks/exhaustive-deps` | CORRECT |
| `routes/_authenticated/go-highlevel-integration.tsx:245` | CORRECT — `react-hooks/exhaustive-deps` | CORRECT |
| `components/calendar/appointment.tsx:393` | CORRECT — `react-hooks/exhaustive-deps` | CORRECT |
| `components/pages/access-control/members-tab.tsx:527` | CORRECT — `react-hooks/exhaustive-deps` | CORRECT |
| `components/customers/customer-profile-panel.tsx:247` | CORRECT — `react-hooks/exhaustive-deps` | CORRECT |

**Severity:** HIGH — Two of the seven files (`today-bookings.tsx:221` and `drop-in-form.tsx:54`) have `@typescript-eslint/no-explicit-any` suppressions, NOT `react-hooks/exhaustive-deps`. The plan says Task 2.4 is about stripping eslint-disable for exhaustive-deps and fixing dep arrays, but these two files suppress `any` type warnings instead. The fix approach is completely different (typing vs. dep array refactoring). Implementer following the plan literally would attempt the wrong fix.

---

## 7. CopyableCell Duplicate (Task 6.4)

**Plan claims:** inline CopyableCell at `columns.tsx:30-59`
**Actual:** Interface at line 25, component definition at line 30, component ends around line 59 (closing brace). The inline CopyableCell spans lines 25-59 (35 lines including interface). Plan's "30-59" omits the interface definition at 25-29.

**Severity:** LOW — minor inaccuracy. The component body is at 30-59 as claimed; the full replacement scope should include the interface at 25.

---

## 8. CI Workflow Path (Task 3.3)

**Plan claims:** `.github/workflows/ci.yml` (or whatever the current CI config is)
**Actual:** Only `.github/workflows/drift-check.yml` exists. There is no `ci.yml`.

**Severity:** MEDIUM — the plan correctly hedges with "verify path before editing", but the default assumption of `ci.yml` is wrong. Implementer must create a new workflow file or add to `drift-check.yml`.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL | 0 | — |
| HIGH | 1 | Task 2.4: two eslint-disable files (`today-bookings.tsx`, `drop-in-form.tsx`) suppress `@typescript-eslint/no-explicit-any`, NOT `react-hooks/exhaustive-deps` — wrong fix approach |
| MEDIUM | 3 | (1) `category-commission-form.tsx:411` is annotation-any not cast-any; (2) `useAppointmentFormState.ts` is 868 lines, not "400+"; (3) No `ci.yml` exists — only `drift-check.yml` |
| LOW | 4 | (1) `auth-debug.ts` console.group block ends at 83 not 79; (2) Task 2.2 title says "as any casts" but includes annotation-any; (3) Deployment coupling table slightly inconsistent with per-phase deps; (4) CopyableCell range should be 25-59 not 30-59 |
| INFO | 6 | All file existence checks pass; all file sizes exact; all subscribe.tsx line refs exact; open questions properly open |

# Iteration 5 — Mop-up + dashboard hardening

**Branch:** `audit-prove/remediation-services-tabs-20260525-1529`
**Approval:** `mop + dashboard` → 6 items in 2 parallel agents
**Build gate after iteration:** ✅ green (production code; only untracked test helpers have unused-import errors)
**Integration tests after iteration:** 26 pass / 0 fail / 1 skip — no regressions

## Targets fixed

| ID | Severity | File | Change |
|---|---|---|---|
| **IW-02** | P3 | `packages/api/src/routers/transfer-orders.ts:80-83` | Added `.refine()` rejecting `fromBranchId === toBranchId` on `create` schema |
| **IW-10** | P3 | `packages/api/src/routers/products.ts` (3 handlers) | Removed duplicate `assertOrgContextMatch` from `getStock`, `adjustStock`, `setBranchPrice` |
| **AC-A-09** | P3 | `packages/api/src/routers/invitations/public.procedures.ts` | Stripped `role` from public `getByToken` response. `email` retained because acceptWithSignup signup flow needs it for pre-fill; server validates match regardless of client input. |
| **DU-003** | P2 | `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx` | Added isError branches to all useQuery calls — failed queries now render an explicit error indicator (not silent zeros) |
| **DU-004** | P2 | same file | Added `useUserContext().hasRole()` gating on admin/manager-only widgets (org-wide revenue, branch breakdown, all-staff performance). Trainers see only personal stats. |

## Already-shipped (no-op verified)

| ID | Severity | Reason |
|---|---|---|
| **CU-008** | P3 | `magic-link-actions.tsx:21` already uses `PLACEHOLDER_DOMAINS = ["@ghl.placeholder", "@avantej.placeholder"]` — both covered. Audit finding stale. |

## Build status

- `bun check-types` — all errors confined to untracked test helpers (`check-stale.ts`, `cleanup-stale.ts`, `email-resend.integration.test.ts`); none in production code
- `bun test` integration bundle (8 files, 26 tests) — all pass, no regressions

## Iteration 5 total

5 fixed, 1 already-shipped. Cumulative across iter-1/2/3/4/5: **48 fixes applied, 14 already-shipped, 1 deferred policy, 1 partial pending migration.**

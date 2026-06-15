# Doc-Consistency Audit — web-holding-it-back-plan.md

**Auditor:** doc-consistency
**Date:** 2026-06-06
**Target:** `zplan/06-05_18-18_next-steps-cleanup-commit-suite-ci/plan/web-holding-it-back-plan.md`
**Verdict:** Plan is **executable and overwhelmingly accurate**. Every file path, LOC count, line number, and the load-bearing CI-gate claim verified true. **One factual error** in the `"use client"` narrative (MEDIUM) — does not block execution but the stated rationale is wrong.

> Note: written as `doc-consistency-web.md` because `doc-consistency.md` in this folder already holds the *server*-plan audit.

---

## Summary table

| # | Claim | Status | Severity |
|---|-------|--------|----------|
| 1 | All 8 cited files exist | TRUE | INFO |
| 2 | installment-plans.tsx = 966 LOC | TRUE (exactly 966) | INFO |
| 3 | sales/$id.tsx = 765 LOC | TRUE (exactly 765) | INFO |
| 4 | review-tab.tsx = 660 LOC | TRUE (exactly 660) | INFO |
| 5 | CI gate scans only `packages/api/src/routers`, NOT `apps/web` | **TRUE — CONFIRMED** | INFO |
| 6 | review-tab.tsx:425 `r: any`; :452 `useMutation` | TRUE (both exact) | INFO |
| 7 | sales/$id.tsx:180 useMutation; :476 createdByName cast; :621 branchId cast | TRUE (all exact) | INFO |
| 8 | google-calendar.tsx:134 `as any`; :404 `as any` | TRUE (both exact) | INFO |
| 9 | commissions/view.tsx:1 `"use client"` | TRUE | INFO |
| 10 | set-password.tsx already compliant | TRUE — CONFIRMED | INFO |
| 11 | PlanCard at "~95–301" in installment-plans.tsx | TRUE (95–301 exact) | INFO |
| 12 | sales/$id.tsx inlines CancelSaleDialog/StatusHistoryCard/SalesStatusBadge/mapReceiptResponse | TRUE (all 4 inline) | INFO |
| 13 | "17 use client, only view.tsx app-authored, other 16 are shadcn/ui" | **FALSE** | MEDIUM |
| 14 | Phase ordering (1 before 3) | SOUND | INFO |

---

## Detailed findings

### CONFIRMED — KEY CLAIM (CI gate scope) — INFO
`scripts/ci/check-router-file-loc.mjs` line 9 sets `routersDir = join(process.cwd(), "packages/api/src/routers")` and line 45 `walk(routersDir)`. There is **no** reference to `apps/web` anywhere in the script. The 400-LOC gate is structurally incapable of seeing the web route files.
**The god-components (installment-plans 966, sales/$id 765) are NOT CI-blocking.** The plan's framing as a "thin-route convention violation, not a failing gate" is exactly correct.

### CONFIRMED — set-password.tsx compliant — INFO
`apps/web/src/routes/set-password.tsx` (175 LOC):
- Line 22: `const { data: session, isPending } = authClient.useSession();`
- Line 47: `await client.auth.setPassword({ newPassword: password });`
- No `fetch`, no `localStorage`, no `access_token` anywhere in the file.
Finding #4 "no work needed" is accurate. Phase 0 T0.2 (no edit) is correct.

### CONFIRMED — all line-number claims exact — INFO
Every cited line number landed on the exact symbol (not merely "near"):
- review-tab.tsx:425 `rawRows.map((r: any) => ({` ; :452 `useMutation({`
- sales/$id.tsx:180 `const { mutate: cancelSale, ... } = useMutation({` ; :476 `(order as { createdByName?: string | null }).createdByName` ; :621 `(order as { branchId?: string | null })?.branchId`
- google-calendar.tsx:134 `orgStatusRaw as any` ; :404 `calendarDataRaw as any`
- commissions/view.tsx:1 `"use client";`

No stale line numbers detected. The plan's "Verified against codebase 2026-06-06" header is honest.

### CONFIRMED — extraction targets are real inline symbols — INFO
- installment-plans.tsx: `function PlanCard(` at line 95, closes at line 301 → "~95–301" is exact. Create/Edit dialog is inline (`<Dialog>` at 665), deactivate logic inline (`deactivateMutation` at 398, `handleDeactivateClick` at 479). `PlanFormDialog` / `DeactivatePlanDialog` are *proposed new component names* (T3.1), not claimed-existing symbols — the plan does not assert they pre-exist, so no defect.
- sales/$id.tsx: `SalesStatusBadge` (62), `StatusHistoryCard` (71), `CancelSaleDialog` (165), `mapReceiptResponse` (740) — all four exist inline as the plan states. Extraction (T3.2) is grounded.

### FALSE — "use client" narrative is wrong — MEDIUM
Plan (line 18): *"17 occurrences in apps/web/src. Only commissions/view.tsx:1 is app-authored cruft. The other 16 are shadcn/ui primitives — leave them."*

Reality (`grep -rn '"use client"' apps/web/src`):
- 17 total occurrences / 17 files (the count "17" is right).
- **Only 6** are in `/ui/` (shadcn primitives).
- **11 are NOT in `/ui/`** and are app-authored, e.g.:
  - `components/app-sidebar.tsx`
  - `components/email-verify-banner.tsx`
  - `components/merge-tables/inventory-options-dashboard.tsx`
  - `components/pages/customers/v2/{packages-tab,packages-tab-filters,packages-tab-row-drawer}.tsx`
  - `components/trainers/{TrainerCard,TrainerCommissionsSection,TrainerServicesSection}.tsx`
  - `bones/registry.ts`
  - `routes/.../commissions/view.tsx`

**Impact:** "Other 16 are shadcn primitives" is factually false — only 6 are. There are ~10 *other* app-authored `"use client"` directives that are also dead cruft in a Vite/TanStack (non-RSC) app. This does NOT break execution (Phase 0 T0.1 only removes the one in view.tsx, which is valid), but the **rationale for leaving the rest is wrong**. If the intent is "remove app-authored `"use client"` cruft," scope is understated by ~10 files. If the intent is strictly "only touch view.tsx for safety," the task still works — just relabel the others as "app-authored, deferred" rather than "shadcn primitives, leave them."

**Recommended edit (plan line 18):** Replace "The other 16 are shadcn/ui primitives — leave them" with: "6 are shadcn/ui primitives (leave them). ~10 others are app-authored (app-sidebar, email-verify-banner, trainers/*, customers/v2/*, bones/registry) — out of scope for this pass but also removable cruft; view.tsx is the only one this plan removes."

### Phase ordering — SOUND — INFO
Phase 1 (typing / `as any` removal) before Phase 3 (extraction) is correct: removing casts first means extracted components inherit clean typed props rather than carrying `as any` into new files. Phase 0 (closeouts) → 1 (typing) → 2 (mutation convention) → 3 (extraction) → 4 (a11y, scoped to files touched in 1–3) is a clean dependency chain. No ordering defect. Phase 4 T4.1 correctly depends on Phases 1–3 having run (it labels "files touched") and is sequenced last.

---

## Severity rollup
- CRITICAL: 0 (no missing files/symbols — plan is fully executable)
- HIGH: 0
- MEDIUM: 1 (`"use client"` shadcn-primitive claim false; understates removable cruft by ~10 files, wrong rationale)
- LOW: 0
- INFO: 13 (all other claims verified accurate to the exact line)

**Bottom line:** Ship the plan. Fix only the one sentence on plan line 18 about `"use client"` before execution.

# Doc Consistency Audit
**Session:** zplan/05-17_21-30_installment-residual-fixes/
**Findings:** 7 (0 critical · 5 high · 2 medium · 0 low · 0 info)

## Findings

### [HIGH] Migration number collision — 0066 already taken
**Plan claims:** `0066_installments_waived_counter.sql` is the next migration (corrected from `00NN` in previous apply pass).
**Actual:** `packages/db/src/migrations/tenant/0066_commission_condition_between_check.sql` already exists (created 2026-05-17). The plan's 0066 collides. All three planned migrations must be renumbered: 0067 (waived counter), 0068 (payment method unification), 0069 (due index).
**File:** packages/db/src/migrations/tenant/0066_commission_condition_between_check.sql
**Fix:** Rename all three migration references throughout plan.md: 0066→0067, 0067→0068, 0068→0069. Update migration order list in §7.

---

### [HIGH] `syncPackagePaymentStatus` function missing — blocks Phases A, B, F
**Plan claims:** Phases A, B, and F call `syncPackagePaymentStatus(tx, packageInstanceId)` — a function from completeness plan Phase 1.
**Actual:** Function does not exist anywhere in the codebase. Phases A, B, and F cannot execute until completeness plan Phase 1 merges.
**File:** packages/services/src/installment.service.ts (missing)
**Fix:** Block Phases A, B, F on completeness plan Phase 1 delivery. Add explicit gate note to each phase header.

---

### [HIGH] `waiveInstallment` function missing — blocks Phases E and F
**Plan claims:** Phase E.1 adds a waived-status guard (`if (installment.status === "waived") throw CONFLICT`); Phase F.2 updates the waiveInstallment function to use the new installmentsWaived counter.
**Actual:** Function does not exist anywhere in the codebase. Completeness plan Phase 4 is the source — not yet merged.
**File:** packages/services/src/installment.service.ts (missing)
**Fix:** Block Phase E.1 waived guard and Phase F.2 waive credit update on completeness plan Phase 4 delivery.

---

### [HIGH] `RescheduleDialog` component missing — blocks Phase E frontend
**Plan claims:** Phase E.4 sets `<Input type="date" min={todayISO()} />` in `RescheduleDialog` within `installments-page.tsx`.
**Actual:** No `RescheduleDialog` component exists in the codebase. Completeness plan Phase 2 is the source — not yet merged.
**File:** apps/web/src/components/pages/packages/installments-page.tsx (component absent)
**Fix:** Block Phase E.4 on completeness plan Phase 2 delivery. Phase E.1–E.3 (service + router hardening) can proceed independently.

---

### [HIGH] `"partially_paid"` absent from Zod schema — blocks Phase A
**Plan claims:** Phase A depends on completeness plan Phase 1 Task 1.9 having added `"partially_paid"` to `paymentStatusSchema` in the package-instances router.
**Actual:** `packages/api/src/routers/package-instances.ts` line 45: `paymentStatusSchema = z.enum(["pending", "paid", "failed", "refunded"])` — no `"partially_paid"`. Phase A.1 writes `paymentStatus: "partially_paid"` at POS insert; router will reject it.
**File:** packages/api/src/routers/package-instances.ts:45
**Fix:** Block Phase A on completeness plan Phase 1 Task 1.9. Gate note: "Do not deploy Phase A until paymentStatusSchema includes 'partially_paid'."

---

### [HIGH] `c.env.*` access pattern invalid in shared router package — Phase G design issue
**Plan claims:** Phase G.1 reads `INSTALLMENTS_LOCK_ON_OPEN` via `c.env.INSTALLMENTS_LOCK_ON_OPEN` inside the `installments.ts` router `listByPackageInstance` handler.
**Actual:** `packages/api/src/routers/installments.ts` is a shared package, not an `apps/server/` Hono route. `c.env` (Hono context env bindings) is only accessible in server-side Hono handlers. The shared router procedures receive `context` from `createContext`, not `c.env` directly. The flag read will fail or be `undefined` at runtime.
**File:** packages/api/src/routers/installments.ts
**Fix:** Thread the env flag through context: read it in `apps/server/src/routers/` (Hono layer) → pass as a context property → consume in procedure handler. Or move the listByPackageInstance evaluation-skip to the server-side router wrapper.

---

### [MEDIUM] Four open questions without formal resolution markers
**Plan claims:** Open questions documented in §8 with resolutions inline.
**Actual:** Question 1 (waive → commissions?) has no decision and no approver. Questions 2–4 have inline resolutions in plan text but no formal `DECIDED:` marker with approver and date, making it unclear to reviewers whether these are proposals or decisions.
**File:** plan.md:655-661
**Fix:** Add `**DECIDED:** <resolution> — <approver> <date>` line to questions 2 and 3 (where the resolution is clear). Mark question 1 and 4 as `**UNRESOLVED:** blocked on product/engineering decision`.

---

### [MEDIUM] `sales.service.ts` call to `createInstallmentSchedule` unverified before Phase H
**Plan claims:** Phase H impact analysis notes "(if applicable — grep to confirm)" but never confirms whether `sales.service.ts` calls `createInstallmentSchedule`.
**Actual:** Impact unconfirmed. If `sales.service.ts` calls `createInstallmentSchedule` with a `tx` and uses an unsafe cast, Phase H must update that call site too. If it passes a `TenantDb`, Phase H's broader union is backwards-compatible with no change needed.
**File:** packages/services/src/sales.service.ts
**Fix:** Before Phase H.1, grep `createInstallmentSchedule` across all service files, list every call site, and document in Phase H.1 task which sites need updating.

---

## Verified existing files

All "should already exist" source files confirmed present: `installment.service.ts`, `pos.service.ts`, `installments.ts` (router), `pos.ts` (router), `package-instances.ts` (schema + router), `installments.ts` (schema), `analytics.service.ts`, `commissions.service.ts`, `payouts.service.ts`, `migrate-all-tenants.ts`, `installments-page.tsx`, `pos-workflow.tsx`, `wrangler.jsonc`, `tenant-migrations.generated.ts`. ✓

`writeAudit` confirmed in `packages/services/src/audit-log.service.ts`. ✓

Phase G file path issues (wrangler.toml → wrangler.jsonc, .dev.vars.example → .dev.vars) already fixed in previous apply pass. ✓

---

## Summary

Five HIGH blockers found: a migration number collision (0066 already taken — rename to 0067/0068/0069), three missing completeness-plan dependencies (`syncPackagePaymentStatus`, `waiveInstallment`, `RescheduleDialog`) blocking Phases A/B/E/F, and a Zod enum gap (`"partially_paid"` absent in package-instances router). A sixth HIGH is a design issue: the env flag for Phase G cannot be read via `c.env.*` from a shared package — requires context threading redesign. The migration renumbering is the only auto-fixable finding.

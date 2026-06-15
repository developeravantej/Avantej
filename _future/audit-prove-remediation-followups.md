# Audit-Prove Remediation — Follow-ups (2026-05-29)

Handoff for the loose ends from the `/audit-prove` remediation session. The code is
**done and verified** (see below); what remains is product sign-off, a schema
rollout, and PR hygiene — none of which were safe to do autonomously.

**Branch:** `audit-prove/remediation-20260529-1240` (also reachable on `Checkpoint_May_29`).
3 commits, NOT pushed: `cd1f9361` (26 fixes + deferred queue), `21bab0ed` + `ccac4218`
(functional integration tests).
**Full report:** `zplan/2026-05-29-1240-audit-prove/REPORT.md`.
**Decision doc:** `zplan/2026-05-29-1240-audit-prove/PRODUCT-DECISIONS.md`.

## Already done (do NOT redo)
- 23 verified audit bugs + 3 diff-review hardening fixes remediated.
- 8 deferred items implemented + 3 best-guess product builds + test-infra.
- 3 new tenant migrations authored (`0079_stock_movements`, `0080_cancellation_sequence`,
  `0081_credit_point_ledger`), `verify:migrations` in sync.
- Verification: cold type-check + lint clean (my packages), Playwright proof 2/2,
  **all 4 deferred features functionally proven against the real DB** (self-cleaning
  integration tests in `audit-prove-deferred.integration.test.ts`).

---

## 1. Product sign-off (BLOCKING — finance/product decisions)

**Problem.** Three deferred items shipped with best-guess defaults because they are
product calls, not bugs. They must be confirmed or respecified before merge.

**Decisions (full detail in PRODUCT-DECISIONS.md):**
- **Credit-point redemption** — 1 pt = 1¢ at POS, members-only, reduces tax base.
  Nothing auto-earns points yet (the earn rule is undecided). Confirm rate + tax
  treatment + whether/how points are earned.
- **`resolveReview` permission union** ⚠️ — now accepts `commission_payout:create` OR
  `commission_review:resolve` (enables self-approve of manual adjustments). **If finance
  requires separation of duties (creator ≠ approver), revert this** and grant a combined
  role instead. `packages/api/src/routers/commission-splits/review.procedures.ts`.
- **Supplier-invoice editability** — now editable while pending/disputed (was
  intentionally immutable). Confirm or revert.

**Why deferred.** Each is a business-policy call; wrong guesses are cheap to change now,
costly after merge. All three are isolated + high-reversibility.

**Acceptance criteria.** Each decision confirmed or reverted; PRODUCT-DECISIONS.md
annotated with the final call.

---

## 2. Tenant-migration rollout (schema/ops)

**Problem.** Migrations `0079`–`0081` are authored + bundled but **not applied to live
tenant branches**. They auto-apply at request time via `runTenantMigrations`, but the
fleet should be migrated explicitly.

**Scope.** Run `apps/server/scripts/migrate-all-tenants.ts` (per
`docs/TENANT_MIGRATION_WORKFLOW.md`) at deploy. Idempotent (`CREATE … IF NOT EXISTS`).

**Out of scope.** No `bun db:push`. No new schema.

**Acceptance criteria.** All active tenant branches have `stock_movements`,
`credit_point_ledger`, and `tenant_cancellation_seq`; `bun scripts/check-drift.ts` shows
no missing-tables for these (note: pre-existing unrelated drift exists — see #3).

---

## 3. Pre-existing schema-drift cleanup (NOT from this session)

**Problem.** `bun scripts/check-drift.ts` is red on drift that predates this work:
`extra_in_live` FKs (commission_split_reversals, customer_profiles.primary_staff_member_id,
households.primary_contact_profile_id), `action_mismatches`
(organizations.owner_user_id schema=RESTRICT live=NO ACTION), and orphan tables
(push_tokens; controlPanel invitation/member/organization). This will block `drift-check`
CI on any schema PR until resolved.

**Why deferred.** Not introduced by the remediation; likely belongs to other in-flight
work. Needs its own investigation (align schema↔live, or annotate intentional drift).

**Acceptance criteria.** `check-drift` exits 0 against a fully-migrated reference tenant.

---

## 4. Test-harness convergence (coordinate with concurrent session)

**Problem.** Two test issues are being solved by a concurrent session, not this work:
- `integration-setup.ts` was migrated `@neondatabase/serverless`→`pg` and currently
  HANGS, so `audit-prove-fixes.integration.test.ts` (tax/promo) times out. (The newer
  `audit-prove-deferred` test uses its own Neon-serverless pool and passes.)
- Combined `bun test:unit` fails ~5 due to Bun's process-global `mock.module`
  (first-factory-wins). The concurrent session added
  `apps/server/scripts/run-integration-isolated.ts` (per-file process isolation) — the
  correct fix; the same pattern would green the unit suite.

**Acceptance criteria.** Once the harness lands: re-run `audit-prove-fixes` (should pass)
and confirm the unit suite greens under per-file isolation. Do NOT widen `mock.module`
supersets — proven to regress (stub/behavior mismatch).

---

## 5. PR finalization (when ready)

**Problem.** The commits sit interleaved with a concurrent session's commits on
`Checkpoint_May_29`. For a clean PR, cherry-pick the 3 audit-prove commits onto a fresh
branch off trunk.

**Scope.** Rebase/cherry-pick `cd1f9361`, `21bab0ed`, `ccac4218`; regenerate ERD
(`bun scripts/gen-erd.ts`) cleanly on that branch; run `verify:migrations` + `check-types`
+ `check` before opening the PR.

**Out of scope.** Pushing/PR until product sign-off (#1) is done.

**Acceptance criteria.** A clean PR branch containing only the 3 commits, green CI
(modulo the pre-existing drift in #3), product decisions resolved.

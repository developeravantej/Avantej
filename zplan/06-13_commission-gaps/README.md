# Commission System — Gap Remediation

**Created:** 2026-06-13
**Branch suggestion:** `feat/commission-dispute-and-automation`

## Context

A full audit of the commission system (calculation → splits → approval → payout →
Stripe Connect disbursement) found the **core is production-grade and complete**.
Three suspected bugs were verified and cleared:

- `createManualAdjustment` is fully implemented (XOR + dup guard + high-value gate) —
  `packages/services/src/commission-splits.service.ts:1717`
- Weightage redistribution math is correct, sums to 10000bp —
  `packages/services/src/commission-math.ts:90`
- `stripe_connect` payouts genuinely fire `stripe.transfers.create` with webhook recovery

Two real **feature gaps** remain. This session plans both.

| Plan | Gap | Why it matters | Size |
|------|-----|----------------|------|
| [plan-1-dispute.md](plan-1-dispute.md) | No staff-side dispute/contest path | Trainers can't flag a wrong commission except via WhatsApp; reuses existing review UI | S–M |
| [plan-2-automation.md](plan-2-automation.md) | No commission/payout cron jobs | Splits sit in `pending` forever; batches are 100% manual; no settlement reconciliation | M |

**Build order:** Plan 1 first (smaller, high user value, reuses review surface), then Plan 2.

## Status (2026-06-13)

**Plan 1 — IMPLEMENTED** (type-check + lint + build all green). Migration is **0093**
(not 0092 — a concurrent "Phase D" installment-commission process claimed 0092 on this
branch mid-implementation; bumped to avoid collision). Functional browser E2E NOT yet
run — needs tenant login + seeded split + the Radix category select (non-automatable).

Files shipped:
- `packages/db/src/schema/tenant/commission-splits.ts` (+8 dispute columns)
- `packages/db/src/migrations/tenant/0093_commission_dispute.sql` (+ regenerated bundle)
- `packages/services/src/commission-splits.service.ts` (`contestCommissionSplit`,
  `listContested`, `resolveDispute` + types/consts)
- `packages/api/src/routers/commission-splits/dispute.procedures.ts` (+ index wiring)
- `apps/web/src/components/pages/commissions/dispute-dialog.tsx` (trainer)
- `apps/web/src/components/pages/commissions/disputes-tab.tsx` (manager)
- `mine-tab.tsx` (Dispute action + contested badge), `view.tsx` (Disputes pill + badge)

**Unit tests — DONE** (`apps/server/src/tests/unit/services/commission-dispute.test.ts`,
12 tests, all green). Cover: contested_from_status remembers prior status; ownership
guard; paid/not-found/non-contested rejections; **uphold restores the exact prior
status**; void; adjust (voids + inserts corrected split, threshold→pending_review).

**Liability hardening — DONE.** Verified the "drops out of payable pool" invariant
first-hand: payout batch uses an allowlist (`status='approved'`) so contested can never
be paid; `liabilitySummary` money columns are CASE-gated to approved/paid/pending so
contested contributes 0. Tightened `liabilitySummary` base filter to also exclude
`contested` (was `!= void` only) so it no longer surfaces phantom zero-value rows.

**Plan 2 — Job 1 SHIPPED; Job 2 scoped (not built); Job 3 product-gated.**

*Job 1 — stale commission-approval digest (DONE, 5 tests green):*
- `apps/server/src/services/commission-approval-alert.service.ts` — daily per-org sweep,
  counts `pending` splits older than 3 days, inserts ONE in-app `commission_pending_digest`
  notification per active admin (dedupe: skip if an unread digest already outstanding).
  Read-only on commissions; the only write is the notification row.
- Wired into the **09:00** cron slot in `apps/server/src/index.ts` (no new cron — Workers
  Free 5-cron limit respected). Server `tsc -b` clean.
- **Design note:** `onboarding-alerts` emails *platform* super-admins (wrong audience), so
  Job 1 uses the *tenant* `notifications` table (manager-facing) instead — the hourly
  notification-dispatch cron can optionally email it.

*Job 2 — payout settlement reconciliation (CANNOT BUILD — integration absent on this branch):*
- Investigated to build it; found there is **nothing to reconcile**. On `checkpoint/6-11`:
  - `payouts` table has NO `stripe_transfer_id` / connected-account column; `payout_method`
    = `bank_transfer | cash | check | other`.
  - Repo-wide (excl. worktrees): ZERO matches for `confirmPayoutViaStripe` / `stripeTransferId`
    / `handleTransferEvent`; no `transfers.create`; no transfer-webhook handling.
  - `stripe_connect` exists only as an enum label (lifecycle.procedures.ts:201) — selecting it
    stamps the payout `paid` with no money movement. All payout methods are MANUAL here.
- **The Connect payout-transfer feature in `_summary/2026-05-27-audit-prove-commission.md`
  (transfers.create + webhook recovery) was never merged to this branch.** It lives in that
  doc + detached worktrees only.
- ⚠️ **Corrects the original audit:** my first-pass "stripe_connect payouts genuinely fire
  transfers.create — real money movement exists" was WRONG for this branch (the explorer read
  the May-27 summary doc + .dev.vars keys and over-inferred). Memory note
  `_summary` is misleading; do not trust it for this branch.
- **Verdict:** Job 2 is blocked on first building the Connect payout-transfer feature — a
  large net-new initiative gated on product/architecture (same gate as Job 3), NOT a cron
  fold-in. Not started.

*Job 3 — scheduled auto-payout batch: BLOCKED on product sign-off* (auto-disbursement
appetite + paid-vs-pending default). Not started.

## Hard constraints (do not break)

- Installment plan amounts (not full price) drive commission in POS.
- Commission reaches trainers in both rotation-queue and requested cases.
- Multi-tenant isolation: never let tenant A touch tenant B's splits.
- `staffId` = `members.userId` (cross-DB), NOT `members.id`.
- `status` is a plain `text` column — new states are string values, no enum migration.
- Tenant migrations are file-based + bundled: author SQL → `bun gen:migrations` → commit both.
- Workers Free tier = **5 cron triggers max**. Already at 5. New jobs MUST fold into an
  existing `scheduled` slot in `apps/server/src/index.ts`, not add a cron.

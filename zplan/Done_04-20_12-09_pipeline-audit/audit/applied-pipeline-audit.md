# Audit Apply: pipeline-audit.md

**Applied:** 2026-04-20
**Source:** Second-pass deep audit (in-conversation, no separate report file)
**Target file:** `zplan/pipeline-audit.md`
**Freshness:** ok — applied immediately after audit

## Summary

| Category | Count |
|----------|-------|
| Critical gaps added | 5 (#7–#11) |
| Moderate (Design Risks) added | 9 (#12–#20) |
| Validation/audit gaps added | 7 (V1–V7) |
| Pipeline Completeness Summary rows updated | 4 |
| Recommended Fix Order: new tier added | 1 (Tier 2, A1–A19) |

## Changes

### Front matter
- Added `Second-pass deep audit: 2026-04-20` line under the existing `Gap analysis applied` line.

### Pipeline Completeness Summary (table updates)
- `Sales Order + Items (POS)` — Working flipped ✅ → ⚠️ (cross-reference Gap #13)
- `Credit Debit at Booking` — all three columns flipped to ⚠️ (cross-reference Gaps #7, #10, V1)
- `Credit Restoration on Check-in Delete` — Working ✅ → ⚠️ (cross-reference Gap #18)
- `Service Access Enforcement` — note expanded to mention Gap #10 (ownership check)

### New Critical Gaps (after existing #6)
- **#7** Appointment insert + credit debit not transactional (`appointment.service.ts` 235–275)
- **#8** Parallel `processRefund` in `installment.service.ts` has no guards (519–558)
- **#9** `confirmInstallmentPayment` not in a transaction (266–365)
- **#10** Package ownership not verified at booking or check-in (`appointment.service.ts` 217–232; `check-ins.service.ts` 305–318)
- **#11** `createInstallmentSchedule` not in a transaction (201–251)

### New Design Risks (appended after `Installment Overdue Lock`)
- **#12** Commission approval TOCTOU (`commission-splits.service.ts` 299–344)
- **#13** POS order number generators not concurrency-safe (`pos.service.ts` 145–175; `refunds.service.ts` 124–133)
- **#14** Trainer buffer-conflict check not locked (`appointment.service.ts` 199–213)
- **#15** `updateAppointment` has no status machine guard (318–337)
- **#16** `rescheduleInstallment` not in a transaction (`installment.service.ts` 573–655)
- **#17** `recordCheckIn` anti-duplicate check outside transaction (`check-ins.service.ts` 244–273)
- **#18** `deleteCheckIn` TOCTOU — double credit restoration (565–620)
- **#19** `listAppointments` filters by scope in memory after `limit` (136–146)
- **#20** `listRefunds` count uses full-row fetch (`refunds.service.ts` 852–859)

### New `Validation & Audit Gaps` section
- **V1** Booking accepts `creditsUsed: 0` or negative
- **V2** POS `taxBase` goes negative when discount > subtotal
- **V3** POS allows negative `unitPriceCents` and zero `quantity`
- **V4** Refund cap check excludes pending refunds
- **V5** Missing `writeAudit` on appointment + installment lifecycle ops
- **V6** `searchPosCustomers` fetches all members, filters in memory
- **V7** `unlockPackage` has no "already unlocked" guard

### Recommended Fix Order
- Original 12-row table preserved as **Tier 1 — Original Pipeline Fixes**.
- Added **Tier 2 — Atomicity, Authorization & Validation** (A1–A19) covering all new findings, ordered by risk:
  - A1–A2: package ownership + appointment transaction (highest risk, security + data integrity)
  - A3: parallel unguarded refund path
  - A4–A8: remaining transaction wrappers and TOCTOU fixes
  - A9–A12: concurrency / status guards
  - A13–A19: validation, audit, and performance

## Deferred (process gaps)

None — this was a documentation update, not a code change. To act on the new findings, run `/plan` against the Tier 2 priorities or implement them directly.

## Next steps

1. Decide implementation order — recommend A1 (ownership check) and A2 (`createAppointment` transaction) first, as both are security/data-integrity issues with low LOC.
2. For A3 (parallel `processRefund`), confirm with the team whether to delete or guard it — this is a judgment call, not a mechanical fix.
3. After implementation, re-verify the affected service files to confirm the gaps are closed.

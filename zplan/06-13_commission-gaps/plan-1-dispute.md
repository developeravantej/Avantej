# Plan 1 — Staff Commission Dispute Workflow

## Problem

The existing `pending_review` flow is **manager-initiated** (a high-value manual
adjustment enters review for sign-off). There is no path for a **trainer** to say
"my commission on this session is wrong." Today that dispute happens over WhatsApp.

We reuse the existing Review-tab surface and resolution machinery — the only new
concept is a split flagged `contested` by the earning staff member, plus a reason
trail, which a manager then resolves (uphold / adjust / void).

## User journeys (both must work end-to-end)

### Journey A — Trainer contests a split (the "Mine" tab)
1. Trainer opens Commissions → **Mine**, sees a `pending` or `approved` split they
   believe is wrong.
2. Clicks **Dispute**, picks a reason category + free-text note, submits.
3. Split flips `pending|approved → contested`; it leaves the payout-eligible pool
   (liability + batch queries already filter on status, so it drops out automatically).
4. Trainer sees a "Disputed" badge on the row with their submitted reason.

### Journey B — Manager resolves the dispute (the "Review" tab)
1. Manager opens Commissions → **Review**. Contested splits appear in a new section
   (or filter) alongside `pending_review` adjustments.
2. Per row: sees the staff's reason, the split's snapshot fields (base, weightage,
   tier, condition) for reproducibility.
3. Manager picks an outcome:
   - **Uphold** → split returns to its prior state (`pending` or `approved`).
   - **Void** → `contested → void` with reason.
   - **Adjust** → void the contested split + create a corrected manual adjustment
     (reuses `createManualAdjustment`, which already enters `pending_review`).
4. Resolution writes an audit row and notifies the trainer (reuse notification-dispatch
   if cheap; otherwise just in-app state — see Open Questions).

> Constraint: a **paid** split can NOT be contested through this flow (money already
> moved — that's a refund/reversal, which already exists). Guard rejects it.

## Status model

`status` is plain `text`. Add one value: **`contested`**.

```
pending  ──dispute──▶ contested ──uphold──▶ pending
approved ──dispute──▶ contested ──uphold──▶ approved   (restore prior status)
                      contested ──void────▶ void
                      contested ──adjust──▶ void (+ new pending_review split)
```

To restore the prior status on "uphold", store it. Reuse no existing column —
add `contested_from_status`.

## Files to change

### Schema + migration
- **`packages/db/src/schema/tenant/commission-splits.ts`** — add columns:
  - `contestedBy text` (members.userId)
  - `contestedReason text`
  - `contestedCategory text` (enum-in-app: `wrong_amount | wrong_staff | should_not_earn | missing_split | other`)
  - `contestedAt timestamptz`
  - `contestedFromStatus text` (the status to restore on uphold)
  - `resolvedBy text`, `resolvedAt timestamptz`, `resolutionNote text`
- **`packages/db/src/migrations/tenant/00XX_commission_dispute.sql`** — idempotent
  `ADD COLUMN IF NOT EXISTS` for each. No new index strictly required (status index
  already covers `contested` filtering), but add
  `commission_splits_contested_idx ON (status) WHERE status='contested'` partial if
  the Review query benefits.
- Run `bun gen:migrations`, commit `tenant-migrations.generated.ts` alongside.
  ⚠️ autocrlf flips LF→CRLF and breaks `verify:migrations` — just re-run `gen:migrations`.

### Services
- **`packages/services/src/commission-splits.service.ts`**:
  - `contestCommissionSplit(tenantDb, { splitId, contestedBy, category, reason })`
    — guards: split exists, belongs to caller (staffId === contestedBy), status ∈
    {pending, approved} (reject paid/void/contested/pending_review). Sets `contested`
    + stores `contestedFromStatus`. Writes audit. `FOR UPDATE` lock.
  - `resolveDispute(tenantDb, { splitId, action: 'uphold'|'void'|'adjust', resolvedBy, note, adjustment? })`
    — `uphold` restores `contestedFromStatus`; `void` → void; `adjust` → void + call
    `createManualAdjustment`. Writes audit.
  - Extend `listPendingReview` OR add `listContested` — prefer a **separate**
    `listContested` query (different shape: includes contest reason/category) to keep
    the existing review query clean.

### API router
- **`packages/api/src/routers/commission-splits/`**:
  - In `lifecycle.procedures.ts` (or a new `dispute.procedures.ts`):
    - `contest` mutation — gated `commission_management:read` is NOT enough; the
      earner needs to act on their OWN split. Permission: any authenticated member
      may contest a split where `staffId === session.user.id`. Enforce ownership in
      the handler, not just permission.
    - `resolveDispute` mutation — gated `commission_management:approve` (manager).
    - `listContested` query — gated `commission_management:read`, RBAC-scoped by
      `accessibleNodeIds` (mirror `listPendingReview`).
  - Register in the router `index.ts`.
- **Type stub:** no server-only router here, so no `_types` change needed.

### Frontend
- **`apps/web/src/components/pages/commissions/`**:
  - **Mine tab** (`my-commissions-page.tsx` or equivalent) — add a **Dispute** row
    action visible when `status ∈ {pending, approved}` AND row is the current user's.
    Opens a new `DisputeDialog` (category select + reason textarea). Calls `contest`.
    Show "Disputed" badge when `status==='contested'`.
  - **Review tab** (`review-tab.tsx`) — add a "Disputes" section or a roleType-style
    filter that lists `listContested`. Per row: Uphold / Void / Adjust actions →
    `resolveDispute`. The Adjust action reuses the existing `ManualAdjustmentDialog`
    pre-filled with the contested split's staff + target.
  - New `dispute-dialog.tsx` (mirror `manual-adjustment-dialog.tsx` structure).
- Invalidate on success: `getMyCommissions`, `listLedger`, `liabilitySummary`,
  `listContested`, badge query.

## Risks
- **Contested splits must drop out of payout/liability.** Verify `runBatch`,
  `previewBatch`, and `liabilitySummary` only count `approved`/`paid` — they do
  (status-filtered), so `contested` is excluded for free. **Add a test that pins this.**
- **Ownership bypass.** The `contest` mutation must reject contesting someone else's
  split even for admins-acting-as — enforce `staffId === session.user.id` server-side.
- **Race:** trainer contests while manager approves. `FOR UPDATE` + status precondition
  CAS handles it (whichever commits first wins; the other's status guard fails cleanly).

## Verification
1. `bun check-types` + `bun verify:migrations`.
2. Unit: contest from pending/approved succeeds; from paid/void/contested rejects;
   uphold restores exact prior status; contested excluded from `liabilitySummary`.
3. Browser (`http://avantej.localhost:3021/`): as `franchisee@gmail.com`, complete an
   appointment → split appears in Mine → Dispute it → confirm it leaves liability →
   resolve as manager (uphold, then void, then adjust) → confirm each transition.
4. `/audit-prove` POS pass to confirm no regression in split creation.

## Open questions (decide before coding)
- **Notify the trainer on resolution?** Reuse `notification-dispatch` (adds a queued
  email + an hourly-cron dependency) or in-app status only for v1? Recommend in-app
  only for v1.
- **Who counts as "the earner" for contest rights** — only `staffId`, or also their
  manager up the hierarchy? Recommend `staffId` only for v1; managers already have
  the adjustment path.
- **Permission for `contest`** — net-new `commission:dispute` resource, or "any member
  on own split, no extra permission"? Recommend the latter (no perm, ownership-gated)
  so it works out of the box for staff who lack commission_management perms.

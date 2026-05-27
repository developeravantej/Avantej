# Payouts View

**Route:** `/dashboard/payouts/view`
**Files:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/payouts/view.tsx` — empty route shell (registers route only)
- `apps/web/src/routes/_authenticated/dashboard/_layout/payouts/view.lazy.tsx` — `createLazyFileRoute`, all UI + queries live here

**Platform:** web
**Auth required:** authenticated (rbac `user_management:read` enforced server-side)
**Last updated:** 2026-05-27

---

## 1. What It Does

**Purpose (user perspective):** View commission payout records for staff and trainers — a read-only ledger of all payouts generated from appointments.

**Produces:** A KPI strip (Pending count + total, Processing count, Paid total + count, Failed count with amber callout when >0) plus a filterable data table showing payout ID (copyable/truncated), recipient name, amount (MYR), status badge, paid-at date, and created-at date.

**On success:** Table renders payouts, enriched with recipient names fetched from the control panel user table.

**On failure / error states:** `PageLoader` while loading; "Select an organization" guard when no org is selected; `StatusCallout` error banner with retry button on fetch failure; `EmptyState` (Banknote icon) when no rows.

---

## 2. How It Works

**Execution flow:**
```
PayoutsViewPage
  → useUserContext()                       # reads organizationId
  → useQuery(["payouts", orgId, statusFilter])
    → client.payouts.list({ organizationId, status: statusFilter })
      → payoutsRouter.list                 # rbac: user_management:read
        → payouts (tenant DB)              # filtered by status, ordered by createdAt DESC
        → members (tenant DB)              # batch: get userIds from recipientIds
        → user (control panel DB)          # batch: enrich with user names
```

**Inputs:**
- Status filter tabs: All / Pending / Processing / Paid / Failed / Canceled (refetches on change)

**State management:**
- `statusFilter` (`PayoutStatus | undefined`) — drives query re-fetch

**Outputs:** KPI strip + `DataTable<PayoutRow>` with columns: id (truncated copyable), recipientName, amount, status (badge), paidAt, createdAt. No create button — payouts are auto-generated from appointments.

**Side effects:** None — read-only page.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `payouts.list` — list payouts with optional status filter, limit 50, enriched with recipient names

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — reused generic table
- `columns` / `PayoutRow` — `apps/web/src/components/tables/payouts/view/columns.tsx` — column defs with status badge
- `PageLoader`, `EmptyState`, `StatusCallout` — `@/components/ui/*` — loading / empty / error UX
- `formatPrice` — `@/lib/money` — MYR currency display on KPI strip

**Uses these hooks:**
- `useUserContext` — provides `organizationId`

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — "Payouts" link under the Finance nav group

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `payouts` (tenant) | READ | `id`, `recipientId`, `amount`, `status`, `paidAt`, `appointmentId`, `createdAt` |
| `members` (tenant) | READ | `userId` (batch lookup for recipientIds) |
| `user` (control panel) | READ | `id`, `name` (batch lookup for recipient display names) |

**Key types:**
```typescript
interface PayoutRow {
  id?: string;
  recipientId?: string | null;
  recipientName?: string | null;   // enriched from control panel user table
  amount?: number | null;          // cents
  status?: string | null;          // "pending"|"processing"|"paid"|"failed"|"canceled"
  paidAt?: string | null;
  appointmentId?: string | null;
  createdAt?: string | null;
}
```

---

## 5. Tests

**Test files:** None found for this page or the payouts router.

**Not tested (risk areas):**
- Recipient name enrichment fails silently if `controlPanelDb` is not in the Hono context — recipients show as "Unknown".
- KPI strip aggregates only over the currently-loaded 50 rows — not a true org total when more rows exist.
- Default limit of 50 payouts — no pagination controls; older payouts are not visible.
- Status `"canceled"` (one 'l') used in API vs "cancelled" (two 'l's) used elsewhere — be consistent when filtering.

---

## 6. Notes

- Payouts are auto-created by the appointment processing flow — there is no create button on this page.
- Recipient name enrichment requires a cross-database join: tenant DB for `members.userId` → control panel DB for `user.name`. If `controlPanelDb` is unavailable (e.g., context not set), names show as "Unknown".
- `amount` in payouts is in cents; `formatPrice(amount, "MYR")` in the column renderer handles display.
- The `user_management:read` permission guards this page (same as members/trainers pages), not a dedicated payout permission.
- The page uses the generic sales DataTable (`apps/web/src/components/tables/sales/view/data-table.tsx`) rather than a payout-specific table component.
- **Lazy-route split (Phase 5 of web-debt-cleanup):** `view.tsx` is now a minimal `createFileRoute` stub; all component code lives in `view.lazy.tsx` via `createLazyFileRoute`. This keeps the route out of the initial dashboard bundle.
- Row shape adds optional `batchId` field (payouts may belong to a batch run); the column file may surface this when present.

### 2026-05-27 audit-prove commission delta

- **F-08** `runBatch` now wires `getOrCreatePayoutBatch` into its transaction — every inserted payout row carries a non-null `batchId` and `payout_batches.totalCents` is recomputed via a single GROUP BY. The procedure also accepts an optional `branchId` input (`guardBranchAccessible` when supplied).
- **F-15 refinement** `payouts.list` non-admin RBAC predicate refined: admins bypass (role check); non-admins see rows where `recipientId === viewer.userId` OR `appointments.branchId IN accessibleNodeIds` OR (appointment-less + `payout_batches.branchId IN accessibleNodeIds`). Stops branch-scoped staff from seeing org-wide batch payouts.
- **F-19** `recipientSummary.avgPerCycle` now groups by `batchId` (fallback `paidAt::date`) and excludes negative reversal rows.
- **NEW state machine** Per-row procedures `payouts.markPaid` / `markFailed` / `retry` / `cancel`; each transition is FOR-UPDATE-locked. `runBatch.confirmImmediately` defaults `true` (legacy cash flow); when `false`, payouts insert at `pending` and linked splits stay `approved` until `markPaid` settles.
- **NEW Stripe Connect path** `paymentMethod: "stripe_connect"` enum value added. `partnerStripe.confirmViaStripe(payoutId)` (server-only router) fires `stripe.transfers.create` for a pending stripe_connect payout with idempotency key `confirm-payout:<id>`.
- Source: `packages/services/src/payouts.service.ts`, `packages/api/src/routers/payouts.ts`, `apps/server/src/routers/partner-stripe.ts`, `apps/server/src/services/confirm-payout-via-stripe.service.ts`.


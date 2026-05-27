# Payouts

**Route:** `/dashboard/payouts/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/payouts/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-27

---

## 1. What It Does

**Purpose (user perspective):** View staff and trainer commission payouts for the current organization.
**Produces:** Table of payout records with status filter tabs (All, Pending, Processing, Paid, Failed, Canceled).
**On success:** Data table with sortable/filterable payout rows.
**On failure / error states:** Loading spinner; error message with retry button; empty state if no org selected.

---

## 2. How It Works

**Execution flow:** Component mount → get currentOrganizationId from useUserContext → query client.payouts.list() via TanStack Query → map API response to PayoutRow shape → render table
**Inputs:** organizationId (from session context); statusFilter (local state)
**State management:** TanStack Query `["payouts", organizationId, statusFilter]`; local state for statusFilter
**Outputs:** DataTable<PayoutRow> component + status filter tabs
**Side effects:** Refetch on tab change; error toasts from DataTable

---

## 3. What Depends On It

**Calls these API endpoints:**
  - `client.payouts.list({ organizationId, status })` — fetches payout records
**Uses these components:**
  - `DataTable` — `@/components/tables/sales/view/data-table` — generic table renderer
  - `columns` — `@/components/tables/payouts/view/columns` — payout column definitions
**Uses these hooks:** useUserContext, useQuery
**Navigation: who navigates here:** Dashboard sidebar link
**Navigation: where it goes:** None

---

## 4. Data Shapes

**DB tables touched:** tenantDb: payouts (READ)
**Key types / Zod schemas:**
  - API input: `{ organizationId: string, status?: PayoutStatus }`
  - API output: Array of `{ id, recipientId, recipientName, amount (cents), status, paidAt, appointmentId, createdAt }`
  - PayoutRow: maps API response (dates as strings) for table display

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
  - Status filter persistence (resets on mount)
  - Null org handling (guard at render; messages shown)
  - Large result sets (pagination not implemented)
  - Error recovery (no manual refetch UI visible to user)

---

## 6. Notes

- Payouts are auto-generated from appointments; no create button shown
- Status filter is ephemeral (resets when component unmounts)
- No org → shows "Select an organization" message before loading check
- Date formatting via String() conversion (not ideal; could use date library)

### 2026-05-27 audit-prove commission delta

Backend hardening from the audit-prove commission session (see `web-dashboard-payouts-view.md` for detail): `runBatch` now guarantees every payout row has a non-null `batchId` and recomputes `payout_batches.totalCents` from a single GROUP BY (F-08); `payouts.list` RBAC refined so branch-scoped staff don't see org-wide batch payouts (F-15); `recipientSummary.avgPerCycle` groups by `batchId` and ignores reversals (F-19). NEW per-row state machine — `payouts.markPaid` / `markFailed` / `retry` / `cancel`, each FOR-UPDATE-locked; `runBatch.confirmImmediately:false` keeps payouts at `pending` and splits at `approved` until settle. NEW `stripe_connect` payment method + server-only `partnerStripe.confirmViaStripe(payoutId)` that fires `stripe.transfers.create` with idempotency key `confirm-payout:<id>`. Source: `packages/services/src/payouts.service.ts`, `packages/api/src/routers/payouts.ts`, `apps/server/src/routers/partner-stripe.ts`, `apps/server/src/services/confirm-payout-via-stripe.service.ts`.

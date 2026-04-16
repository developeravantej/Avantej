# Payouts View

**Route:** `/dashboard/payouts/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/payouts/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** View all staff and trainer commission payout records with status-based filtering.
**Produces:** A table of payout records including recipient name, amount (MYR), status, paid date, and creation date.
**On success:** Payout rows are displayed in a sortable, copyable table; row IDs are copyable via `CopyableCell`.
**On failure / error states:**
- No organization selected: full-page "Select an organization to view payouts." message.
- Loading: centered spinner.
- Empty result: table renders with no rows (no custom empty state).

---

## 2. How It Works

**Execution flow:**
```
PayoutsViewPage
  → useUserContext() → organizationId
  → statusFilter state (tab click)
  → useQuery(["payouts", organizationId, statusFilter])
    → client.payouts.list({ organizationId, status })
      → payoutsRouter.list (packages/api/src/routers/payouts.ts)
        → requirePermission(tenantDb, member, "user_management", "read")
        → tenantDb.select().from(payouts).where(status?).orderBy(desc createdAt).limit(50)
        → batch-enrich recipientId via members → controlPanelDb users
      → returns { id, recipientId, recipientName, amount, status, paidAt, appointmentId, createdAt }[]
  → maps to PayoutRow[]
  → <DataTable columns={columns} data={data} />
```

**Inputs:** Status filter tab (All / Pending / Processing / Paid / Failed / Canceled), `organizationId` from user context.
**State management:** `statusFilter` local state drives query key and re-fetch.
**Outputs:** Table with columns: Payout ID (copyable, truncated), Recipient, Amount (MYR), Status (badge), Paid At, Created.
**Side effects:** None — read-only page.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `payouts.list` — lists payouts filtered by status; requires `user_management:read` permission.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic TanStack Table wrapper.
- `columns` / `PayoutRow` — `apps/web/src/components/tables/payouts/view/columns.tsx` — column definitions with status badge and copyable ID.
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — click-to-copy cell.
- `Separator` — `apps/web/src/components/ui/separator.tsx`.

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`.
- `useQuery` (TanStack Query) — fetches payout list.

**Navigation: who navigates here:** Sidebar "Finance → Payouts" link (`apps/web/src/components/app-sidebar.tsx:191`).
**Navigation: where it goes:** No outbound navigation from this page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `payouts` | SELECT | `id`, `recipientId`, `amount`, `status`, `paidAt`, `appointmentId`, `createdAt` |
| `members` | SELECT (enrich) | `userId` |
| `user` (control panel) | SELECT (enrich) | `id`, `name` |

**Key types:**
```typescript
type PayoutStatus = "pending" | "processing" | "paid" | "failed" | "canceled";
interface PayoutRow {
  id?: string;
  recipientId?: string | null;
  recipientName?: string | null;
  amount?: number | null; // integer cents
  status?: string | null;
  paidAt?: string | null;
  appointmentId?: string | null;
  createdAt?: string | null;
}
```

---

## 5. Tests

**Test files:** None found for the route or component.
**Scenarios covered:** N/A
**Not tested:** Status filter tab behavior, empty/loading/no-org states, enrichment logic (tested indirectly in the router).

---

## 6. Notes

- Payouts are auto-generated from appointment completions — there is no create button on this page.
- Recipient name enrichment is a two-hop cross-DB query (tenant `members` → control panel `user`); the router falls back to `"Unknown"` if the control panel DB is unavailable.
- The permission required is `user_management:read`, not a dedicated `payouts` permission — any user-management reader can see payouts.
- Default limit is 50 rows; there is no pagination UI.
- Amount column passes `amount` (cents) directly to `formatPrice`; no division is done in the page — `formatPrice` handles the cents-to-RM conversion.

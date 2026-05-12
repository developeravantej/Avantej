# Expenses View

**Route:** `/dashboard/expenses/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/expenses/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (rbac `expense_management:read`; create requires `expense_management:create`; approve/reject/markPaid require `expense_management:update`)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Submit expense claims and manage the approval workflow — view, submit, approve, reject, and mark expenses as paid.

**Produces:** A filterable data table of expense records with action buttons per-row; a Sheet for submitting new expenses; Dialogs for rejecting (with reason) and marking as paid (with reference).

**On success:** Submitted expense appears in the list; approved/rejected/paid expenses update their status badge. All mutations invalidate the expenses cache and show a toast.

**On failure / error states:** Spinner while loading; "Select an organization" guard; toast errors on mutation failures. No dedicated error render state for the list fetch failure.

---

## 2. How It Works

**Execution flow:**
```
ExpensesViewPage
  → useUserContext()                          # reads organizationId + hasPermission()
  → useQuery(["expenses", orgId, statusFilter])
    → client.expenses.list({ organizationId, status: statusFilter })
      → expensesRouter.list                   # rbac: expense_management:read
        → listExpenses()                      # service fn
          → expenses (tenant DB)              # filtered by status + accessibleNodeIds
  → createMutation
    → client.expenses.create(...)             # rbac: expense_management:create
      → createExpense()                       # submittedBy = context.member.userId
        → expenses (tenant DB) INSERT
  → approveMutation
    → client.expenses.approve({ organizationId, id })
      → approveExpense()                      # sets status='approved', approvedBy
  → rejectMutation
    → client.expenses.reject({ organizationId, id, rejectionReason })
      → rejectExpense()                       # sets status='rejected', rejectionReason
  → markPaidMutation
    → client.expenses.markPaid({ organizationId, id, paymentReference })
      → markExpensePaid()                     # sets status='paid', paidBy
```

**Inputs:**
- Status filter tabs: All / Pending / Approved / Rejected / Paid (refetches on change)
- Create Sheet fields: category (select), description (textarea, required), amount in RM (number), expense date (date, required), receipt URL (URL, optional)
- Reject Dialog: rejectionReason (textarea, required)
- Mark Paid Dialog: paymentReference (text, optional)

**State management:**
- `statusFilter` — drives query re-fetch on tab change
- `isCreateOpen` + form fields — Sheet open state and field values
- `rejectTarget` + `rejectionReason` — reject Dialog state
- `paidTarget` + `paymentReference` — mark-paid Dialog state

**Outputs:** `DataTable<ExpenseRow>` inline columns; Sheet, two Dialogs.

**Side effects:** `queryClient.invalidateQueries(["expenses", orgId])` after every mutation. `submittedBy` is automatically set to `context.member.userId` server-side.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `expenses.list` — list with optional status filter and accessibleNodeIds scope
- `expenses.create` — submit new expense (category, description, amount in cents, expenseDate, receiptUrl)
- `expenses.approve` — set status to approved
- `expenses.reject` — set status to rejected with reason
- `expenses.markPaid` — set status to paid with optional reference

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — reused generic table
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — for submittedBy column
- `StatusBadge` (local) — maps `pending|approved|rejected|paid` to badge variants

**Uses these hooks:**
- `useUserContext` — provides `organizationId` and `hasPermission()` for `canCreate` / `canUpdate` guards

**Navigation: who navigates here:**
- `apps/web/src/components/app-sidebar.tsx` — "Expenses" link under the Finance nav group
- `apps/web/src/components/claims-widget.tsx` — links to this page

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `expenses` (tenant) | READ, INSERT, UPDATE | `id`, `category`, `description`, `amount`, `expenseDate`, `submittedBy`, `status`, `branchId`, `receiptUrl`, `rejectionReason`, `approvedBy`, `paidBy`, `createdAt` |

**Key types:**
```typescript
type ExpenseCategory = "travel" | "equipment" | "supplies" | "training" | "other";
type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";

interface ExpenseRow {
  id: string; category: ExpenseCategory; description: string;
  amount: number;          // cents
  expenseDate: string;     // formatted with toLocaleDateString()
  submittedBy: string;
  status: ExpenseStatus;
  receiptUrl?: string|null; rejectionReason?: string|null;
  approvedBy?: string|null; paidBy?: string|null;
}
```

**Form fields (Create Sheet):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| category | select | required (default: travel) | `expenses.create.category` |
| description | textarea | min 1 char | `expenses.create.description` |
| amount | number (RM) | > 0 | `expenses.create.amount` (×100 → cents) |
| expenseDate | date | required | `expenses.create.expenseDate` (→ ISO datetime) |
| receiptUrl | url | optional, must be valid URL if provided | `expenses.create.receiptUrl` |

---

## 5. Tests

**Test files:**
- `apps/web/src/__tests__/routes/expenses.test.tsx` — frontend tests
- `apps/server/src/tests/unit/services/expenses.test.ts` — service unit tests
- `apps/server/src/tests/integration/expenses.integration.test.ts` — integration tests

**Scenarios covered:** Create, approve, reject, markPaid flows; status filter; permission checks.

**Not tested (risk areas):**
- Receipt URL validation (client-side `new URL()` check) edge cases
- `amount` field accepts non-integer RM values; conversion uses `Math.round(rmValue * 100)` — floating-point edge cases
- Date conversion: local date string → `T00:00:00.000Z` may shift date by timezone on the API side

---

## 6. Notes

- Amount is stored in integer cents server-side; the UI accepts a decimal RM value and multiplies by 100 before sending.
- The `submittedBy` field is set server-side from `context.member.userId` — the create input does not accept it from the client.
- Action buttons in the table are guarded by `canUpdate` (derived from `hasPermission("expense_management:update")`); users without this permission see "—".
- `canCreate` hides the "Submit Expense" header button for users without `expense_management:create`.
- The reject mutation requires a non-empty `rejectionReason`; this is validated client-side before calling the API.
- Claims widget (`apps/web/src/components/claims-widget.tsx`) calls `expenses.list({ status: "pending" })` separately — it is not connected to this page's query cache.

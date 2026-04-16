# Expenses View

**Route:** `/dashboard/expenses/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/expenses/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Allows staff to submit expense claims and managers to approve, reject, or mark them as paid. A status-filter tab bar narrows the table to a specific workflow stage.

**Produces:** A full-page layout with header, status tab filter (All / Pending / Approved / Rejected / Paid), a data table, a create-expense side sheet, a reject-reason dialog, and a mark-paid dialog.

**On success:**
- Submit: toast "Expense submitted!" Sheet closes; table refreshes.
- Approve: toast "Expense approved" Row status updates to Approved.
- Reject: toast "Expense rejected" Requires a rejection reason. Row status updates to Rejected.
- Mark Paid: toast "Expense marked as paid" Optional payment reference. Row status updates to Paid.

**On failure / error states:**
- No `organizationId`: message "Select an organization to view expenses."
- Loading: centered spinner.
- Mutation errors: toast with error message.

---

## 2. How It Works

**Execution flow:**
```
ExpensesViewPage
  → useUserContext() → organizationId, hasPermission("expense_management:create/update")
  → useState(statusFilter) → "pending" | "approved" | "rejected" | "paid" | undefined
  → useQuery(["expenses", orgId, statusFilter])
      → client.expenses.list({ organizationId, status? })
  → data: ExpenseRow[] (mapped from API, amount in cents)
  → inline columns (ColumnDef[]) with approve/reject/markPaid actions (canUpdate-gated)
  → <DataTable columns data /> (from sales/view/data-table)

  → "Submit Expense" button (canCreate-gated) → <Sheet>
      → handleCreateSubmit() → parseFloat(amountRm) * 100 → cents
      → createMutation → client.expenses.create({ ..., amount: cents, expenseDate: ISO })

  → Approve button → approveMutation → client.expenses.approve({ id })

  → Reject button → <Dialog> → rejectionReason → rejectMutation → client.expenses.reject({ id, rejectionReason })

  → "Mark Paid" button → <Dialog> → paymentReference? → markPaidMutation → client.expenses.markPaid({ id, paymentReference? })
```

**Inputs:**
- Status tab filter: client-side state, passed to query as `status` param
- Sheet form: category (select), description (textarea, required), amount in RM (number input, required), expense date (date, required), receipt URL (url, optional)
- Reject dialog: rejectionReason (textarea, required)
- Mark Paid dialog: paymentReference (text, optional)

**State management:**
- `statusFilter` — active tab selection
- Sheet open/form state: `isCreateOpen`, `formCategory`, `formDescription`, `formAmountRm`, `formDate`, `formReceiptUrl`
- Reject dialog: `rejectTarget` (expense id | null), `rejectionReason`
- Mark paid dialog: `paidTarget` (expense id | null), `paymentReference`

**Outputs:** Expense rows created/status-changed; query invalidated after each mutation.

**Side effects:** Query invalidated for `["expenses", organizationId]` after any mutation.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.expenses.list` — fetch expenses, optionally filtered by status
- `client.expenses.create` — submit a new expense claim
- `client.expenses.approve` — approve a pending expense
- `client.expenses.reject` — reject a pending expense with reason
- `client.expenses.markPaid` — mark an approved expense as paid

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table (reused from sales)
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — submittedBy column
- `Sheet`, `SheetContent`, `SheetHeader`, etc. — shadcn/ui — create expense form
- `Dialog`, `DialogContent`, etc. — shadcn/ui — reject + mark-paid confirmation dialogs
- `Select`, `Input`, `Textarea`, `Button`, `Badge` — shadcn/ui

**Uses these hooks:**
- `useUserContext` — org context + `hasPermission` for canCreate/canUpdate
- `useQuery` — expense list
- `useMutation` (×4) — create, approve, reject, markPaid
- `useQueryClient` — cache invalidation

**Navigation: who navigates here:** `app-sidebar.tsx` — "Expenses" link under Finance section

**Navigation: where it goes:** Stays on page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `expenses` | SELECT | `id`, `category`, `description`, `amount`, `expense_date`, `submitted_by`, `status`, `branch_id`, `receipt_url`, `rejection_reason`, `approved_by`, `paid_by`, `created_at` |
| `expenses` | INSERT | `category`, `description`, `amount` (cents), `expense_date`, `receipt_url`, `submitted_by`, `branch_id` |
| `expenses` | UPDATE | `status → "approved"`, `approved_by`, `approved_at` |
| `expenses` | UPDATE | `status → "rejected"`, `rejection_reason` |
| `expenses` | UPDATE | `status → "paid"`, `paid_by`, `paid_at`, `payment_reference` |

**`ExpenseRow` interface:**
```ts
{
  id: string; category: ExpenseCategory; description: string;
  amount: number;          // cents (stored as integer in DB)
  expenseDate: string;     // formatted via toLocaleDateString()
  submittedBy: string;     // member userId
  status: ExpenseStatus;
  branchId?: string | null; receiptUrl?: string | null;
  rejectionReason?: string | null; approvedBy?: string | null; paidBy?: string | null;
  createdAt: string;
}
```

**Category options:** `travel | equipment | supplies | training | other`

**Amount handling:** User enters RM value (decimal); converted to cents via `Math.round(rmValue * 100)` before API call. Displayed via `formatPrice(amount, "MYR")` from `@/lib/currency`.

**Form fields (create sheet):**
| Field | Type | Validation | Maps to |
|-------|------|-----------|---------|
| category | select | required (default: travel) | `category` |
| description | textarea | required, non-empty | `description` |
| amount | number (RM) | > 0, required | `amount` (×100 → cents) |
| expenseDate | date | required | `expense_date` (ISO UTC) |
| receiptUrl | url | optional; validated as valid URL | `receipt_url` |

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/expenses.test.tsx`

**Scenarios covered:**
- Renders without crashing (empty state)
- Renders page heading ("Expenses") and "Submit Expense" button
- (Additional scenarios visible in test file)

**Not tested:** Approve/reject/markPaid mutation flows with UI interaction, status tab filtering, receipt URL validation, `canCreate`/`canUpdate` permission gates

---

## 6. Notes

- The "Submit Expense" button is only shown when `hasPermission("expense_management:create")` returns true. Action buttons in the table (Approve, Reject, Mark Paid) are only rendered when `hasPermission("expense_management:update")`.
- `hasPermission` is called from `useUserContext()` return value — verify this method exists on the hook's return type.
- Expenses `amount` is stored in integer cents; `currency` column defaults to `"usd"` in the DB schema but the UI always displays as MYR — the currency column may be a schema artifact not used by this UI.
- The reject dialog requires a non-empty reason; the mark-paid dialog's payment reference is optional.
- Inline columns are defined within the component (not a separate columns file) — same pattern as the walk-in customers page.
- No `beforeLoad` permission guard on this route.

# Expenses

**Route:** `/dashboard/expenses/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/expenses/view.tsx`
**Platform:** web
**Auth required:** authenticated + rbac(expense_management:create, expense_management:update)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Submit, review, approve, reject, and track expense claims by status (pending, approved, rejected, paid).

**Produces:** Filterable table of expenses with actions; create/reject/mark-paid dialogs; toast notifications.

**On success:**  
- List: table populated with expenses matching status filter
- Create: expense added; form reset; sheet closes; query invalidated
- Approve/Reject/Mark Paid: mutation completes; table refreshes; toast confirms

**On failure / error states:**  
- No org: guard message "Select an organization..."
- Loading: spinner
- Error: DataTable error state with retry button
- Form validation: toast errors (missing description, invalid amount, malformed receipt URL)
- API failure: toast error with mutation message

---

## 2. How It Works

**Execution flow:**  
1. Page guards: checks org, loads user permissions
2. Query `client.expenses.list({ organizationId, status: statusFilter })`
3. Renders filterable table: status tabs (All/Pending/Approved/Rejected/Paid)
4. Each row shows: date, category badge, description, amount (RM), submitted by, status badge, actions
5. Actions vary by status:
   - Pending: Approve, Reject buttons
   - Approved: Mark Paid button
   - Rejected/Paid: no actions
6. Create Sheet: category select, description, amount (RM), expense date, receipt URL (optional)
7. Reject Dialog: rejection reason required
8. Mark Paid Dialog: payment reference (optional)

**Inputs:**  
- Status filter (local state) — refetches list query
- Create form: category, description, amount (RM), date, receipt URL
- Reject dialog: rejection reason
- Mark Paid dialog: payment reference

**State management:**  
- TanStack Query: `["expenses", organizationId, statusFilter]`
- Local state: statusFilter, create sheet, reject target + reason, paid target + reference
- Form state: formCategory, formDescription, formAmountRm, formDate, formReceiptUrl

**Outputs:**  
- Table with status-dependent actions
- Dialogs for secondary workflows
- Toast notifications

**Side effects:**  
- Query invalidation on create/approve/reject/markPaid success
- Form reset on create success
- Dialog close on mutation success
- Toast shown on error

---

## 3. What Depends On It

**Calls these API endpoints:**  
- `client.expenses.list({ organizationId, status? })` — fetch expenses
- `client.expenses.create({ organizationId, category, description, amount, expenseDate, receiptUrl? })` — submit new expense
- `client.expenses.approve({ organizationId, id })` — approve pending expense
- `client.expenses.reject({ organizationId, id, rejectionReason })` — reject with reason
- `client.expenses.markPaid({ organizationId, id, paymentReference? })` — mark approved as paid

**Uses these components:**  
- `DataTable<ExpenseRow>` — `src/components/tables/sales/view/data-table` — sortable/filterable table
- `StatusBadge` — status display (CanonicalStatus-based)
- `CopyableCell` — "Submitted By" column
- Sheet, Dialog, Button, Badge, Input, Textarea, Select (shadcn/ui)

**Uses these hooks:**  
- `useUserContext()` — org ID, permissions check
- `useQuery()` — expense list
- `useMutation()` — create/approve/reject/markPaid
- `useQueryClient()` — invalidation

**Navigation: who navigates here:**  
- Dashboard sidebar link

**Navigation: where it goes:** None (internal dialogs/modals only)

---

## 4. Data Shapes

**DB tables touched:**  
- `expenses` (read/write) — CRUD operations
- `users` (read) — submitted by, approved by, paid by references

**Key types / Zod schemas:**  
```tsx
type ExpenseCategory = "travel" | "equipment" | "supplies" | "training" | "other";
type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";

interface ExpenseRow {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number; // cents
  expenseDate: string;
  submittedBy: string;
  status: ExpenseStatus;
  branchId?: string | null;
  receiptUrl?: string | null;
  rejectionReason?: string | null;
  approvedBy?: string | null;
  paidBy?: string | null;
  createdAt: string;
}
```

---

## 5. Tests

**Test files:** `src/__tests__/routes/expenses.test.tsx`

**Scenarios covered:**  
- Renders without crashing (empty state)
- Page heading + submit button present
- Status filter tabs rendered
- Expenses populate table when data exists
- Pending expense shows Approve + Reject action buttons

**Not tested (risk areas):**  
- Form validation (amount, URL validation)
- Rejection reason dialog interaction
- Mark Paid dialog interaction
- Query refetch on filter change
- Permission-based action visibility (canCreate, canUpdate gates)
- Error handling in mutations
- Receipt URL validation edge cases
- Date conversion (local date → ISO UTC)

---

## 6. Notes

- **Currency**: Uses RM (Malaysian Ringgit); amounts stored in cents; `formatPrice()` helper for display
- **Date handling**: Form date input (YYYY-MM-DD) converted to ISO UTC start-of-day string for submission
- **Receipt URL**: Must be valid URL or toast error shown; optional field
- **Action visibility**: Determined by permission check (`canUpdate`) and expense status state
- **Status badges**: Uses `StatusBadge` component which expects CanonicalStatus union; all four expense statuses (pending/approved/rejected/paid) map to valid CanonicalStatus values
- **Reject/Mark Paid**: Stored with reason/reference fields; visible in row detail
- **Form reset**: All fields reset to defaults (category: travel, amount: "", date: today) after successful create


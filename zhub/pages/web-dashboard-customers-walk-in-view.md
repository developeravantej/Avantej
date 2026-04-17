# Walk-in Customers View

**Route:** `/dashboard/customers/walk-in/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/customers/walk-in/view.tsx:1`
**Platform:** web
**Auth required:** rbac(`walk_in_customer_management:read`) — enforced in `beforeLoad`
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Manages unregistered walk-in customers — lists them in a searchable table and provides a slide-over sheet to create or edit customer records, including optional emergency contact and health note sections.

**Produces:** A full-page layout with a header, debounced search bar, data table (name, phone, email, branch, date added, status), and an "Add Customer" button. Active customers have an "Edit" and "Deactivate" action; inactive ones show "Edit" only.

**On success:**
- Create: toast "Walk-in customer created successfully." Sheet closes, table refreshes.
- Update: toast "Walk-in customer updated successfully." Sheet closes.
- Deactivate: toast "Customer deactivated." Row status badge changes to Inactive.

**On failure / error states:**
- No `organizationId`: message "Select an organization to manage walk-in customers."
- Loading: centered spinner.
- Mutation errors: toast with error message.

---

## 2. How It Works

**Execution flow:**
```
WalkInCustomersPage
  → useUserContext() → organizationId
  → useState(search) + useDebounce(300ms) → debouncedSearch
  → useQuery(["walkInCustomers", orgId, debouncedSearch])
      → client.walkInCustomers.list({ organizationId, search? })
  → tableData: WalkInCustomerRow[] (mapped from API)
  → inline columns definition (ColumnDef[]) with Edit/Deactivate actions
  → <DataTable columns data /> (from sales/view/data-table)
  → <Sheet> (open on Add/Edit click)
      → form state: FormState (name, phone, email, dob, gender, branchId, address, emergency*, medical*, notes)
      → onSubmit:
          create → createMutation → client.walkInCustomers.create
          edit   → updateMutation → client.walkInCustomers.update
  → Deactivate button → deactivateMutation → client.walkInCustomers.deactivate
```

**Inputs:**
- Search bar: plain text, debounced 300ms, passed as `search` to list API
- Sheet form: 11 fields (see Form Fields below)
- Edit pre-fills form from row data; DOB converted via `toDateInputValue()`

**State management:**
- `search`, `debouncedSearch` — search input + debounced value
- `sheetOpen`, `editingId`, `form` — sheet open state + edit target
- `emergencyOpen`, `healthOpen` — collapsible section states within sheet

**Outputs:** Renders table and sheet; mutates walk_in_customers rows; invalidates `["walkInCustomers", organizationId]` query.

**Side effects:** Query invalidation after create/update/deactivate.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.walkInCustomers.list` — list with optional search filter
- `client.walkInCustomers.create` — create new walk-in customer
- `client.walkInCustomers.update` — update existing customer
- `client.walkInCustomers.deactivate` — soft-deactivate (sets `isActive = false`)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table (reused from sales)
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — phone/email cells with copy-to-clipboard
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter` — shadcn/ui
- `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` — shadcn/ui (emergency + health sections)
- `Input`, `Textarea`, `Select`, `Label`, `Button`, `Badge`, `Separator` — shadcn/ui

**Uses these hooks:**
- `useUserContext` — org context
- `useDebounce` — `@/hooks/useDebounce` — 300ms debounce for search
- `useQuery` — fetch customer list
- `useMutation` — create/update/deactivate
- `useQueryClient` — cache invalidation

**Navigation: who navigates here:** `app-sidebar.tsx` — "Walk-in Customers" link under Customers section

**Navigation: where it goes:** Stays on page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `walk_in_customers` | SELECT | `id`, `name`, `email`, `phone`, `branch_id`, `date_of_birth`, `gender`, `address`, `emergency_contact_name`, `emergency_contact_phone`, `medical_notes`, `notes`, `is_active`, `created_at` |
| `walk_in_customers` | INSERT | all fields except `id`, `created_at`, `updated_at` |
| `walk_in_customers` | UPDATE | all mutable fields |
| `walk_in_customers` | UPDATE | `is_active = false` (deactivate) |

**`WalkInCustomerRow` local type:** mirrors DB columns with JS types (DOB as `Date | string | null`).

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|-----------|---------|
| name | text | required (non-empty) | `name` |
| phone | tel | optional | `phone` |
| email | email | optional | `email` |
| dateOfBirth | date (`YYYY-MM-DD`) | optional; converted to ISO datetime | `date_of_birth` |
| gender | select | optional: male/female/other/prefer_not_to_say | `gender` |
| branchId | text (UUID) | optional | `branch_id` |
| address | textarea | optional | `address` |
| emergencyContactName | text | optional (collapsible) | `emergency_contact_name` |
| emergencyContactPhone | tel | optional (collapsible) | `emergency_contact_phone` |
| medicalNotes | textarea | optional (collapsible) | `medical_notes` |
| notes | textarea | optional (collapsible) | `notes` |

**DOB conversion:** `dateInputToIso("YYYY-MM-DD")` → appends `T00:00:00.000Z` for the create API's `z.string().datetime()` validator. Update sends the raw date string.

**Permission required:** `walk_in_customer_management:read` (enforced in `beforeLoad`)

---

## 5. Tests

**Test files:** None found

**Not tested:** Search debounce, create/update/deactivate mutations, collapsible section UI, form validation

---

## 6. Notes

- `branchId` field is a raw UUID text input — not a dropdown. Users must know the branch UUID to assign a walk-in to a branch.
- Emergency contact and health note sections are collapsed by default; they auto-expand when editing a record that has data in those fields.
- Deactivation is soft-delete (`isActive = false`); there is no reactivation action in this UI.
- The `DataTable` imported is the sales view data-table, not a dedicated walk-in table — columns are defined inline in the route component.
- `requirePermission("walk_in_customer_management:read")` uses the string-colon form rather than the object form used in appointment/view — both are accepted by the (currently stub) `requirePermission` function.

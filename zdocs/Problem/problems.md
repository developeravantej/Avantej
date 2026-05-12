# Avantej — Combined Open Problems

**Generated**: 2026-04-22  
**Sources**: 22 feature audit files  

---

## Table of Contents

1. [Announcements](#1-announcements)
2. [Appointments](#2-appointments)
3. [Attendance](#3-attendance)
4. [Audit Log](#4-audit-log)
5. [Branches](#5-branches)
6. [Class Slots](#6-class-slots)
7. [Commissions](#7-commissions)
8. [Customers](#8-customers)
9. [Employees](#9-employees)
10. [Expenses](#10-expenses)
11. [Google Calendar](#11-google-calendar)
12. [Home Dashboard](#12-home-dashboard)
13. [Installment Plans](#13-installment-plans)
14. [Memberships](#14-memberships)
15. [My Services](#15-my-services)
16. [POS (Point of Sale)](#16-pos-point-of-sale)
17. [Promotions](#17-promotions)
18. [Rooms](#18-rooms)
19. [Sales & Payments](#19-sales--payments)
20. [Services](#20-services)
21. [Trainer Tiers](#21-trainer-tiers)
22. [Trainers](#22-trainers)

---

## 1. Announcements

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/announcements/view.tsx`

### CRITICAL

#### 1.1 Soft-delete labeled as hard-delete
**Files**: `announcements/view.tsx:214-226`, `packages/services/src/announcements.service.ts:166-183`

`deleteAnnouncement` performs `UPDATE SET is_active = false` (soft-delete), but the confirmation dialog uses "Delete" language and states "This action cannot be undone." — which is false. Either (a) replace the service with a real `DELETE` statement, or (b) rename the action to "Archive" throughout the UI and service layer and expose a corresponding "Restore" action.

#### 1.2 Query invalidation key mismatch
**File**: `announcements/view.tsx:159,185`

The `useQuery` cache key is `["announcements", organizationId, isActiveFilter]` (3 elements) but mutations call `invalidateQueries(["announcements", organizationId])` (2 elements). This relies on partial-key invalidation — technically works today but is fragile. Fix by aligning mutation invalidation keys to include the filter element, or explicitly use `queryClient.invalidateQueries({ queryKey: [...], exact: false })` with a documented rationale.

### MAJOR

#### 1.3 No "Reactivate" action for inactive announcements
**File**: `announcements/view.tsx:372-381`

When viewing the Inactive tab, users can see deactivated announcements but have no way to restore them. The `update` API procedure already accepts `isActive: true`. Add a "Reactivate" button (or menu item) visible only when `row.original.isActive === false` that calls `update` with `{ id, isActive: true }` and invalidates the query.

#### 1.4 No server-side pagination
**File**: `announcements/view.tsx:132-142`

`listAnnouncements` is called with a hard-coded `limit: 50` and no pagination controls are rendered. Organizations with more than 50 announcements receive silently truncated results. Implement cursor- or offset-based pagination in the service and wire up pagination controls in the table.

#### 1.5 `branchId` renders raw UUID
**File**: `announcements/view.tsx:316-320`

When an announcement has a `branchId` set, the table column displays the raw UUID rather than a human-readable branch name. Resolve the UUID to a node name by joining with hierarchy data before rendering.

#### 1.6 No error state
**File**: `announcements/view.tsx:396-403`

The `isError` flag from `useQuery` is never consumed. When the API call fails, the table silently renders an empty state with no indication that a network or server error occurred.

### MINOR

#### 1.7 Message column absent from table
**File**: `announcements/view.tsx:300-304`

There is no column displaying announcement message content; users must open the Edit sheet to read the body text. Add a truncated "Message" column (e.g. `max-w-xs truncate`) or a tooltip preview.

#### 1.8 Sheet form resets before close animation completes
**File**: `announcements/view.tsx:535-541`

`editingId` is cleared and the form is reset synchronously on sheet close, causing a visible flicker as the sheet animates out with blank fields. Delay the reset until after the close animation finishes.

#### 1.9 Delete button lacks `aria-label`
**File**: `announcements/view.tsx:362-395`

The row-level delete action renders a `Trash2` icon with no visible text and no `aria-label` attribute, making it inaccessible to screen readers.

#### 1.10 `datetime-local` inputs have no `min` constraint
**File**: `announcements/view.tsx:627-648`

The start-date and end-date `datetime-local` fields accept any past date. Add `min={new Date().toISOString().slice(0, 16)}` on the start-date input and ensure end-date `min` is always at least equal to the selected start date.

#### 1.11 Route has no `beforeLoad` permission guard
**File**: `announcements/view.tsx:41-44`

The route lacks a `beforeLoad` hook that checks whether the current user has the `announcements` permission. Unauthorized users are redirected rather than seeing an empty or broken page on other routes — apply the same guard here.

### MISSING FEATURES

- Branch/scope picker in create form — `branchId` is always submitted as `null`; no picker to target a specific branch
- Pagination controls — no UI to navigate beyond the first 50 results
- Sort controls — announcements always appear in default DB order
- Duplicate/copy announcement action

---

## 2. Appointments

**Files**: `apps/web/src/components/calendar/add-appointment-modal.tsx`, `apps/web/src/components/calendar/appointment.tsx`, `apps/web/src/components/appointments/appointment-list.tsx`

### CRITICAL

#### 2.1 "Test Dialog" shown to end users on every appointment submit
**File**: `add-appointment-modal.tsx:340-341`

Every successful appointment creation pops a raw JSON debug dialog (`setIsTestDialogOpen(true)`). This is developer scaffolding that was never removed and is visible to all end users. Remove the `setIsTestDialogOpen(true)` call and call `onSubmit` directly with the result.

#### 2.2 Bulk status change is a no-op stub
**File**: `appointment.tsx:251-255`

`handleBulkStatusChange` accepts a `_newStatus` parameter (leading underscore signals intentionally unused) and makes no API call. Selecting multiple appointments and applying a bulk action silently does nothing. Implement the handler — call the appropriate oRPC mutation with the selected IDs and target status, then invalidate the query on success.

### MAJOR

#### 2.3 `teamMembers` prop is always an empty array — employee assignment is broken
**File**: `appointment.tsx:747`

Both call sites pass `teamMembers={[]}`. The trainer/staff assignment dropdown will always be empty, making it impossible to assign staff to an appointment. Fetch the members list via `client.members.list` at the parent level and thread the result through as `teamMembers`.

#### 2.4 `selectedDate` is shifted forward 24 hours everywhere
**File**: `add-appointment-modal.tsx:225-226, 282, 348` (9+ occurrences)

`new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000)` shifts every date by one day — clicking Monday pre-fills Tuesday. Remove the `+ 24 * 60 * 60 * 1000` offset. If the root cause is a UTC midnight timestamp being interpreted as the previous day, convert the date string to local time directly without adding 24 hours.

#### 2.5 `createMutation` in `AppointmentList` drops `staffAssignments` and `serviceId`
**File**: `appointment-list.tsx:862-877`

When the appointment creation mutation fires from the list view, the payload omits `staffAssignments` and `serviceId`. Appointments created from the list view are always unassigned with no service attached. Map the full modal form output before passing to the mutation.

#### 2.6 `serviceId` not passed to `appointments.create`
**File**: `add-appointment-modal.tsx:164-168`

The `serviceId` field collected in the form is not included in the object passed to `appointments.create`. All appointments created through this modal result in commission calculation failures or missing commission records.

#### 2.7 Walk-in customer search is not wired up
**File**: `add-appointment-modal.tsx:148-155`

The UserPlus icon button that should open a walk-in customer search/creation flow has an `onClick` that is a no-op. Wire the button to open a walk-in customer search dialog (query `client.walkInCustomers.search`) or a quick-create form.

#### 2.8 Query range does not update when the user navigates the calendar
**File**: `appointment.tsx:38`

The data fetch uses a fixed `±1 month` window relative to initial mount time. Navigating forward or backward in the calendar does not update the query range, so future/past months show empty results. Derive query start/end dates from `currentDate` (the calendar's navigation state) rather than a one-time constant.

### MINOR

#### 2.9 Edit flow opens a blank modal
**File**: `appointment.tsx:638-641`

`setEditingAppointment` stores the record in `_editingAppointment` (prefixed with `_`). The modal does not read from this variable, so clicking "Edit" opens a blank create form. Rename `_editingAppointment`, pass it to the modal as `initialValues`, and have the modal pre-fill its fields from that prop.

### MISSING FEATURES

#### 2.10 Recurrence UI is non-functional end-to-end
**File**: `add-appointment-modal.tsx` (recurrence fields) and `appointments.create` API boundary

The modal renders recurrence controls (frequency, interval, end date), but recurrence data is silently dropped before the API call. Fix requires: confirming the `appointments.create` API accepts recurrence fields; if not, adding `recurrenceRule` to the API input schema; including the recurrence payload in the mutation call; and adding a recurring appointment indicator in calendar and list views.

---

## 3. Attendance

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/attendance/view.tsx`

### CRITICAL

#### 3.1 `branchName` and `checkedInByName` are phantom fields
**Files**: `check-ins-log.tsx:25-32`, `packages/services/src/check-ins.service.ts:84-86`

Frontend type `CheckInRow` declares `branchName: string | null` and `checkedInByName: string | null` but the API's `CheckInRowEnriched` only adds `clientName`. These fields are always `undefined`. The Staff column in `check-ins-log.tsx:206-212` always shows "—". Backend needs to batch-resolve `checkedInBy` userIds to display names.

#### 3.2 Member drop-in requires pasting a raw UUID
**File**: `drop-in-form.tsx:141-168`

The drop-in form shows a monospace text input labeled "Member User ID". Operationally broken — no front-desk operator can use this. Replace with a Combobox powered by `client.customerDirectory.list({ search, branchId })`.

### MAJOR

#### 3.3 All API calls use `(client as any)` casts
**Files**: `attendance/view.tsx:100-107` and all attendance component files

Every oRPC call suppresses TypeScript. `checkIns` is on `AppRouterClient`. Removing casts would expose the phantom field type mismatch. Remove all `as any` casts and fix the underlying type issues.

#### 3.4 `branchId` state initialized once, never updated
**File**: `view.tsx:69`

If `branchOptions` changes async (org switch), `branchId` stays empty and the "select a branch" warning persists. Add a `useEffect` or `useMemo` that resets `branchId` when `branchOptions[0]?.id` changes.

#### 3.5 Naive datetime strings sent to list endpoint
**File**: `view.tsx:123-128`

`"${date}T00:00:00"` is sent without a timezone offset. `new Date()` parses differently in browsers (local) vs Node/Bun (UTC). Send UTC: `"${date}T00:00:00.000Z"`.

#### 3.6 No pagination on check-ins log
**File**: `check-ins-log.tsx`

Capped at 100 rows server-side with no "Load more". Total count is shown but unreachable rows have no UI path.

### MINOR

#### 3.7 "Unknown client" vs "Walk-in" inconsistency
**File**: `check-ins-log.tsx:186`

Backend resolves walk-ins to "Walk-in" but frontend shows "Unknown client" for empty string. Align to "Walk-in".

#### 3.8 Member/Walk-in toggle buttons lack `aria-pressed`
**File**: `drop-in-form.tsx:116-138`

Toggle buttons have no `aria-pressed` attribute, making the current selection indistinguishable to screen readers.

#### 3.9 Native date input inconsistent with shadcn UI
**File**: `view.tsx:199-208`

Raw `<input type="date">` used instead of a shadcn-styled date picker, creating a visual inconsistency.

### MISSING FEATURES

- Real-time / auto-refresh for bookings and log panels
- Attendance summary KPI strip (total booked, checked in, no-show)
- Link from member log row to Customer 360
- CSV export of daily check-in log

---

## 4. Audit Log

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/audit/view.tsx`

> **Fixed this session**: Stale `@ts-expect-error` removed from line 368 (the `auditLogs` router IS present in `packages/api/src/routers/index.ts`).

### CRITICAL

#### 4.1 `entityLabel` and `branchName` phantom fields
**File**: `audit/view.tsx:108-125`

`AuditRowEnriched` declares two fields the API never populates: `entityLabel: string | null` and `branchName: string | null`. `packages/services/src/audit-log.service.ts` returns raw rows enriched only with `actorName`. The Entity column always displays the raw `entityId` UUID; the Branch column always shows "—". Options: (A) add enrichment in the service layer, or (B) remove the fields from `AuditRowEnriched` and render `entityId`/`branchId` directly.

### MAJOR

#### 4.2 `changes` field type mismatch
**File**: `audit/view.tsx:121`

Frontend declares `changes: Record<string, unknown> | null` but the service returns `changes` typed as `unknown` (from a `jsonb` column). Narrowing logic in the detail modal may silently skip rendering. Align the type in the service with a runtime guard, or widen the frontend type to `unknown` and add explicit narrowing.

#### 4.3 O(n) total count query
**File**: `packages/services/src/audit-log.service.ts:200-205`

Fetches every matching row ID to count them — a full table scan that scales with audit volume. Replace with a single `COUNT(*)` query using `sql<number>\`cast(count(*) as int)\`` from drizzle-orm.

#### 4.4 `userContext` loading flash
**File**: `audit/view.tsx:298-384`

When `userContext` is still `undefined`, `organizationId` resolves to `null` and the page immediately renders the "Select an organization" empty state, which then disappears once context resolves. Guard on `userContext === undefined` and return a `<LoadingSpinner />` instead.

### MINOR

#### 4.5 `actorUserId` filter fires on every keystroke
**File**: `audit/view.tsx:307-308`

The input's `onChange` calls `setActorUserId` directly, triggering a round trip on every character typed. Debounce the value before it reaches the query key: `const actorUserId = useDebounce(actorUserIdInput, 300)`.

#### 4.6 DataTable renders a redundant client-side search bar
**File**: `audit/view.tsx:730`

`DataTable` from `@/components/tables/sales/view/data-table` renders its own search input that only operates on the current 100-row page. Pass `searchKey` as `undefined` or add a `hideSearch` prop to avoid misleading users into thinking it searches the full dataset.

#### 4.7 `AUDIT_ACTIONS` list is incomplete
**File**: `audit/view.tsx:45-65`

Missing actions the service layer can emit: `commission.create`, `commission.void`, `appointment.created`, `appointment.status_changed`, `installment.paid`. Audit all `auditLog.log(...)` call sites in `packages/services/src/` and sync the constant.

### MISSING FEATURES

#### 4.8 No URL search-param persistence
Filter state lives entirely in local React state. Navigating away and back resets all filters. Filtered views cannot be shared via URL. Sync each filter to a URL search param using TanStack Router's `useSearch` / `useNavigate` with the route's `validateSearch`.

#### 4.9 No export / download
No way to export audit log results to CSV. Add an export endpoint in `packages/api/src/routers/audit-logs.ts` that accepts the same filter params.

#### 4.10 No entity ID filter in UI
The backend `list` procedure accepts an `entityId` param but no UI input exposes it. Users cannot look up all audit events for a specific record (e.g., a specific sales order ID) from the UI.

---

## 5. Branches

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`

### MAJOR

#### 5.1 Two separate `listNodes` queries fetch identical data
**File**: `branch/view.tsx:112-156` (hierarchy-nodes query) and `295-448` (branches query)

Both `["hierarchy-nodes"]` and `["branches"]` queries call `client.hierarchy.listNodes` with the same `organizationId`. One should derive from the other (e.g. edit-dialog dropdowns computed from `branchData` via `queryClient.getQueryData`), eliminating a redundant network request on every page load.

#### 5.2 Dual localStorage caching layers inconsistently maintained
**File**: `branch/view.tsx:295-448`

The `["branches"]` query reads and writes `org_<id>_hierarchy` and `org_<id>_hierarchy_timestamp` in localStorage. The `["hierarchy-nodes"]` query fetches the same data but never writes to that cache. The cache is always empty on the first load, defeating its purpose. Unify the two cache layers or make one the sole writer.

#### 5.3 Edit dialog uses `@headlessui/react` instead of project-standard shadcn Dialog
**File**: `branch/view.tsx:16`

Every other dialog in the project uses `@/components/ui/dialog` (shadcn/ui). This inconsistency increases bundle size and diverges from the design system (focus ring styles, backdrop, close button will look different).

#### 5.4 `window.confirm` used for destructive delete action
**File**: `apps/web/src/components/tables/branch/view/columns.tsx:184-191`

Browser-native confirm dialogs are not styled, cannot be dismissed with keyboard consistently, and are blocked in some embedded contexts. Replace with a shadcn `AlertDialog`.

#### 5.5 No `beforeLoad` permission guard on the view route
**Files**: guard reference at `branch/create.tsx:21-24`; missing from `branch/view.tsx:32-36`

The create route guards itself with `requirePermission` in `beforeLoad`. The view route has no equivalent guard — anyone who navigates to `/dashboard/branch/view` can see all branches regardless of permission level.

### MINOR

#### 5.6 Four `(branch as any)` casts in `mapBranchesWithHierarchy`
**File**: `branch/view.tsx:253, 264, 272, 286`

`(branch as any).picUserId`, `(branch as any).code`, `(branch as any).address`. Widen the input array type to include these optional fields so the casts can be removed.

#### 5.7 `allHierarchyNodes` useState + useEffect is unnecessary indirection
**File**: `branch/view.tsx:67, 167-176`

`allHierarchyNodes` is a `useState` set by a `useEffect` watching `hierarchyNodesData?.nodes`. Since `hierarchyNodesData` is already reactive query data, the intermediate state adds a render cycle. Replace with `const allHierarchyNodes = hierarchyNodesData?.nodes ?? []`.

### MISSING FEATURES

#### 5.8 No server-side search or pagination
The branches table loads all nodes on every page load and filters client-side. The API should accept `search` and `page`/`pageSize` parameters.

#### 5.9 No "View Branch Details" navigation
The branches table has Edit and Delete actions but no way to navigate to a branch detail page.

---

## 6. Class Slots

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/class-slots/view.tsx`

### CRITICAL

#### 6.1 Branch ID text input requires raw UUID
**File**: `view.tsx:619-635`

The "Branch ID" field in the create/edit form is a plain text input. No user can be expected to know and type the exact UUID of a hierarchy node. Replace with a hierarchy node selector component scoped to the current member's `accessibleNodeIds`.

### MAJOR

#### 6.2 `members.list` requires `user_management:read`
**File**: `view.tsx:181-188`

The instructor dropdown is populated via `client.members.list(...)`, which requires `user_management:read`. Staff with only `class_slot_management` access see an empty instructor list. Either expose a narrower `members.listInstructors` procedure gated on `class_slot_management:read`, or change the permission guard on the existing procedure.

#### 6.3 `services.list` requires `service_management:read`
**File**: `view.tsx:172-178`

Same pattern — the service filter dropdown calls `client.services.list(...)`, which requires `service_management:read`. Staff with only class slot access see no services.

#### 6.4 No pagination
**File**: `view.tsx:576`; service layer defaults to 50 results

No UI to fetch subsequent pages. Locations with more than 50 slots in a date range silently show incomplete data.

### MINOR

#### 6.5 Date timezone issue
**File**: `view.tsx:212-213`

Dates stored as UTC midnight (`T00:00:00.000Z`). For Malaysian users (UTC+8) a slot dated `2026-04-22T00:00:00.000Z` displays as `2026-04-21` locally. Use a date-only column type or store/compare in the tenant's local timezone.

#### 6.6 Clear button doesn't refetch
**File**: `view.tsx:556-564`

Clicking "Clear" resets filter state variables but does not call `refetch()`. If the user has never applied filters, clearing matches the initial cache key and React Query serves stale cache. Call `refetch()` explicitly in the clear handler or use `queryClient.removeQueries` first.

#### 6.7 Booked cell button has no `aria-label`
**File**: `view.tsx:386-393`

The "view signups" button in the Booked column renders an icon inside a `<Button>` with no accessible label. Add `aria-label="View signups"`.

#### 6.8 Signups do not show `pricePaid`
**File**: `view.tsx:976`

The signup detail panel omits the `pricePaid` field even though it is returned by the API. Operators cannot see what each member paid. Add a "Price Paid" column formatted with `formatPrice`.

---

## 7. Commissions

**Files**: `apps/web/src/components/pages/commissions/`, `packages/api/src/routers/commission-splits.ts`

> **Fixed this session**: Removed `"use client"` directive from `liability-tab.tsx`; changed `grid-cols-5` → `grid-cols-4` in the liability totals footer.

### CRITICAL

#### 7.1 My Commissions tab always empty — response shape mismatch
**File**: `mine-tab.tsx:112`

`data` is cast as `any[] | undefined`, but `getMyCommissions` returns `{ splits, totalAmount }` — an object, not an array. The `.map()` receives `undefined` and renders nothing. Fix: `(data as { splits: MyCommissionRow[] } | undefined)?.splits ?? []`.

#### 7.2 `getMyCommissions` uses wrong ID — always returns empty for all users
**File**: `packages/api/src/routers/commission-splits.ts:143`

The router passes `context.member.id` (tenant-DB PK UUID) but `commissionSplits.staffId` stores `members.userId` (the cross-DB Better-Auth user ID). These never match. Use `context.session.user.id` instead.

#### 7.3 Staff filter sends wrong ID type — zero results when filtering by specific staff
**File**: `all-tab.tsx:652-653`

The member picker populates the filter value with `m.id` (tenant-DB PK) but the backend matches against `staffId` which holds `members.userId`. Filtering by a specific staff member always returns zero rows. Use `m.userId` instead.

#### 7.4 `getMyCommissions` requires `commission_management:read` — staff cannot see their own commissions
**File**: `packages/api/src/routers/commission-splits.ts` (permission guard)

Regular staff who do not hold `commission_management:read` cannot view their own commission records. Remove or downgrade the permission guard — each user can only see their own data anyway.

#### 7.5 `MarkPaidDialog` discards `payoutMethod` and `payoutReference`
**File**: `mark-paid-dialog.tsx:81-85`

The dialog form collects `payoutMethod` and `payoutReference` from the user, but the `mutationFn` only forwards `{ organizationId, ids, payoutId }`. The payout method and reference are silently dropped. Include them in the mutation payload.

### MAJOR

#### 7.6 Bulk void is non-atomic — partial failure leaves stale state
**File**: `commissions/bulk-action-bar.tsx:183-202`

The bulk void action iterates splits in a `for` loop and calls `voidSplit` sequentially. If any call fails mid-loop, earlier splits are voided but later ones are not. Move bulk void to a single backend procedure wrapping all deletes in a database transaction.

### MISSING FEATURES

#### 7.7 Void button shown on already-paid rows
The void action button is visible on rows with `status === "paid"`. Add `|| r.status === "paid"` to the existing disabled/hidden check.

#### 7.8 No manual adjustment creation UI
The `createManualAdjustment` procedure exists on the backend but there is no button or form in the UI to create one.

#### 7.9 No pagination — hardcoded limit of 100
All commission list queries use `limit: 100, offset: 0` with no pagination controls. High-volume organizations will silently miss records.

### REFACTOR (low priority)

#### 7.10 Duplicate `formatDate` helper in mine-tab and all-tab
**Files**: `mine-tab.tsx:31-38`, `all-tab.tsx:80-87`

Both files define an identical `formatDate(value)` function. Extract to a shared utility at `apps/web/src/lib/date.ts`.

---

## 8. Customers

**Routes**: `apps/web/src/routes/_authenticated/dashboard/_layout/customers/$id.tsx`, `customers/walk-in/view.tsx`

### CRITICAL

#### 8.1 Customer 360 appointments always return wrong list
**File**: `customers/$id.tsx:191-215`

`client.appointments.list()` is called with a `clientUserId` param that doesn't exist in the procedure's input schema. The param is silently dropped. Both "Upcoming Appointments" and the "Appointments" tab always return the staff-scoped full list, never per-customer. Fix: Add `clientUserId: z.string().optional()` to `appointmentsRouter.list` input and filter by `userId` in `listAppointments`, OR create a dedicated `listForClient` procedure.

#### 8.2 `payment.method` → should be `payment.paymentMethod`
**File**: `customer-detail-sheet.tsx:581`

Column named `paymentMethod` in schema but referenced as `payment.method`. Always `undefined` — payment method column always blank.

### MAJOR

#### 8.3 Stale `search: { tab: "registered" }` in back-links
**Files**: `customers/$id.tsx:258,279`, `customers/walk-in/view.tsx:7`

The customers view no longer has tabs. These links pass an unrecognized search param. Remove `search: { tab: "registered" }` from both Link instances.

#### 8.4 `lastVisitAt` always `undefined` in `CustomerDetailSheet`
**File**: `customer-detail-sheet.tsx:285-289`

Unsafe cast `(data as unknown as { lastVisitAt?: Date | null }).lastVisitAt` — `lastVisitAt` is not in the `CustomerDetail` return type. "Last Visit" stat always shows "Never".

#### 8.5 `packageInstances` missing `serviceName` and `paymentPlanCode`
**Files**: `customer-detail-sheet.tsx:539`, `customer-360/package-row.tsx:17-26`

`getCustomerDetail` does a plain SELECT with no join to services. `pkg.serviceName` always `undefined`, falls back to UUID slice. Add a join to the `services` table in `getCustomerDetail`.

#### 8.6 No "Add Customer" / "Invite Customer" action
The directory is read-only; there is no way to add new clients from this page.

### MINOR

#### 8.7 `"use client"` directive in `customer-detail-sheet.tsx`
**File**: `customer-detail-sheet.tsx:1`

Next.js artifact in a Vite/TanStack Router project. Remove it.

#### 8.8 Pagination shows only when `total > PAGE_LIMIT`
**File**: `registered-page.tsx:437-459`

Should show when `total > offset + PAGE_LIMIT`. Currently hides the paginator when on the last page.

#### 8.9 No `beforeLoad` permission guard on `view.tsx` or `$id.tsx`
Brief flash of page shell before error state. Add permission guards matching the pattern used on other routes.

#### 8.10 LTV KPI card hardcodes "N/A"
**File**: `$id.tsx:311`

No tooltip explaining this is not yet computed. At minimum add a tooltip.

### MISSING FEATURES

- Last Visit and Joined columns in directory table (data available in API response)
- Column sorting
- Customer status management (`deactivateMember` procedure exists but not wired)
- Export button (currently permanently disabled)
- Customer 360 appointments tab (needs backend fix #8.1 above)

---

## 9. Employees

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/user/view.tsx`

### CRITICAL

#### 9.1 Impersonation API schema mismatch
**File**: `apps/web/src/components/tables/user/view/actions-cell.tsx:43-45`

The client sends `{ targetMemberId, organizationId }` to `client.tenantAdmin.impersonateMember`, but the server procedure only declares `{ targetMemberId }` in its input schema. The extra `organizationId` field either causes a validation error or is silently ignored. Fix: remove `organizationId` from the `mutationFn` call; update the type stub at `packages/api/src/routers/index.ts:481`. If org-scoping is genuinely needed, add `organizationId` to the server-side input schema.

### MAJOR

#### 9.2 Tenant impersonation stop is broken
**File**: `apps/web/src/components/impersonation-banner.tsx:18-21`

`stopMutation` unconditionally calls `client.admin.stopImpersonating({})` regardless of session type. When the active session was started by `tenantAdmin.impersonateMember`, calling the platform-admin stop endpoint will fail or clear the wrong session, leaving the impersonation banner stuck. Fix:
```ts
if (data?.type === "tenant") {
  return client.tenantAdmin.stopImpersonating({});
}
return client.admin.stopImpersonating({});
```

#### 9.3 No error state UI
**File**: `user/view.tsx:27-31`

`useQuery` errors are never surfaced. A failed fetch silently renders zero rows with no feedback. Check `isError` and render an error callout.

#### 9.4 No sorting, filtering, or pagination in DataTable
**File**: `apps/web/src/components/tables/user/view/data-table.tsx:26-30`

`enableSorting: true` is set on column definitions, but the sort-state is never passed back to `useReactTable`, so sort button clicks do nothing. No pagination — all rows render at once. Add `getSortedRowModel`, `getFilteredRowModel`, and `getPaginationRowModel`.

#### 9.5 No route-level permission guard
**File**: `user/view.tsx`

No `beforeLoad` guard checking that the current user has permission to view this page. Staff who navigate directly to `/dashboard/user/view` receive a 403 from the API but the UI just shows an empty table.

### MINOR

#### 9.6 Inconsistent page title: "Members" vs sidebar label "Employees"
**File**: `user/view.tsx:55`

The page renders "Members" while the sidebar navigation item is labelled "Employees". Align both labels.

### MISSING FEATURES

#### 9.7 No "Add Member / Invite" button
No CTA to invite a new member. Add an "Invite member" button linking to the invite flow.

#### 9.8 No search input
No text search field. Finding a specific member requires scrolling through all rows.

#### 9.9 No role or status filter pills
No quick-filter controls for role (`admin` / `trainer` / `staff` / `client`) or status (`active` / `suspended`).

---

## 10. Expenses

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/expenses/view.tsx`

### CRITICAL

#### 10.1 RBAC scoping bug — staff see zero results when `branchId` is null
**File**: `packages/services/src/expenses.service.ts:54-55`

`listExpenses` applies `inArray(expenses.branchId, params.accessibleNodeIds)`. If an expense has `branchId = null`, it never matches — even if the submitter is in scope. Fix: widen filter to `(branchId IS NULL OR branchId IN (...))`.

#### 10.2 No error state for list query
**File**: `expenses/view.tsx:159-169`

`isError` is never consumed. Silent empty table on API failure.

### MAJOR

#### 10.3 No `expense_management:read` permission guard
**File**: `view.tsx:128-133`

Page only checks create/update permissions, not read. Unauthorized users hit the API unnecessarily.

#### 10.4 `approveMutation.isPending` disables ALL approve buttons simultaneously
**File**: `view.tsx:407-454`

Approving one expense disables every row's Approve button. Track pending state per row ID instead.

#### 10.5 Currency default mismatch
**File**: `packages/db/src/schema/tenant/expenses.ts:21`

DB schema defaults to `"usd"` but service hardcodes `"MYR"` on insert. `ExpenseRow` doesn't include a currency field.

### MINOR

#### 10.6 `submittedBy` shows raw userId UUID
**File**: `view.tsx:323-339`

The "Submitted By" column shows UUID instead of a display name. API should return `submitterName` from a members join.

#### 10.7 Form labels lack `htmlFor`
**Files**: `view.tsx:541-625, 662-672, 711-723`

Accessibility gap in Create Sheet, Reject Dialog, and Mark Paid Dialog.

#### 10.8 UTC date anchoring issue
**File**: `view.tsx:80-81, 292`

`new Date(\`${formDate}T00:00:00.000Z\`)` anchors to UTC midnight. Malaysian users (UTC+8) may see off-by-one dates. Also `getTodayDateString()` returns UTC date.

#### 10.9 `approvedBy`, `paidBy`, `rejectionReason` never displayed
**File**: `view.tsx:324-338`

Fields populated from the API but not shown in any column.

### MISSING FEATURES

- Date range filter (API supports from/to params)
- Submitter filter
- Branch filter
- Expense detail view / receipt preview
- Notes field (DB column exists, no create form input)
- Edit / delete expenses before approval
- Export (CSV/Excel)
- Bulk approve/reject
- Server-side pagination (currently hard-capped at 50 rows)

---

## 11. Google Calendar

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx`

> **Fixed this session**: URL `?gcal=` param cleared after toast; Connect button disabled when `!organizationId`; retry button wired via `refetch()`; `token_exchange_failed` case added; Reconnect shows for any non-null `lastSyncError`.

### MAJOR

#### 11.1 `window.confirm` for disconnect
**File**: `google-calendar.tsx:101-109` (`handleDisconnect`)

The disconnect confirmation uses `window.confirm()` — a blocking browser dialog that is visually inconsistent, cannot be styled, and is blocked in some embedded environments. Replace with a shadcn `AlertDialog`.

### MISSING FEATURES

#### 11.2 No "Sync now" button
**File**: `google-calendar.tsx`, connected state `CardContent`

No way for a user to trigger an immediate sync of existing appointments. Add a "Sync now" button calling a new `client.googleCalendar.syncNow({ organizationId })` procedure.

#### 11.3 No calendar selector
**File**: `handleConnect` — hardcoded `calendarId: "primary"`

The integration always syncs to the user's primary Google Calendar. Add a `<Select>` after OAuth to let the user choose which calendar appointments sync to, fetched from the Google Calendar API `/calendars/list`.

### MINOR

#### 11.4 Sync scope badge not explained
**File**: `google-calendar.tsx:165-170`

The `<Badge>` showing "All appointments" or "Your appointments" has no tooltip explaining what these mean or how to change the scope. Wrap in a `<Tooltip>`.

#### 11.5 No "last synced" refresh button
**File**: `google-calendar.tsx:181-185`

The `lastSyncAt` value is a static snapshot from page load. Add a `<Button variant="ghost" size="icon">` with a `RefreshCw` icon that calls `refetch()` on click.

#### 11.6 No tests
**File**: No test file exists for this route

Key cases to cover: skeleton while `organizationId` is empty; success toast for `?gcal=connected`; error toasts for `auth_denied`, `invalid_state`, `token_exchange_failed`; retry button in error state; Reconnect for any non-null `lastSyncError`.

#### 11.7 `GOOGLE_CLIENT_ID` / `GOOGLE_REDIRECT_URI` not in `wrangler.jsonc`
**File**: `apps/server/wrangler.jsonc`

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` are not declared as bindings/secrets, so Cloudflare Workers will not have access to them in production. Add to `[vars]` and use `wrangler secret put` for the client secret.

---

## 12. Home Dashboard

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx`

### CRITICAL

#### 12.1 "today" period mapping missing for staff query
**File**: `index.tsx:323-330`

When the user selects period `"today"`, the staff performance query should map this to `"this_week"` (per-staff daily granularity is not meaningful). This mapping is absent — the literal `"today"` is passed to the API, returning no data or an error.

### MAJOR

#### 12.2 Quick Actions links point to wrong destinations
**File**: `apps/web/src/components/dashboard/quick-actions.tsx:7-8`

- "Calendar" navigates to `/dashboard/appointment/view` without `?view=calendar`, likely defaulting to a list view. Add `search: { view: "calendar" }`.
- "Reports" navigates to the sales list instead of a dedicated reports page.

#### 12.3 KPI stats cards have no error state
**File**: `index.tsx:311-331`

If analytics queries fail, KPI cards silently render with zero values. Destructure `isError` from each `useQuery` call and render an error state.

#### 12.4 Staff Performance table shows UUID not names
**File**: `index.tsx:279`

Staff rows display `staff.staffId.slice(0, 8)…` (a truncated UUID) rather than the staff member's actual name. Use the `staffName` field (or equivalent) from the API response.

#### 12.5 `PayrollWidget` shows empty state flash on load
**File**: `apps/web/src/components/payroll-widget.tsx:16, 34`

No `isLoading` guard — renders the empty state immediately before data arrives. The data is also typed as `any`. Add an `isLoading` branch and replace `any` with the correct return type.

### MINOR

#### 12.6 `OnboardingChecklist` and `RecentActivityWidget` are built but never mounted
**Files**: `recent-activity-widget.tsx`, `onboarding-checklist.tsx`

Both components are fully implemented but neither is imported or rendered in the dashboard index page. Either mount them or explicitly mark them as future work with a TODO comment.

#### 12.7 Greeting banner avatar shows nothing on empty name
**File**: `apps/web/src/components/dashboard/greeting-banner.tsx:22`

`name[0]?.toUpperCase()` returns `undefined` when `name` is empty or undefined. Replace with `name?.[0]?.toUpperCase() ?? "?"`.

---

## 13. Installment Plans

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/settings/installment-plans.tsx`

> **Fixed this session**: Added `isError` / `refetch` from `useQuery` and an error-state guard with retry button.

### CRITICAL

#### 13.1 No reactivation path
**Files**: `installment-plans.tsx:395-407`, `packages/api/src/routers/installment-plans.ts`

When `showInactive = true` is toggled, inactive plans become visible but there is no "Reactivate" button. The `update` procedure does not accept `isActive`. The `deactivate` mutation is one-way with no corresponding reverse. Fix: add a `reactivate` procedure to the router (mirror `deactivateTaxRate` → `activateTaxRate`); add a "Reactivate" button rendered only when `row.original.isActive === false`.

### MAJOR

#### 13.2 Code field has no format validation
**File**: `installment-plans.tsx:112, 219-229`

Convention is `lowercase_snake_case` but there is no client-side regex check. Codes with spaces or uppercase are stored and then silently become immutable (the edit sheet greys out the code field with no explanation). Add a `/^[a-z0-9_]+$/` validation check in `handleSubmit` before the create mutation fires.

#### 13.3 Deactivation warning race condition
**File**: `installment-plans.tsx:255-278`

`openDeactivate()` calls an async service-reference check but opens the dialog immediately before that fetch resolves. The user sees the dialog with no warning text even when a warning is warranted. Open the dialog immediately but with a spinner replacing the warning slot; populate the warning text once the async fetch resolves.

#### 13.4 `createdAt` stored but never rendered
**File**: `installment-plans.tsx:51, 295`

The `InstallmentPlanRow` type includes `createdAt` and it is populated in the row map, but no table column displays it — dead weight on every row object. Either add a "Created" column (hidden by default behind a column visibility toggle) or remove `createdAt` from the type and map entirely.

### MINOR

#### 13.5 Form labels use raw `<label>` instead of shadcn `<Label>`
**File**: `installment-plans.tsx:515-530`

The sheet form uses native `<label>` elements rather than `<Label>` from `@/components/ui/label`, causing visual inconsistency with other settings pages.

#### 13.6 Star button for "Set as default" has no `aria-label`
**File**: `installment-plans.tsx:350-365`

The `<button>` wrapping the `<Star>` icon only sets `title=`. The `title` attribute is not reliably announced by screen readers, especially on touch devices. Add `aria-label={isDefault ? "Current default plan" : "Set as default plan"}`.

#### 13.7 Filter toggle has no ARIA group semantics
**File**: `installment-plans.tsx:458-481`

The Active / All toggle buttons are two plain `<button>` elements inside a `<div>` with no `role="group"` and no `aria-label` describing the group purpose. Add `role="group" aria-label="Filter plans by status"` to the container div.

#### 13.8 Deactivation confirmation dialog is oversized
**File**: `installment-plans.tsx:695-742`

The confirmation dialog uses `sm:max-w-2xl`, correct for data-entry but disproportionate for a simple "Are you sure?". Change to `sm:max-w-md`.

### MISSING FEATURES

- Sort-order editing UI — `sortOrder` is stored and mapped but there is no drag-to-reorder or input control
- Native app sync gap — `apps/native/app/(app)/dashboard/buy-package/plan.tsx` hardcodes a `PLAN_CONFIG`; plans created through this page won't appear in the native purchase flow
- `updatedAt` visibility — no "last modified" timestamp in the table or edit sheet

---

## 14. Memberships

**File**: `apps/web/src/components/pages/packages/memberships-page.tsx`

### CRITICAL

#### 14.1 Search input is dead code
**File**: `memberships-page.tsx:151, 281`

`search` state is declared and bound to an Input but never passed to the query, never used to filter `rows`, never debounced. Users type in the search bar and see no change. Fix: either wire to a client-side filter `rows.filter(r => r.clientName.toLowerCase().includes(search.toLowerCase()))` or add `search: z.string().optional()` to the `listMemberships` API and debounce the query.

#### 14.2 Stat cards compute on current page only, not full dataset
**File**: `memberships-page.tsx:206-215`

`expiringSoonCount`, `frozenCount`, `outstandingBalanceSum` are derived from `rows` (max 100 per page). With pagination, these are silently wrong. Add separate aggregation queries or a stats endpoint on the server.

#### 14.3 Unnecessary `as unknown as` cast defeats oRPC type safety
**File**: `memberships-page.tsx:182-196`

`client.packageInstances.listMemberships` is fully typed but cast to a local interface. API type changes won't be caught by the compiler.

### MAJOR

#### 14.4 `sql.raw()` used with `accessibleNodeIds` — potential SQL injection vector
**File**: `packages/services/src/package-instance.service.ts:222-224`

Node IDs interpolated into raw SQL. Should use Drizzle's `inArray` or a parameterized `sql` tag.

#### 14.5 No ARIA roles on tab navigation
**Files**: `packages/view.tsx:30-46`, `memberships-page.tsx:355-373`

Both outer tabs (Memberships/Session Packs/Installments) and inner filter pills lack `role="tablist"`, `role="tab"`, `aria-selected`.

#### 14.6 Error state has no retry action
**File**: `memberships-page.tsx:241-264`

Shows "Please try again" but no retry button. Add a `<Button onClick={refetch}>Try again</Button>`.

### MINOR

#### 14.7 Wrong permission label in hub doc
**File**: `zhub/pages/web-dashboard-memberships-view.md:6`

Code and API agree on `service_management:read` but hub doc says `customer_management:read`.

#### 14.8 Date formatted in UTC
`toISOString().slice(0, 10)` ignores user timezone. For Malaysian users (UTC+8), packages expiring midnight UTC show as the next day. Use `toLocaleDateString('en-MY')` or `Intl.DateTimeFormat` with `Asia/Kuala_Lumpur`.

#### 14.9 Skeleton rows use array index as React key
**File**: `memberships-page.tsx:389-390`

Strict mode warning. Use a stable key (e.g. a fixed string with the index, such as `skeleton-${i}`).

### MISSING FEATURES

- Server-side search: `listMemberships` API has no `search`/`query` parameter
- Service category filter: API accepts `serviceCategoryId` but UI has no picker
- Export / download for expiring member lists
- Bulk actions (renewal reminder, unfreeze)
- Sort controls
- Customer email visible in row

---

## 15. My Services

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx`

### MAJOR

#### 15.1 DataTable import is the Sales table component
**File**: `view.tsx:8`

`DataTable` imported here is the one built for the Sales page, carrying layout assumptions (`flex-1 overflow-y-auto` without a bounded parent) that can cause height/scroll breakage on the My Services page. Use a dedicated or shared generic DataTable instead.

#### 15.2 `isPrimary` column not exposed
**DB**: `service_members.isPrimary`; router: `serviceMembers.listMine`

The `service_members` table stores an `isPrimary` boolean flag per assignment, but `listMine` does not return this field. Members cannot see which of their services is marked as primary. Add the JOIN in `serviceMembers.listMine`, update the type, and add a column.

#### 15.3 Float input truncated silently
**File**: `handleSave`, `parseInt` call

`parseInt("10.5", 10)` returns `10` with no warning. After `parseInt`, compare the parsed value to `parseFloat(bufferInput)` and show an error if they differ.

### MINOR

#### 15.4 Empty state rendered twice — dead `!isLoading` check
**File**: `view.tsx:220`

`!isLoading` at this point is always `true` because the `isLoading` guard at line ~190 already returned early. Remove `&& !isLoading` from the empty state condition.

### MISSING FEATURES

#### 15.5 No sort controls
The DataTable renders columns but no column-header sort controls are wired. Enable `enableSorting` on the `serviceName` and `categoryDefaultBuffer` columns and pass `getSortedRowModel`.

#### 15.6 No confirmation before "Clear Override"
**File**: `handleClearOverride` and the "Clear Override" button in `SheetFooter`

Clicking "Clear Override" immediately fires `saveMutation.mutate(...)` with `bufferTimeMinutes: null` — a misclick permanently discards the custom buffer. Wrap in an `AlertDialog`.

#### 15.7 No display of effective buffer time
The sheet shows "Category Default" and "My Override" separately but never computes the resolved effective buffer. Add a read-only "Effective Buffer" row showing `bufferTimeMinutes ?? categoryDefaultBuffer`.

---

## 16. POS (Point of Sale)

**Files**: `packages/services/src/pos.service.ts`, `apps/web/src/components/pos/`, `apps/web/src/routes/_authenticated/dashboard/_layout/sales/create.tsx`

### CRITICAL

#### 16.1 `searchPosCustomers` never queries walk-in customers
**File**: `pos.service.ts:698-769`

Function docstring says walk-ins are searched, but implementation ends after the members loop and returns without touching the `walkInCustomers` table. Walk-in customers by name/phone are unsearchable.

#### 16.2 Member search loads all members into memory when query is empty
**File**: `pos.service.ts:719-723`

No SQL WHERE on name/email — all client members are loaded then filtered in-application. Can blow Worker memory budget for large orgs.

#### 16.3 `TrainerPickerStep` calls `members.list` which needs `user_management:read`
**File**: `apps/web/src/components/pos/trainer-picker-step.tsx:49`

POS-only staff with `pos:create` but not `user_management:read` get FORBIDDEN silently. Trainer dropdown shows "No trainers found". Commission assignments silently skipped.

### MAJOR

#### 16.4 Duplicate step badge numbers
**File**: `create.tsx:577, 613`

When Trainers accordion is visible, both Trainers and Promotion show badge "3". Numbers should be dynamic based on whether `hasServiceItems`.

#### 16.5 Client-side re-filter after server already filtered
**File**: `apps/web/src/components/pos/customer-step.tsx:120-127`

`filtered` variable re-filters `results` by `query` but uses non-debounced `query` vs debounced fetch query — mismatch during debounce window. Drop the client-side filter.

#### 16.6 Two `useQuery` calls for tax rates with race condition
**File**: `create.tsx:148-180`

Default tax selection can point to an ID not yet in the list. Anti-pattern of side-effects in `queryFn`. Merge into one query.

#### 16.7 `resolvedBranchId` can be null for walk-in mode, hard-blocking submission
**File**: `create.tsx:344-348`

Misleading error "Branch could not be determined" for anonymous walk-in purchases. `isReadyToSubmit` doesn't gate on `resolvedBranchId`.

#### 16.8 Receipt data cast as wrong type
**File**: `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx:245-247`

`pos.getReceiptData` returns nested `{ order, items, payment, invoice }` structure but is cast as flat `ReceiptData`. Receipt display is broken or crashes.

### MINOR

#### 16.9 `calcTotals` logic duplicated in 3 files
Duplicated in `cart-summary.tsx`, `payment-step.tsx`, `create.tsx`. Extract to `@/lib/pos-calc.ts`.

#### 16.10 Negative `taxBase` not clamped
**File**: `cart-summary.tsx:22-24`

If `discountCents > subtotalCents`, `taxBase` goes negative, `totalCents` goes negative. Clamp `taxBase` to `Math.max(0, subtotalCents - discountCents)`.

#### 16.11 `nanoid()` is a hand-rolled stub with low entropy
**File**: `items-step.tsx:20-23`

Uses `Math.random().toString(36).slice(2, 10)`. Use `crypto.randomUUID()` instead.

#### 16.12 "Package" item type in UI but cannot be added
**File**: `items-step.tsx:200-208`

No Package button in `ItemsStep`, so the installment plan UI is permanently dead code. Either implement it or remove the dead UI.

### MISSING FEATURES

- Walk-in customer search by name/phone (see critical #16.1)
- Package item type in cart
- Product items (backend accepts "product" type but no UI)
- Phone number search for members
- Cash quick-fill buttons (RM10, RM50, RM100 denominations)
- No hub page for POS: `zhub/pages/` has no `pos.md` entry

---

## 17. Promotions

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/promotions/view.tsx`

> **Fixed this session**: Removed duplicate empty-state div; added percentage > 100 validation; added promotion name to deactivation dialog.

### MAJOR

#### 17.1 No way to reactivate a deactivated promotion
The API supports `update({ isActive: true })` but no UI exposes this. Once a promotion is deactivated there is no way to restore it. Add an "Activate" button (or menu item) appearing when `row.original.isActive === false` that calls `updatePromotion({ id, isActive: true })`.

#### 17.2 `maximumDiscount` field missing from create form
**File**: `view.tsx:113-124`

The DB schema and API accept a `maximumDiscount` field (to cap the absolute value of a percentage discount). The field is correctly mapped in the data array but there is no input for it in the create sheet. Percentage promotions can never have a cap set via the UI.

#### 17.3 No server-side pagination
**File**: `view.tsx:276-284`

`client.promotions.list` is called with a hard-coded default limit (50 records). No pagination controls and no `totalCount`/`nextCursor` handling.

### MINOR

#### 17.4 `free_item` and `buy_x_get_y` types exposed in UI but form provides no additional inputs
**File**: `view.tsx:612-622`

The type selector lets users choose `free_item` and `buy_x_get_y` but the create form has no inputs for `applicableProductIds` or `applicableServiceIds`. These promotion types produce non-functional records. Either hide these options or add the required selectors.

#### 17.5 Usage column shows `usageCount`/`usageLimit` but never `perCustomerLimit`
`perCustomerLimit` is never surfaced anywhere in the UI — not in the table, not in the detail/edit sheet.

#### 17.6 Edit button active during pending deactivation
`buildColumns` receives `isDeactivating` and disables the Deactivate button while the mutation is in flight, but the Edit button in the same row action group is not disabled. Potential race condition.

#### 17.7 Edit form name field allows empty string — silently ignored by server
`handleEditSubmit` passes `name: editForm.name.trim() || undefined`. Sending `undefined` causes the server to ignore the field silently. The name field should have a required validation guard in the edit path.

#### 17.8 Promo code regex has redundant case-insensitive flag
**File**: `view.tsx:592-596`

`/^[A-Z0-9_-]+$/i` — the `i` flag is harmless but misleading since the character class already explicitly lists only uppercase `A-Z`. Remove it.

### MISSING FEATURES

#### 17.9 No branch restriction in create form
When creating a promotion it is applied org-wide. No mechanism to scope a promotion to a specific branch/hierarchy node.

#### 17.10 No promotion duplication action
No "Duplicate" action in the row menu. Creating a variant with a different code or date range requires manually re-entering all fields.

---

## 18. Rooms

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/rooms/view.tsx`

> **Fixed this session**: All-tab filter (always returned active-only); duplicate success toast.

### MAJOR

#### 18.1 Permission key mismatch
**Files**: `rooms/view.tsx:84-85`, `packages/api/src/routers/rooms.ts:31, 66, 107, 149`

Frontend gates actions on `appointment_management:create` / `appointment_management:update`, but the backend router enforces the `appointments` resource name (without the `_management` suffix). Users whose role grants `appointments:create` will be blocked by the UI despite having backend access — and vice versa.

#### 18.2 No pagination
**File**: `apps/web/src/components/tables/rooms/view/data-table.tsx`

`useReactTable` is configured with only `getCoreRowModel`, `getSortedRowModel`, and `getFilteredRowModel`. No `getPaginationRowModel`, no page-size state, no pagination controls. Entire list renders at once.

#### 18.3 Hierarchy query error not surfaced
**File**: `rooms/view.tsx:96-103`

The `listNodes` query has no `isError` binding. If the request fails, the Branch combobox silently shows "No branches found" — indistinguishable from a legitimately empty hierarchy. Capture `isError` and show an explicit error state.

### MINOR

#### 18.4 Missing `htmlFor` on Type and Branch labels
**File**: `rooms/view.tsx:359, 396`

`<label>` elements for the Type select and Branch combobox lack `htmlFor` attributes, breaking screen-reader association.

#### 18.5 Timestamps missing `{ withTimezone: true }`
**File**: `packages/db/src/schema/tenant/rooms.ts:13-14`

`createdAt` and `updatedAt` columns declared without `{ withTimezone: true }`, violating the project-wide convention. Generate and apply a migration.

#### 18.6 Header icon missing
**File**: `rooms/view.tsx:244-259`

The page header renders only the text "Rooms" with no accompanying icon. Import `DoorOpen` from `lucide-react` and render it adjacent to the `<h1>`.

#### 18.7 Plain `<input type="checkbox">` instead of shadcn `<Checkbox>`
**File**: `rooms/view.tsx:413-428`

The "Active" toggle uses a raw `<input type="checkbox">`. Replace with `<Checkbox>` from `@/components/ui/checkbox` and a matching `<Label>`.

---

## 19. Sales & Payments

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx`

> **Fixed this session**: `useNavigate()` extracted from `cell:` renderer into proper `SalesActionCell` and `PaymentActionCell` React components; `period: undefined` added to `handleClear` navigate call.

### MAJOR

#### 19.1 Stats cards compute on current page only
**File**: `sales/view.tsx:103-107`

"Total Revenue", "Completed", and "Cancelled" stat cards reduce `salesData` (the current page of 50 rows), not the full dataset. A user on page 3 sees misleading revenue/counts. Compute aggregates server-side and return them alongside paginated rows, or add a separate aggregate-only query.

#### 19.2 Invoices query fetches ALL invoices — no pagination, no RBAC filter
**Files**: `sales/view.tsx:261-264`, `packages/api/src/routers/invoices.ts:47-53`

`invoices.list` applies no `LIMIT`, no cursor/offset pagination, and does not filter by `accessibleNodeIds`. On large tenants this returns the entire table on every load. Members with restricted hierarchy scope also receive invoices outside their permitted nodes.

#### 19.3 Client-side search only searches the current 50-row page
**File**: `apps/web/src/components/tables/sales/view/data-table.tsx:42-54`

The search input filters rows in the TanStack Table instance, which only holds the current page. Searching for an order number on a different page returns zero results. Move search to the server (as a URL param), or add a prominent disclaimer that search is page-local.

### MINOR

#### 19.4 `status` filter cast via `as any` bypasses enum type check
**File**: `sales/view.tsx:246`

`status: (status || undefined) as any` — an invalid status string passes TypeScript but may produce a runtime error. Define a typed union for valid status values and eliminate the cast.

#### 19.5 Invoice status badge missing `paid`, `overdue`, `draft`, `partially_paid` states
**File**: `apps/web/src/components/tables/payment/view/columns.tsx:78-95`

`formatEInvoiceStatus` only handles `pending`, `generated`, `sent`, `failed`, `cancelled`. Other statuses fall through to an unstyled raw string badge.

#### 19.6 Filter `<label>` elements not associated with inputs via `htmlFor`
**File**: Filter toolbar lines ~50, 61, 72, 93

Labels "From", "To", "Status", "Branch" render without matching `htmlFor`/`id` pairs. Clicking the label text does not focus the input.

#### 19.7 Dead `onServiceAdd` prop in both DataTable components
**Files**: `tables/sales/view/data-table.tsx:26`, `tables/payment/view/data-table.tsx:22`

`onServiceAdd` is declared in both DataTable interfaces but never passed by any parent and never used internally. Remove from both.

### MISSING FEATURES

#### 19.8 Payments tab has no filter toolbar
The Sales tab has date-range, status, and branch filters. The Payments tab renders only the raw data table with no filtering.

#### 19.9 No server-side search
Neither tab supports full-dataset search by order number, invoice number, or customer name.

#### 19.10 No export functionality
No way to export sales or payment records to CSV/Excel.

#### 19.11 Payment "View" button navigates to the sales order, not the invoice detail
**File**: `tables/payment/view/columns.tsx` (`PaymentActionCell`)

The "View" button navigates to `/dashboard/sales/$id` using `row.original.sales_order` as the ID. When a sales order has multiple invoices the user lands on the wrong detail page. Determine if an invoice detail route exists (or should be created) and navigate there instead.

---

## 20. Services

**Files**: `apps/web/src/components/pages/services/`, `apps/web/src/components/tables/service/`, `packages/services/src/service.service.ts`

> **Fixed this session**: USD currency display replaced with `formatPrice(..., "MYR")` in `service-detail-dialog.tsx`; dollar sign prefixes replaced with `RM` in `service-form.tsx`.

### CRITICAL

#### 20.1 `service_category_name` always blank
**Files**: `packages/services/src/service.service.ts:91-103`, `tables/service/view/columns.tsx:36-42`

`listServices` does not join to the `service_categories` table. The Category column always shows "—". Fix: add a LEFT JOIN on `service_categories` and include `service_categories.name as service_category_name` in the SELECT.

#### 20.2 `ServiceFormData` in `service-category-form.tsx` describes a service, not a category
**File**: `apps/web/src/components/forms/service-category-form.tsx:8-19`

The `ServiceFormData` interface contains service-specific fields (`duration`, `schedulingType`, `sessions`, `taxable`, etc.). Replace with a correct `ServiceCategoryFormData` interface: `{ name: string; description?: string; isActive: boolean; }`.

### MAJOR

#### 20.3 No error state for services or categories query
**Files**: `services-page.tsx`, `categories-page.tsx`

If the API call fails, the table silently shows an empty state. Check `isError` from `useQuery` and render an error message or retry button.

#### 20.4 Double-invalidation on form submit
**File**: `tables/service/view/data-table.tsx:221-226`

`onSuccess` is triggered twice after a successful form submission, causing two redundant cache invalidations and potentially two toast notifications. Consolidate the duplicate calls.

#### 20.5 Orphan Actions column in categories table
**File**: `tables/service-category/view/data-table.tsx:161-163`

An extra `<TableHead>` for an "Actions" column exists outside the column definitions array. The empty-state `colSpan={columns.length}` does not account for it, causing misalignment. Either add `actions` as a proper `ColumnDef`, or use `columns.length + 1` in the empty-state cell.

### MINOR

#### 20.6 `useEffect`-based fetch in detail dialogs
**Files**: `service-detail-dialog.tsx:83-107`, `service-category-detail-dialog.tsx:64-97`

Both dialogs fetch data via `useEffect` + local state, bypassing TanStack Query's caching, deduplication, and background refetch. Replace with `useQuery`.

#### 20.7 `@headlessui/react` Dialog instead of shadcn Dialog
**Files**: `service-form.tsx:1`, `service-category-form.tsx:1`

Both form dialogs use `@headlessui/react` Dialog/Transition instead of the project-standard shadcn/ui Dialog. Migrate to `import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"`.

### MISSING FEATURES

#### 20.8 Missing features
- Active/inactive filter — no way to toggle between active and inactive services
- Pagination — table loads all records at once with no server-side pagination controls
- Reactivation — deactivating a service is supported but there is no UI affordance to reactivate

---

## 21. Trainer Tiers

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/tiers.tsx`

> **Fixed this session**: Toast messages fixed; `isError` handling with retry button added; `(tiers as any[])` cast removed; tier name added to deactivation dialog.

### CRITICAL

#### 21.1 `(result as any)` casts on mutation results
**File**: `tiers.tsx:65-68, 91-94`

Both `createMutation.onSuccess` and `reactivateMutation.onSuccess` cast the result to `any` to access `missingRateCategories`. If the API return type changes, this code silently breaks. Import proper result types from the services package and type the `mutationFn` return explicitly.

### MAJOR

#### 21.2 No edit functionality
The backend procedure `trainerTiers.update` exists but there is no edit UI. Users cannot rename a tier or change its rank without deactivating and recreating it. Add an Edit button opening a pre-populated dialog that calls `client.trainerTiers.update({ organizationId, id, ...changes })`.

#### 21.3 Missing-rate banner shows raw UUIDs
**File**: `tiers.tsx:147-149`

When `missingRateBanner` is set after create/reactivate, list items display the raw `categoryId` UUID instead of a human-readable category name. Either expand the API response to include `categoryName`, or resolve names client-side via `client.serviceCategories.list`.

#### 21.4 Missing-rate banner has no dismiss button
**File**: `tiers.tsx:140-153`

Once the missing-rate alert appears it persists for the entire session with no way to dismiss it short of a page reload. Add an X button inside the `Alert` that calls `setMissingRateBanner(null)`.

#### 21.5 Mutations use `refetch()` instead of `queryClient.invalidateQueries()`
All three mutations (`createMutation`, `deactivateMutation`, `reactivateMutation`) call `refetch()` on the local query instance. Other components holding the same tier data (sidebar badge, trainer assignment dropdown) will not be invalidated. Use `queryClient.invalidateQueries({ queryKey: ["trainerTiers", orgId] })`.

### MINOR

#### 21.6 No reactivate confirmation dialog
Deactivating a tier shows a confirmation dialog. Reactivating fires immediately on button click with no confirmation — inconsistent UX that could lead to accidental reactivation.

#### 21.7 No description column in table
The create form collects a `description` field but the tier table has no column for it. Users cannot see descriptions without an edit dialog. Add a Description column with a fallback dash.

#### 21.8 `orgId` could be empty string when mutations fire
`orgId` is derived as `userContext?.currentOrganizationId ?? ""`. The `useQuery` is guarded with `enabled: !!orgId`, but all three mutations pass `orgId` directly without any guard. Add an early return check or disable action buttons while `!orgId`.

---

## 22. Trainers

**Route**: `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx`

> **Fixed this session**: Hierarchy dropdown indent changed from `"  ".repeat(node.depth)` to CSS `style={{ paddingLeft: \`${node.depth * 12}px\` }}`.

### CRITICAL

#### 22.1 `c.serviceName` references non-existent field
**File**: `view.tsx:1282`

`CommissionLedgerRow` has no `serviceName` field. Reading it always yields `undefined`. The commissions display will silently show nothing or crash if used in a conditional. Remove the reference or map the correct field from the actual API response.

### MAJOR

#### 22.2 No confirmation for Suspend / Reactivate
**File**: `view.tsx:766-783`

Clicking "Suspend" or "Reactivate" fires the mutation immediately with no warning dialog. A mis-click irreversibly changes member status. Wrap the action in an `AlertDialog` (confirm → proceed) before calling the mutation.

#### 22.3 No error state for member list query
**File**: `view.tsx:151`

If the `members.list` API call fails, the component renders an empty grid with no indication that an error occurred. Check `isError` and render an error banner or retry button.

#### 22.4 No pagination for trainer grid
**File**: `view.tsx:601`

All trainers are fetched in a single request with no `limit` or `offset`. On large organizations this produces a huge payload and slow render. Add server-side pagination to `members.list` and render a paginator or infinite scroll.

### MINOR

#### 22.5 Commission amount may be 100x too large
**File**: `view.tsx:1296-1298`

`formatPrice(c.calculatedAmount, "MYR")` — if `calculatedAmount` is stored in integer cents (per Phase 2S convention), this displays 100x the real value. Verify what unit `listCommissionLedger` returns. If cents, divide by 100 or use `centsToRm()` from `apps/web/src/lib/amount.ts`.

#### 22.6 Tier dropdown uses native `<select>` instead of design-system `<Select>`
**File**: `view.tsx:654`

The trainer tier assignment control uses a raw HTML `<select>`. Replace with shadcn `<Select>` / `<SelectTrigger>` / `<SelectContent>` / `<SelectItem>` from `@/components/ui/select`.

### MISSING FEATURES

#### 22.7 Services collapsible has no loading state
When a trainer's services are being fetched, the collapsible section renders as empty. Add a `Skeleton` placeholder while the services query is pending.

#### 22.8 Availability conflict validation missing
**File**: `trainer-availability-editor.tsx`

Overlapping shift submissions are accepted by the UI without warning. Before submitting a new availability slot, check client-side whether the new time range overlaps any existing slot for the same trainer/day.

#### 22.9 Commission pagination capped at 20 — no "load more"
**File**: `view.tsx:247`

`listCommissionLedger` fetches at most 20 records with no "Load more" button or infinite scroll. Add a `limit`/`cursor` pattern and render a "Load more" button.

---

*End of combined problems document. 22 feature areas, ~190 individual issues.*

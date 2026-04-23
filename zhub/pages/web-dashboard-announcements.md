# Announcements Management

**Route:** `/dashboard/announcements/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/announcements/view.tsx`
**Platform:** web
**Auth required:** authenticated (no explicit RBAC guard)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Create, edit, publish, and manage organization-wide and branch-specific announcements with optional scheduling and pinning.

**Produces:**
- Data table of announcements with title, priority, target audience, validity dates, pin status, and active/inactive state
- Create/edit sheet with form for title, message, priority, target audience, date range, pin toggle
- Confirmation dialogs for deactivation and deletion

**On success:** Announcements are created, updated, deactivated, or deleted with success toast.

**On failure / error states:** Permission denied (no org selected), loading spinner, error callout with retry, error toasts on mutation failure.

---

## 2. How It Works

**Execution flow:**
1. Route component fetches user context to determine organization
2. useQuery fetches announcements filtered by isActive status
3. Announcement list renders with inline status/priority badges
4. User clicks "Create", "Edit", or actions → opens sheet with form state
5. Form validation on submit → create/update mutation → query invalidation → toast
6. Delete/deactivate → confirmation dialog → mutation → query invalidation

**Inputs:**
- Form fields: title, message, priority (low|normal|high|urgent), targetAudience (all|staff|clients), startDate (datetime-local), endDate (datetime-local), isPinned (checkbox)
- Filters: statusFilter (active|inactive|all), audienceFilter (all|staff|clients)

**State management:**
- TanStack Query: `["announcements", organizationId, isActiveFilter]`
- Local state: statusFilter, audienceFilter, sheetOpen, editingId, form (FormState), deleteTarget, deactivateTarget
- Mutations: createMutation, updateMutation, deactivateMutation, deleteMutation with isPending flags

**Outputs:**
- Data table with columns: title, priority, target, scope, valid from/until, pinned, status, actions
- Action buttons: edit, deactivate (if active), delete
- Sheet footer with cancel/save buttons (showing pending state)
- Confirmation dialogs for destructive actions

**Side effects:**
- onSuccess: invalidates announcements query (with all variants), resets form, closes sheet, shows success toast
- onError: shows error toast with error message
- Dates converted ISO ↔ datetime-local format for input compatibility

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.announcements.list()` — fetch announcements with status filter
- `client.announcements.create()` — create announcement
- `client.announcements.update()` — update announcement (full or isActive only)
- `client.announcements.delete()` — delete announcement

**Uses these components:**
- `DataTable` @ `/components/tables/sales/view/data-table` — announcement list
- `EmptyState` — no announcements message
- `StatusBadge` — active/inactive status indicator
- `StatusCallout` — error state with retry
- Button, Badge, Input, Textarea, Label, Checkbox, Select, Sheet, Dialog, Separator

**Uses these hooks:**
- `useUserContext()` — fetch org ID
- `useQuery()` — fetch announcements
- `useMutation()` — create/update/deactivate/delete
- `useQueryClient()` — invalidate queries

**Navigation: who navigates here:**
- Announcements menu link

**Navigation: where it goes:**
- None explicit; could link to target-audience-specific pages if implemented

---

## 4. Data Shapes

**DB tables touched:**
- announcements — create, read, update, delete (soft via isActive)

**Key types / Zod schemas:**
- `AnnouncementRow` — {id, title, message, priority, targetAudience, branchId?, startDate?, endDate?, isPinned, isActive, createdAt}
- `FormState` — {title, message, priority, targetAudience, startDate, endDate, isPinned}
- Priority enum: "low" | "normal" | "high" | "urgent"
- TargetAudience enum: "all" | "staff" | "clients"
- StatusFilter enum: "active" | "inactive" | "all"

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Date range validation edge cases (same start/end, past dates, DST transitions)
- Audience filter client-side accuracy (backend does not filter by targetAudience)
- Concurrent announcement updates (no optimistic UI)
- Priority badge color correctness (high priority hardcoded orange-600 per comment)
- Large message bodies (Textarea unbounded)
- Announcement persistence across org switches

---

## 6. Notes

- **No RBAC guard** — all authenticated users can access; consider restricting to specific roles
- **Date conversion quirk** — ISO dates with Z suffix stripped to datetime-local format (line 244); naive date handling may cause TZ issues
- **Priority levels** — "high" priority explicitly documented as semantic, not lifecycle status (line 99 comment)
- **Audience filtering** — done client-side only; backend list() does not accept targetAudience param (line 275 comment)
- **Soft delete via isActive** — deletion sets isActive: false; hard delete also available (line 221)
- **BranchId is optional** — null means org-wide announcement; branch-specific not yet fully scoped
- **Created/updated timestamps** — returned from API but not displayed in table


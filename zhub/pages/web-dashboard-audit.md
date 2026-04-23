# Audit Log Viewer

**Route:** `/dashboard/audit/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/audit/view.tsx`
**Platform:** web
**Auth required:** authenticated (RBAC checked in component via hasPermission("audit_log:read"))
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View organization audit trail with filtering by actor, action, entity type, branch, and date range. Drill into entry details (changes JSON, actor info, affected entity).

**Produces:**
- Data table with columns: when (relative time), actor (name+ID+role badge), action (colored badge), entity (type+label+ID), branch, summary, expand button
- Filter bar: actor userId (free-text), action (single-select), entity type (single-select), branch (select if available), from/to dates (datetime-local)
- Detail dialog: summary, actor info, entity details, changes JSON, IP/UA metadata
- Pagination controls (if >100 entries)
- Empty state with result count

**On success:** Audit entries load and display with filters applied. Entries colored by action category.

**On failure / error states:** Permission denied, loading spinner, error callout with retry, 403 detection for permission errors.

---

## 2. How It Works

**Execution flow:**
1. Route loads with component-level RBAC check (no explicit guard in beforeLoad)
2. Component derives accessible branches from userContext hierarchy
3. User sets filters: actorUserId, action, entityType, branchId, fromApplied/toApplied
4. Query fires with all filter params; offset used for pagination
5. Table renders with action-color mapping function (category-based badge colors)
6. Expand button opens detail dialog with full entry info
7. Date inputs have blur handlers to apply dates (not real-time filtering)

**Inputs:**
- Filter inputs: actorUserId (free-text userId), action (dropdown), entityType (dropdown), branchId (select), from/to (datetime-local inputs)
- Pagination: offset (row number, not page number)
- Detail view: selected row with all enriched data

**State management:**
- TanStack Query: `["auditLog", organizationId, actorUserId, action, entityType, branchId, fromApplied, toApplied, offset]`
- Local state: actorUserId, action, entityType, branchId, fromInput, toInput, fromApplied, toApplied, offset, detailRow, detailOpen
- Pagination: currentPage = floor(offset / PAGE_LIMIT) + 1, totalPages = ceil(total / PAGE_LIMIT)

**Outputs:**
- Data table with color-coded action badges, role badges for actors
- CopyableCell components for user IDs and entity IDs
- Detail dialog with modal form displaying all entry metadata
- Pagination buttons (Previous/Next, disabled at boundaries)
- Clear filters button (appears if any filter set)

**Side effects:**
- Filter changes reset offset to 0 (resetOffset helper)
- Date filters applied on input blur (not onChange)
- Clear filters resets all local state and offset
- Permission check (403) shows dedicated permission-denied UI (not generic error)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.auditLogs.list()` — fetch entries with filters (actorUserId, action, entityType, branchId, from, to, limit, offset)

**Uses these components:**
- `DataTable` @ `/components/tables/sales/view/data-table` — audit log table
- `EmptyState` — no entries message
- `StatusCallout` — error state with retry
- `CopyableCell` @ `/components/tables/copyable-cell` — user/entity ID copy button
- `Tooltip` — relative time explanation
- `Select`, `Input`, `Label`, `Button`, `Dialog`, `Separator`

**Uses these hooks:**
- `useUserContext()` — fetch org ID, accessible branches, RBAC perms
- `useQuery()` — fetch audit entries
- `useState()` — manage filters, pagination, detail modal

**Navigation: who navigates here:**
- Audit menu link

**Navigation: where it goes:**
- None explicit

---

## 4. Data Shapes

**DB tables touched:**
- audit_logs — read
- audit_log_entries — read (implied)
- members — read (for actor name resolution)
- hierarchy_nodes — read (for branch name)

**Key types / Zod schemas:**
- `AuditRowEnriched` — {id, actorUserId, actorMemberId?, actorRole?, actorName?, action, entityType, entityId?, entityLabel?, branchId?, branchName?, summary, changes, ipAddress?, userAgent?, createdAt}
- Canonical actions: sale.create, sale.refund.approve, member.deactivate, checkin.create, etc. (predefined list)
- Entity types: sales_order, refund, member, check_in, commission_split, etc.
- Response: `{rows: AuditRowEnriched[], total: number}`

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Filter accuracy (assumes API respects all param combinations)
- Date filtering edge cases (datetime-local vs ISO, timezone, DST)
- Pagination correctness (offset calculation, boundary conditions)
- Action color mapping completeness (new action types not in AUDIT_ACTIONS)
- Large result sets (pagination at 100-entry limit; UI may slow)
- 403 error detection (checks for "403", "forbidden", "permission" in message; case-sensitive check may miss variants)
- Actor/entity name resolution fallback (shows IDs if names not available)

---

## 6. Notes

- **AUDIT_ACTIONS const** — hardcoded list of known actions; new actions require code change, not config
- **ACTION_CATEGORY_COLORS** — maps action prefix (before first ".") to Tailwind badge class; refund. actions get orange override
- **Relative time formatting** — custom implementation without date-fns (lines 135-155); supports 60 min/hour/day/month/year granularity
- **Role badge colors** — distinct for admin|staff|trainer|client|system
- **Free-text actor search** — searches userId only (no listStaff procedure available per comment); TODO to upgrade to combobox
- **Date filters applied on blur** — not real-time; allows batch date entry without repeated queries
- **Detail dialog** — modal show/hide controlled by detailOpen state; detailRow cleared on close
- **Branch filter** — only shown if any accessible branches exist (optional conditional render)
- **Entity type display** — uppercase-formatted; label shown in parentheses if available
- **Changes JSON** — displayed as formatted JSON in <pre> with max-height scroll and monospace font


# Test Plan: Audit Log View

**Route:** `/dashboard/audit/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Some audit log entries in the tenant DB
- `PAGE_LIMIT = 100`

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/audit/view`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- Page heading "Audit Log" (or similar) with calendar/audit icons
- Filters section: actor filter, action filter, entity type filter, date filters
- DataTable with audit log rows
- Pagination visible
- No console errors

### TC-02: Audit table — populated state
**Trigger:** Wait for data
**Steps:**
1. Navigate, wait for data
**Expected:**
- Rows show: actor name, role badge, action, entity type, entity label, branch, summary
- CopyableCell for entity IDs
- ActionCategoryBadge for action types
- RoleBadge for actor role

### TC-03: Audit table — empty state
**Trigger:** No matching audit entries
**Steps:**
1. Apply filters that return no results
**Expected:**
- EmptyState component shown

### TC-04: Audit table — loading state
**Trigger:** Observe before data arrives
**Steps:**
1. Navigate, observe before response
**Expected:**
- PageLoader or loading indicator visible

### TC-05: Filter — by action
**Trigger:** Select action filter
**Steps:**
1. Navigate to route
2. Select action from AUDIT_ACTIONS list (e.g., "sale.create")
**Expected:**
- Query re-fetches with action filter
- Only matching entries shown

### TC-06: Filter — by entity type
**Trigger:** Select entity type
**Steps:**
1. Select entity type (e.g., "sales_order")
**Expected:**
- Query re-fetches with entityType filter
- Table updates

### TC-07: Filter — by date range
**Trigger:** Enter date range
**Steps:**
1. Use date filters (from/to inputs)
**Expected:**
- Query re-fetches with date range
- Table shows only entries within range

### TC-08: Filter — by actor
**Trigger:** Enter actor search
**Steps:**
1. Enter member name or ID in actor filter
**Expected:**
- Query re-fetches with actor filter

### TC-09: Row expansion — details dialog
**Trigger:** Click ChevronRight or row to expand
**Steps:**
1. Click a row's expand button
**Expected:**
- Dialog opens showing full audit entry details
- Shows: actorUserId, actorMemberId, action, entityType, entityId, entityLabel, branchId, summary, timestamp

### TC-10: Pagination — navigate pages
**Trigger:** Click next page in TablePagination
**Steps:**
1. If more than PAGE_LIMIT entries, paginate
**Expected:**
- `TablePagination` component handles page navigation
- Query re-fetches for new offset
- New entries shown

### TC-11: Tooltip on truncated content
**Trigger:** Hover over truncated cell content
**Steps:**
1. Find a row with long entity label
2. Hover over it
**Expected:**
- TooltipProvider/Tooltip shows full content

### TC-12: CopyableCell — copy entity ID
**Trigger:** Click copy icon on entity ID cell
**Steps:**
1. Click copy icon on a CopyableCell
**Expected:**
- ID copied to clipboard
- Visual feedback (check icon)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.auditLog.list({ organizationId, action, entityType, actorMemberId, from, to, offset, limit })` | TC-02, TC-05, TC-06, TC-07, TC-08, TC-10 |

## Edge Cases

### EC-01: 100+ entries (page limit)
**Setup:** More than 100 audit entries
**Expected:** First 100 shown; pagination allows viewing more

### EC-02: Unknown action in AUDIT_ACTIONS
**Setup:** DB has action not in the constant list
**Expected:** Action shown as-is; no crash

### EC-03: null actorName/branchName
**Setup:** System-generated or automated audit entries
**Expected:** "—" or empty shown in table; no crash

### EC-04: Very long summary text
**Setup:** Audit entry with long summary
**Expected:** Cell truncates or wraps gracefully

## Known Gaps
- Exact API procedure name unknown without reading server files
- Filter combinations (multiple filters simultaneously) not tested
- Export/download functionality (if any) not covered

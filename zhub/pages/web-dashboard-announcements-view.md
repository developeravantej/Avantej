# Announcements View

**Route:** `/dashboard/announcements/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/announcements/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (no explicit `beforeLoad` guard)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Create, view, edit, deactivate, and delete organization announcements scoped by status and target audience.

**Produces:** A filterable table of announcements with title, priority badge, target audience, date range, pin indicator, and status. A slide-out Sheet for create/edit. Confirmation Dialogs for delete and deactivate.

**On success:**
- Create → toast "Announcement created successfully."; Sheet closes; table refreshes.
- Update → toast "Announcement updated successfully."; Sheet closes; table refreshes.
- Deactivate → toast "Announcement deactivated."; table refreshes.
- Delete → toast "Announcement deleted."; table refreshes.

**On failure / error states:**
- No `organizationId` → centered empty state "Select an organization to manage announcements."
- Loading → centered spinner.
- Mutation error → destructive toast with error message.
- Form validation error → toast "Title and message are required." or "End Date must be after Start Date."

---

## 2. How It Works

**Execution flow:**
```
AnnouncementsViewPage
  → useUserContext() → organizationId
  → useQuery(client.announcements.list, { isActive: filter }) → apiData
  → client-side filter by targetAudience → filteredData
  → DataTable (sales/view/data-table) with inline columns
  → Create/Edit Sheet:
      → createMutation: client.announcements.create()
      → updateMutation: client.announcements.update()
  → Deactivate Dialog:
      → deactivateMutation: client.announcements.update({ isActive: false })
  → Delete Dialog:
      → deleteMutation: client.announcements.delete()
```

**Inputs:**
- Status filter tab (active / inactive / all) — drives `isActive` param to API.
- Audience filter dropdown (all / staff / clients) — applied client-side after API response.

**State management:**
- `statusFilter`, `audienceFilter` — local state for filters.
- `sheetOpen`, `editingId`, `form` — slide-out Sheet state.
- `deleteTarget`, `deactivateTarget` — confirmation dialog open state (IDs of target records).
- TanStack Query (`queryKey: ["announcements", organizationId, isActiveFilter]`).

**Side effects:** All mutations invalidate `["announcements", organizationId]`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `announcements.list` — list announcements for org (filters: `branchId`, `isActive`, `limit`, `offset`)
- `announcements.create` — create announcement
- `announcements.update` — update or deactivate announcement
- `announcements.delete` — hard-delete announcement

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table (columns defined inline)

**Uses these hooks:**
- `useUserContext` — resolves `organizationId`
- `useQuery`, `useMutation`, `useQueryClient` — data fetching and mutations

**Navigation: who navigates here:**
- App sidebar: "Announcements" under the Announcements section

**Navigation: where it goes:** Stays on page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `announcements` (tenant) | SELECT | `id`, `title`, `message`, `priority`, `targetAudience`, `branchId`, `startDate`, `endDate`, `isPinned`, `isActive`, `createdAt` |
| `announcements` (tenant) | INSERT | All above except `id`, `createdAt` |
| `announcements` (tenant) | UPDATE | `title`, `message`, `priority`, `targetAudience`, `startDate`, `endDate`, `isPinned`, `isActive` |
| `announcements` (tenant) | DELETE | `id` |

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| Title | Text input | Required (non-empty) | `title` |
| Message | Textarea | Required (non-empty) | `message` |
| Priority | Select | low/normal/high/urgent | `priority` |
| Target Audience | Select | all/staff/clients | `targetAudience` |
| Start Date | datetime-local | Optional; before End Date | `startDate` (ISO string) |
| End Date | datetime-local | Optional; after Start Date | `endDate` (ISO string) |
| Pin to top | Checkbox | — | `isPinned` |

---

## 5. Tests

**Test files:**
- `apps/web/src/__tests__/components/announcements-widget.test.tsx` — tests the dashboard widget (`listActive`), not this full page.

**Scenarios covered (widget test):** Loading state, empty state, renders active announcements list.

**Not tested (risk areas):**
- Create/edit/delete/deactivate mutations
- Client-side audience filter
- Date validation (end after start)
- `branchId` — always `null` from this UI (no branch selector exposed)

---

## 6. Notes

- The `announcements.list` API supports a `branchId` filter but this page does not expose it — all announcements for the org are shown regardless of branch. `branchId` is displayed as "Org-wide" when null.
- `targetAudience` filter is applied client-side only (the API does not accept it as a query param).
- `isActive` filter is encoded: "active" → `true`, "inactive" → `false`, "all" → `undefined` (no filter).
- Dates are stored and sent as ISO strings; the datetime-local input value is sliced to 16 chars for display compatibility (`"YYYY-MM-DDTHH:MM"`).
- `DataTable` is reused from the sales module — no pagination, sorting, or column visibility controls are exposed on this page.
- API requires `announcement_management:read` permission (enforced server-side); no `beforeLoad` guard on this route.

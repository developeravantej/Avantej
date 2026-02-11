# Web App: New APIs Implementation – What Was Done

This document summarizes the work done to wire the web app (`apps/web`) to the newly created oRPC APIs, following [WEB_PAGES_NEW_APIS_PLAN.md](./WEB_PAGES_NEW_APIS_PLAN.md).

---

## Overview

- **Service Categories** – List, get by ID, create, update; table + dialogs wired to API.
- **Services** – List, get by ID, create, update; table + dialogs wired to API; category names resolved from service categories.
- **Appointments** – List (staff view) used on both appointment pages and dashboard widget; shared mapper for calendar shape.
- **Dashboard widgets** – Appointments widget shows today’s appointments; Announcements widget shows notifications (with “Mark all read”).
- **Customers page** – “My profile” section added using customer profile get/upsert.

All new usage goes through `client` from `@/utils/orpc` and `organizationId` from `useUserContext()`.

---

## 1. Service Category View

**Route:** `/_authenticated/service-category/view`

| What was done | Files |
|---------------|--------|
| Route fetches list and passes data to table | `apps/web/src/routes/_authenticated/service-category/view.tsx` |
| Table columns aligned with API (name, description, order, status, created) | `apps/web/src/components/tables/service-category/view/columns.tsx` |
| New create/edit dialog (name, description, displayOrder, isActive) | `apps/web/src/components/forms/service-category-create-edit-dialog.tsx` |
| Detail dialog loads by ID and shows API fields; deactivate = soft-delete | `apps/web/src/components/forms/service-category-detail-dialog.tsx` |
| Data table uses API for list, getById, create, update, soft-delete | `apps/web/src/components/tables/service-category/view/data-table.tsx` |

**APIs used:** `serviceCategories.list`, `serviceCategories.getById`, `serviceCategories.create`, `serviceCategories.update` (soft-deactivate via `update(..., isActive: false)`).

---

## 2. Service View

**Route:** `/_authenticated/service/view`

| What was done | Files |
|---------------|--------|
| Route fetches services + categories; builds category name map; passes services with `service_category_name` | `apps/web/src/routes/_authenticated/service/view.tsx` |
| Columns: name, category, duration, price, scheduling, status, created | `apps/web/src/components/tables/service/view/columns.tsx` |
| New create/edit dialog (name, category, duration, unit, maxAttendees, price, scheduling, isActive) | `apps/web/src/components/forms/service-create-edit-dialog.tsx` |
| Detail dialog loads by ID and shows API fields; deactivate = soft-delete | `apps/web/src/components/forms/service-detail-dialog.tsx` |
| Data table uses API for list, getById, create, update, soft-delete | `apps/web/src/components/tables/service/view/data-table.tsx` |

**APIs used:** `services.list`, `services.getById`, `services.create`, `services.update`; `serviceCategories.list` for category names and dropdowns.

---

## 3. Appointment View (Both Routes)

**Routes:** `/_authenticated/appointment/view`, `/_authenticated/dashboard/_layout/appointment/view`

| What was done | Files |
|---------------|--------|
| Shared mapper: API appointment → calendar shape (start, end, status, title, clientName, service, assignedTo) | `apps/web/src/lib/appointment-mapper.ts` |
| Helpers for query date range (3-month window) and today’s range | Same file |
| Standalone appointment page: useQuery for list, map, pass to calendar; loading/error | `apps/web/src/routes/_authenticated/appointment/view.tsx` |
| Dashboard appointment page: same list + map; initialView from search; handlers for date/appointment/add (toast) | `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx` |

**APIs used:** `appointments.list` with `startFrom` / `startTo` (ISO). Create/update not wired in UI yet.

---

## 4. Dashboard Appointments Widget

**Where:** Dashboard index (`/_authenticated/dashboard/_layout/`)

| What was done | Files |
|---------------|--------|
| Today’s range helper | `apps/web/src/lib/appointment-mapper.ts` (`getTodayRange`) |
| Widget uses useUserContext + useQuery for today’s appointments (limit 10), mapApiAppointmentToCalendar | `apps/web/src/components/appointments-widget.tsx` |
| States: no org, loading, empty, list; click still goes to `/appointment/view?view=weekly` | Same file |

**APIs used:** `appointments.list` with `getTodayRange()` (startOfToday / endOfToday).

---

## 5. Announcements Widget (Notifications)

**Where:** Dashboard index

| What was done | Files |
|---------------|--------|
| Widget uses useUserContext + useQuery for notifications.list(limit 10) | `apps/web/src/components/announcements-widget.tsx` |
| Display: title → topic, createdAt → date, message → description | Same file |
| “Mark all read” calls notifications.markAllRead and invalidates list | Same file |
| States: no org, loading, empty, list | Same file |

**APIs used:** `notifications.list`, `notifications.markAllRead`.

---

## 6. Customers Page – My Profile

**Route:** `/_authenticated/customers`

| What was done | Files |
|---------------|--------|
| “My profile” card: useQuery for customerProfiles.get, display phone, address, emergency, medical notes, notes | `apps/web/src/routes/_authenticated/customers.tsx` |
| “Edit profile” dialog: form for phone, address, emergency name/phone, medical notes, notes; save calls customerProfiles.upsert | Same file |
| Existing customer list placeholder left as-is (no list API) | Same file |

**APIs used:** `customerProfiles.get`, `customerProfiles.upsert`.

---

## Files Created

| File | Purpose |
|------|--------|
| `apps/web/src/lib/appointment-mapper.ts` | Map API appointments to calendar shape; getAppointmentQueryRange(); getTodayRange() |
| `apps/web/src/components/forms/service-category-create-edit-dialog.tsx` | Create/edit service category (name, description, displayOrder, isActive) |
| `apps/web/src/components/forms/service-create-edit-dialog.tsx` | Create/edit service (name, category, duration, maxAttendees, price, scheduling, isActive) |

---

## Files Substantially Changed

| File | Changes |
|------|--------|
| `apps/web/src/routes/_authenticated/service-category/view.tsx` | Mock → useQuery(serviceCategories.list), pass organizationId + data + onSuccess |
| `apps/web/src/routes/_authenticated/service/view.tsx` | Mock → useQuery(services + categories), category map, servicesWithCategoryName |
| `apps/web/src/routes/_authenticated/appointment/view.tsx` | Mock → useQuery(appointments.list), mapper, loading/error |
| `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx` | Mock useEffect → useQuery(appointments.list), mapper, initialView from search |
| `apps/web/src/routes/_authenticated/customers.tsx` | Added My profile card + edit dialog (get/upsert) |
| `apps/web/src/components/tables/service-category/view/columns.tsx` | Replaced with columns matching API (name, description, displayOrder, isActive, createdAt) |
| `apps/web/src/components/tables/service-category/view/data-table.tsx` | Props: organizationId, isLoading, onSuccess; new create/edit dialog; detail + getById + soft-delete |
| `apps/web/src/components/tables/service/view/columns.tsx` | Replaced with columns matching API (name, category, duration, price, schedulingType, isActive, createdAt) |
| `apps/web/src/components/tables/service/view/data-table.tsx` | Props: organizationId, categories, isLoading, onSuccess; new create/edit + detail; getById + soft-delete |
| `apps/web/src/components/forms/service-category-detail-dialog.tsx` | Rewritten: getById with organizationId, display API fields, deactivate = update isActive false |
| `apps/web/src/components/forms/service-detail-dialog.tsx` | Rewritten: getById with organizationId, display API fields, deactivate |
| `apps/web/src/components/appointments-widget.tsx` | Hardcoded list → useQuery(appointments.list today), mapper, loading/empty |
| `apps/web/src/components/announcements-widget.tsx` | Hardcoded list → useQuery(notifications.list), “Mark all read” |

---

## Not Done (Per Plan)

- **Appointment create/update in UI** – Plan listed wiring “Add appointment” and edit/cancel to API; list and display only were implemented. Create modal and update flow can be added later.
- **Customer list** – No “list customers” API; placeholder cards and “Add Customer” remain as-is.
- **Enriching appointment display** – Client name, service name, and assigned-to name still show IDs or placeholders; optional follow-up is to resolve via members/services lookups.

---

## Troubleshooting

### `POST /rpc/serviceCategories/list 400` and "Input validation failed" / "getTenantDb failed"

- **Cause 1 – Mock `org-1` sent to API:** The server expects `organizationId` to be a **UUID**. If the web app sends `"org-1"` (e.g. from mock user context or old localStorage), the API returns 400 "Input validation failed".
  **Fix:** The web app was updated so that mock and non-UUID stored org IDs are not used for API calls (`currentOrganizationId` is set to `null` in those cases). Clear `current_organization_id` from localStorage if it is still `"org-1"`, or sign in and use a real organization so the API returns a UUID.

- **Cause 2 – Control panel DB missing `organizations` table or org row:** When `organizationId` is a valid UUID, the server looks up the organization in the **control panel** database (same DB as `DATABASE_URL`). If you see "Failed query: select ... from organizations", the control panel DB may not have the `organizations` table or the given org row.
  **Fix:** Run control-panel migrations so the `organizations` table exists. Ensure there is at least one organization row whose `id` matches the UUID the frontend sends (from `auth.userContext`). Tenant procedures need that row to resolve the tenant DB connection.

### "Organization ID: None" after running seed and signing in as franchisee

- **What’s happening:** The Branches (and other) pages get `currentOrganizationId` from `auth.userContext`. If that API call fails or returns no organizations, the app uses fallback data and shows **Organization ID: None**.

- **Checks:**
  1. **Confirm you’re signed in as the seeded user**  
     Email must be exactly `franchisee@gmail.com` (the user the seed script creates/links to the org). If the debug section shows a different user email or “demo@avantej.com”, you’re on mock data because the API failed.

  2. **Confirm the seed ran successfully**  
     From repo root: `cd apps/server` then run the seed (with `bun` or `npx tsx`). You should see “Seed completed successfully” and “Organization ID: &lt;uuid&gt;”. Optionally verify membership: `bun run scripts/verify-user-org-relationship.ts` (or `npx tsx scripts/verify-user-org-relationship.ts`).

  3. **Confirm `auth.userContext` returns your org**  
     Open DevTools → Network, reload the app, and find the request to the user-context RPC (e.g. `POST /rpc/auth/userContext` or similar). Check: **Status 200** and response body with `organizations: [{ id: "<uuid>", ... }]`. If you see **401** or **500**, fix the server/session or control-panel DB first.

  4. **Clear cache and refetch**  
     On the Branches page click **Clear Cache & Refresh** (this invalidates the `user-context` query). Then hard-refresh the page. If the API is healthy, the UI should now show the organization UUID. You can also clear localStorage for the app (`current_organization_id`, `user_organizations`) and sign in again so the first load gets a fresh userContext.

- **If the API returns 500:** Check server logs when `auth.userContext` runs. Typical causes: control panel DB unreachable, missing `organization_members` row for the signed-in user, or errors while loading tenant hierarchy (e.g. decrypt or tenant DB connection).

---

## Checklist: What to Check

Use this list when testing the implementation. Tick each item after verifying.

### Service Category View (`/service-category/view`)

- [ ] Page loads without error when user has an organization.
- [ ] Table shows categories from API (name, description, order, status, created).
- [ ] Loading state shows while data is fetching.
- [ ] Empty state shows when there are no categories.
- [ ] "Add" opens create dialog; submitting creates a category and refreshes the list.
- [ ] Edit (from row or detail) opens dialog with current data; save updates and refreshes.
- [ ] View/Detail opens dialog and loads category by ID (name, description, displayOrder, isActive, dates).
- [ ] Deactivate sets category inactive and list refreshes.
- [ ] No-org / error handling shows appropriate message (no crash).

### Service View (`/service/view`)

- [ ] Page loads without error.
- [ ] Table shows services with category names (not raw IDs).
- [ ] Columns show: name, category, duration, price, scheduling, status, created.
- [ ] Loading and empty states work.
- [ ] "Add" opens create dialog; category dropdown is populated; submit creates service and refreshes.
- [ ] Edit loads service by ID and saves updates correctly.
- [ ] Detail dialog loads by ID and shows all API fields.
- [ ] Deactivate soft-deletes and list refreshes.
- [ ] No-org / error handling works.

### Appointment View (standalone and dashboard sub-route)

- [ ] `/appointment/view` loads and shows calendar with appointments from API.
- [ ] `/dashboard/.../appointment/view` loads and shows same (with view from query if present).
- [ ] Calendar displays events with correct start/end and basic info (title, etc.).
- [ ] Loading and error states show; no crash when no org or API error.
- [ ] Date range used for list is sensible (e.g. 3-month window).
- [ ] Clicking date or "Add" does not crash (toast or placeholder is OK).

### Dashboard Appointments Widget

- [ ] Widget shows "today’s" appointments from API (correct date range).
- [ ] Loading state shows while fetching.
- [ ] Empty state shows when there are no appointments today.
- [ ] List shows time, title, client, service, duration, status where available.
- [ ] Click navigates to `/appointment/view?view=weekly` without error.

### Announcements Widget

- [ ] Widget shows notifications from API (topic = title, date = createdAt, description = message).
- [ ] Loading and empty states work.
- [ ] "Mark all read" calls API and list updates (or refetches) without error.
- [ ] No-org / error handling does not crash.

### Customers – My Profile (`/customers`)

- [ ] "My profile" card loads profile via `customerProfiles.get`.
- [ ] Shows phone, address, emergency contact, medical notes, notes (or "No profile yet").
- [ ] "Edit profile" opens dialog with current values.
- [ ] Save calls `customerProfiles.upsert` and card refreshes with new data.
- [ ] Empty/missing profile shows friendly message.
- [ ] No-org / error handling works.

### General

- [ ] Switching organization (if supported) updates data on relevant pages.
- [ ] No console errors or unhandled promise rejections on happy path.
- [ ] Lint/build passes for `apps/web`.

---

## Reference

- Plan: [WEB_PAGES_NEW_APIS_PLAN.md](./WEB_PAGES_NEW_APIS_PLAN.md)
- API implementation details: [API_IMPLEMENTATION_CHANGES.md](./API_IMPLEMENTATION_CHANGES.md)

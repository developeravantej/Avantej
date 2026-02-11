# What Was Done: Applying New APIs to Web Pages

This document summarizes the work completed to wire the newly created oRPC APIs to the web app pages, following [WEB_PAGES_NEW_APIS_PLAN.md](./WEB_PAGES_NEW_APIS_PLAN.md).

---

## Overview

The plan was executed step by step. Each step replaced mock or static data with real API calls using the oRPC client (`client` from `@/utils/orpc`), `useUserContext()` for `organizationId`, and React Query for fetching and cache invalidation.

---

## Step 1: Service Category View

**Route:** `/_authenticated/service-category/view`  
**Files changed/added:**

- **`apps/web/src/routes/_authenticated/service-category/view.tsx`**  
  - Uses `useUserContext()` and `useQuery` to call `client.serviceCategories.list({ organizationId })`.  
  - Passes `categories`, `organizationId`, `isLoading`, and `onSuccess` (refetch) to the data table.  
  - Handles no-org, loading, and error states.

- **`apps/web/src/components/tables/service-category/view/columns.tsx`**  
  - Simplified to match the new API: **Name**, **Description**, **Order** (displayOrder), **Status** (isActive), **Created** (createdAt).  
  - Removed old columns (duration, advance booking, cancellation, incentive, etc.).

- **`apps/web/src/components/forms/service-category-create-edit-dialog.tsx`** (new)  
  - Dialog for create/edit with: Name*, Description, Display order, Active.  
  - Create: `client.serviceCategories.create(...)`; Edit: `client.serviceCategories.update(...)`; then `onSuccess()` and close.

- **`apps/web/src/components/forms/service-category-detail-dialog.tsx`**  
  - Rewritten to accept `organizationId` and `categoryId`.  
  - Fetches with `client.serviceCategories.getById({ organizationId, id: categoryId })`.  
  - Displays: Name, Description, Display order, Status, Created, Updated.  
  - Edit opens the create/edit dialog; **Deactivate** calls `update(..., isActive: false)` (soft-delete).

- **`apps/web/src/components/tables/service-category/view/data-table.tsx`**  
  - Accepts `organizationId`, `isLoading`, `onSuccess`.  
  - Add → create dialog; row click → detail dialog; Edit → `getById` then edit dialog; Deactivate → `client.serviceCategories.update(..., isActive: false)` then `onSuccess()`.

---

## Step 2: Service View

**Route:** `/_authenticated/service/view`  
**Files changed/added:**

- **`apps/web/src/routes/_authenticated/service/view.tsx`**  
  - Fetches `serviceCategories.list` and `services.list`; builds `categoryNameMap` and `servicesWithCategoryName`.  
  - Passes `organizationId`, `categories`, `servicesWithCategoryName`, `isLoading`, `onSuccess` to the data table.

- **`apps/web/src/components/tables/service/view/columns.tsx`**  
  - Aligned with API: Name, Category (service_category_name), Duration (+ unit), Price (cents → USD), Scheduling, Status, Created.

- **`apps/web/src/components/forms/service-create-edit-dialog.tsx`** (new)  
  - Create/edit dialog: Name*, Category (dropdown), Duration + unit, Max attendees*, Price, Scheduling type, Active.  
  - Create/update call `client.services.create` / `client.services.update` with the correct input shape.

- **`apps/web/src/components/forms/service-detail-dialog.tsx`**  
  - Rewritten to accept `organizationId` and `serviceId`; fetches with `client.services.getById`.  
  - Displays API fields; Edit opens create/edit dialog; Deactivate uses `update(..., isActive: false)`.

- **`apps/web/src/components/tables/service/view/data-table.tsx`**  
  - Accepts `organizationId`, `categories`, `isLoading`, `onSuccess`; uses the new create/edit and detail dialogs; edit via `getById`, delete via soft-deactivate.

---

## Step 3: Appointment View (Both Routes)

**Routes:** `/_authenticated/appointment/view` and `/_authenticated/dashboard/_layout/appointment/view`  
**Files changed/added:**

- **`apps/web/src/lib/appointment-mapper.ts`** (new)  
  - `mapApiAppointmentToCalendar(api)` maps API appointment (startTime, endTime, status, userId, trainerId, serviceId, description) to calendar shape (id, title, start, end, status, clientName, service, assignedTo).  
  - Status mapping: completed → confirmed, no-show → cancelled.  
  - `getAppointmentQueryRange()` returns a 3-month window for list query.  
  - `getTodayRange()` for the dashboard widget.

- **`apps/web/src/routes/_authenticated/appointment/view.tsx`**  
  - `useUserContext()` and `useQuery` for `client.appointments.list({ organizationId, startFrom, startTo, limit: 200 })` using `getAppointmentQueryRange()`.  
  - Maps result with `mapApiAppointmentToCalendar` and passes to `AppointmentCalendar`.  
  - Handles no-org, loading, error.

- **`apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`**  
  - Same data flow (list + mapper); removed mock `useEffect`.  
  - Keeps `initialView` from `search.view` (weekly/monthly).  
  - Handlers for date select, appointment click, and add still show toasts (create form not wired to API).

---

## Step 4: Dashboard AppointmentsWidget

**File:** `apps/web/src/components/appointments-widget.tsx`

- Uses `useUserContext()` and `useQuery` for **today’s** appointments: `client.appointments.list({ organizationId, startFrom, startTo, limit: 10 })` with `getTodayRange()` from the mapper.  
- Maps with `mapApiAppointmentToCalendar`.  
- States: no org, loading, empty (“No appointments today”), or list (time, title, client, service, duration, status).  
- Click still navigates to `/appointment/view` with `view: "weekly"`.

**Also:** `getTodayRange()` added to `apps/web/src/lib/appointment-mapper.ts`.

---

## Step 5: AnnouncementsWidget + Customers “My profile”

**AnnouncementsWidget** – `apps/web/src/components/announcements-widget.tsx`

- Uses `useUserContext()` and `useQuery` for `client.notifications.list({ organizationId, limit: 10 })`.  
- Renders each item as: **topic** ← `title`, **date** ← formatted `createdAt`, **description** ← `message`.  
- “Mark all read” calls `client.notifications.markAllRead({ organizationId })` and invalidates the list.  
- Handles no org, loading, empty.

**Customers page** – `apps/web/src/routes/_authenticated/customers.tsx`

- **My profile** section added: `useQuery` for `client.customerProfiles.get({ organizationId })`; displays phone, address, emergency contact, medical notes, notes (or empty state).  
- **Edit profile** opens a dialog with form fields; **Save** calls `client.customerProfiles.upsert({ organizationId, phone, address, emergencyContactName, emergencyContactPhone, medicalNotes, notes })` and invalidates the profile query.  
- Existing “Customer Management” placeholder list left as-is (no “list customers” API).

---

## Conventions Used

- **Organization:** `organizationId` from `useUserContext()` (`data?.currentOrganizationId`).  
- **Client:** `client` from `@/utils/orpc`; procedures called as `client.<router>.<procedure>(input)`.  
- **React Query:** `useQuery` for list/get; `useMutation` for create/update; invalidate relevant queries on success.  
- **Loading/error:** Each page or widget handles loading and error (inline message or empty state).  
- **Soft delete:** Where the API has no delete procedure, “Deactivate” uses `update(..., isActive: false)`.

---

## Not Done (Deferred / Optional)

- **Appointment create:** “Add appointment” in the calendar still shows a toast; no modal wired to `client.appointments.create` (would need branchId, sessionTotal, pricePerClient, etc.).  
- **Customer list:** “Customer Management” list remains placeholder; `customerProfiles` is only get/upsert for the current user.  
- **Enriching calendar events:** Client name, service name, and assigned-to name could be resolved from userId, serviceId, trainerId (e.g. via members/services APIs) instead of showing truncated IDs in the mapper.

---

## Reference

- Plan: [WEB_PAGES_NEW_APIS_PLAN.md](./WEB_PAGES_NEW_APIS_PLAN.md)  
- API implementation details: [API_IMPLEMENTATION_CHANGES.md](./API_IMPLEMENTATION_CHANGES.md)

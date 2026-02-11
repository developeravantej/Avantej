# Web App: New APIs Implementation Summary

This document summarizes what was done to wire the web app (`apps/web`) to the newly created oRPC APIs, following [WEB_PAGES_NEW_APIS_PLAN.md](./WEB_PAGES_NEW_APIS_PLAN.md).

---

## Overview

- **Reference plan:** `new md/WEB_PAGES_NEW_APIS_PLAN.md`
- **API reference:** `new md/API_IMPLEMENTATION_CHANGES.md`
- **Scope:** Service categories, services, appointments, dashboard widgets (appointments, announcements), and customer profile (My profile) on the Customers page.
- **Conventions used:** `useUserContext()` for `organizationId`, `client` from `@/utils/orpc`, React Query (`useQuery` / `useMutation`) with invalidation on success.

---

## 1. Service Category View

**Route:** `/_authenticated/service-category/view`  
**Files changed/added:**

- **`apps/web/src/routes/_authenticated/service-category/view.tsx`**  
  - Uses `useUserContext()` and `useQuery` with `client.serviceCategories.list({ organizationId })`. Passes `categories`, `organizationId`, `isLoading`, and `onSuccess` (refetch) to the data table.

- **`apps/web/src/components/tables/service-category/view/columns.tsx`**  
  - Replaced with columns matching the new API: Name, Description, Order (displayOrder), Status (isActive), Created (createdAt). Removed old incentive/booking columns.

- **`apps/web/src/components/forms/service-category-create-edit-dialog.tsx`** (new)  
  - Dialog for create/edit: Name*, Description, Display order, Active. Calls `serviceCategories.create` or `serviceCategories.update`; on success runs `onSuccess()` and closes.

- **`apps/web/src/components/forms/service-category-detail-dialog.tsx`**  
  - Rewritten to accept `organizationId` and `categoryId`. Fetches with `client.serviceCategories.getById({ organizationId, id: categoryId })`. Displays name, description, displayOrder, isActive, createdAt, updatedAt. Edit opens create/edit dialog; “Deactivate” calls `update(..., isActive: false)` (soft-delete).

- **`apps/web/src/components/tables/service-category/view/data-table.tsx`**  
  - Accepts `organizationId`, `isLoading`, `onSuccess`. Uses the new create/edit and detail dialogs. Add → create dialog; row click → detail (getById); Edit → getById then edit dialog; Deactivate → `serviceCategories.update(..., isActive: false)` then `onSuccess()`.

---

## 2. Service View

**Route:** `/_authenticated/service/view`  
**Files changed/added:**

- **`apps/web/src/routes/_authenticated/service/view.tsx`**  
  - Fetches `serviceCategories.list` and `services.list`. Builds `categoryNameMap` and `servicesWithCategoryName` (each service gets `service_category_name`). Passes `organizationId`, `categories`, `servicesWithCategoryName`, `isLoading`, `onSuccess` to the data table.

- **`apps/web/src/components/tables/service/view/columns.tsx`**  
  - Replaced with API-aligned columns: Name, Category (service_category_name), Duration (+ unit), Price (cents → USD), Scheduling, Status (isActive), Created.

- **`apps/web/src/components/forms/service-create-edit-dialog.tsx`** (new)  
  - Create/edit dialog: Name*, Category (dropdown), Duration + unit, Max attendees*, Price (USD), Scheduling type, Active. Calls `services.create` or `services.update`; invalidates list on success.

- **`apps/web/src/components/forms/service-detail-dialog.tsx`**  
  - Rewritten to accept `organizationId` and `serviceId`. Fetches with `client.services.getById({ organizationId, id: serviceId })`. Displays name, description, duration, maxAttendees, price, schedulingType, isActive, createdAt, updatedAt. Edit opens create/edit dialog; “Deactivate” soft-deletes via `update(..., isActive: false)`.

- **`apps/web/src/components/tables/service/view/data-table.tsx`**  
  - Accepts `organizationId`, `categories`, `isLoading`, `onSuccess`. Uses the new create/edit and detail dialogs. Edit loads service via `getById` then opens edit dialog; Deactivate calls `services.update(..., isActive: false)`.

---

## 3. Appointment View (both routes)

**Routes:** `/_authenticated/appointment/view` and `/_authenticated/dashboard/_layout/appointment/view`  
**Files changed/added:**

- **`apps/web/src/lib/appointment-mapper.ts`** (new)  
  - `mapApiAppointmentToCalendar(api)`: maps API appointment (startTime, endTime, status, userId, trainerId, serviceId, description) to calendar shape (id, title, start, end, status, clientName, service, assignedTo). Status mapping: completed → confirmed, no-show → cancelled.  
  - `getAppointmentQueryRange()`: 3-month window for list query.  
  - `getTodayRange()`: today 00:00–23:59 for dashboard widget.

- **`apps/web/src/routes/_authenticated/appointment/view.tsx`**  
  - Uses `useUserContext()` and `useQuery` with `client.appointments.list({ organizationId, startFrom, startTo, limit: 200 })` (range from `getAppointmentQueryRange()`). Maps result with `mapApiAppointmentToCalendar` and passes to `AppointmentCalendar`. Handles no-org, loading, error.

- **`apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`**  
  - Same data flow as above. Removed mock `useEffect`. Keeps `initialView` from `search.view` (weekly/monthly). Handlers (date select, appointment click, add) left as toasts; create appointment not wired to API in this pass.

---

## 4. Dashboard AppointmentsWidget

**File:** `apps/web/src/components/appointments-widget.tsx`  

- Uses `useUserContext()` and `useQuery` for today’s appointments: `client.appointments.list({ organizationId, startFrom, startTo, limit: 10 })` with `getTodayRange()` from `appointment-mapper`.  
- Maps with `mapApiAppointmentToCalendar`.  
- States: no org (“Select an organization…”), loading (“Loading…”), empty (calendar icon + “No appointments today”), data (existing list UI).  
- Click still navigates to `/appointment/view` with `search: { view: "weekly" }`.

---

## 5. AnnouncementsWidget (notifications)

**File:** `apps/web/src/components/announcements-widget.tsx`  

- Uses `useUserContext()` and `useQuery` for `client.notifications.list({ organizationId, limit: 10 })`.  
- Renders each item as: title (topic), formatted createdAt (date), message (description).  
- “Mark all read” calls `client.notifications.markAllRead({ organizationId })` and invalidates the notifications query.  
- Handles no org, loading, empty list.

---

## 6. Customers Page – My Profile

**File:** `apps/web/src/routes/_authenticated/customers.tsx`  

- **My profile card:** `useQuery` for `client.customerProfiles.get({ organizationId })`. Displays phone, address, emergency contact, medical notes, notes (or “No profile yet” / “No profile details yet”). “Edit profile” opens a dialog.  
- **Edit dialog:** Fields: Phone, Address, Emergency contact name/phone, Medical notes, Notes. Save calls `client.customerProfiles.upsert({ organizationId, ... })`, invalidates profile query, toasts success.  
- Existing “Customer Management” placeholder list and “Add Customer” button left as-is (no list-customers API).

---

## What was not done (per plan)

- **Appointment create:** “Add appointment” on the calendar still shows a toast; no modal wired to `appointments.create`.  
- **User View:** Still uses mock users; would need existing members API, not the new APIs.  
- **Customer list:** No “list customers” in new APIs; customer list on Customers page remains placeholder.

---

## Shared patterns

- **Organization:** `const { data: userContext } = useUserContext(); const organizationId = userContext?.currentOrganizationId ?? null`.  
- **oRPC client:** `client` from `@/utils/orpc`; procedures called as `client.<router>.<procedure>(input)`.  
- **Refetch:** List/get queries invalidated (or `refetch` passed as `onSuccess`) after create/update/delete.  
- **Soft delete:** Where API has no delete, deactivate is implemented as `update(..., isActive: false)` for categories and services.

# Plan: Apply New APIs to Web App Pages

This document audits each page (and relevant widgets) in `apps/web` against the newly created oRPC APIs and provides a step-by-step plan to wire them. Reference: [API_IMPLEMENTATION_CHANGES.md](./API_IMPLEMENTATION_CHANGES.md).

---

## New APIs Reference (oRPC)

| Router | Procedures | Typical use |
|--------|------------|-------------|
| `serviceCategories` | `list`, `getById`, `create`, `update` | Service category CRUD |
| `services` | `list`, `getById`, `create`, `update` | Service CRUD |
| `appointments` | `list`, `listForUser`, `getById`, `create`, `update` | Staff calendar / client calendar |
| `packages` | `list`, `getById` | Package catalog |
| `packageInstances` | `listForClient`, `getActiveForClient`, `getById`, `create` | Client packages / purchases |
| `preferredTimes` | `list`, `upsert` | Client preferred times |
| `notifications` | `list`, `getUnreadCount`, `markRead`, `markAllRead` | In-app notifications |
| `notificationPreferences` | `get`, `update` | User notification settings |
| `customerProfiles` | `get`, `upsert` | Current user profile (customer fields) |
| `userActivityLog` | `list` | Recent activity for current user |

All tenant procedures require `organizationId` (from `useUserContext()` or equivalent). Use the oRPC client from `@/utils/orpc` (`orpc` or `client`).

---

## Page-by-Page Audit and Plan

### 1. Service Category View  
**Route:** `/_authenticated/service-category/view`  
**File:** `apps/web/src/routes/_authenticated/service-category/view.tsx`

| Current state | New API to use |
|---------------|----------------|
| Mock array `mockCategories` | `serviceCategories.list`, `getById`, `create`, `update` |

**Steps:**

1. In the route component, get `organizationId` from `useUserContext()` (e.g. `userContext?.currentOrganizationId`). If missing, show empty state or redirect.
2. Replace mock data with a `useQuery` that calls `client.serviceCategories.list({ organizationId, isActive: true })` (optional: `branchId` for filtering).
3. Pass real list into `<DataTable columns={columns} data={categories} />`. Handle loading and error states.
4. In `ServiceCategoryDetailDialog` and `ServiceCategoryForm` (used by the service-category data table): when opening for view/edit, call `client.serviceCategories.getById({ organizationId, id: categoryId })` to load a single category.
5. On create: call `client.serviceCategories.create({ organizationId, name, description, displayOrder, branchId, isActive })`; invalidate the list query on success.
6. On update: call `client.serviceCategories.update({ organizationId, id, name?, description?, displayOrder?, branchId?, isActive? })`; invalidate list (and getById) on success.
7. If the UI supports “delete,” note: the new API has no delete procedure; either add a soft-delete via `update(..., isActive: false)` or keep delete as future work.
8. Ensure table columns match API response shape: `id`, `name`, `description`, `displayOrder`, `branchId`, `isActive`, `createdAt`, `updatedAt`. Add `service_count` from a separate count if needed (e.g. from services list filtered by categoryId) or from a future API.

---

### 2. Service View  
**Route:** `/_authenticated/service/view`  
**File:** `apps/web/src/routes/_authenticated/service/view.tsx`

| Current state | New API to use |
|---------------|----------------|
| Mock array `mockServices` | `services.list`, `getById`, `create`, `update` |

**Steps:**

1. Get `organizationId` from `useUserContext()`.
2. Replace mock with `useQuery` → `client.services.list({ organizationId, isActive: true })`. Optional filters: `categoryId`, `branchId`, `type`, `schedulingType`.
3. Pass result to `<DataTable columns={columns} data={services} />`. Handle loading/error.
4. In service detail/edit dialogs (e.g. `ServiceDetailDialog`, `ServiceForm`): load one with `client.services.getById({ organizationId, id })`.
5. On create: call `client.services.create`. Required: `organizationId`, `name`, `duration`, `maxAttendees`. Optional: `categoryId`, `durationUnitType`, `attendanceThreshold`, `branchId`, `isActive`, `title`, `description`, `imageUrl`, `type`, `price`, `priceUnit`, `taxable`, `taxPercentage`, `isRecommended`, `location`, `features`, `schedulingType`. Invalidate list on success.
6. On update: call `client.services.update` with `organizationId`, `id`, and any of the same optional fields; invalidate list and getById on success.
7. Map API response to table columns. API returns `categoryId` (not category name); table columns may expect `service_category_name`—resolve via `serviceCategories.list` or `getById(categoryId)`. API uses `durationUnitType` (e.g. "minutes"), `price` (number, cents). Align or adapt column keys: `id`, `name`, `categoryId`, `duration`, `durationUnitType`, `price`, `schedulingType`, etc.

---

### 3. Appointment View (standalone)  
**Route:** `/_authenticated/appointment/view`  
**File:** `apps/web/src/routes/_authenticated/appointment/view.tsx`

| Current state | New API to use |
|---------------|----------------|
| Mock array `mockAppointments` | `appointments.list` (staff) or `appointments.listForUser` (client) |

**Steps:**

1. Get `organizationId` from `useUserContext()`. Decide if this route is staff or client view (e.g. by permission or role).
2. **Staff:** Use `client.appointments.list({ organizationId, startFrom, startTo, branchId?, status?, limit })` for the visible date range. **Client:** Use `client.appointments.listForUser({ organizationId, startFrom, startTo, status?, limit })`. Pass `startFrom`/`startTo` as ISO 8601 datetime strings (e.g. start of month and end of month for monthly view).
3. Replace mock with `useQuery`; pass fetched list to `<AppointmentCalendar appointments={...} />`.
4. Map API response to the shape expected by `AppointmentCalendar`: e.g. `id`, `title`, `start`, `end`, `status`, `clientName`, `service`, `assignedTo`. API returns DB fields: `startTime`, `endTime`, `userId` (client), `trainerId` (assigned staff/member id), `serviceId`, `description`. Add a small mapper: `start` ← `startTime`, `end` ← `endTime`; enrich `title`/`service` from service name (e.g. services.getById or list); `clientName` from `userId` (user lookup); `assignedTo` from `trainerId` (members lookup or context).
5. When user clicks “Add appointment,” open a modal/form that calls `client.appointments.create`. Required input: `organizationId`, `type` ("private" | "semi-private"), `startTime` (ISO string), `duration` (minutes), `branchId`, `sessionTotal`, `pricePerClient`. Optional: `serviceId`, `status`, `userId` (client), `trainerId`, `packageInstanceId`, `creditsUsed`, `location`, `classSlotId`, `description`, `imageUrl`, `notes`, `bookingNumber`. Invalidate list on success.
6. When user edits/cancels, call `client.appointments.update({ organizationId, id, status?, startTime?, duration?, trainerId?, location?, notes?, cancelledAt?, cancellationReason?, ... })`; invalidate list on success.
7. Handle loading and error states; optional: refetch when date range changes (e.g. when switching month/week).

---

### 4. Dashboard Appointment View (under layout)  
**Route:** `/_authenticated/dashboard/_layout/appointment/view`  
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`

| Current state | New API to use |
|---------------|----------------|
| Local state + mock array built in `useEffect` | Same as #3: `appointments.list` or `appointments.listForUser` |

**Steps:**

1. Get `organizationId` from `useUserContext()`.
2. Replace the mock `useEffect` with a single `useQuery` for appointments (staff: `appointments.list`, client: `appointments.listForUser`) with `startFrom`/`startTo` derived from the current view (e.g. from `search.view` or visible date range).
3. Pass query result to `<AppointmentCalendar appointments={...} />` and remove the mock array and the 800ms delay.
4. Wire `handleAddAppointment` to open a create-appointment form that uses `client.appointments.create` with the same required/optional input as in section 3 (step 5); wire `handleAppointmentClick` to detail/edit using `client.appointments.getById` and `client.appointments.update`.
5. Map API response to calendar event shape (same as section 3, step 4: startTime/endTime → start/end, userId→clientName, trainerId→assignedTo, serviceId→service/title). Invalidate query on create/update.

---

### 5. Dashboard Index (widgets)  
**Route:** `/_authenticated/dashboard/_layout/` (index)  
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx`

| Widget | Current state | New API to use |
|--------|----------------|----------------|
| AppointmentsWidget | Hardcoded `appointments` array | `appointments.list` or `appointments.listForUser` (e.g. today only) |
| AnnouncementsWidget | Hardcoded `announcements` array | Optional: `notifications.list` (treat as in-app announcements) or leave mock until backend has announcements |
| TeamDashboard / SingleTeamDashboard / Payroll / Claims | Mock/static data | No new API; leave as-is or plan separately |

**Steps for AppointmentsWidget:**

1. In `AppointmentsWidget` (or the dashboard page), get `organizationId` from `useUserContext()` and pass it in or read it inside the widget.
2. Add a `useQuery` for today’s appointments: e.g. `client.appointments.list({ organizationId, startFrom: startOfToday.toISOString(), startTo: endOfToday.toISOString(), limit: 10 })` or `listForUser` for client view.
3. Replace the hardcoded `appointments` array with the query result. Handle loading (skeleton) and empty state.
4. Keep “View all” navigating to `/dashboard/appointment/view` or `/appointment/view`.

**Steps for AnnouncementsWidget (optional):**

5. If the product treats “Announcements” as in-app notifications: call `client.notifications.list({ organizationId, limit: 10 })` and optionally `getUnreadCount`; display items and optionally “Mark all read” via `markAllRead`. Map notification fields from API/schema: `title`, `message` (not `body`), `createdAt`, `type`, `isRead`. Map to the widget’s topic/date/description (e.g. topic ← title, date ← createdAt, description ← message). If there is no notifications type for “announcements,” leave widget as mock until backend supports it.

**No change (for now):**

6. TeamDashboard, SingleTeamDashboard, PayrollWidget, ClaimsWidget: no matching new API; keep mock/static data unless another spec defines their data source.

---

### 6. Customers Page  
**Route:** `/_authenticated/customers`  
**File:** `apps/web/src/routes/_authenticated/customers.tsx`

| Current state | New API to use |
|---------------|----------------|
| Static sample customer cards | No direct “list customers” in new APIs. `customerProfiles` is get/upsert for the **current user** only. |

**Steps:**

1. **Option A (current user profile only):** Add a section “My profile” that uses `client.customerProfiles.get({ organizationId })` (returns profile or null for current user) and `client.customerProfiles.upsert({ organizationId, phone?, dateOfBirth?, gender?, address?, emergencyContactName?, emergencyContactPhone?, medicalNotes?, fitnessGoals?, creditPoints?, notes? })` for the logged-in user. Keep the “customer list” as placeholder or mock until a “list customers” or “list members as customers” API exists.
2. **Option B (defer list):** Keep the page as-is with static cards and a TODO to replace with a future “customers” or “members” list API. Document in this plan that `customerProfiles` is available for “my profile” only.
3. If “Add Customer” is implemented later, it may map to inviting a user or creating a member/customer record; that is outside the current new API set.

---

### 7. Branch View  
**Route:** `/_authenticated/dashboard/_layout/branch/view`  
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`

| Current state | New API to use |
|---------------|----------------|
| Already uses `client.hierarchy.listNodes`, `updateNode`, `moveNode`, `deleteNode` | None of the **new** APIs; hierarchy is existing. |

**Steps:**

1. No change required for the new APIs. Branch view is already wired to the hierarchy API. Optionally, if the branch view ever shows “services offered at this branch,” you could add a call to `services.list({ organizationId, branchId })` for that branch; document as an optional enhancement.

---

### 8. Access Control – Invitations  
**Route:** `/_authenticated/dashboard/_layout/access-control/invitations`  
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/invitations.tsx`  
**Component:** `InvitationsPage` in `apps/web/src/components/invitations/invitations-page.tsx`

| Current state | New API to use |
|---------------|----------------|
| Already uses `client.invitations.list`, `revoke`, `resend`, `sendEmail` | None; invitations are existing API. |

**Steps:**

1. No change for new APIs. Invitations page is already connected to the existing invitations oRPC procedures.

---

### 9. Access Control – Roles  
**Route:** `/_authenticated/dashboard/_layout/access-control/roles`  
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/roles.tsx`  
*(There is also a separate Role View data table at `/_authenticated/dashboard/_layout/role/view` in `role/view.tsx`; it likewise uses existing RBAC, not new APIs.)*

| Current state | New API to use |
|---------------|----------------|
| Uses RBAC/roles from existing APIs (e.g. hierarchy, members, permissions) | No new API in the list for roles. |

**Steps:**

1. No change. Roles/permissions are handled by existing auth and tenant APIs, not by the new service/appointment/notification/customer-profile APIs.

---

### 10. Access Control – Permissions  
**Route:** `/_authenticated/dashboard/_layout/access-control/permissions.tsx`

| Current state | New API to use |
|---------------|----------------|
| Mock `MOCK_RESOURCES` for permission matrix UI | No new API for permission definitions. |

**Steps:**

1. No change for new APIs. Permission matrix is driven by existing RBAC; keep or replace mock resources per existing spec only.

---

### 11. Access Control – User Assignment  
**Route:** `/_authenticated/dashboard/_layout/access-control/user-assignment.tsx`

| Current state | New API to use |
|---------------|----------------|
| Likely uses members/hierarchy for assignment | No new API in the list. |

**Steps:**

1. No change. User assignment uses existing members/hierarchy APIs.

---

### 12. User View  
**Route:** `/_authenticated/user/view`  
**File:** `apps/web/src/routes/_authenticated/user/view.tsx`

| Current state | New API to use |
|---------------|----------------|
| Mock `mockUsers` | No “users list” in the new APIs; user/member list is from existing members/auth. |

**Steps:**

1. No change for the **new** APIs. To replace mock with real data, use the existing members/organization APIs (e.g. members list) as per project conventions; the new APIs do not add a “list users” procedure.

---

### 13. Onboarding  
**Route:** `/_authenticated/onboarding`  
**File:** `apps/web/src/routes/_authenticated/onboarding.tsx`

| Current state | New API to use |
|---------------|----------------|
| Org creation / onboarding flow | None of the new APIs. |

**Steps:**

1. No change. Onboarding uses existing org/auth flows.

---

### 14. Public / Auth Routes  
**Routes:** `index`, `login`, `signup`, `verify-email`, `accept-invitation`

| Current state | New API to use |
|---------------|----------------|
| Auth and redirects | None. |

**Steps:**

1. No change. These do not consume tenant-scoped CRUD from the new APIs.

---

## Implementation Order (Suggested)

1. **Service Category View** – Single list + CRUD; good first step and unlocks service view (categoryId).
2. **Service View** – List + CRUD; depends on categories for dropdowns.
3. **Appointment View (both)** – List + create/update; shared mapping and calendar component.
4. **Dashboard AppointmentsWidget** – Reuse same appointments API with today’s range.
5. **AnnouncementsWidget** – Optional: notifications.list if product treats announcements as notifications.
6. **Customers** – Optional: customerProfiles get/upsert for “My profile” only; defer list until API exists.

---

## Shared Conventions

- **Organization context:** Use `useUserContext()` (returns `{ data, isLoading, error }`); get `organizationId` from `data?.currentOrganizationId` (e.g. `const { data: userContext } = useUserContext(); const organizationId = userContext?.currentOrganizationId`). If no organization, show empty state or redirect to onboarding/dashboard.
- **oRPC client:** Use `client` (or `orpc`) from `@/utils/orpc`. All procedures are called as `client.<router>.<procedure>(input)`.
- **React Query:** Use `useQuery` for list/get and `useMutation` for create/update; invalidate list (and getById) queries on mutation success.
- **Loading/error:** Every page that fetches data should handle loading and error (toast or inline message); tables can show skeleton or “No data.”
- **Mapping:** Map API response fields to the shapes expected by existing table/calendar components (e.g. `start`/`end` from `startTime`/`endTime`, or join service name for display).

---

## Summary Table

| Page / widget | Uses new API? | Procedures to use |
|--------------|----------------|--------------------|
| Service Category View | Yes | serviceCategories.list, getById, create, update |
| Service View | Yes | services.list, getById, create, update |
| Appointment View (both) | Yes | appointments.list or listForUser, getById, create, update |
| Dashboard index – AppointmentsWidget | Yes | appointments.list or listForUser (today) |
| Dashboard index – AnnouncementsWidget | Optional | notifications.list, getUnreadCount, markRead/markAllRead |
| Dashboard index – Team/Payroll/Claims | No | — |
| Customers | Optional (profile only) | customerProfiles.get, customerProfiles.upsert |
| Branch View | No (existing hierarchy) | — |
| Access Control (invitations/roles/permissions/user-assignment) | No | — |
| User View | No (use existing members) | — |
| Onboarding / Auth routes | No | — |

This plan is ready to be executed step by step; start with Service Category View, then Service View, then Appointments, then dashboard widgets and optional items.

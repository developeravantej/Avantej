# API Implementation Changes

**Date**: Implementation of [PLAN_NEW_APIS.md](./PLAN_NEW_APIS.md)  
**Purpose**: Document all files added and modified when implementing the new APIs (services & categories, appointments, packages & package instances & preferred times, notifications & preferences & customer profiles & user activity log).

---

## Summary

- **New service files**: 10 (in `packages/services/src/`)
- **New router files**: 10 (in `packages/api/src/routers/`)
- **Modified files**: 2 (`packages/services/src/index.ts`, `packages/api/src/routers/index.ts`)

All new APIs follow the existing format: oRPC procedures with Zod input, `protectedProcedure`, `context.tenantDb` / `context.member`, `requirePermission` where applicable, and services in `packages/services` that use Drizzle against `packages/db` schema.

---

## 1. New Service Files (`packages/services/src/`)

| File | Description |
|------|-------------|
| `service-category.service.ts` | `listServiceCategories`, `getServiceCategoryById`, `createServiceCategory`, `updateServiceCategory`. Branch/accessible-node scoping. |
| `service.service.ts` | `listServices`, `getServiceById`, `createService`, `updateService`. Category, branch, type, schedulingType, accessible-node scoping. |
| `appointment.service.ts` | `listAppointments`, `listAppointmentsForUser`, `getAppointmentById`, `createAppointment`, `updateAppointment`. endTime from startTime + duration. |
| `package.service.ts` | `listPackages`, `getPackageById`. Branch, appointmentType, isArchived, accessible-node scoping. |
| `package-instance.service.ts` | `listPackageInstancesForClient`, `getPackageInstanceById`, `createPackageInstance`. Client-scoped list/create. |
| `preferred-time.service.ts` | `listPreferredTimes`, `upsertPreferredTimes`. Max 4 preferred times per package instance. |
| `notification.service.ts` | `listNotifications`, `getUnreadCount`, `markNotificationRead`, `markAllNotificationsRead`. User-scoped. |
| `notification-preference.service.ts` | `getNotificationPreferences`, `upsertNotificationPreferences`. User-scoped get/upsert. |
| `customer-profile.service.ts` | `getCustomerProfile`, `upsertCustomerProfile`. User-scoped get/upsert. |
| `user-activity-log.service.ts` | `listUserActivityLog`. User-scoped list for “Recent Activity”. |

---

## 2. New Router Files (`packages/api/src/routers/`)

| File | Procedures | Permission / scope |
|------|------------|---------------------|
| `service-categories.ts` | `list`, `getById`, `create`, `update` | `service_management:read/create/update`; branch access via `accessibleNodeIds`. |
| `services.ts` | `list`, `getById`, `create`, `update` | `service_management:read/create/update`; branch access. |
| `appointments.ts` | `list`, `listForUser`, `getById`, `create`, `update` | `appointment_management:read/create/update` for staff; `listForUser`/getById by session user; client can cancel. |
| `packages.ts` | `list`, `getById` | `service_management:read`; branch access. |
| `package-instances.ts` | `listForClient`, `getActiveForClient`, `getById`, `create` | Session user for client list/getActive; `service_management:create` for create; staff read for getById. |
| `preferred-times.ts` | `list`, `upsert` | Client or staff; staff uses `service_management:update` for upsert. |
| `notifications.ts` | `list`, `getUnreadCount`, `markRead`, `markAllRead` | Session user only. |
| `notification-preferences.ts` | `get`, `update` | Session user only. |
| `customer-profiles.ts` | `get`, `upsert` | Session user only. |
| `user-activity-log.ts` | `list` | Session user only. |

---

## 3. Modified Files

### `packages/services/src/index.ts`

**Added exports:**

- **Service categories**: `listServiceCategories`, `getServiceCategoryById`, `createServiceCategory`, `updateServiceCategory`, `ListServiceCategoriesParams`, `CreateServiceCategoryParams`, `UpdateServiceCategoryParams`
- **Services**: `listServices`, `getServiceById`, `createService`, `updateService`, `ListServicesParams`, `CreateServiceParams`, `UpdateServiceParams`
- **Appointments**: `listAppointments`, `listAppointmentsForUser`, `getAppointmentById`, `createAppointment`, `updateAppointment`, `ListAppointmentsParams`, `ListAppointmentsForUserParams`, `CreateAppointmentParams`, `UpdateAppointmentParams`
- **Packages**: `listPackages`, `getPackageById`, `ListPackagesParams`
- **Package instances**: `listPackageInstancesForClient`, `getPackageInstanceById`, `createPackageInstance`, `ListPackageInstancesForClientParams`, `CreatePackageInstanceParams`
- **Preferred times**: `listPreferredTimes`, `upsertPreferredTimes`, `PreferredTimeInput`
- **Notifications**: `listNotifications`, `getUnreadCount`, `markNotificationRead`, `markAllNotificationsRead`, `ListNotificationsParams`
- **Notification preferences**: `getNotificationPreferences`, `upsertNotificationPreferences`, `UpsertNotificationPreferencesParams`
- **Customer profiles**: `getCustomerProfile`, `upsertCustomerProfile`, `UpsertCustomerProfileParams`
- **User activity log**: `listUserActivityLog`, `ListUserActivityLogParams`

### `packages/api/src/routers/index.ts`

**Added imports:**

- `appointmentsRouter` from `./appointments`
- `customerProfilesRouter` from `./customer-profiles`
- `notificationPreferencesRouter` from `./notification-preferences`
- `notificationsRouter` from `./notifications`
- `packageInstancesRouter` from `./package-instances`
- `packagesRouter` from `./packages`
- `preferredTimesRouter` from `./preferred-times`
- `serviceCategoriesRouter` from `./service-categories`
- `servicesRouter` from `./services`
- `userActivityLogRouter` from `./user-activity-log`

**Added to `baseRouter`:**

- `serviceCategories: serviceCategoriesRouter`
- `services: servicesRouter`
- `appointments: appointmentsRouter`
- `packages: packagesRouter`
- `packageInstances: packageInstancesRouter`
- `preferredTimes: preferredTimesRouter`
- `notifications: notificationsRouter`
- `notificationPreferences: notificationPreferencesRouter`
- `customerProfiles: customerProfilesRouter`
- `userActivityLog: userActivityLogRouter`

---

## 4. API Surface (oRPC procedure names)

Clients (web/native) call these via the oRPC client (e.g. `orpc.serviceCategories.list`, `orpc.appointments.listForUser`). All tenant procedures require `organizationId` in input so that `orpcTenantMiddleware` can set `tenantDb`.

| Router | Procedures |
|--------|------------|
| `serviceCategories` | `list`, `getById`, `create`, `update` |
| `services` | `list`, `getById`, `create`, `update` |
| `appointments` | `list`, `listForUser`, `getById`, `create`, `update` |
| `packages` | `list`, `getById` |
| `packageInstances` | `listForClient`, `getActiveForClient`, `getById`, `create` |
| `preferredTimes` | `list`, `upsert` |
| `notifications` | `list`, `getUnreadCount`, `markRead`, `markAllRead` |
| `notificationPreferences` | `get`, `update` |
| `customerProfiles` | `get`, `upsert` |
| `userActivityLog` | `list` |

---

## 5. Database Tables Used

All new code reads/writes only to existing tenant schema; no new tables or migrations were added.

- **Service categories**: `service_categories`
- **Services**: `services`
- **Appointments**: `appointments`
- **Packages**: `packages`
- **Package instances**: `package_instances`
- **Preferred times**: `preferred_times`
- **Notifications**: `notifications`
- **Notification preferences**: `notification_preferences`
- **Customer profiles**: `customer_profiles`
- **User activity log**: `user_activity_log`

Schema reference: [SERVER_SCHEMA_FINAL_V2.0.md](./SERVER_SCHEMA_FINAL_V2.0.md).

---

## 6. Related Docs

- [PLAN_NEW_APIS.md](./PLAN_NEW_APIS.md) – Plan and conventions for creating new APIs
- [API_AND_DATABASE_POPULATION.md](./API_AND_DATABASE_POPULATION.md) – How APIs populate the database
- [APPS_OVERVIEW.md](./APPS_OVERVIEW.md) – Native app features that consume these APIs
- [WEB_OVERVIEW.md](./WEB_OVERVIEW.md) – Web app features that consume these APIs

# Plan: Creating New APIs to Populate the Database

**Source of truth**: The codebase (`packages/db`, `packages/api`, `packages/services`, `apps/server`).  
**Schema reference**: [SERVER_SCHEMA_FINAL_V2.0.md](./SERVER_SCHEMA_FINAL_V2.0.md) — use it for table/column names, types, and relationships; implement only what exists in the codebase schema.  
**Feature context**: [APPS_OVERVIEW.md](./APPS_OVERVIEW.md) (native app) and [WEB_OVERVIEW.md](./WEB_OVERVIEW.md) (web app) describe the functions and features that consume these APIs.

This document describes the **existing API format** and a **step-by-step plan** to add new APIs that follow it and populate the database correctly.

---

## 1. Existing API Format Summary

### 1.1 Two API Styles

| Style | When to use | Entry | DB access | Validation |
|-------|-------------|--------|-----------|------------|
| **oRPC (RPC + OpenAPI)** | Tenant-scoped CRUD, hierarchy, members, invitations, most app features | `packages/api` routers → `/rpc/*`, `/api-reference/*` | `context.tenantDb` (and optionally control panel via `context.honoContext`) | Zod `.input(z.object({ ... }))` |
| **Hono REST** | Auth, org lifecycle, webhooks, control-panel-only, or one-off flows | `apps/server/src/routes/*.ts` | `getControlPanelDb(c)` or `getTenantDb(organizationId, c)` | Ad-hoc in handler (recommended: add Zod for bodies) |

- **Control Panel** data (users, organizations, subscriptions, organization_members, etc.) → use **Hono routes** and `getControlPanelDb(c)`, or oRPC with `context.honoContext.get("controlPanelDb")` when already in oRPC.
- **Tenant** data (hierarchy_nodes, members, invitations, services, appointments, package_instances, etc.) → use **oRPC** and `context.tenantDb`; add a **service** in `packages/services` that accepts `tenantDb` and performs Drizzle writes.

### 1.2 Request Flow (Codebase as Reference)

**oRPC (tenant data):**

```
Client (web/native) → /rpc/* or /api-reference/*
  → dbMiddleware (request-scoped pools)
  → orpcTenantMiddleware (sets tenantDb, organizationId from input/header)
  → createContext (session, tenantDb, member, accessibleNodeIds)
  → Procedure handler (protectedProcedure / publicProcedure)
      → .input(Zod) validated
      → Check context.tenantDb, context.member
      → requirePermission(tenantDb, member, resource, action) when needed
      → Call packages/services function(tenantDb, params)
  → Service uses Drizzle on tenantDb (packages/db schema)
  → Return result
```

**Hono REST:**

```
Client → e.g. POST /orgs, /auth/*, /webhooks/*
  → dbMiddleware
  → authMiddleware / tenantMiddleware as needed
  → Route handler
      → getControlPanelDb(c) or getTenantDb(organizationId, c)
      → Parse body/params (add Zod for bodies recommended)
      → Drizzle insert/update or call a shared service
  → c.json(...)
```

### 1.3 Conventions (Follow These)

- **Procedures**: Use `protectedProcedure` for anything that requires a logged-in user; `publicProcedure` for health check, public forms (e.g. accept invitation with token).
- **Input**: Always use `.input(z.object({ ... }))` for oRPC (e.g. `organizationId: z.string().uuid()`, `email: z.string().email()`). Include `organizationId` in input for tenant procedures so middleware can set `tenantDb`.
- **Errors**: Throw `ORPCError("FORBIDDEN" | "UNAUTHORIZED" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT" | "INTERNAL_SERVER_ERROR", { message })` in oRPC; in REST return `c.json({ error: "..." }, 4xx)`.
- **Context**: In oRPC, never assume `tenantDb` or `member` without checking; return clear errors if missing.
- **Permissions**: For tenant actions, call `requirePermission(tenantDb, member, resource, action)` from `packages/services` (e.g. `hierarchy_management`, `create`) and map failures to `ORPCError("FORBIDDEN")`.
- **Schema**: All table/column names and types must match `packages/db/src/schema/`. Use [SERVER_SCHEMA_FINAL_V2.0.md](./SERVER_SCHEMA_FINAL_V2.0.md) for reference only; the actual source of truth is the schema files in the repo.

---

## 2. Step-by-Step Plan to Create a New API

Use this checklist for each new API that writes to or reads from the database.

### Step 1: Decide API style and scope

- **Tenant CRUD / app features (web + native)** → oRPC procedure.
- **Control panel only (org create, webhooks, auth callbacks)** → Hono route.
- **Need OpenAPI doc from code** → Prefer oRPC (OpenAPI generated from procedures).

### Step 2: Identify tables and operations

- Open [SERVER_SCHEMA_FINAL_V2.0.md](./SERVER_SCHEMA_FINAL_V2.0.md) and locate the **tenant** or **control panel** tables involved.
- Confirm the table exists in code: `packages/db/src/schema/tenant/` or `packages/db/src/schema/control-panel/`.
- List operations: create, read, update, delete, list (with filters). Plan which procedures or routes map to which operations.

### Step 3: Schema and migrations (if new table/column)

- If the schema already has the table/columns: skip.
- If adding a new table or column: add it in `packages/db/src/schema/tenant/` or `packages/db/src/schema/control-panel/`, then add a migration in `packages/db/src/migrations/` (tenant or control-panel as appropriate; use drizzle config). Run migrations; do not document schema that is not in the codebase.

### Step 4: Service layer (tenant writes)

- **For oRPC tenant writes**: Add or extend a file in `packages/services/src/` (e.g. `appointment.service.ts`, `service-category.service.ts`).
- Export a function that receives `tenantDb` (and any other args) and uses Drizzle to `insert` / `update` / `delete` / `query`. Use schema from `packages/db`. Export from `packages/services/src/index.ts`.
- Keep business rules (validation of hierarchy, permissions, etc.) either in the service or in the router after permission check; avoid duplicating logic.

### Step 5: Router (oRPC) or route (Hono)

**oRPC:**

- In `packages/api/src/routers/`, add or open a router file (e.g. `appointments.ts`, `services.ts`).
- Add a procedure, e.g.:
  - `createX: protectedProcedure.input(z.object({ organizationId: z.string().uuid(), ... })).handler(async ({ input, context }) => { ... })`
- In the handler:
  - If `!context.tenantDb` or `!context.member`, throw `ORPCError` with a clear message.
  - When the procedure requires a specific permission, call `requirePermission(tenantDb, member, "resource", "action")` (recommended for create/update/delete).
  - Call the service function with `context.tenantDb` and input.
  - Return the result (and avoid leaking internal fields).
- Add the router to the **baseRouter** in `packages/api/src/routers/index.ts` (e.g. `appointments: appointmentRouter`). The server’s app router in `apps/server/src/index.ts` imports baseRouter, so new routers are included automatically. Only add to the server app if the procedure has **server-only** dependencies (e.g. email sending, like `invitations.sendEmail`).

**Hono:**

- In `apps/server/src/routes/`, add or open a route file.
- Use `getControlPanelDb(c)` or `getTenantDb(organizationId, c)`. Optionally validate body with Zod and parse.
- Perform Drizzle operations or call a shared service. Return `c.json(...)` with appropriate status.
- Mount in `apps/server/src/index.ts`: `app.route("/path", yourRoutes)`.

### Step 6: Client usage (web / native)

- **Web**: Use the oRPC client (typed) or fetch for REST; ensure `organizationId` (and session) is sent where required.
- **Native**: Same; use the same API package / base URL and pass `organizationId` in procedure input for tenant APIs.
- Invalidate or refetch queries after mutations (e.g. React Query) so UI reflects new data.

### Step 7: Permissions (tenant APIs)

- For tenant procedures, enforce RBAC via `requirePermission(tenantDb, member, resource, action)` from `packages/services` (exported from `permission.service.ts`). **Resource** and **action** must match the permission service: resources are `hierarchy_management` | `user_management` | `service_management` | `appointment_management`; actions are `create` | `read` | `update` | `delete`. These map to the `roles` / `permissions` / `role_permissions` tables (see SERVER_SCHEMA_FINAL_V2.0.md).
- Document which permission is required for each procedure in the router or in this plan.

---

## 3. Feature → Schema → API Mapping

Use this to decide **which tables** and **which APIs** to add for the features described in APPS_OVERVIEW and WEB_OVERVIEW. The codebase remains the source of truth for what is implemented.

### 3.1 Native app (APPS_OVERVIEW)

| Feature / Screen | Likely tables (schema ref) | Suggested APIs (follow existing format) |
|------------------|---------------------------|----------------------------------------|
| Dashboard home – fitness plan, workouts remaining, plan progress | `package_instances`, `packages` | oRPC: `packageInstances.getActiveForClient` (client_id = session user), list with credits_remaining, expires_at; optionally `packages.getById`. |
| Dashboard home – Up Next, upcoming activity | `appointments` | oRPC: `appointments.listForUser` (user_id, status confirmed, start_time >= now). |
| Dashboard home – Recent Activity | `user_activity_log` | oRPC: `userActivityLog.list` (user_id, limit). |
| Dashboard home – notification badge | `notifications` | oRPC: `notifications.getUnreadCount` (user_id). |
| Book workout – categories, services, trainers | `service_categories`, `services`, `service_members`, `members`, `member_profiles` | oRPC: `serviceCategories.list` (branch_id optional), `services.list` (category_id, branch_id), `serviceMembers.listByService`, `members.list` (by branch/scope) for trainer list. |
| Book workout – schedule (1-on-1 vs class) | `appointments`, `class_slots` | oRPC: `classSlots.listAvailable` (service_id, date range); `appointments.create` (with service_id, branch_id, trainer_id, user_id, start_time, duration, etc.). |
| Book workout – confirm booking | `appointments`, optionally `appointment_clients`, `appointment_staff` | oRPC: `appointments.create` (and any appointment_clients/appointment_staff writes in service). |
| Buy package – packages list, selection | `packages` | oRPC: `packages.list` (branch_id, appointment_type, is_archived). |
| Buy package – preferred times | `preferred_times`, `package_instances` | oRPC: `packageInstances.create` (with source `purchased`), then `preferredTimes.upsert` for the instance (max 4 per instance). |
| Buy package – sign & pay | `package_instances`, `payments`, `payment_items` | oRPC: `packageInstances.create` (or update with payment_id, e_signature, terms_agreed_at); `payments.create` + `paymentItems.create` (amounts in cents). |
| Bookings list & detail | `appointments` | oRPC: `appointments.listForUser`, `appointments.getById`; optional `appointments.update` (reschedule, cancel). |
| Explore – categories, search, services | `service_categories`, `services` | oRPC: `serviceCategories.list`, `services.list` (filters, is_active, branch_id). |
| Explore – service detail | `services`, `service_members`, `member_profiles` | oRPC: `services.getById`; join or separate call for trainers (service_members + members + member_profiles). |
| Profile – save user data | `customer_profiles` (tenant) | oRPC: `customerProfiles.upsert` (user_id, phone, etc.); control panel user name/email may be Better-Auth or separate endpoint. |
| Profile – notification toggles | `notification_preferences` | oRPC: `notificationPreferences.get`, `notificationPreferences.update` (user_id from session). |
| Notifications list – mark read | `notifications` | oRPC: `notifications.list` (user_id), `notifications.markRead` (id), `notifications.markAllRead` (user_id). |

### 3.2 Web app (WEB_OVERVIEW)

| Feature / Page | Likely tables (schema ref) | Suggested APIs (follow existing format) |
|-----------------|---------------------------|----------------------------------------|
| Onboarding – create org | Control panel: `organizations`, `organization_members`; tenant: `hierarchy_nodes`, `members` | Existing: POST /orgs (Hono). Keep using it; ensure it matches schema (schema_version, etc.). |
| Dashboard – appointments widget | `appointments` | oRPC: `appointments.list` (branch_id, date range, optional status) for staff view. |
| Dashboard – announcements | `announcements` | oRPC: `announcements.list` (branch_id, is_active), optionally `announcements.create`/update. |
| Dashboard – team/payroll/claims | Various (members, payouts, expenses) | oRPC: expose `expenses.list`, `payouts.list` (if needed); align with `expenses`, `payouts` in schema. |
| Branch view / create / edit | `hierarchy_nodes`, `members` | Existing: hierarchy router (createNode, listNodes, updateNode, moveNode, deleteNode, listMembers, listAllMembers). Use same; extend if new fields in schema. |
| Role view | `roles`, `role_permissions` | oRPC: `roles.list`, `roles.getById`, `rolePermissions.listByRole`; ensure services use schema. |
| Appointment calendar | `appointments`, `appointment_staff`, `services` | oRPC: `appointments.list` (branch_id, date range), `appointments.create`/update/delete; permission `appointment_management:read` (and create/update/delete as needed). |
| Permissions management | `permissions`, `role_permissions` | oRPC: `permissions.list`, attach to roles via existing or new procedures. |
| Roles (detailed) – matrix, wizard | `roles`, `role_permissions`, `permissions` | oRPC: roles + role_permissions CRUD; follow existing member/invitation pattern. |
| User role assignment | `members`, `roles`, tenant members + control panel user | oRPC: members router (existing); ensure list includes user details from control panel where needed. |
| Invitations | `invitations` | Existing: invitations router (create, list, getByToken, accept, revoke). sendEmail is implemented in server (serverInvitationRouter). Keep as-is. |
| User management | `members` (tenant), control panel `user` / `organization_members` | oRPC: members list/get; control panel data via existing admin or auth context. |
| Service management | `services`, `service_categories` | oRPC: `services.list`, `services.getById`, `services.create`, `services.update`; `serviceCategories.list`, create, update. |
| Service category management | `service_categories`, optionally `service_category_config` | oRPC: `serviceCategories.list`, create, update, delete; config in `service_category_config` if needed. |
| Customers | `customer_profiles`, `appointments` (for history) | oRPC: `customerProfiles.list` (search), `customerProfiles.getByUserId`; optional appointments by user_id. |

---

## 4. Implementation Order Suggestion

1. **Already implemented (use as reference)**  
   Hierarchy, invitations, members (routers + services). Use these as the template for new oRPC + service + DB flow.

2. **High impact for both apps**  
   - **Appointments**: `appointments` table — list, create, update (reschedule/cancel).  
   - **Package instances**: `package_instances` + `preferred_times` — list for client, create (purchase flow).  
   - **Services & categories**: `services`, `service_categories` — list, getById, create, update for web; list/filters for native explore and book workout.

3. **Dashboard and profile**  
   - **Notifications**: list, markRead, markAllRead; **notification_preferences**: get, update.  
   - **Customer profiles**: get/upsert by user_id (tenant).  
   - **User activity log**: list for “Recent Activity”.

4. **Web-only or secondary**  
   - **Announcements**, **expenses**, **class_slots**, **waitlist_entries** — add procedures when the corresponding web/native screens are implemented.

---

## 5. File Reference (Codebase)

| Purpose | Location |
|--------|----------|
| Schema (source of truth) | `packages/db/src/schema/` (control-panel/, tenant/) |
| Schema reference doc | [SERVER_SCHEMA_FINAL_V2.0.md](./SERVER_SCHEMA_FINAL_V2.0.md) |
| oRPC procedures | `packages/api/src/routers/*.ts` |
| oRPC context & base procedures | `packages/api/src/context.ts`, `packages/api/src/index.ts` |
| Tenant business logic & DB writes | `packages/services/src/*.service.ts` |
| Hono routes | `apps/server/src/routes/*.ts` |
| Middleware (DB, tenant, auth) | `apps/server/src/middleware/*.ts` |
| App router mount | `apps/server/src/index.ts` |
| How APIs populate DB (detail) | [API_AND_DATABASE_POPULATION.md](./API_AND_DATABASE_POPULATION.md) |

---

## 6. Summary

- **Codebase** is the source of truth; **SERVER_SCHEMA_FINAL_V2.0.md** is the schema reference for table/column names and types.  
- **New tenant APIs**: Prefer **oRPC** (Zod input, protectedProcedure, context.tenantDb, service layer, Drizzle).  
- **New control-panel or one-off APIs**: Use **Hono** routes and `getControlPanelDb` / `getTenantDb`.  
- For each new API: (1) choose style, (2) identify tables from schema doc/codebase, (3) add/use service for tenant writes, (4) add procedure or route, (5) enforce permissions for tenant procedures, (6) wire clients from APPS_OVERVIEW and WEB_OVERVIEW.  
- Use the **Feature → Schema → API** tables above to prioritize and implement APIs that populate the database for the functions and features described in APPS_OVERVIEW and WEB_OVERVIEW.

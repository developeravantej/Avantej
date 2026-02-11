# Database Schema Documentation

## Overview

The Avantej platform uses a **two-database architecture** for multi-tenant isolation:

1. **Control Panel Database** - Single Neon project storing platform-wide data
2. **Tenant Databases** - Separate Neon project per organization (project-per-tenant pattern)

---

## Control Panel Database

**Location**: Single Neon PostgreSQL project  
**Purpose**: Platform metadata, user identity, subscriptions, and routing

### Better-Auth Tables (Authentication)

#### `user`
Platform-wide user identity managed by Better-Auth.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | User ID (Better-Auth format) |
| `name` | text | User's display name |
| `email` | text (unique) | Email address (unique) |
| `email_verified` | boolean | Email verification status |
| `image` | text | Profile image URL (optional) |
| `role` | text | Better-Auth admin role (optional) |
| `banned` | boolean | Ban status (optional) |
| `ban_reason` | text | Ban reason (optional) |
| `ban_expires` | timestamp | Ban expiration (optional) |
| `created_at` | timestamp | Account creation time |
| `updated_at` | timestamp | Last update time |
| `last_login_at` | timestamp | Most recent login time |

**Indexes**:
- Unique index on `email`

#### `session`
User session records managed by Better-Auth.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | Session ID |
| `expires_at` | timestamp | Session expiration |
| `token` | text (unique) | Session token |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |
| `ip_address` | text | Client IP address |
| `user_agent` | text | Client user agent |
| `user_id` | text (FK) | References `user.id` |

**Indexes**:
- Unique index on `token`
- Foreign key to `user.id` (cascade delete)

#### `account`
OAuth and password account records managed by Better-Auth.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | Account ID |
| `account_id` | text | Provider account ID |
| `provider_id` | text | OAuth provider ID |
| `user_id` | text (FK) | References `user.id` |
| `access_token` | text | OAuth access token |
| `refresh_token` | text | OAuth refresh token |
| `id_token` | text | OAuth ID token |
| `access_token_expires_at` | timestamp | Access token expiration |
| `refresh_token_expires_at` | timestamp | Refresh token expiration |
| `scope` | text | OAuth scope |
| `password` | text | Bcrypt hashed password (email/password auth) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Foreign key to `user.id` (cascade delete)

#### `verification`
Email verification and password reset tokens.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | Verification ID |
| `identifier` | text | Email address |
| `value` | text | Verification token |
| `expires_at` | timestamp | Token expiration |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

---

### Control Panel Tables

#### `subscriptions`
Stripe subscription tracking and tier management.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Subscription ID |
| `stripe_subscription_id` | text (unique) | Stripe subscription ID |
| `stripe_customer_id` | text | Stripe customer ID |
| `tier` | text | Subscription tier: `basic`, `professional`, `enterprise` |
| `organization_count_limit` | integer | Max organizations allowed (1, 3, or 10) |
| `status` | text | Status: `active`, `past_due`, `canceled` (note: uses American spelling "canceled") |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Unique index on `stripe_subscription_id`
- Index on `stripe_customer_id`

**Business Rules**:
- One subscription can support multiple organizations (based on tier limit)
- Subscription status determines organization payment status

#### `organizations`
Tenant organization registry with Neon project routing.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Organization ID |
| `name` | text | Organization name |
| `slug` | text (unique) | URL-safe slug (unique) |
| `neon_project_id` | text (unique) | Neon project ID (unique) |
| `connection_string` | text | **Encrypted** Neon connection string |
| `subscription_id` | uuid (FK) | References `subscriptions.id` (restrict on delete) |
| `payment_status` | text | Status: `active`, `suspended`, `failed` |
| `owner_user_id` | text (FK, nullable) | References `users.id` (organization owner, nullable) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |
| `stripe_connect_account_id` | text (unique) | Stripe Connect account ID |
| `stripe_connect_status` | text | Status: `pending`, `active`, `restricted`, `rejected` |
| `stripe_connect_account_type` | text | Type: `franchiser` (default) |
| `stripe_connect_onboarding_completed_at` | timestamp | Onboarding completion time |

**Indexes**:
- Unique index on `slug`
- Unique index on `neon_project_id`
- Unique index on `stripe_connect_account_id`
- Index on `subscription_id`
- Index on `payment_status`

**Business Rules**:
- Connection string is encrypted at rest
- Each organization has one Neon project
- Stripe Connect fields for franchiser payment processing

#### `organization_members`
User-organization membership registry (fast routing cache).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Membership ID |
| `user_id` | text (FK) | References `users.id` (cascade delete) |
| `organization_id` | uuid (FK) | References `organizations.id` (cascade delete) |
| `role` | text | Role: `admin`, `trainer`, `staff`, `client` |
| `status` | text | Status: `active`, `suspended` |
| `joined_at` | timestamp | Join date |

**Indexes**:
- Unique composite index on (`user_id`, `organization_id`)
- Index on `user_id`
- Index on `organization_id`
- Index on `status`

**Business Rules**:
- One membership per user per organization
- This is a cache/registry - tenant DB `members` table is source of truth
- Must be kept in sync with tenant database

#### `platform_admins`
Platform administrator privileges.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Admin record ID |
| `user_id` | text (FK, unique) | References `users.id` (unique) |
| `role` | text | Role: `super_admin`, `support`, `billing` |
| `granted_by` | text (FK, nullable) | References `users.id` (who granted access, nullable, set null on delete) |
| `granted_at` | timestamp | Grant date |

**Indexes**:
- Unique index on `user_id`
- Index on `role`

**Business Rules**:
- `super_admin`: Full platform access, can grant/revoke admin privileges
- `support`: Can impersonate users, view tenants, cannot modify billing
- `billing`: Can view payment data, manage subscriptions, cannot impersonate

#### `admin_sessions`
Admin impersonation session tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Session ID |
| `admin_user_id` | text (FK) | References `users.id` (admin) |
| `impersonated_user_id` | text (FK) | References `users.id` (impersonated user) |
| `organization_id` | uuid (FK, nullable) | References `organizations.id` (optional scope, nullable, set null on delete) |
| `session_token` | text (unique) | Impersonation session token |
| `started_at` | timestamp | Session start time |
| `ended_at` | timestamp | Session end time (null = active) |

**Indexes**:
- Unique index on `session_token`
- Index on `admin_user_id`
- Partial index on `ended_at` (for active sessions: `ended_at IS NULL`)

**Business Rules**:
- Maximum session duration: 1 hour
- All actions during impersonation are logged
- Used for compliance audit trail

---

## Tenant Databases

**Location**: Separate Neon PostgreSQL project per organization  
**Purpose**: Isolated operational data for each franchisee organization

### Core Tables

#### `hierarchy_nodes`
5-level organizational hierarchy structure.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Node ID |
| `name` | text | Node name |
| `type` | text | Type: `organization`, `country`, `region`, `area`, `branch` |
| `parent_id` | uuid (FK, nullable) | References `hierarchy_nodes.id` (self-reference, nullable for organization nodes) |
| `depth` | integer | Depth: 0=org, 1=country, 2=region, 3=area, 4=branch |
| `address` | text | Physical address (branch only, nullable) |
| `pic_user_id` | text | Person In Charge user ID (branch only, nullable, references control panel `users.id`) |
| `deleted_at` | timestamp | Soft delete timestamp (nullable, added in migration 0003) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Index on `parent_id`
- Index on `type`
- Index on `depth`
- Index on `pic_user_id`
- Index on `deleted_at` (for filtering active nodes)

**Business Rules**:
- Fixed 5-level depth: organization (0) → country (1) → region (2) → area (3) → branch (4)
- Cannot delete node with active children
- Cannot delete node with assigned members
- Node names unique within parent scope
- At least one active branch must exist under organization
- Deletion is **soft delete** (sets `deleted_at` timestamp, added in migration 0003)
- Active nodes have `deleted_at IS NULL`
- `address` and `pic_user_id` are branch-specific fields (nullable, only used for branch type nodes)
- Note: API accepts `code` parameter in CreateHierarchyNodeParams but it is not currently stored in the database (planned feature, currently ignored)

#### `members`
User membership in organization with role and hierarchy scope.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Member ID |
| `user_id` | text | References control panel `users.id` (no FK - cross-database) |
| `role` | text | Role: `admin`, `trainer`, `staff`, `client` |
| `hierarchy_scope_id` | uuid (FK) | References `hierarchy_nodes.id` (access scope) |
| `status` | text | Status: `active`, `suspended` |
| `joined_at` | timestamp | Join date |

**Indexes**:
- Unique index on `user_id` (one membership per user per organization)
- Index on `hierarchy_scope_id`
- Index on `role`
- Index on `status`

**Business Rules**:
- One user = one membership per organization
- User can belong to multiple organizations (via separate tenant DBs)
- Hierarchy scope determines accessible nodes (current + all descendants)
- Admin role grants full organization access
- Cannot remove last admin/owner from organization

#### `invitations`
Pending invitations to join organization.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Invitation ID |
| `email` | text | Invitee email address |
| `invited_by` | text | References control panel `users.id` (no FK - cross-database) |
| `role` | text | Role: `admin`, `trainer`, `staff`, `client` |
| `hierarchy_scope_id` | uuid (FK) | References `hierarchy_nodes.id` |
| `token` | text (unique) | Invitation token (unique) |
| `status` | text | Status: `pending`, `accepted`, `declined`, `expired` |
| `expires_at` | timestamp | Expiration time (7 days) |
| `created_at` | timestamp | Creation time |

**Indexes**:
- Unique index on `token`
- Composite index on (`email`, `status`)
- Index on `expires_at`
- Index on `invited_by`

**Business Rules**:
- Invitations expire after 7 days
- Email must match user's email for acceptance
- Only one pending invitation per email in organization
- Invitation creates member record upon acceptance

---

### RBAC Tables

#### `roles`
Role definitions within organization.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Role ID |
| `name` | text (unique) | Role name (unique) |
| `description` | text | Role description (nullable) |
| `is_system` | boolean | System role (cannot be deleted, default: false) |
| `priority` | integer | Permission precedence (higher = more permissions, admin = 100) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Unique index on `name`
- Index on `priority`

**Business Rules**:
- System roles cannot be deleted
- Priority determines permission precedence
- Custom roles can be created by organization admins

#### `permissions`
Permission definitions (resource:action pairs).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Permission ID |
| `resource` | text | Resource: `hierarchy_management`, `user_management`, `service_management`, `appointment_management` |
| `action` | text | Action: `create`, `read`, `update`, `delete` |
| `description` | text | Permission description |
| `created_at` | timestamp | Creation time |

**Indexes**:
- Unique composite index on (`resource`, `action`)
- Index on `resource`

**Business Rules**:
- Permissions are seeded automatically
- Format: `{resource}:{action}` (e.g., `hierarchy_management:create`)

#### `role_permissions`
Many-to-many relationship between roles and permissions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Relationship ID |
| `role_id` | uuid (FK) | References `roles.id` |
| `permission_id` | uuid (FK) | References `permissions.id` |
| `created_at` | timestamp | Creation time |

**Indexes**:
- Unique composite index on (`role_id`, `permission_id`)
- Index on `role_id`
- Index on `permission_id`

**Business Rules**:
- Defines which permissions each role has
- Cascade delete when role or permission is deleted

---

### Service Management Tables

#### `service_categories`
Service category groupings.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Category ID |
| `name` | text | Category name |
| `display_order` | integer | Display order (default: 0) |
| `branch_id` | uuid (FK, nullable) | References `hierarchy_nodes.id` (branch scope, nullable, restrict on delete) |
| `is_active` | boolean | Active status (default: true) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Index on `branch_id`
- Index on `is_active`
- Index on `display_order`

**Business Rules**:
- Category names must be unique within a branch (enforced in app layer)
- Categories can be archived instead of deleted to preserve historical data (`is_active` flag)
- Display order determines sorting in UI
- `branch_id` is nullable (can be organization-wide category)

#### `services`
Services offered by organization.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Service ID |
| `name` | text | Service name |
| `category_id` | uuid (FK, nullable) | References `service_categories.id` (nullable, restrict on delete) |
| `duration` | integer | Duration in seconds (integer value) |
| `duration_unit_type` | text | Display unit: `seconds`, `minutes`, `hours` (default: `minutes`) - used for UI display |
| `max_attendees` | integer | Maximum attendees |
| `attendance_threshold` | integer | Minimum attendees required (null = no threshold) |
| `stripe_product_id` | text | Stripe Product ID (nullable) |
| `stripe_price_id` | text | Stripe Price ID (nullable) |
| `stripe_sync_status` | text | Sync status: `pending`, `synced`, `failed` (default: `pending`) |
| `stripe_last_synced_at` | timestamp | Last Stripe sync time (nullable) |
| `branch_id` | uuid (FK, nullable) | References `hierarchy_nodes.id` (branch scope, nullable, restrict on delete) |
| `is_active` | boolean | Active status (default: true) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Index on `category_id`
- Index on `branch_id`
- Index on `stripe_product_id`
- Index on `stripe_sync_status`
- Index on `is_active`

**Business Rules**:
- Service names must be unique within a branch (enforced in app layer)
- Duration is stored in seconds (integer), `duration_unit_type` determines the display unit for UI
- Stripe sync status tracks whether service is synced with Stripe Connect
- Services can be archived instead of deleted to preserve historical data (`is_active` flag)
- Attendance threshold allows services to require minimum attendees
- `category_id` is nullable (services can exist without category, restrict on delete)
- `branch_id` is nullable (can be organization-wide service, restrict on delete)

#### `service_commission_config`
Commission configuration for services.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Config ID |
| `service_id` | uuid (FK, unique) | References `services.id` (one-to-one, cascade delete) |
| `commission_type` | text | Commission type: `fixed`, `percentage`, `position_based` |
| `fixed_amounts` | jsonb | Fixed commission amounts (nullable, used when type = `fixed`, JSON: `{ "role_1": 5000 }` in cents) |
| `staff_pool_percentage` | integer | Staff pool percentage (default: 100, 0-100, used when type = `percentage` or `position_based`) |
| `position_weightage` | jsonb | Position weightage configuration (nullable, used when type = `percentage` or `position_based`, JSON array) |
| `max_staff` | integer | Maximum staff (default: 1) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Unique index on `service_id`

**Business Rules**:
- One commission config per service
- Cascade delete when service is deleted

#### `service_rules`
Business rules for services (booking, cancellation).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Rule ID |
| `service_id` | uuid (FK, unique) | References `services.id` (one-to-one) |
| `require_advance_booking` | boolean | Require advance booking (default: false) |
| `min_advance_booking_duration` | integer | Minimum advance booking duration in seconds (nullable) |
| `min_advance_booking_unit_type` | text | Unit type: `seconds`, `minutes`, `hours`, `days` (default: `hours`) |
| `enable_cancellation_window` | boolean | Enable cancellation window (default: false) |
| `cancellation_cutoff_duration` | integer | Cancellation cutoff duration in seconds before start time (nullable) |
| `cancellation_cutoff_unit_type` | text | Unit type: `seconds`, `minutes`, `hours`, `days` (default: `hours`) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Unique index on `service_id`

**Business Rules**:
- One rule set per service
- Cascade delete when service is deleted

---

### Package Management Tables

#### `packages`
Service packages (session bundles).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Package ID |
| `name` | text | Package name |
| `appointment_type` | text | Type: `private`, `semi-private`, `both` |
| `cross_usage_enabled` | boolean | Allow cross-branch usage (default: false) |
| `session_count` | integer | Number of sessions |
| `price_per_session` | integer | Price per session (in cents) |
| `max_clients_per_session` | integer | Maximum clients per session |
| `expiry_days` | integer | Expiry in days (nullable) |
| `expiry_date` | timestamp | Fixed expiry date (nullable) |
| `auto_generate_invoice` | boolean | Auto-generate invoice (default: false) |
| `branch_id` | uuid (FK, nullable) | References `hierarchy_nodes.id` (branch scope, nullable, restrict on delete) |
| `allowed_service_ids` | jsonb | Array of allowed service IDs (nullable) |
| `is_archived` | boolean | Archived status (default: false) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Index on `branch_id`
- Index on `appointment_type`
- Index on `is_archived`

#### `package_assignments`
Package assignments to clients.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Assignment ID |
| `package_id` | uuid (FK) | References `packages.id` (restrict on delete) |
| `client_id` | text | Client user ID (references control panel `users.id`) |
| `assigned_by` | text | Assigned by user ID (references control panel `users.id`) |
| `sessions_remaining` | integer | Sessions remaining |
| `sessions_used` | integer | Sessions used (default: 0) |
| `expiry_date` | timestamp | Expiry date |
| `payment_confirmed` | boolean | Payment confirmed (default: false) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Index on `package_id`
- Index on `client_id`
- Index on `expiry_date`
- Composite index on (`client_id`, `expiry_date`)

**Business Rules**:
- One active assignment per client-package combination (enforced in app layer)
- `sessions_remaining` decrements on each booking
- Expired packages cannot be used for new bookings
- `payment_confirmed` must be true before package can be used

---

### Appointment Tables

#### `appointments`
Appointment bookings.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Appointment ID |
| `type` | text | Type: `private`, `semi-private` |
| `start_time` | timestamp | Start time |
| `duration` | integer | Duration in minutes |
| `end_time` | timestamp | End time (calculated: start_time + duration) |
| `service_id` | uuid (FK, nullable) | References `services.id` (nullable, set null on delete) |
| `branch_id` | uuid (FK) | References `hierarchy_nodes.id` (required) |
| `status` | text | Status: `pending`, `confirmed`, `completed`, `cancelled`, `no-show` (note: uses British spelling "cancelled") |
| `session_total` | integer | Total pre-tax revenue (price_per_client × client_count) |
| `price_per_client` | integer | Price per client (in cents) |
| `is_recurring` | boolean | Is recurring (default: false) |
| `recurring_parent_id` | uuid (FK, nullable) | References `appointments.id` (self-reference, nullable, cascade delete) |
| `recurring_frequency` | text | Frequency: `daily`, `weekly`, `custom` (nullable) |
| `recurring_end_date` | timestamp | Recurring series end date (nullable) |
| `conflict_resolved` | boolean | Conflict resolved (default: false) |
| `conflict_reason` | text | Conflict resolution reason (nullable) |
| `payment_status` | text | Payment status: `pending`, `paid`, `partial`, `refunded` (default: `pending`) |
| `stripe_payment_intent_id` | text | Stripe PaymentIntent ID (nullable) |
| `notes` | text | Notes (nullable) |
| `created_by` | text | Created by user ID (references `members.user_id`) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Index on `branch_id`
- Index on `service_id`
- Index on `start_time`
- Index on `status`
- Index on `type`
- Index on `recurring_parent_id`
- Index on `stripe_payment_intent_id`
- Composite index on (`start_time`, `status`)

**Business Rules**:
- `end_time` = `start_time` + `duration`
- Private appointments: `max_attendees` = 1
- Semi-private appointments: `max_attendees` > 1
- Recurring appointments link via `recurring_parent_id`

#### `appointment_clients`
Client attendance records for appointments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Record ID |
| `appointment_id` | uuid (FK) | References `appointments.id` |
| `client_id` | text | Client user ID (references control panel `users.id`) |
| `package_assignment_id` | uuid (FK, nullable) | References `package_assignments.id` (nullable, set null on delete) |
| `price_paid` | integer | Price paid (in cents) |
| `attended` | boolean | Attendance status (nullable, null until appointment completed) |
| `notes` | text | Notes (nullable) |
| `created_at` | timestamp | Creation time |

**Indexes**:
- Unique composite index on (`appointment_id`, `client_id`)
- Index on `appointment_id`
- Index on `client_id`
- Index on `package_assignment_id`

**Business Rules**:
- Unique constraint: one client per appointment (enforced by unique composite index)
- `price_paid` may differ from `appointment.price_per_client` if discounts applied
- `attended` is null until appointment is completed
- `package_assignment_id` links to the package used for this booking
- Cascade delete when appointment is deleted

#### `appointment_staff`
Staff assignments for appointments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Assignment ID |
| `appointment_id` | uuid (FK) | References `appointments.id` |
| `staff_id` | text | Staff user ID (references `members.user_id`) |
| `created_at` | timestamp | Creation time |

**Indexes**:
- Unique composite index on (`appointment_id`, `staff_id`)
- Index on `appointment_id`
- Index on `staff_id`

**Business Rules**:
- Unique constraint: one staff per appointment (enforced by unique composite index)
- Staff assignments determine commission splits
- Cascade delete when appointment is deleted

#### `commission_splits`
Commission splits for appointment staff.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Split ID |
| `appointment_id` | uuid (FK) | References `appointments.id` |
| `staff_id` | text | Staff user ID (references `members.user_id`) |
| `split_percentage` | integer | Split percentage (0-100) |
| `calculated_amount` | integer | Calculated amount (in cents, pre-tax: sessionTotal × splitPercentage / 100) |
| `notes` | text | Notes (nullable, optional override reason) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Unique composite index on (`appointment_id`, `staff_id`)
- Index on `appointment_id`
- Index on `staff_id`

**Business Rules**:
- Unique constraint: one commission split per appointment-staff combination (enforced by unique composite index)
- `split_percentage` must be between 0-100
- `calculated_amount` is pre-tax: `sessionTotal × splitPercentage / 100`
- Commission splits are calculated when appointment is confirmed/completed
- Cascade delete when appointment is deleted

---

### Payment Tables

#### `payments`
Payment records from Stripe.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Payment ID |
| `stripe_payment_intent_id` | text (unique) | Stripe PaymentIntent ID (unique) |
| `stripe_charge_id` | text | Stripe Charge ID (nullable) |
| `customer_id` | text | Customer user ID (references `members.user_id`, the client who paid) |
| `stripe_customer_id` | text | Stripe Customer ID (nullable) |
| `amount` | integer | Amount (in cents) |
| `tax_amount` | integer | Tax amount (in cents, default: 0) |
| `total_amount` | integer | Total amount (in cents) |
| `currency` | text | Currency (default: `usd`) |
| `platform_fee_amount` | integer | Platform fee amount (in cents, default: 0) |
| `platform_fee_percentage` | integer | Platform fee percentage (default: 0) |
| `franchiser_amount` | integer | Franchiser amount (in cents) |
| `status` | text | Status: `pending`, `succeeded`, `failed`, `canceled`, `refunded` |
| `appointment_id` | uuid (FK, nullable) | References `appointments.id` (nullable, set null on delete) |
| `description` | text | Payment description (nullable) |
| `metadata` | text | Additional metadata (nullable) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Unique index on `stripe_payment_intent_id`
- Index on `stripe_charge_id`
- Index on `customer_id`
- Index on `appointment_id`
- Index on `status`
- Composite index on (`customer_id`, `status`)

**Business Rules**:
- Unique constraint: one payment record per Stripe PaymentIntent (enforced by unique index on `stripe_payment_intent_id`)
- Platform fee is calculated as percentage of `total_amount`
- `franchiser_amount` = `total_amount` - `platform_fee_amount`
- Payment status must match Stripe PaymentIntent status
- Payment can be linked to an appointment (nullable) or standalone (package purchase)
- `appointment_id` set to null on delete (set null on delete)

#### `partner_stripe_accounts`
Stripe Connect accounts for partners/franchisers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Account ID |
| `partner_id` | text (FK, unique) | Partner user ID (references `members.user_id`, unique, cascade delete) |
| `stripe_connect_account_id` | text (unique) | Stripe Connect account ID (unique, required) |
| `stripe_connect_status` | text | Status: `pending`, `active`, `restricted`, `rejected` (default: `pending`) |
| `stripe_connect_account_type` | text | Type: `partner` (default) |
| `onboarding_url` | text | Stripe Connect onboarding URL (nullable) |
| `onboarding_completed_at` | timestamp | Onboarding completion time (nullable) |
| `bank_account_last_4` | text | Bank account last 4 digits (nullable) |
| `bank_account_type` | text | Bank account type (nullable) |
| `account_type` | text | Account type: `express`, `standard`, `custom` (default: `express`) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Unique index on `partner_id`
- Unique index on `stripe_connect_account_id`
- Index on `stripe_connect_status`

**Business Rules**:
- Unique constraint: one Stripe Connect account per partner (enforced by unique index on `partner_id`)
- Partner must be a member of the organization
- Onboarding status tracks Stripe Connect onboarding flow
- Bank account details stored for manual payout verification
- Cascade delete when member is deleted (via FK to `members.user_id`)

#### `payouts`
Payout records to partners/franchisers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Payout ID |
| `stripe_transfer_id` | text | Stripe Transfer ID (nullable, for Stripe Connect payouts) |
| `stripe_payout_id` | text | Stripe Payout ID (nullable) |
| `recipient_id` | text | Recipient user ID (references `members.user_id`) |
| `stripe_connect_account_id` | text | Stripe Connect account ID (nullable, if recipient has one) |
| `appointment_id` | uuid (FK) | References `appointments.id` (required, restrict on delete) |
| `commission_split_id` | uuid (FK, nullable) | References `commission_splits.id` (nullable, set null on delete) |
| `amount` | integer | Payout amount (in cents, pre-tax commission) |
| `currency` | text | Currency (default: `usd`) |
| `payout_method` | text | Payout method: `stripe_connect`, `manual_bank_transfer` |
| `bank_account_last_4` | text | Bank account last 4 digits (nullable, for manual payouts) |
| `manual_payout_confirmed_at` | timestamp | Manual payout confirmation time (nullable) |
| `manual_payout_confirmed_by` | text | Manual payout confirmed by user ID (nullable, references `members.user_id`) |
| `status` | text | Status: `pending`, `processing`, `paid`, `failed`, `canceled` |
| `scheduled_at` | timestamp | Scheduled payout time (nullable) |
| `paid_at` | timestamp | Actual payout time (nullable) |
| `description` | text | Payout description (nullable) |
| `notes` | text | Notes (nullable) |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

**Indexes**:
- Index on `recipient_id`
- Index on `appointment_id`
- Index on `commission_split_id`
- Index on `stripe_transfer_id`
- Index on `stripe_payout_id`
- Index on `status`
- Index on `payout_method`
- Composite index on (`recipient_id`, `status`)

**Business Rules**:
- Payout amount is based on commission splits from appointments
- Stripe Connect payouts are automated via Stripe Transfer API
- Manual payouts require confirmation by admin/staff (`manual_payout_confirmed_at` and `manual_payout_confirmed_by`)
- Payout status tracks the lifecycle: `pending` → `processing` → `paid`/`failed`
- `appointment_id` is required (restrict on delete)
- `commission_split_id` is optional (set null on delete)

---

## Database Relationships

### Control Panel Database

```
users (Better-Auth)
  ├── organization_members (many-to-many via organization_members)
  ├── platform_admins (one-to-one)
  └── admin_sessions (one-to-many as admin_user_id or impersonated_user_id)

subscriptions
  └── organizations (one-to-many)

organizations
  ├── organization_members (one-to-many)
  └── admin_sessions (one-to-many, optional)
```

### Tenant Database

```
hierarchy_nodes (self-referencing tree)
  ├── members (one-to-many via hierarchy_scope_id)
  ├── invitations (one-to-many via hierarchy_scope_id)
  ├── service_categories (one-to-many via branch_id)
  ├── services (one-to-many via branch_id)
  ├── packages (one-to-many via branch_id)
  └── appointments (one-to-many via branch_id)

members
  ├── appointment_staff (one-to-many via staff_id)
  ├── commission_splits (one-to-many via staff_id)
  ├── payouts (one-to-many via recipient_id)
  └── partner_stripe_accounts (one-to-one via partner_id)

service_categories
  └── services (one-to-many)

services
  ├── service_commission_config (one-to-one)
  ├── service_rules (one-to-one)
  └── appointments (one-to-many)

appointments
  ├── appointment_clients (one-to-many)
  ├── appointment_staff (one-to-many)
  ├── commission_splits (one-to-many)
  ├── payments (one-to-many, optional)
  └── payouts (one-to-many)

packages
  └── package_assignments (one-to-many)

roles
  └── role_permissions (one-to-many)

permissions
  └── role_permissions (one-to-many)
```

---

## Key Design Decisions

1. **Project-Per-Tenant**: Each organization gets its own Neon PostgreSQL project for complete data isolation
2. **Encrypted Connection Strings**: Tenant connection strings encrypted in control panel database
3. **Cross-Database References**: User IDs stored as text (no FK constraints) since users are in control panel DB
4. **Hierarchy Scoping**: Members assigned to hierarchy nodes, access limited to scope + descendants
5. **RBAC System**: Role-based permissions with hierarchy scoping for fine-grained access control
6. **Stripe Integration**: Services synced with Stripe Products/Prices, payments tracked via PaymentIntents
7. **Soft Deletes**: 
   - `hierarchy_nodes` uses `deleted_at` timestamp (soft delete)
   - Some tables use `is_active` or `is_archived` flags instead of hard deletes
8. **Audit Trail**: Admin impersonation sessions tracked for compliance

---

## Migration History

### Control Panel Migrations
- `0000_far_luminals.sql` - Initial control panel schema

### Tenant Migrations
- `0000_noisy_aqueduct.sql` - Core tenant schema (hierarchy_nodes, members, invitations)
- `0001_salty_morlocks.sql` - Service management, packages, appointments, payments, payouts
- `0002_calm_martin_li.sql` - RBAC tables (roles, permissions, role_permissions) + branch fields (address, pic_user_id)
- `0003_green_runaways.sql` - Soft delete support for hierarchy_nodes (adds `deleted_at` column and index)

---

## Notes

- All timestamps use PostgreSQL `timestamp` type (with timezone)
- All monetary amounts stored in cents (integers)
- UUIDs used for primary keys (except Better-Auth tables which use text IDs)
- Foreign key constraints enforce referential integrity within each database
- Cross-database references (user_id) have no FK constraints but are validated in application layer
- Connection strings are encrypted using application-level encryption before storage

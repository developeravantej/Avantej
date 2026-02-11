# Unified Database Schema (Server + Mobile App)

**Created**: Merged from `SERVER_SCHEMA_FINAL.md` and `APP_SCHEMA.md`  
**Purpose**: Complete schema supporting both server (web admin) and mobile app features  
**Last Updated**: Updated to match current codebase (`packages/db` schema and migrations). Web admin and mobile app share the same database and authentication.

**Field Indicators**:
- ✅ **Existing** - Field already exists in current schema (unchanged)
- 🆕 **New** - New field to be added
- 🔧 **Modified** - Existing field that needs modification (constraint, type change, etc.)
- 📋 **Mapped** - Field exists but usage/mapping clarified
- 🔄 **Shared** - Field/table used by both web admin and mobile app

---

## Overview

The Avantej platform uses a **two-database architecture** for multi-tenant isolation:

1. **Control Panel Database** - Single Neon project storing platform-wide data
2. **Tenant Databases** - Separate Neon project per organization (project-per-tenant pattern)

**Unified Authentication**: Both web admin and mobile app use the same Better-Auth `user` table in the Control Panel Database. Mobile app clients are end-users (customers) who book appointments - they are NOT members. Staff members (admin, trainer, staff) are represented in the `members` table in tenant databases. All tables are shared between web admin and mobile app - there are no mobile-only tables.

---

## Control Panel Database

### Better-Auth Tables

#### `user` ✅
| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | text (PK) | ✅ Existing | User ID (Better-Auth format) |
| `name` | text | ✅ Existing | User's display name |
| `email` | text (unique) | ✅ Existing | Email address (unique) |
| `email_verified` | boolean | ✅ Existing | Email verification status |
| `image` | text | ✅ Existing | Profile image URL (optional) |
| `role` | text | ✅ Existing | Better-Auth admin role (optional) |
| `banned` | boolean | ✅ Existing | Ban status (optional) |
| `ban_reason` | text | ✅ Existing | Ban reason (optional) |
| `ban_expires` | timestamp | ✅ Existing | Ban expiration (optional) |
| `created_at` | timestamp | ✅ Existing | Account creation time |
| `updated_at` | timestamp | ✅ Existing | Last update time |
| `last_login_at` | timestamp | ✅ Existing | Most recent login time |

**No changes needed** - All fields remain as-is.

---

#### `session` ✅
**No changes needed** - All fields remain as-is.

---

#### `account` ✅
**No changes needed** - All fields remain as-is.

---

#### `verification` ✅
**No changes needed** - All fields remain as-is.

---

### Control Panel Tables

#### `subscriptions` ✅
**No changes needed** - All fields remain as-is.

---

#### `organizations` ✅
| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Organization ID |
| `name` | text | ✅ Existing | Organization name |
| `slug` | text (unique) | ✅ Existing | URL-safe slug (unique) |
| `neon_project_id` | text (unique) | ✅ Existing | Neon project ID (unique) |
| `connection_string` | text | ✅ Existing | **Encrypted** Neon connection string |
| `subscription_id` | uuid (FK) | ✅ Existing | References `subscriptions.id` (restrict on delete) |
| `payment_status` | text | ✅ Existing | Status: `active`, `suspended`, `failed` |
| `owner_user_id` | text (FK, nullable) | ✅ Existing | References Control Panel `user.id` (Better-Auth, organization owner, nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |
| `stripe_connect_account_id` | text (unique) | ✅ Existing | Stripe Connect account ID |
| `stripe_connect_status` | text | ✅ Existing | Status: `pending`, `active`, `restricted`, `rejected` |
| `stripe_connect_account_type` | text | ✅ Existing | Type: `franchiser` (default) |
| `stripe_connect_onboarding_completed_at` | timestamp | ✅ Existing | Onboarding completion time |
| `schema_version` | text | ✅ Existing | Tenant schema migration version (default: `0000`), used for tenant DB migration tracking |

**No changes needed** - All fields remain as-is. (No unique constraint on `name` in codebase.)

---

#### `organization_analytics` ✅
**Purpose**: Aggregated metrics from tenant databases for superadmin/analytics dashboards (synced periodically).

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Analytics row ID |
| `organization_id` | uuid (FK, unique) | ✅ Existing | References `organizations.id` (cascade on delete) |
| `total_customers` | integer | ✅ Existing | Total customers (default: 0) |
| `active_customers` | integer | ✅ Existing | Active customers (default: 0) |
| `total_bookings` | integer | ✅ Existing | Total bookings (default: 0) |
| `completed_bookings` | integer | ✅ Existing | Completed bookings (default: 0) |
| `cancelled_bookings` | integer | ✅ Existing | Cancelled bookings (default: 0) |
| `total_revenue` | integer | ✅ Existing | Total revenue in cents (default: 0) |
| `monthly_revenue` | integer | ✅ Existing | Monthly revenue in cents (default: 0) |
| `active_package_instances` | integer | ✅ Existing | Active package instances count (default: 0) |
| `last_synced_at` | timestamp | ✅ Existing | Last sync time (nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: Index on `organization_id`.

---

#### `organization_members` ✅
**No changes needed** - All fields remain as-is.

---

#### `platform_admins` ✅
**No changes needed** - All fields remain as-is.

---

#### `admin_sessions` ✅
**No changes needed** - All fields remain as-is.

---

## Tenant Databases

### Core Tables

#### `hierarchy_nodes` ✅
**No changes needed** - All fields remain as-is.

---

#### `members` ✅ 🔄 **Shared**
| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Member ID |
| `user_id` | text | ✅ Existing | References Control Panel `user.id` (Better-Auth, no FK - cross-database) |
| `role` | text | ✅ Existing | Role: `admin`, `trainer`, `staff` (staff members only, NOT clients) |
| `hierarchy_scope_id` | uuid (FK) | ✅ Existing | References `hierarchy_nodes.id` (access scope) |
| `status` | text | ✅ Existing | Status: `active`, `suspended` |
| `joined_at` | timestamp | ✅ Existing | Join date |

**No changes needed** - All fields remain as-is.

**Note**: `members` table is for staff members only (admin, trainer, staff). Mobile app clients (end-users/customers) are NOT members - they are users who book appointments and are referenced directly via Control Panel `user.id` in `appointments` and `appointment_clients` tables.

---

#### `invitations` ✅
**No changes needed** - All fields remain as-is.

---

### RBAC Tables

#### `roles` ✅
**No changes needed** - All fields remain as-is.

---

#### `permissions` ✅
**No changes needed** - All fields remain as-is.

---

#### `role_permissions` ✅
**No changes needed** - All fields remain as-is.

---

### Service Management Tables

#### `service_categories` ✅ 🔄 **Shared**
| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Category ID |
| `name` | text | ✅ Existing | Category name |
| `description` | text | ✅ Existing | Category description (nullable) |
| `display_order` | integer | ✅ Existing | Display order (default: 0) |
| `branch_id` | uuid (FK, nullable) | ✅ Existing | References `hierarchy_nodes.id` (branch scope, nullable, restrict on delete) |
| `is_active` | boolean | ✅ Existing | Active status (default: true) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: branch_id, is_active, display_order.

**No changes needed** - Matches codebase. (Codebase does not have duration, max_attendees, incentive_type, or other commission/config fields on this table; those may be in `service_category_config` or app layer.)

---

#### `services` ✅ 🔄 **Shared**
| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Service ID |
| `name` | text | ✅ Existing | Service name |
| `category_id` | uuid (FK, nullable) | ✅ Existing | References `service_categories.id` (restrict on delete) |
| `duration` | integer | ✅ Existing | Duration in seconds |
| `duration_unit_type` | text | ✅ Existing | Display unit: `seconds`, `minutes`, `hours` (default: `minutes`) |
| `max_attendees` | integer | ✅ Existing | Maximum attendees |
| `attendance_threshold` | integer | ✅ Existing | Minimum attendees required (nullable) |
| `stripe_product_id` | text | ✅ Existing | Stripe Product ID (nullable) |
| `stripe_price_id` | text | ✅ Existing | Stripe Price ID (nullable) |
| `stripe_sync_status` | text | ✅ Existing | Sync status: `pending`, `synced`, `failed` (default: `pending`) |
| `stripe_last_synced_at` | timestamp | ✅ Existing | Last Stripe sync time (nullable) |
| `branch_id` | uuid (FK, nullable) | ✅ Existing | References `hierarchy_nodes.id` (restrict on delete) |
| `is_active` | boolean | ✅ Existing | Active status (default: true) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |
| `title` | text | ✅ Existing | Service title (nullable) |
| `description` | text | ✅ Existing | Service description (nullable) |
| `image_url` | text | ✅ Existing | Service image URL (nullable) |
| `type` | text | ✅ Existing | Type: `private`, `semi_private` (default: `private`) |
| `price` | integer | ✅ Existing | Display price in cents (nullable) |
| `price_unit` | text | ✅ Existing | Unit: `session`, `class`, `package` (default: `session`) |
| `taxable` | boolean | ✅ Existing | Is taxable (default: false) |
| `tax_percentage` | integer | ✅ Existing | Tax percentage 0-100 (default: 0) |
| `is_recommended` | boolean | ✅ Existing | Recommended flag (default: false) |
| `location` | text | ✅ Existing | Default location (nullable) |
| `features` | text[] | ✅ Existing | Array of service features (nullable) |
| `scheduling_type` | text | ✅ Existing | `appointment` (flexible booking) \| `class_slot` (pre-defined slots), default: `appointment` |

**Indexes**: category_id, branch_id, stripe_product_id, stripe_sync_status, is_active, type, is_recommended, scheduling_type.

**No changes needed** - Matches codebase. (Codebase does not have duration_minutes, popularity_percentage, sessions, expirable, expiry_*, time_preset_config.)

---

#### `service_members` ✅ 🔄 **Shared**
**Purpose**: Many-to-many relationship between services and trainers/staff (members who can deliver the service)

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Relationship ID |
| `service_id` | uuid (FK) | ✅ Existing | References `services.id` (cascade on delete) |
| `member_id` | uuid (FK) | ✅ Existing | References `members.id` (cascade on delete) |
| `is_primary` | boolean | ✅ Existing | Primary trainer flag (default: false) |
| `created_at` | timestamp | ✅ Existing | Creation time |

**Indexes**:
- Unique index on (`service_id`, `member_id`)
- Index on `service_id`
- Index on `member_id`

**Note**: Trainer/staff profiles use `members` + `member_profiles`; no separate `trainers` table in codebase.

---

#### `service_commission_config` ✅
**No changes needed** - All fields remain as-is.

---

#### `service_rules` ✅
**No changes needed** - All fields remain as-is.

---

### Package Management Tables

#### `packages` ✅ 🔄 **Shared**
**Purpose**: Prepaid session packages (restrictable to services via allowed_service_ids).

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Package ID |
| `name` | text | ✅ Existing | Package name |
| `appointment_type` | text | ✅ Existing | `private` \| `semi-private` \| `both` |
| `cross_usage_enabled` | boolean | ✅ Existing | Cross-usage allowed (default: false) |
| `session_count` | integer | ✅ Existing | Number of sessions |
| `price_per_session` | integer | ✅ Existing | Price per client per session (cents) |
| `max_clients_per_session` | integer | ✅ Existing | Max clients per session |
| `expiry_days` | integer | ✅ Existing | Days from assignment (nullable; else use expiry_date) |
| `expiry_date` | timestamp | ✅ Existing | Fixed expiry date (nullable) |
| `auto_generate_invoice` | boolean | ✅ Existing | Auto-generate invoice (default: false) |
| `branch_id` | uuid (FK, nullable) | ✅ Existing | References `hierarchy_nodes.id` (restrict on delete) |
| `allowed_service_ids` | jsonb | ✅ Existing | Service IDs allowed (null = all) |
| `is_archived` | boolean | ✅ Existing | Archived status (default: false) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: branch_id, appointment_type, is_archived.

---

#### `package_assignments` ✅
**No changes needed** - All fields remain as-is.

**Note**: Staff-assigned packages are unified with client-purchased packages in `package_instances` (see below) via `source` = `assigned` \| `purchased`; `package_assignments` may be legacy or used in parallel depending on codebase.

---

### Appointment/Booking Tables

#### `appointments` ✅ 🔄 **Shared**
| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Appointment/Booking ID |
| `type` | text | ✅ Existing | Type: `private`, `semi-private` |
| `start_time` | timestamp | ✅ Existing | Start time |
| `duration` | integer | ✅ Existing | Duration in minutes |
| `end_time` | timestamp | ✅ Existing | End time (calculated: start_time + duration) |
| `service_id` | uuid (FK, nullable) | ✅ Existing | References `services.id` (set null on delete) |
| `branch_id` | uuid (FK) | ✅ Existing | References `hierarchy_nodes.id` (required) |
| `status` | text | ✅ Existing | Status: `pending`, `confirmed`, `completed`, `cancelled`, `no-show` |
| `session_total` | integer | ✅ Existing | Total pre-tax revenue (price_per_client × client_count) |
| `price_per_client` | integer | ✅ Existing | Price per client (in cents) |
| `is_recurring` | boolean | ✅ Existing | Is recurring (default: false) |
| `recurring_parent_id` | uuid (FK, nullable) | ✅ Existing | References `appointments.id` (self-reference, cascade delete) |
| `recurring_frequency` | text | ✅ Existing | Frequency: `daily`, `weekly`, `custom` (nullable) |
| `recurring_end_date` | timestamp | ✅ Existing | Recurring series end date (nullable) |
| `conflict_resolved` | boolean | ✅ Existing | Conflict resolved (default: false) |
| `conflict_reason` | text | ✅ Existing | Conflict resolution reason (nullable) |
| `payment_status` | text | ✅ Existing | Payment status: `pending`, `paid`, `partial`, `refunded` (default: `pending`) |
| `stripe_payment_intent_id` | text | ✅ Existing | Stripe PaymentIntent ID (nullable) |
| `notes` | text | ✅ Existing | Notes (nullable) |
| `created_by` | text | ✅ Existing | Created by (references `members.user_id`) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |
| `booking_number` | text (unique, nullable) | ✅ Existing | Human-readable booking ID |
| `user_id` | text | ✅ Existing | References Control Panel `user.id` (client bookings) |
| `trainer_id` | uuid (FK, nullable) | ✅ Existing | References `members.id` (trainer/staff assigned) |
| `package_instance_id` | uuid (FK, nullable) | ✅ Existing | References `package_instances.id` (if booked via package) |
| `credits_used` | integer | ✅ Existing | Credits used (default: 1) |
| `location` | text | ✅ Existing | Location/studio (nullable) |
| `cancelled_at` | timestamp | ✅ Existing | Cancellation time (nullable) |
| `cancellation_reason` | text | ✅ Existing | Cancellation reason (nullable) |
| `class_slot_id` | uuid (FK, nullable) | ✅ Existing | References `class_slots.id` (for class-slot bookings) |
| `description` | text | ✅ Existing | Booking description (nullable) |
| `image_url` | text | ✅ Existing | Booking image URL (nullable) |

**Indexes**: branch_id, service_id, start_time, status, type, recurring_parent_id, stripe_payment_intent_id, start_time+status, booking_number, user_id, trainer_id, package_instance_id, class_slot_id, (user_id, status).

**Note**: Recurrence details (frequency value, time unit, repeat_on, monthly type, ends type/occurrences) are stored in the separate `recurrence_rules` table (1:1 with appointment).

---

#### `recurrence_rules` ✅ 🔄 **Shared**
**Purpose**: Complex recurrence configuration for recurring appointments (1:1 with parent appointment).

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Rule ID |
| `appointment_id` | uuid (FK, unique) | ✅ Existing | References `appointments.id` (cascade on delete) |
| `frequency_value` | integer | ✅ Existing | Frequency number (e.g. every 2 weeks, default: 1) |
| `time_unit` | text | ✅ Existing | Unit: `day`, `week`, `month` |
| `repeat_on` | jsonb | ✅ Existing | Days of week for weekly (e.g. [1,3,5] for Mon,Wed,Fri, nullable) |
| `monthly_type` | text | ✅ Existing | Monthly type: `day_of_month`, `day_of_week` (nullable) |
| `monthly_day_of_week` | integer | ✅ Existing | Day of week for monthly (nullable) |
| `monthly_week_of_month` | integer | ✅ Existing | Week of month (nullable) |
| `ends_type` | text | ✅ Existing | Ends: `never`, `on_date`, `after_occurrences` |
| `ends_after_occurrences` | integer | ✅ Existing | Number of occurrences (nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: Index on `appointment_id`.

---

#### `class_slots` ✅ 🔄 **Shared**
**Purpose**: Pre-defined class schedules with capacity tracking

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Slot ID |
| `service_id` | uuid (FK) | ✅ Existing | References `services.id` (cascade on delete) |
| `branch_id` | uuid (FK) | ✅ Existing | References `hierarchy_nodes.id` (restrict on delete) |
| `date` | timestamp (NOT NULL) | ✅ Existing | Slot date |
| `start_time` | text (NOT NULL) | ✅ Existing | Start time as text (e.g. `09:00`) |
| `end_time` | text (NOT NULL) | ✅ Existing | End time as text |
| `capacity` | integer (NOT NULL) | ✅ Existing | Maximum capacity |
| `spots_booked` | integer | ✅ Existing | Spots booked (default: 0) |
| `spots_available` | integer (NOT NULL) | ✅ Existing | Available spots |
| `is_full` | boolean | ✅ Existing | Full status (default: false) |
| `is_available` | boolean | ✅ Existing | Availability status (default: true) |
| `is_cancelled` | boolean | ✅ Existing | Cancelled status (default: false) |
| `cancellation_reason` | text | ✅ Existing | Cancellation reason (nullable) |
| `instructor_id` | uuid (FK, nullable) | ✅ Existing | References `members.id` (set null on delete) |
| `location` | text | ✅ Existing | Location (nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: service_id, branch_id, date, (service_id, date, start_time), (is_available, is_full, date), instructor_id.

---

#### `waitlist_entries` ✅ 🔄 **Shared**
**Purpose**: Waitlist for full class slots

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Waitlist entry ID |
| `class_slot_id` | uuid (FK) | ✅ Existing | References `class_slots.id` (cascade on delete) |
| `user_id` | text | ✅ Existing | References Control Panel `user.id` (Better-Auth) |
| `position` | integer | ✅ Existing | Position in queue |
| `status` | text | ✅ Existing | `waiting` \| `notified` \| `booked` \| `expired` \| `cancelled` |
| `notified_at` | timestamp | ✅ Existing | Notification timestamp (nullable) |
| `expires_at` | timestamp | ✅ Existing | Expiry (nullable) |
| `booked_at` | timestamp | ✅ Existing | When spot was booked (nullable) |
| `appointment_id` | uuid (FK, nullable) | ✅ Existing | References `appointments.id` (set null on delete) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: Unique on (`class_slot_id`, `user_id`); index on class_slot_id, user_id, status; composite on (class_slot_id, status, position).

---

#### `appointment_clients` ✅
**No changes needed** - All fields remain as-is.

---

#### `appointment_staff` ✅
**No changes needed** - All fields remain as-is.

---

#### `commission_splits` ✅
**No changes needed** - All fields remain as-is.

---

### Package Instance Tables

#### `package_instances` ✅ 🔄 **Shared**
**Purpose**: Unified tracking for both staff-assigned and client-purchased packages (single table with `source` = `assigned` \| `purchased`).

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Instance ID |
| `package_id` | uuid (FK) | ✅ Existing | References `packages.id` (restrict on delete) |
| `client_id` | text | ✅ Existing | References Control Panel `user.id` (Better-Auth) |
| `source` | text | ✅ Existing | `assigned` \| `purchased` |
| `assigned_by` | text | ✅ Existing | User ID of assigner (when source = assigned, nullable) |
| `purchase_number` | text (unique, nullable) | ✅ Existing | Purchase number (e.g. PKG-2024-001) |
| `payment_id` | uuid (FK, nullable) | ✅ Existing | References `payments.id` (set null on delete) |
| `total_price` | integer (nullable) | ✅ Existing | Total price (cents) |
| `tax_amount` | integer | ✅ Existing | Tax amount (default: 0) |
| `payment_status` | text | ✅ Existing | Status: `pending`, `paid`, `failed`, `refunded` |
| `payment_method` | text | ✅ Existing | Payment method (nullable) |
| `e_signature` | text | ✅ Existing | Electronic signature (nullable) |
| `terms_agreed_at` | timestamp | ✅ Existing | Terms agreement timestamp (nullable) |
| `credits_total` | integer | ✅ Existing | Total credits |
| `credits_remaining` | integer | ✅ Existing | Remaining credits |
| `credits_used` | integer | ✅ Existing | Credits used (default: 0) |
| `starts_at` | timestamp | ✅ Existing | Start date/time |
| `expires_at` | timestamp | ✅ Existing | Expiration date/time |
| `status` | text | ✅ Existing | Status: `active`, `expired`, `exhausted`, `cancelled` |
| `remark` | text | ✅ Existing | Remarks (nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: package_id, client_id, source, status, payment_status, expires_at, (client_id, status), purchase_number.

---

#### `preferred_times` 🔄 **Shared**
**Purpose**: Preferred day and time combinations for Personal Training packages

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Preferred time ID |
| `package_instance_id` | uuid (FK) | ✅ Existing | References `package_instances.id` (cascade on delete) |
| `day_of_week` | text (NOT NULL) | ✅ Existing | Day: `Monday`, `Tuesday`, etc. |
| `time` | text (NOT NULL) | ✅ Existing | Preferred time as text (e.g. `09:00`) |
| `priority` | integer (NOT NULL) | ✅ Existing | Priority order (1-4) |
| `created_at` | timestamp | ✅ Existing | Creation time |

**Indexes**: Index on `package_instance_id`; composite on (`package_instance_id`, `priority`).

**Business Rules**: Maximum 4 preferred times per package instance; priority unique per package instance (1-4).

---

### Payment Tables

#### `payments` 🔄 **Shared**
**Purpose**: Tracks customer payments; amounts in cents (integer). Matches codebase.

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Payment ID |
| `stripe_payment_intent_id` | text (unique) | ✅ Existing | Stripe PaymentIntent ID |
| `stripe_charge_id` | text | ✅ Existing | Stripe Charge ID (nullable) |
| `customer_id` | text | ✅ Existing | Client who paid (references `members.user_id` or Control Panel `user.id`) |
| `stripe_customer_id` | text | ✅ Existing | Stripe Customer ID (nullable) |
| `amount` | integer | ✅ Existing | Amount in cents (pre-tax) |
| `tax_amount` | integer | ✅ Existing | Tax in cents (default: 0) |
| `total_amount` | integer | ✅ Existing | Total in cents (amount + tax) |
| `currency` | text | ✅ Existing | ISO currency (default: `usd`) |
| `platform_fee_amount` | integer | ✅ Existing | Platform fee in cents (default: 0) |
| `platform_fee_percentage` | integer | ✅ Existing | Platform fee % (default: 0) |
| `franchiser_amount` | integer | ✅ Existing | Amount franchiser receives |
| `status` | text | ✅ Existing | `pending`, `succeeded`, `failed`, `canceled`, `refunded` |
| `appointment_id` | uuid (FK, nullable) | ✅ Existing | References `appointments.id` (set null on delete) |
| `description` | text | ✅ Existing | Payment description (nullable) |
| `metadata` | text | ✅ Existing | JSON metadata (nullable) |
| `user_id` | text | ✅ Existing | Control Panel `user.id` (mobile app client, nullable) |
| `payment_number` | text (unique, nullable) | ✅ Existing | Human-readable payment ID |
| `payment_method` | text | ✅ Existing | `card`, `apple_pay`, `google_pay`, `cash` (nullable) |
| `refunded_at` | timestamp | ✅ Existing | Refund time (nullable) |
| `refund_amount` | integer | ✅ Existing | Refund amount in cents (nullable) |
| `failure_reason` | text | ✅ Existing | Failure reason (nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: stripe_payment_intent_id, stripe_charge_id, customer_id, appointment_id, status, (customer_id, status), user_id, payment_number, payment_method.

**No changes needed** - Matches codebase (amounts in cents).

---

#### `payment_items` 🔄 **Shared**
**Purpose**: Line items for payments (for order breakdown)

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Item ID |
| `payment_id` | uuid (FK) | ✅ Existing | References `payments.id` (cascade on delete) |
| `item_type` | text (NOT NULL) | ✅ Existing | Type: `package`, `booking`, `tax`, `fee`, `discount` |
| `item_id` | uuid | ✅ Existing | Reference to item (nullable) |
| `description` | text (NOT NULL) | ✅ Existing | Item description |
| `quantity` | integer | ✅ Existing | Quantity (default: 1) |
| `unit_price` | integer (NOT NULL) | ✅ Existing | Unit price in cents |
| `total_price` | integer (NOT NULL) | ✅ Existing | Total price in cents |
| `created_at` | timestamp | ✅ Existing | Creation time |

**Indexes**:
- Index on `payment_id`
- Index on `item_type`, `item_id`

---

#### `partner_stripe_accounts` ✅
**No changes needed** - All fields remain as-is.

---

#### `payouts` ✅
**No changes needed** - All fields remain as-is.

---

### Notification Tables

#### `notifications` 🔄 **Shared**
**Purpose**: User notifications. Matches codebase.

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Notification ID |
| `user_id` | text | ✅ Existing | References Control Panel `user.id` (Better-Auth) |
| `type` | text (NOT NULL) | ✅ Existing | Type: `booking`, `reminder`, `payment`, `promotion`, `system` |
| `title` | text (NOT NULL) | ✅ Existing | Notification title |
| `message` | text (NOT NULL) | ✅ Existing | Notification message |
| `icon` | text | ✅ Existing | Icon name (nullable) |
| `color` | text | ✅ Existing | Icon color (nullable) |
| `related_id` | uuid | ✅ Existing | Related entity ID (nullable) |
| `related_type` | text | ✅ Existing | Related entity type (nullable) |
| `is_read` | boolean | ✅ Existing | Read status (default: false) |
| `read_at` | timestamp | ✅ Existing | Read timestamp (nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |

**Indexes**: user_id, is_read, type, (user_id, is_read, created_at).

**No changes needed** - Matches codebase.

---

### Profile Tables (Staff vs Customer)

#### `member_profiles` ✅ 🔄 **Shared**
**Purpose**: Extended profile for staff/trainers (1:1 with `members`).

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Profile ID |
| `member_id` | uuid (FK, unique) | ✅ Existing | References `members.id` (cascade on delete) |
| `display_name` | text | ✅ Existing | Display name (nullable) |
| `bio` | text | ✅ Existing | Biography (nullable) |
| `specialization` | text | ✅ Existing | Specialization (nullable) |
| `image_url` | text | ✅ Existing | Profile image URL (nullable) |
| `phone_number` | text | ✅ Existing | Contact phone (nullable) |
| `certifications` | text[] | ✅ Existing | Certifications array (nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: Index on `member_id`.

---

#### `notification_preferences` ✅ 🔄 **Shared**
**Purpose**: User notification preferences per tenant

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Preference ID |
| `user_id` | text (unique) | ✅ Existing | References Control Panel `user.id` (one-to-one) |
| `email_enabled` | boolean | ✅ Existing | Email notifications (default: true) |
| `sms_enabled` | boolean | ✅ Existing | SMS notifications (default: false) |
| `push_enabled` | boolean | ✅ Existing | Push notifications (default: true) |
| `booking_reminders` | boolean | ✅ Existing | Booking reminders (default: true) |
| `booking_confirmations` | boolean | ✅ Existing | Booking confirmations (default: true) |
| `promotional_emails` | boolean | ✅ Existing | Promotional emails (default: true) |
| `package_expiry` | boolean | ✅ Existing | Package expiry reminders (default: true) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: Unique index on `user_id`.

---

#### `user_activity_log` 🔄 **Shared**
**Purpose**: User activity tracking (for Recent Activity section). Matches codebase.

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Activity ID |
| `user_id` | text | ✅ Existing | References Control Panel `user.id` (Better-Auth) |
| `activity_type` | text (NOT NULL) | ✅ Existing | Type: `booking_created`, `booking_completed`, `booking_cancelled`, `package_purchased`, `credit_used`, `credit_added` |
| `title` | text (NOT NULL) | ✅ Existing | Activity title |
| `description` | text | ✅ Existing | Activity description (nullable) |
| `related_id` | uuid | ✅ Existing | Related entity ID (nullable) |
| `related_type` | text | ✅ Existing | Related entity type (nullable) |
| `credits_change` | integer | ✅ Existing | Credits change (+/-, default: 0) |
| `icon` | text | ✅ Existing | Icon name (nullable) |
| `created_at` | timestamp | ✅ Existing | Activity timestamp |

**Indexes**: user_id, activity_type, (user_id, created_at).

**No changes needed** - Matches codebase.

---

## Additional Tables

### Customer Management Tables

#### `customer_profiles` ✅ 🔄 **Shared**
**Purpose**: Extended customer profile data (tenant DB; one org per DB so `user_id` unique per tenant).

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Profile ID |
| `user_id` | text (unique) | ✅ Existing | References Control Panel `user.id` (Better-Auth, no FK - cross-database) |
| `phone` | text | ✅ Existing | Phone number (nullable) |
| `date_of_birth` | timestamp | ✅ Existing | Date of birth (nullable) |
| `gender` | text | ✅ Existing | Gender (nullable) |
| `address` | text | ✅ Existing | Address (nullable) |
| `emergency_contact_name` | text | ✅ Existing | Emergency contact name (nullable) |
| `emergency_contact_phone` | text | ✅ Existing | Emergency contact phone (nullable) |
| `medical_notes` | text | ✅ Existing | Medical notes (nullable) |
| `fitness_goals` | text[] | ✅ Existing | Fitness goals array (nullable) |
| `credit_points` | integer | ✅ Existing | Loyalty/credit points (default: 0) |
| `notes` | text | ✅ Existing | Notes (nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: Unique index on `user_id`; index on `credit_points`.

---

### System Management Tables

#### `announcements` ✅ 🔄 **Shared**
**Purpose**: System announcements for dashboard widget

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Announcement ID |
| `branch_id` | uuid (FK, nullable) | ✅ Existing | References `hierarchy_nodes.id` (cascade on delete) |
| `title` | text | ✅ Existing | Announcement title |
| `message` | text | ✅ Existing | Announcement message |
| `priority` | text | ✅ Existing | `low` \| `normal` \| `high` \| `urgent` (default: `normal`) |
| `target_audience` | text | ✅ Existing | `all` \| `staff` \| `clients` (default: `all`) |
| `start_date` | timestamp | ✅ Existing | Start date (nullable) |
| `end_date` | timestamp | ✅ Existing | End date (nullable) |
| `is_active` | boolean | ✅ Existing | Active status (default: true) |
| `is_pinned` | boolean | ✅ Existing | Pinned (default: false) |
| `created_by` | text | ✅ Existing | References `members.user_id` (no FK - cross-database) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: branch_id, is_active, priority, target_audience, (start_date, end_date), (is_active, start_date, end_date).

---

#### `expenses` ✅ 🔄 **Shared**
**Purpose**: Expense/claim tracking for staff reimbursements

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Expense ID |
| `branch_id` | uuid (FK, nullable) | ✅ Existing | References `hierarchy_nodes.id` (restrict on delete) |
| `submitted_by` | text | ✅ Existing | References `members.user_id` (no FK - cross-database) |
| `amount` | integer | ✅ Existing | Amount in cents |
| `currency` | text | ✅ Existing | Currency (default: `usd`) |
| `category` | text | ✅ Existing | `travel` \| `equipment` \| `supplies` \| `training` \| `other` |
| `description` | text | ✅ Existing | Description |
| `receipt_url` | text | ✅ Existing | Receipt URL (nullable) |
| `expense_date` | timestamp | ✅ Existing | Expense date |
| `status` | text | ✅ Existing | `pending` \| `approved` \| `rejected` \| `paid` (default: `pending`) |
| `approved_by` | text | ✅ Existing | Approver user ID (nullable) |
| `approved_at` | timestamp | ✅ Existing | Approval time (nullable) |
| `rejection_reason` | text | ✅ Existing | Rejection reason (nullable) |
| `paid_at` | timestamp | ✅ Existing | Paid time (nullable) |
| `paid_by` | text | ✅ Existing | Payer (nullable) |
| `payment_reference` | text | ✅ Existing | Payment reference (nullable) |
| `notes` | text | ✅ Existing | Notes (nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: branch_id, submitted_by, status, category, expense_date; (submitted_by, status).

---

### Service Configuration Tables

#### `service_category_config` ✅ 🔄 **Shared**
**Purpose**: Commission, incentive, and booking rules per category (1:1 with service_categories)

| Column | Type | Status | Description |
|--------|------|--------|-------------|
| `id` | uuid (PK) | ✅ Existing | Config ID |
| `category_id` | uuid (FK, unique) | ✅ Existing | References `service_categories.id` (cascade on delete) |
| `default_duration` | integer | ✅ Existing | Default duration (nullable) |
| `default_max_attendees` | integer | ✅ Existing | Default max attendees (nullable) |
| `incentive_type` | text | ✅ Existing | `fixed` \| `variable` (nullable) |
| `is_conditional` | boolean | ✅ Existing | Conditional payment (default: false) |
| `max_staff` | integer | ✅ Existing | Max staff (default: 1) |
| `staff_pool_percentage` | integer | ✅ Existing | Staff pool % (default: 100) |
| `staff_weightage` | jsonb | ✅ Existing | Position weightage (nullable) |
| `payment_structures` | jsonb | ✅ Existing | Payment config (nullable) |
| `threshold` | integer | ✅ Existing | Threshold (nullable) |
| `require_advance_booking` | boolean | ✅ Existing | Require advance booking (default: false) |
| `min_advance_hours` | integer | ✅ Existing | Min advance hours (nullable) |
| `enable_cancellation_window` | boolean | ✅ Existing | Cancellation window (default: false) |
| `cancellation_cutoff_hours` | integer | ✅ Existing | Cancellation cutoff hours (nullable) |
| `created_at` | timestamp | ✅ Existing | Creation time |
| `updated_at` | timestamp | ✅ Existing | Last update |

**Indexes**: category_id (unique), incentive_type.

---

## Summary of Changes

### Modified Tables
1. **`organizations`** - Has `schema_version` (codebase has no unique on `name`)
2. **`service_categories`** - Matches codebase (id, name, description, display_order, branch_id, is_active, created_at, updated_at only)
3. **`services`** - Matches codebase (includes title, description, type, image_url, price, price_unit, taxable, tax_percentage, is_recommended, location, features, scheduling_type; no duration_minutes, popularity_percentage, sessions, expirable, expiry_*, time_preset_config)
4. **`appointments`** - Matches codebase: booking_number, user_id, package_instance_id, trainer_id (uuid → members.id), description, image_url, credits_used, location, cancelled_at, cancellation_reason, class_slot_id (recurrence in `recurrence_rules` table)
5. **`packages`** - Matches codebase: name, appointment_type, cross_usage_enabled, session_count, price_per_session, max_clients_per_session, expiry_days, expiry_date, auto_generate_invoice, branch_id, allowed_service_ids, is_archived (no title, description, type, credits, schedule, duration_weeks, sessions_per_week, price in codebase)
6. **`payments`** - Matches codebase: amounts in integer (cents); stripe_payment_intent_id, customer_id, user_id, payment_number, platform_fee_*, franchiser_amount, etc.

### New Tables (Shared)
1. **`service_members`** - Service-member (trainer/staff) relationships
2. **`class_slots`** - Class time slots
3. **`waitlist_entries`** - Waitlist for full classes
4. **`package_instances`** - Unified package instances (assigned + purchased)
5. **`recurrence_rules`** - Recurrence config for appointments (1:1 with appointment)
6. **`preferred_times`** - Preferred scheduling times
7. **`payment_items`** - Payment line items
8. **`notifications`** - User notifications
9. **`member_profiles`** and **`customer_profiles`** - Extended profiles (staff vs customer)
10. **`notification_preferences`** - Notification settings
11. **`user_activity_log`** - Activity tracking

### New Tables (Additional)
1. **`customer_profiles`** - Extended customer profiles (shared)
2. **`announcements`** - System announcements (shared)
3. **`expenses`** - Expense/claim tracking (shared)
4. **`service_category_config`** - Service category configuration (shared)

### Total Field Additions
- **`service_categories`**: Matches codebase (no extra fields in code)
- **`services`**: Matches codebase (title, description, type, image_url, price, price_unit, taxable, tax_percentage, is_recommended, location, features, scheduling_type)
- **`appointments`**: Matches codebase (booking_number, user_id, package_instance_id, trainer_id, credits_used, location, cancelled_at, cancellation_reason, class_slot_id, description, image_url)
- **`packages`**: Matches codebase (name, appointment_type, session_count, price_per_session, etc.; no title/description/credits/schedule in codebase)
- **`payments`**: Matches codebase (integer amounts in cents; all columns documented)

### Migration Priority
1. **Phase 1 (Critical)**: `organizations`, `services`, `service_categories`, `appointments`
2. **Phase 2**: Service-related tables (service_members, class_slots, waitlist_entries)
3. **Phase 3**: Package tables (`package_instances`, `preferred_times`, `recurrence_rules`)
4. **Phase 4**: Notification and preference tables (`notifications`, `member_profiles`, `customer_profiles`, `notification_preferences`, `user_activity_log`, `payment_items`)
5. **Phase 5 (Optional)**: New tables based on feature requirements

---

## Field Mapping Reference

### Web/Mobile App → Schema Mappings

#### Service Fields (codebase)
- `title` → `services.title`
- `description` → `services.description`
- `type` → `services.type` (`private`, `semi_private`)
- `image_url` → `services.image_url`
- `price_unit` → `services.price_unit` (`session`, `class`, `package`)
- `is_recommended` → `services.is_recommended`
- `location` → `services.location`
- `features` → `services.features` (text array). Note: codebase does not have `popularity_percentage`.

#### Booking Fields (codebase)
- `booking_number` → `appointments.booking_number`
- `user_id` → `appointments.user_id` (references Control Panel `user.id`)
- `package_instance_id` → `appointments.package_instance_id` (references `package_instances.id`)
- `trainer_id` → `appointments.trainer_id` (uuid, references `members.id`; not `members.user_id`)
- Date/time → derive from `appointments.start_time`, `end_time` (no separate scheduled_date/scheduled_time columns)
- `notes` → `appointments.notes`; `remark` can map to `notes`
- `location` → `appointments.location`
- `image_url` → `appointments.image_url`
- `credits_used` → `appointments.credits_used`

#### Package Fields (codebase)
- `name` → `packages.name`
- `appointment_type` → `packages.appointment_type` (`private`, `semi-private`, `both`)
- `session_count` → `packages.session_count`
- `price_per_session` → `packages.price_per_session` (cents)
- `cross_usage_enabled` → `packages.cross_usage_enabled`
- `expiry_days` / `expiry_date` → `packages.expiry_days`, `packages.expiry_date`
- Note: codebase does not have title, description, type, credits, schedule, duration_weeks, sessions_per_week, or single price column.

---

## Business Rules

### Authentication
1. Both web admin and mobile app use Better-Auth `user` table in Control Panel DB (email-based authentication)
2. Sessions are managed by Better-Auth in Control Panel DB
3. Sessions expire after configured duration (Better-Auth settings)

### Bookings
1. Bookings require available credits (for credit-based services)
2. Class bookings require available spots in `class_slots`
3. Cancellations must be made at least 24 hours in advance (configurable per service category)
4. Auto-assigned trainers are assigned based on availability and specialization
5. Booking status flow: `pending` → `confirmed` → `completed`/`cancelled`

### Packages
1. Personal Training packages include credits
2. Class packages have fixed schedules
3. Maximum 4 preferred times per Personal Training package
4. Packages expire based on `expires_at` date
5. Credits cannot be negative (enforced by check constraint)
6. `workouts_remaining` = `credits_remaining` (calculated field)
7. `plan_progress` = ((`credits_total` - `credits_remaining`) / `credits_total`) * 100 (calculated field)
8. `renewal_date` is set based on package duration from `starts_at` or `expires_at`

### Payments
1. Payment must be completed before package activation
2. Tax calculation: configurable percentage (stored in service/service_category)
3. Refunds must be processed through payment gateway (Stripe)
4. Payment status flow: `pending` → `processing` → `succeeded`/`failed`

### Waitlist
1. Users can join waitlist for full class slots
2. When a spot becomes available, users are notified in order of waitlist entry
3. Waitlist entries expire after 7 days if not booked
4. Maximum 1 waitlist entry per user per class slot

### Notifications
1. Unread notifications are marked as read when viewed
2. Notifications older than 90 days can be archived
3. System notifications cannot be deleted by users
4. Booking notifications are created when booking status changes
5. Reminder notifications are sent 24 hours before scheduled bookings (configurable)

### Data Integrity
1. Soft deletes for critical records (add `deleted_at` timestamp)
2. Audit trail for financial transactions
3. Referential integrity via foreign keys with appropriate CASCADE rules
4. Unique constraints on business-critical fields
5. `credits_remaining` must be >= 0 (check constraint)
6. `spots_available` must be >= 0 and <= `capacity` (check constraint)
7. `expires_at` must be > `starts_at` (check constraint)
8. `start_time` (date part) must be >= CURRENT_DATE for new bookings (check constraint; codebase uses start_time/end_time)

---

## Relationships Diagram

### Additional Relationships (Shared)

```
user (Control Panel) (1) ──< (many) appointments (via user_id text)
user (Control Panel) (1) ──< (many) package_instances (via client_id text)
user (Control Panel) (1) ──< (many) payments (via user_id text)
user (Control Panel) (1) ──< (many) notifications (via user_id text)
user (Control Panel) (1) ──< (many) user_activity_log (via user_id text)
user (Control Panel) (1) ── (1) customer_profiles (via user_id text, per tenant)
user (Control Panel) (1) ── (1) notification_preferences (via user_id text)

service_categories (1) ──< (many) services
services (1) ──< (many) bookings
services (1) ──< (many) packages
services (1) ──< (many) class_slots
services (many) ──< (many) service_members ──> (many) members

members (1) ──< (many) appointments (via trainer_id uuid, references members.id)

packages (1) ──< (many) package_instances
package_instances (1) ──< (many) appointments (via package_instance_id)
package_instances (1) ──< (many) preferred_times
package_instances (1) ── (1) payments (optional, via payment_id)

payments (1) ──< (many) payment_items
payments (1) ── (many) package_instances (via payment_id, optional)

class_slots (1) ──< (many) waitlist_entries
class_slots (1) ──< (many) bookings
```

### Server Relationships (Control Panel Database)

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

### Server Relationships (Tenant Database)

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

## Indexes & Performance

### Critical Indexes (Shared)

1. **User Lookups**:
   - Control Panel `user.email` (unique)
   - Control Panel `user.id` (text, Better-Auth format)

2. **Booking Queries**:
   - `appointments(user_id, status)` and `appointments(start_time, status)`
   - `appointments(start_time)` (date/time from start_time, end_time)

3. **Package Queries**:
   - `package_instances(client_id, status)`
   - `package_instances(expires_at)` (for expiration checks)

4. **Notification Queries**:
   - `notifications(user_id, is_read, created_at)`

5. **Activity Queries**:
   - `user_activity_log(user_id, created_at DESC)`

### Performance Considerations

- Use **partial indexes** for active records (e.g., `WHERE is_active = true`)
- Consider **partitioning** for large tables:
  - `appointments` by `start_time`
  - `notifications` by `created_at`
  - `user_activity_log` by `created_at`
- Use **materialized views** for dashboard aggregations:
  - User workout statistics
  - Popular services
  - Revenue metrics

---

## Sample Queries

### Get User Dashboard Data
```sql
-- User's active package with remaining credits (package_instances.client_id = Control Panel user.id)
SELECT 
  pp.id,
  p.name as package_name,
  pp.credits_remaining,
  pp.expires_at
FROM package_instances pp
JOIN packages p ON pp.package_id = p.id
WHERE pp.client_id = $1 
  AND pp.status = 'active'
ORDER BY pp.created_at DESC
LIMIT 1;

-- Upcoming bookings (use start_time; trainer_id references members.id)
SELECT 
  b.id,
  s.title as service_name,
  b.start_time,
  b.end_time,
  mp.display_name as trainer_name,
  b.location
FROM appointments b
JOIN services s ON b.service_id = s.id
LEFT JOIN members m ON b.trainer_id = m.id
LEFT JOIN member_profiles mp ON mp.member_id = m.id
WHERE b.user_id = $1 
  AND b.status = 'confirmed'
  AND b.start_time >= CURRENT_TIMESTAMP
ORDER BY b.start_time
LIMIT 5;

-- Recent activity
SELECT 
  activity_type,
  title,
  description,
  credits_change,
  icon,
  created_at
FROM user_activity_log
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 10;
```

### Get Unread Notifications Count
```sql
SELECT COUNT(*) as unread_count
FROM notifications
WHERE user_id = $1 AND is_read = false;
```

### Get Available Class Slots
```sql
SELECT 
  cs.id,
  cs.date,
  cs.start_time,
  cs.end_time,
  cs.spots_available,
  cs.is_full
FROM class_slots cs
WHERE cs.service_id = $1
  AND cs.date >= CURRENT_DATE
  AND cs.is_available = true
  AND cs.is_full = false
ORDER BY cs.date, cs.start_time;
```

### Get User Fitness Plan Progress
```sql
-- Get active package with progress (codebase: client_id, packages.name; no workouts_completed/renewal_date)
SELECT 
  pp.id,
  p.name as package_name,
  pp.credits_total,
  pp.credits_remaining,
  (pp.credits_total - pp.credits_remaining) as workouts_completed,
  pp.expires_at,
  pp.expires_at as renewal_date,
  ROUND(((pp.credits_total - pp.credits_remaining)::decimal / NULLIF(pp.credits_total, 0)) * 100, 2) as plan_progress,
  CEIL(pp.credits_remaining::decimal / 2.0) as weeks_to_finish
FROM package_instances pp
JOIN packages p ON pp.package_id = p.id
WHERE pp.client_id = $1 
  AND pp.status = 'active'
ORDER BY pp.created_at DESC
LIMIT 1;
```

### Join Waitlist
```sql
-- waitlist_entries has no service_id; unique on (class_slot_id, user_id)
INSERT INTO waitlist_entries (user_id, class_slot_id, position, status)
VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1 FROM waitlist_entries WHERE class_slot_id = $2), 'waiting')
ON CONFLICT (class_slot_id, user_id) DO NOTHING;
```

---

## Computed Fields & Views (Mobile App)

### Dashboard Calculations

The following fields are computed/calculated for the mobile app dashboard:

1. **Workouts Remaining**: `credits_remaining` from active `package_instances`
2. **Plan Progress**: `((credits_total - credits_remaining) / credits_total) * 100`
3. **Weeks to Finish**: Calculated based on average workouts per week and remaining credits
4. **Renewal Date**: `expires_at` or calculated from package duration

### Materialized Views (Recommended)

```sql
-- User package summary (for dashboard; codebase: client_id, packages.name)
CREATE MATERIALIZED VIEW user_package_summary AS
SELECT 
  pp.client_id as user_id,
  pp.id as package_instance_id,
  p.name as package_title,
  pp.credits_total,
  pp.credits_remaining,
  (pp.credits_total - pp.credits_remaining) as workouts_completed,
  pp.starts_at,
  pp.expires_at,
  pp.expires_at as renewal_date,
  pp.status,
  ROUND(((pp.credits_total - pp.credits_remaining)::decimal / NULLIF(pp.credits_total, 0)) * 100, 2) as plan_progress
FROM package_instances pp
JOIN packages p ON pp.package_id = p.id
WHERE pp.status = 'active';

-- Refresh periodically or on package_instances updates
CREATE INDEX ON user_package_summary(user_id);
```

---

## Migration Scripts Preview

### Migration 1: Organizations (codebase does not have unique on name)
```sql
-- Optional: Add unique constraint on organizations.name only if desired.
-- Current codebase does NOT enforce unique on name.
-- SELECT name, COUNT(*) FROM organizations GROUP BY name HAVING COUNT(*) > 1;
-- CREATE UNIQUE INDEX idx_organizations_name_unique ON organizations(name);
```

### Migration 2: Services Table (codebase already has these)
```sql
-- Codebase already has: title, description, type, image_url, price, price_unit, taxable,
-- tax_percentage, is_recommended, location, features, scheduling_type.
-- Do NOT add: sessions, expirable, expiry_*, time_preset_config, popularity_percentage (not in codebase).
-- Use only if applying to an older schema; otherwise skip.
```

### Migration 3: Service Categories (codebase: config in service_category_config)
```sql
-- Codebase keeps service_categories minimal (id, name, description, display_order, branch_id, is_active).
-- Commission/incentive/booking rules live in service_category_config (1:1 with service_categories).
-- Do not add duration, max_attendees, incentive_type, etc. to service_categories; use service_category_config.
```

### Migration 4: Appointments Table Additions
```sql
ALTER TABLE appointments
ADD COLUMN booking_number text UNIQUE,
ADD COLUMN user_id text, -- References Control Panel user.id (Better-Auth, no FK - cross-database)
ADD COLUMN package_instance_id uuid REFERENCES package_instances(id) ON DELETE SET NULL,
ADD COLUMN trainer_id uuid REFERENCES members(id) ON DELETE SET NULL,
ADD COLUMN description text,
ADD COLUMN image_url text,
ADD COLUMN credits_used integer DEFAULT 1,
ADD COLUMN location text,
ADD COLUMN cancelled_at timestamp,
ADD COLUMN cancellation_reason text,
ADD COLUMN class_slot_id uuid REFERENCES class_slots(id) ON DELETE SET NULL;

-- Add indexes
CREATE UNIQUE INDEX idx_appointments_booking_number ON appointments(booking_number) WHERE booking_number IS NOT NULL;
CREATE INDEX idx_appointments_user_id ON appointments(user_id);
CREATE INDEX idx_appointments_package_instance_id ON appointments(package_instance_id);
CREATE INDEX idx_appointments_trainer_id ON appointments(trainer_id);
CREATE INDEX idx_appointments_class_slot_id ON appointments(class_slot_id);
CREATE INDEX idx_appointments_user_status ON appointments(user_id, status);
```

**Recurrence**: Use separate `recurrence_rules` table (see Migration 8) for frequency_value, time_unit, repeat_on, monthly_type, ends_type, ends_after_occurrences (1:1 with appointment).

**Note**: Columns `package_instance_id` and `class_slot_id` reference tables created in Migrations 7–8; add these columns in a migration that runs after `package_instances` and `class_slots` exist, or create tables in dependency order as in the codebase.

### Migration 5: Packages Table Additions
```sql
ALTER TABLE packages
ADD COLUMN title text,
ADD COLUMN description text,
ADD COLUMN type text,
ADD COLUMN credits integer,
ADD COLUMN schedule text,
ADD COLUMN duration_weeks integer,
ADD COLUMN sessions_per_week integer,
ADD COLUMN price decimal(10,2);

-- Add indexes
CREATE INDEX idx_packages_type ON packages(type);
```

### Migration 6: Additional Tables (Shared)

**Note**: Mobile app authentication uses Better-Auth `user` table in Control Panel DB. No separate authentication tables needed in tenant databases. Sessions are managed by Better-Auth in Control Panel DB.

### Migration 7: Service-Related Tables (Shared)
```sql
-- Create service_members junction table (services ↔ members who can deliver)
CREATE TABLE service_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  UNIQUE(service_id, member_id)
);

CREATE INDEX idx_service_members_service_id ON service_members(service_id);
CREATE INDEX idx_service_members_member_id ON service_members(member_id);

-- Create class_slots table
CREATE TABLE class_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id),
  date date NOT NULL,
  time time NOT NULL,
  capacity integer NOT NULL,
  spots_available integer NOT NULL,
  is_full boolean DEFAULT false,
  is_available boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX idx_class_slots_service_id ON class_slots(service_id);
CREATE INDEX idx_class_slots_date_time ON class_slots(date, time);
CREATE INDEX idx_class_slots_available_full ON class_slots(is_available, is_full);
CREATE UNIQUE INDEX idx_class_slots_service_date_time ON class_slots(service_id, date, time);

-- Create waitlist_entries table
CREATE TABLE waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL, -- References Control Panel user.id (Better-Auth, no FK - cross-database)
  class_slot_id uuid NOT NULL REFERENCES class_slots(id),
  service_id uuid NOT NULL REFERENCES services(id),
  status text NOT NULL,
  notified_at timestamp,
  booked_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX idx_waitlist_entries_user_id ON waitlist_entries(user_id);
CREATE INDEX idx_waitlist_entries_class_slot_id ON waitlist_entries(class_slot_id);
CREATE INDEX idx_waitlist_entries_service_id ON waitlist_entries(service_id);
CREATE INDEX idx_waitlist_entries_status ON waitlist_entries(status);
CREATE INDEX idx_waitlist_entries_slot_status_created ON waitlist_entries(class_slot_id, status, created_at);
```

### Migration 8: Package Instances and Recurrence (Shared)
```sql
-- Create package_instances table (unified: assigned + purchased via source)
CREATE TABLE package_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  client_id text NOT NULL, -- References Control Panel user.id (Better-Auth, no FK - cross-database)
  source text NOT NULL, -- 'assigned' | 'purchased'
  assigned_by text,
  purchase_number text UNIQUE,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  total_price integer,
  tax_amount integer DEFAULT 0,
  payment_status text NOT NULL,
  payment_method text,
  e_signature text,
  terms_agreed_at timestamp,
  credits_total integer NOT NULL,
  credits_remaining integer NOT NULL,
  credits_used integer DEFAULT 0 NOT NULL,
  starts_at timestamp NOT NULL,
  expires_at timestamp NOT NULL,
  status text NOT NULL,
  remark text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX idx_package_instances_package_id ON package_instances(package_id);
CREATE INDEX idx_package_instances_client_id ON package_instances(client_id);
CREATE INDEX idx_package_instances_source ON package_instances(source);
CREATE INDEX idx_package_instances_status ON package_instances(status);
CREATE INDEX idx_package_instances_payment_status ON package_instances(payment_status);
CREATE INDEX idx_package_instances_expires_at ON package_instances(expires_at);
CREATE INDEX idx_package_instances_client_status ON package_instances(client_id, status);
CREATE INDEX idx_package_instances_purchase_number ON package_instances(purchase_number);

-- Create preferred_times table
CREATE TABLE preferred_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_instance_id uuid NOT NULL REFERENCES package_instances(id) ON DELETE CASCADE,
  day_of_week text NOT NULL,
  time time NOT NULL,
  priority integer DEFAULT 1,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_preferred_times_package_instance_id ON preferred_times(package_instance_id);
CREATE INDEX idx_preferred_times_package_priority ON preferred_times(package_instance_id, priority);

-- Create recurrence_rules table (1:1 with recurring parent appointment)
CREATE TABLE recurrence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  frequency_value integer NOT NULL DEFAULT 1,
  time_unit text NOT NULL,
  repeat_on jsonb,
  monthly_type text,
  monthly_day_of_week integer,
  monthly_week_of_month integer,
  ends_type text NOT NULL,
  ends_after_occurrences integer,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX idx_recurrence_rules_appointment_id ON recurrence_rules(appointment_id);
```

### Migration 9: Payment Tables (Shared)
```sql
-- Add additional fields to payments table
ALTER TABLE payments
ADD COLUMN user_id text, -- References Control Panel user.id (Better-Auth, no FK - cross-database)
ADD COLUMN payment_number text UNIQUE,
ADD COLUMN amount decimal(10,2),
ADD COLUMN currency text DEFAULT 'USD',
ADD COLUMN payment_method text,
ADD COLUMN payment_intent_id text,
ADD COLUMN status text,
ADD COLUMN failure_reason text,
ADD COLUMN refunded_at timestamp,
ADD COLUMN refund_amount decimal(10,2),
ADD COLUMN metadata jsonb;

-- Add indexes
CREATE UNIQUE INDEX idx_payments_payment_number ON payments(payment_number) WHERE payment_number IS NOT NULL;
CREATE INDEX idx_payments_user_id ON payments(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_payments_payment_intent_id ON payments(payment_intent_id) WHERE payment_intent_id IS NOT NULL;
CREATE INDEX idx_payments_status ON payments(status) WHERE status IS NOT NULL;
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- Create payment_items table
CREATE TABLE payment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  item_type text NOT NULL,
  item_id uuid,
  description text NOT NULL,
  quantity integer DEFAULT 1,
  unit_price decimal(10,2) NOT NULL,
  total_price decimal(10,2) NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_payment_items_payment_id ON payment_items(payment_id);
CREATE INDEX idx_payment_items_type_id ON payment_items(item_type, item_id);
```

### Migration 10: Notification Tables (Shared)
```sql
-- Create notifications table
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL, -- References Control Panel user.id (Better-Auth, no FK - cross-database)
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  icon text,
  color text,
  related_id uuid,
  related_type text,
  is_read boolean DEFAULT false,
  read_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_user_read_created ON notifications(user_id, is_read, created_at);
```

### Migration 11: Profile and Preference Tables (Shared)
```sql
-- Create member_profiles table (extended profile for staff/trainers, 1:1 with members)
CREATE TABLE member_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  display_name text,
  bio text,
  specialization text,
  image_url text,
  phone_number text,
  certifications text[],
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX idx_member_profiles_member_id ON member_profiles(member_id);

-- Create customer_profiles table (extended profile for customers, user_id unique per tenant)
CREATE TABLE customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE, -- References Control Panel user.id (Better-Auth, no FK - cross-database)
  phone text,
  date_of_birth timestamp,
  gender text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  medical_notes text,
  fitness_goals text[],
  credit_points integer DEFAULT 0 NOT NULL,
  notes text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX idx_customer_profiles_user_id ON customer_profiles(user_id);
CREATE INDEX idx_customer_profiles_credit_points ON customer_profiles(credit_points);

-- Create notification_preferences table
CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text UNIQUE NOT NULL, -- References Control Panel user.id (Better-Auth, no FK - cross-database)
  email_enabled boolean DEFAULT true,
  sms_enabled boolean DEFAULT false,
  push_enabled boolean DEFAULT false,
  booking_reminders boolean DEFAULT true,
  promotional_emails boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Create user_activity_log table
CREATE TABLE user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL, -- References Control Panel user.id (Better-Auth, no FK - cross-database)
  activity_type text NOT NULL,
  title text NOT NULL,
  description text,
  related_id uuid,
  related_type text,
  credits_change integer DEFAULT 0,
  icon text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_user_activity_log_user_id ON user_activity_log(user_id);
CREATE INDEX idx_user_activity_log_activity_type ON user_activity_log(activity_type);
CREATE INDEX idx_user_activity_log_created_at ON user_activity_log(created_at);
CREATE INDEX idx_user_activity_log_user_created_desc ON user_activity_log(user_id, created_at DESC);
```

### Migration 12: Customer Management Tables (Shared)

**Note**: `customer_profiles` is created in Migration 11 (Profile and Preference Tables). No separate migration needed unless adding more customer-specific tables.

### Migration 13: System Management Tables (Shared)
```sql
-- Create announcements table
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, -- References tenant organization (no FK - cross-database)
  title text NOT NULL,
  message text NOT NULL,
  priority text DEFAULT 'normal',
  target_audience text,
  start_date timestamp,
  end_date timestamp,
  is_active boolean DEFAULT true,
  created_by text NOT NULL, -- References members.user_id (no FK - cross-database)
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX idx_announcements_organization_id ON announcements(organization_id);
CREATE INDEX idx_announcements_is_active ON announcements(is_active);
CREATE INDEX idx_announcements_start_date ON announcements(start_date);
CREATE INDEX idx_announcements_end_date ON announcements(end_date);
CREATE INDEX idx_announcements_priority ON announcements(priority);
CREATE INDEX idx_announcements_org_active_dates ON announcements(organization_id, is_active, start_date, end_date);

-- Create expenses table
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, -- References tenant organization (no FK - cross-database)
  submitted_by text NOT NULL, -- References members.user_id (no FK - cross-database)
  amount integer NOT NULL,
  currency text DEFAULT 'usd',
  category text,
  description text,
  receipt_url text,
  status text DEFAULT 'pending',
  approved_by text, -- References members.user_id (nullable, no FK - cross-database)
  approved_at timestamp,
  paid_at timestamp,
  notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX idx_expenses_organization_id ON expenses(organization_id);
CREATE INDEX idx_expenses_submitted_by ON expenses(submitted_by);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_approved_by ON expenses(approved_by);
CREATE INDEX idx_expenses_org_status ON expenses(organization_id, status);
CREATE INDEX idx_expenses_submitted_status ON expenses(submitted_by, status);
```

### Migration 14: Service Configuration Tables (Shared)
```sql
-- Create service_category_config table
CREATE TABLE service_category_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL UNIQUE REFERENCES service_categories(id) ON DELETE CASCADE,
  duration integer,
  max_attendees integer,
  incentive_type text,
  is_conditional boolean DEFAULT false,
  max_staff integer DEFAULT 1,
  staff_pool_percentage integer DEFAULT 100,
  staff_weightage jsonb,
  payment_structures jsonb,
  threshold integer,
  require_advance_booking boolean DEFAULT false,
  min_advance_hours integer,
  enable_cancellation_window boolean DEFAULT false,
  cancellation_cutoff_hours integer,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX idx_service_category_config_category_id ON service_category_config(category_id);
CREATE INDEX idx_service_category_config_incentive_type ON service_category_config(incentive_type);
```

---

## Migration Strategy

### Additional Tables (Shared)

1. **Phase 1**: Service-related tables (service_members, class_slots, waitlist_entries)
2. **Phase 2**: Package tables (package_instances, preferred_times, recurrence_rules)
3. **Phase 3**: Payment tables (payment_items)
4. **Phase 4**: Notification and preference tables (notifications, member_profiles, customer_profiles, notification_preferences, user_activity_log)
5. **Phase 5**: Customer and system management tables (customer_profiles, announcements, expenses, service_category_config)
6. **Phase 6**: Indexes and performance optimizations
7. **Phase 7**: Materialized views and computed fields

**Note**: Authentication uses Better-Auth `user` table in Control Panel DB - no separate authentication tables needed.

### Server Tables

1. **Phase 1 (Critical)**: `organizations`, `services`, `service_categories`, `appointments`
2. **Phase 2 (Optional)**: New tables based on feature requirements

---

## Schema Summary

### Total Tables

**Control Panel Tables**: ~10+ tables (Better-Auth + platform management)
**Tenant Tables**: ~34+ tables (shared between web admin and mobile app)

### Additional Tables Summary

**Services & Packages (6 tables)**:
- `service_categories` - Service categories (shared, with mobile additions)
- `services` - Individual services (shared, with mobile additions)
- `service_members` - Service-member relationships; trainers = `members` + `member_profiles`
- `service_members` - Service-member (trainer/staff) relationships
- `packages` - Package offerings (shared)
- `class_slots` - Class availability slots

**Bookings (3 tables)**:
- `appointments` - Individual bookings (shared)
- `class_slots` - Class time slots (shared)
- `waitlist_entries` - Waitlist for full classes (shared)

**Packages (2 tables)**:
- `package_instances` - Unified package instances assigned + purchased (shared)
- `preferred_times` - Preferred scheduling times (shared)

**Payments (2 tables)**:
- `payments` - Payment transactions (shared)
- `payment_items` - Payment line items (shared)

**Notifications (1 table)**:
- `notifications` - User notifications (shared)

**User Preferences (3 tables)**:
- `member_profiles` and `customer_profiles` - Extended profiles (staff vs customer, shared)
- `notification_preferences` - Notification settings (shared)
- `user_activity_log` - Activity tracking (shared)

**Customer Management (1 table)**:
- `customer_profiles` - Extended customer profiles per organization (shared)

**System Management (2 tables)**:
- `announcements` - System announcements (shared)
- `expenses` - Expense/claim tracking (shared)

**Service Configuration (1 table)**:
- `service_category_config` - Service category configuration (shared)

### Key Features Supported

**Server Features**:
✅ Multi-tenant architecture (project-per-tenant)
✅ Better-Auth email-based authentication
✅ RBAC with hierarchy scoping
✅ Service management with Stripe integration
✅ Appointment scheduling
✅ Commission tracking
✅ Payment processing

**Additional Features**:
✅ Unified Better-Auth authentication (email-based, shared by web and mobile)
✅ Service booking (1-on-1 and classes)
✅ Package purchasing with credits
✅ Preferred time scheduling (up to 4 per package)
✅ Class waitlist functionality
✅ Payment processing (Card, Apple Pay, Google Pay)
✅ Notification system
✅ User profiles and preferences
✅ Activity tracking
✅ Dashboard metrics (workouts remaining, progress, etc.)

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
9. **Unified Authentication**: Both web admin and mobile app use Better-Auth `user` table (email-based) in Control Panel DB
10. **Monetary Format**: **Decision needed** - Standardize on cents (integers) OR decimal(10,2). Currently mixed usage.

---

## Migration History

### Control Panel Migrations
- `0000_far_luminals.sql` - Initial control panel schema

### Tenant Migrations
- `0000_noisy_aqueduct.sql` - Core tenant schema (hierarchy_nodes, members, invitations)
- `0001_salty_morlocks.sql` - Service management, packages, appointments, payments, payouts
- `0002_calm_martin_li.sql` - RBAC tables (roles, permissions, role_permissions) + branch fields (address, pic_user_id)
- `0003_green_runaways.sql` - Soft delete support for hierarchy_nodes (adds `deleted_at` column and index)

### Additional Table Migrations (Pending)
- Additional shared tables (service_members, class_slots, package_instances, recurrence_rules, notifications, etc.) as in codebase

---

## Notes

- All new fields are **nullable** unless specified as NOT NULL
- Default values provided where appropriate
- JSONB fields used for flexible configuration (recurrence, time_preset_config, payment_structures, etc.)
- Monetary amounts: **Decision needed** - Standardize on cents (integers) OR decimal(10,2). Currently mixed usage.
- Timestamps use PostgreSQL `timestamp` type (with timezone)
- UUIDs used for primary keys (except Better-Auth tables)
- Foreign key constraints enforce referential integrity
- Indexes added for performance on frequently queried fields
- **Payment-Package Relationship**: `package_instances.payment_id` is NULL until payment is completed, then links to `payments.id`
- **Booking-Package Relationship**: `appointments.package_purchase_id` links bookings to the package used (for credit tracking)
- **Dashboard Calculations**: Use materialized views or computed columns for performance
- **Authentication**: Both web admin and mobile app use Better-Auth `user` table in Control Panel DB (unified authentication)
- **Trainers**: Codebase uses `members` table with `role='trainer'` and `member_profiles` for extended trainer data (no separate trainers table)
- **Members vs Clients**: `members` table is for staff only (admin, trainer, staff). Clients are NOT members - they are users who book appointments
- **Packages**: `package_assignments` is for staff-assigned packages, `package_purchases` is for client-purchased packages - both are shared

---

## Decision Points

1. **Payment Amount Format**: Standardize on cents (integer) or decimal(10,2)? Currently mixed usage.
2. **Trainer Management**: Codebase uses `members` + `member_profiles` (no separate trainers table).
3. **Package Tables**: `package_instances` with `source` = `assigned` \| `purchased` is the single table in codebase.
4. **Appointments**: Single `appointments` table is used for both web admin and mobile app bookings (unified).

---

**Next Steps**: 
1. Review this unified schema with the team
2. Codebase uses `members` + `member_profiles` for trainers (no separate trainers table).
3. Standardize data types (especially monetary amounts - cents vs decimal)
4. Create final migration scripts
5. Test migrations on development database

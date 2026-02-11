# Server Schema Enhancement Plan

**Created**: Based on analysis of `SERVER_SCHEMA.md` vs `apps/web/WEB_WORK.md`  
**Purpose**: Identify schema gaps and changes needed to support web application features

---

## Executive Summary

This plan identifies what needs to be **added** or **changed** in the server database schema to fully support all web application features currently using mock data or not yet implemented.

**Status Indicators**:
- ✅ **Schema Exists** - Table/field already exists in schema
- ⚠️ **Schema Partial** - Table exists but missing fields/functionality
- ❌ **Schema Missing** - Table/field does not exist, needs to be added
- 🔧 **Needs Change** - Schema exists but needs modification
- 📋 **API Only** - Schema is fine, only API endpoints needed

---

## Analysis by Feature Area

### 1. User Management

#### Current Schema Status
- ✅ `user` table exists in Control Panel DB (Better-Auth)
- ✅ `members` table exists in Tenant DB
- ✅ `organization_members` table exists in Control Panel DB (cache)

#### Gaps Identified
- 📋 **API Only**: Need endpoints for:
  - List users in organization
  - Get user details
  - Update user information
  - Delete/deactivate user
  - Assign roles to users
  - Toggle user status (active/suspended)

#### Schema Changes Needed
- ❌ **ADD**: `user_profiles` table (optional) - Extended user profile data
  - Purpose: Store additional user metadata not in Better-Auth user table
  - Fields: `user_id` (FK), `phone`, `address`, `date_of_birth`, `emergency_contact`, etc.
  - Location: Control Panel DB or Tenant DB (depending on scope)

#### Recommendations
- **Priority**: 🔴 High
- **Action**: Create API endpoints first, add `user_profiles` table if extended profile data is needed
- **Note**: User list can query `members` table in tenant DB filtered by organization

---

### 2. Organization Management

#### Current Schema Status
- ✅ `organizations` table exists in Control Panel DB
- ✅ Fields: `id`, `name`, `slug`, `neon_project_id`, `connection_string`, etc.

#### Gaps Identified
- ❌ **ADD**: Organization name availability check
  - Current: No unique constraint on `name` (only on `slug`)
  - Need: API endpoint to check if organization name is available
  - Solution: Add unique index on `name` OR implement app-level check with API

#### Schema Changes Needed
- 🔧 **CHANGE**: Add unique constraint on `organizations.name`
  ```sql
  CREATE UNIQUE INDEX idx_organizations_name_unique ON organizations(name);
  ```
  - **Impact**: Prevents duplicate organization names
  - **Migration**: Check for existing duplicates before applying

#### Recommendations
- **Priority**: 🟡 Medium
- **Action**: 
  1. Add unique constraint on `name` field
  2. Create API endpoint: `GET /api/organizations/check-name-availability?name=...`
  3. Implement organization creation API endpoint

---

### 3. Role & Permission Management

#### Current Schema Status
- ✅ `roles` table exists in Tenant DB
- ✅ `permissions` table exists in Tenant DB
- ✅ `role_permissions` table exists (many-to-many)
- ✅ Fields: `id`, `name`, `description`, `is_system`, `priority`

#### Gaps Identified
- ⚠️ **Schema Partial**: Permission scope/action scope not explicitly stored
  - Current: `permissions` has `resource` and `action` fields
  - Web App Needs: Scope-based permissions (organization, branch, area, etc.)
  - Current Schema: Scope is handled via `hierarchy_scope_id` in `members` table

- ❌ **ADD**: `permission_scopes` table (if needed for fine-grained scope control)
  - Purpose: Define scope levels for permissions (organization, branch, area, etc.)
  - Alternative: Use existing `hierarchy_scope_id` in members table

#### Schema Changes Needed
- 📋 **API Only**: Need endpoints for:
  - List roles
  - Create role
  - Update role
  - Delete role (with validation: cannot delete if users assigned)
  - Get role permission matrix
  - Add permission to role
  - Remove permission from role
  - Update permission action scope

#### Recommendations
- **Priority**: 🔴 High (Critical for RBAC)
- **Action**: 
  1. Verify if scope-based permissions need new table or can use existing `members.hierarchy_scope_id`
  2. Create all role/permission API endpoints
  3. Add validation: prevent deleting roles with assigned users

---

### 4. Permission Resource Management

#### Current Schema Status
- ✅ `permissions` table exists with `resource` and `action` fields
- ⚠️ Permissions are seeded (not user-created)

#### Gaps Identified
- ❌ **ADD**: `permission_resources` table (if custom resources needed)
  - Purpose: Allow organizations to create custom permission resources
  - Fields: `id`, `name`, `description`, `organization_id`, `actions` (jsonb), `created_at`
  - Alternative: Keep permissions seeded, only allow role-permission assignments

#### Schema Changes Needed
- **Decision Needed**: 
  - Option A: Keep permissions seeded, only manage role-permission assignments (simpler)
  - Option B: Allow custom permission resources per organization (more flexible)
  
- 📋 **API Only**: Need endpoints for:
  - List permission resources
  - Create custom resource (if Option B)
  - Update resource
  - Delete resource

#### Recommendations
- **Priority**: 🟡 Medium
- **Action**: 
  1. **Decision**: Choose Option A (seeded) or Option B (custom)
  2. If Option B: Create `permission_resources` table
  3. Create API endpoints for resource management

---

### 5. Service Management

#### Current Schema Status
- ✅ `services` table exists
- ✅ `service_categories` table exists
- ✅ `service_commission_config` table exists
- ✅ `service_rules` table exists

#### Gaps Identified
- ⚠️ **Schema Partial**: Service form in web app has fields not in schema:
  - Web App Fields: `price`, `taxable`, `tax_percentage`, `sessions`, `expirable`, `expiry_duration`, `expiry_unit`, `scheduling_type`, `time_preset_config`
  - Schema Fields: `duration` (in seconds), `duration_unit_type`, `max_attendees`, `attendance_threshold`
  - **Mismatch**: Web app expects pricing/tax fields, scheduling type, and time preset config, schema doesn't have them

#### Schema Changes Needed
- ❌ **ADD**: Fields to `services` table:
  ```sql
  ALTER TABLE services ADD COLUMN price integer; -- Price in cents
  ALTER TABLE services ADD COLUMN taxable boolean DEFAULT false;
  ALTER TABLE services ADD COLUMN tax_percentage integer DEFAULT 0; -- Tax percentage (0-100)
  ALTER TABLE services ADD COLUMN sessions integer; -- Number of sessions (for packages)
  ALTER TABLE services ADD COLUMN expirable boolean DEFAULT false;
  ALTER TABLE services ADD COLUMN expiry_duration integer; -- Expiry duration
  ALTER TABLE services ADD COLUMN expiry_unit_type text; -- 'days', 'months', 'years'
  ALTER TABLE services ADD COLUMN scheduling_type text; -- 'appointment-based', 'time-preset'
  ALTER TABLE services ADD COLUMN time_preset_config jsonb; -- Time preset config: { recurring_days: string[], time_slots_per_day: { [day: string]: string[] } }
  ```
  - **Note**: 
    - Some fields might be package-specific, verify if they belong in `services` or `packages` table
    - `scheduling_type` determines if service uses appointment-based or time-preset scheduling
    - `time_preset_config` stores recurring days and time slots per day (JSONB format)

- 🔧 **VERIFY**: `service_categories` table structure matches web app needs:
  - Web App Needs: `name`, `duration`, `max_attendees`, `incentive_type`, `is_conditional`, `max_staff`, `staff_pool_percentage`, `staff_weightage`, `payment_structures`, `threshold`, `rules` (requireAdvanceBooking, minAdvanceHours, enableCancellationWindow, cancellationCutoffHours)
  - Schema Has: `name`, `display_order`, `branch_id`, `is_active`
  - **Note**: Schema has separate `service_commission_config` and `service_rules` tables for **services**, but web app expects these fields on **service_categories**
  - **Mismatch**: Service categories in web app have commission/incentive config and rules, schema doesn't (these exist for services but not categories)

- ❌ **ADD**: Service category commission/incentive fields:
  ```sql
  ALTER TABLE service_categories ADD COLUMN duration integer; -- Duration in minutes
  ALTER TABLE service_categories ADD COLUMN max_attendees integer;
  ALTER TABLE service_categories ADD COLUMN incentive_type text; -- 'fixed', 'variable'
  ALTER TABLE service_categories ADD COLUMN is_conditional boolean DEFAULT false;
  ALTER TABLE service_categories ADD COLUMN max_staff integer DEFAULT 1;
  ALTER TABLE service_categories ADD COLUMN staff_pool_percentage integer DEFAULT 100; -- 0-100
  ALTER TABLE service_categories ADD COLUMN staff_weightage jsonb; -- Position weightage
  ALTER TABLE service_categories ADD COLUMN payment_structures jsonb; -- Payment structure config
  ALTER TABLE service_categories ADD COLUMN threshold integer; -- For conditional payments
  ALTER TABLE service_categories ADD COLUMN require_advance_booking boolean DEFAULT false;
  ALTER TABLE service_categories ADD COLUMN min_advance_hours integer;
  ALTER TABLE service_categories ADD COLUMN enable_cancellation_window boolean DEFAULT false;
  ALTER TABLE service_categories ADD COLUMN cancellation_cutoff_hours integer;
  ```
  - **Alternative**: Move these to a separate `service_category_config` table (one-to-one)

#### Recommendations
- **Priority**: 🔴 High (Core business feature)
- **Action**:
  1. **Decision**: Determine if service pricing belongs in `services` or `packages` table
  2. Add missing fields to `services` table
  3. Add commission/incentive fields to `service_categories` (or create `service_category_config` table)
  4. Create migration scripts
  5. Create API endpoints for all service CRUD operations

---

### 6. Appointment Management

#### Current Schema Status
- ✅ `appointments` table exists
- ✅ `appointment_clients` table exists
- ✅ `appointment_staff` table exists
- ✅ Fields: `type`, `start_time`, `duration`, `end_time`, `service_id`, `branch_id`, `status`, etc.

#### Gaps Identified
- ⚠️ **Schema Partial**: Web app `AddAppointmentModal` has fields not in schema:
  - Web App Fields: `clientId`, `selectedServices[]`, `remarks`, `assignedTo`, `roomId`, `employeeId`, `recurrence`, `customRecurrence`
  - Schema Has: `service_id`, `branch_id`, `is_recurring`, `recurring_frequency`, `recurring_end_date`
  - **Mismatch**: Web app has `roomId`, `employeeId`, `remarks` fields

#### Schema Changes Needed
- ❌ **ADD**: Fields to `appointments` table:
  ```sql
  ALTER TABLE appointments ADD COLUMN room_id uuid; -- Room/space ID (nullable, references rooms.id if rooms table exists)
  ```
  - **Note**: 
    - `employeeId` maps to `appointment_staff.staff_id` (already exists in schema)
    - `remarks` maps to existing `notes` field (schema already has `notes` text field, line 570)
    - Only `room_id` needs to be added

- 🔧 **VERIFY**: Recurrence fields match web app needs:
  - Web App: `recurrence` (daily, weekly, monthly, custom), `customRecurrence` (frequency, timeUnit, repeatOn, monthlyType, endsType, endsDate, endsOccurrences)
  - Schema: `is_recurring`, `recurring_frequency` (daily, weekly, custom), `recurring_end_date`
  - **Gap**: Schema doesn't have `customRecurrence` details (frequency, repeatOn days, etc.)

- ❌ **ADD**: Recurrence configuration fields:
  ```sql
  ALTER TABLE appointments ADD COLUMN recurring_frequency_value integer; -- Frequency number (e.g., every 2 weeks)
  ALTER TABLE appointments ADD COLUMN recurring_time_unit text; -- 'day', 'week', 'month'
  ALTER TABLE appointments ADD COLUMN recurring_repeat_on jsonb; -- Days of week for weekly (e.g., [1,3,5] for Mon,Wed,Fri)
  ALTER TABLE appointments ADD COLUMN recurring_monthly_type text; -- 'day', 'week' (e.g., 1st Monday)
  ALTER TABLE appointments ADD COLUMN recurring_ends_type text; -- 'never', 'on', 'after'
  ALTER TABLE appointments ADD COLUMN recurring_ends_occurrences integer; -- Number of occurrences
  ```
  - **Alternative**: Store `customRecurrence` as JSONB field

- ❌ **ADD**: `rooms` table (if room management needed):
  ```sql
  CREATE TABLE rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id uuid NOT NULL REFERENCES hierarchy_nodes(id) ON DELETE RESTRICT,
    name text NOT NULL,
    capacity integer,
    equipment jsonb, -- Equipment available in room
    is_active boolean DEFAULT true,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  );
  ```

#### Recommendations
- **Priority**: 🔴 High (Core business feature)
- **Action**:
  1. Add `remarks` field to `appointments` (or verify `notes` field usage)
  2. Add `room_id` field if room management is needed
  3. Add recurrence configuration fields (or use JSONB for flexibility)
  4. Create `rooms` table if room management is required
  5. Create API endpoints for appointment CRUD operations

---

### 7. Customer Management

#### Current Schema Status
- ✅ Customers are users with `role='client'` in `members` table
- ✅ `appointment_clients` table links clients to appointments
- ✅ `package_assignments` table tracks client packages

#### Gaps Identified
- ⚠️ **Schema Partial**: No dedicated customer profile/contact information
  - Current: Customer data is in control panel `user` table (name, email)
  - Need: Additional customer fields (phone, address, preferences, credit points, etc.)

#### Schema Changes Needed
- ❌ **ADD**: `customer_profiles` table (optional, if extended customer data needed):
  ```sql
  CREATE TABLE customer_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL, -- References control panel users.id
    organization_id uuid NOT NULL, -- For multi-org support
    phone text,
    address text,
    date_of_birth date,
    emergency_contact_name text,
    emergency_contact_phone text,
    preferences jsonb, -- Customer preferences
    credit_points integer DEFAULT 0, -- Loyalty/credit points
    notes text,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now(),
    UNIQUE(user_id, organization_id)
  );
  ```
  - **Alternative**: Add fields to `members` table if customer-specific

- 📋 **API Only**: Need endpoints for:
  - List customers (filter `members` where `role='client'`)
  - Get customer details
  - Create customer (invite user as client)
  - Update customer
  - Delete/deactivate customer
  - Search customers

#### Recommendations
- **Priority**: 🟡 Medium
- **Action**:
  1. **Decision**: Determine if `customer_profiles` table needed or use `members` + `user` tables
  2. If needed: Create `customer_profiles` table
  3. Create API endpoints for customer management
  4. Implement search functionality

---

### 8. Dashboard Widgets

#### Current Schema Status
- ✅ All underlying data tables exist (appointments, members, payments, etc.)

#### Gaps Identified
- 📋 **API Only**: Need aggregation endpoints for:
  - Appointments widget: Upcoming appointments, today's appointments
  - Announcements widget: System announcements (need `announcements` table?)
  - Team performance: Aggregate appointment/staff performance data
  - Branch performance: Aggregate branch-level metrics
  - Payroll widget: Commission/payout summaries
  - Claims widget: Expense/claim data (need `claims` or `expenses` table?)

#### Schema Changes Needed
- ❌ **ADD**: `announcements` table (if announcements feature needed):
  ```sql
  CREATE TABLE announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL, -- Or branch_id for branch-specific
    title text NOT NULL,
    message text NOT NULL,
    priority text DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    target_audience text, -- 'all', 'staff', 'clients', 'admins'
    start_date timestamp,
    end_date timestamp,
    is_active boolean DEFAULT true,
    created_by text NOT NULL, -- References members.user_id
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  );
  ```

- ❌ **ADD**: `claims` or `expenses` table (if claims widget needed):
  ```sql
  CREATE TABLE expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    submitted_by text NOT NULL, -- References members.user_id
    amount integer NOT NULL, -- Amount in cents
    currency text DEFAULT 'usd',
    category text, -- 'travel', 'equipment', 'supplies', etc.
    description text,
    receipt_url text, -- Receipt image URL
    status text DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'paid'
    approved_by text, -- References members.user_id
    approved_at timestamp,
    paid_at timestamp,
    notes text,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  );
  ```

#### Recommendations
- **Priority**: 🟡 Medium
- **Action**:
  1. **Decision**: Determine if announcements and claims features are needed
  2. If yes: Create `announcements` and `expenses` tables
  3. Create aggregation API endpoints for each widget
  4. Implement caching for dashboard data

---

## Summary of Schema Changes

### Tables to Add
1. ❌ `user_profiles` (optional) - Extended user profile data
2. ❌ `permission_resources` (optional) - If custom permission resources needed
3. ❌ `service_category_config` (optional) - If separating category config from category
4. ❌ `rooms` - Room/space management for appointments
5. ❌ `customer_profiles` (optional) - Extended customer data
6. ❌ `announcements` - System announcements
7. ❌ `expenses` - Expense/claim tracking

### Tables to Modify
1. 🔧 `organizations` - Add unique constraint on `name`
2. 🔧 `services` - Add pricing, tax, expiry, scheduling_type, time_preset_config fields
3. 🔧 `service_categories` - Add commission/incentive configuration fields
4. 🔧 `appointments` - Add `room_id`, recurrence configuration fields (remarks uses existing `notes` field)

### Indexes to Add
1. 🔧 Unique index on `organizations.name`
2. 🔧 Indexes on new fields (room_id, etc.)

---

## Execution Plan

### Phase 1: Critical Schema Changes (Week 1)
**Priority**: 🔴 High

1. **Service Management Schema**
   - Add pricing/tax/expiry fields to `services` table
   - Add `scheduling_type` and `time_preset_config` fields to `services` table
   - Add commission/incentive fields to `service_categories` table
   - Create migration script
   - Test migration on dev database

2. **Appointment Management Schema**
   - Add `room_id` field to `appointments` (remarks uses existing `notes` field)
   - Add recurrence configuration fields
   - Create `rooms` table (if needed)
   - Create migration script

3. **Organization Management**
   - Add unique constraint on `organizations.name`
   - Create migration script (with duplicate check)

### Phase 2: Optional Schema Additions (Week 2)
**Priority**: 🟡 Medium

1. **Customer Management**
   - Create `customer_profiles` table (if needed)
   - Create migration script

2. **Dashboard Features**
   - Create `announcements` table (if needed)
   - Create `expenses` table (if needed)
   - Create migration scripts

3. **User Management**
   - Create `user_profiles` table (if extended profile needed)
   - Create migration script

### Phase 3: API Development (Week 3-4)
**Priority**: 🔴 High

1. **Service Management APIs**
   - List services
   - Create service
   - Update service
   - Delete service
   - Get service details
   - Service category CRUD operations

2. **Appointment Management APIs**
   - List appointments
   - Create appointment
   - Update appointment
   - Delete appointment
   - Get appointment details
   - Recurrence handling

3. **Role & Permission APIs**
   - Role CRUD operations
   - Permission matrix
   - Role-permission assignments

4. **User Management APIs**
   - List users
   - User details
   - User update
   - Role assignment

5. **Organization APIs**
   - Create organization
   - Check name availability
   - Update organization

### Phase 4: Dashboard & Widget APIs (Week 5)
**Priority**: 🟡 Medium

1. **Dashboard Aggregation APIs**
   - Appointments widget data
   - Team performance data
   - Branch performance data
   - Payroll/commission summaries
   - Claims/expenses summaries

---

## Migration Strategy

### Pre-Migration Checklist
- [ ] Backup all databases (control panel + tenant databases)
- [ ] Test migrations on development database
- [ ] Document rollback procedures
- [ ] Schedule maintenance window (if needed)

### Migration Order
1. Control Panel DB migrations first
2. Tenant DB migrations (can be done per-organization)
3. API deployment after schema changes

### Rollback Plan
- Keep previous migration files
- Document rollback SQL scripts
- Test rollback on dev database

---

## Risk Assessment

### High Risk Changes
- ⚠️ Adding unique constraint on `organizations.name` (may fail if duplicates exist)
- ⚠️ Adding fields to `services` table (large table, may take time)
- ⚠️ Modifying `service_categories` structure (affects existing data)
- ⚠️ Adding `scheduling_type` and `time_preset_config` to `services` (verify existing services compatibility)

### Medium Risk Changes
- ⚠️ Adding recurrence fields to `appointments` (verify existing data compatibility)
- ⚠️ Creating new tables (low risk, but need to verify relationships)

### Low Risk Changes
- ✅ Creating optional tables (`announcements`, `expenses`, etc.)
- ✅ Adding nullable fields to existing tables

---

## Testing Strategy

### Schema Testing
1. Test migrations on empty database
2. Test migrations on database with sample data
3. Verify foreign key constraints
4. Verify indexes are created
5. Test rollback procedures

### API Testing
1. Unit tests for each API endpoint
2. Integration tests with database
3. Test error handling
4. Test validation rules
5. Performance testing for aggregation queries

---

## Notes

- All monetary amounts should be stored in **cents** (integers)
- All timestamps use PostgreSQL `timestamp` type (with timezone)
- UUIDs used for primary keys (except Better-Auth tables)
- Consider using JSONB for flexible configuration fields (recurrence, preferences, time_preset_config, etc.)
- **Service duration**: Schema stores duration in **seconds** (integer), web app uses various units - ensure proper conversion
- **Appointment notes**: Schema already has `notes` field - use this for `remarks` instead of adding new field
- Verify field requirements with web app team before implementing
- Some features may not need schema changes (API-only implementations)

---

## Next Steps

1. **Review this plan** with team
2. **Prioritize** which schema changes are essential vs. optional
3. **Create detailed migration scripts** for approved changes
4. **Set up development database** for testing
5. **Begin Phase 1** implementation

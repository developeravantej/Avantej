# Tenant Database Schema Reference

> Generated 2026-04-11 from `packages/db/src/schema/tenant/`
> Branch: `Customer-app` (post-consolidation)

This document describes the **current** state of the tenant database schema. Each tenant organization gets an isolated Neon PostgreSQL database containing these tables.

---

## Table of Contents

1. [Table Summary](#table-summary)
2. [Table Definitions](#table-definitions)
3. [Schema Consolidation Changes](#schema-consolidation-changes)

---

## Table Summary

| # | Table | Description |
|---|-------|-------------|
| 1 | `hierarchy_nodes` | 5-level organizational hierarchy (organization > country > region > area > branch) |
| 2 | `members` | User membership in the organization with role and hierarchy scope |
| 3 | `invitations` | Pending invitations to join the organization |
| 4 | `roles` | Role definitions (admin, trainer, staff, client, custom) |
| 5 | `permissions` | Permission definitions as resource:action pairs |
| 6 | `role_permissions` | Many-to-many mapping of roles to permissions |
| 7 | `service_categories` | Categories for organizing services, scoped to branches |
| 8 | `services` | Services offered (Personal Training, Group Classes, etc.) with Stripe sync |
| 9 | `service_category_config` | Per-category commission, incentive, and booking rule configuration |
| 10 | `service_members` | Junction table linking services to staff who can perform them |
| 11 | `appointments` | Individual appointment bookings with scheduling, payment, and status tracking |
| 12 | `appointment_clients` | Links clients to appointments with attendance and package usage tracking |
| 13 | `appointment_staff` | Links staff members to appointments |
| 14 | `commission_splits` | Calculated commission splits for staff per appointment |
| 15 | `payments` | Customer payment records with Stripe PaymentIntent details |
| 16 | `payment_items` | Line items for payment breakdowns |
| 17 | `partner_stripe_accounts` | Stripe Connect accounts for partners receiving payouts |
| 18 | `payouts` | Payout tracking from franchiser to partners |
| 19 | `member_profiles` | Extended profile information for staff/trainers (1:1 with members) |
| 20 | `customer_profiles` | Extended customer data per organization |
| 21 | `package_instances` | Unified tracking for staff-assigned and client-purchased service packages |
| 22 | `preferred_times` | Scheduling preferences for package instances |
| 23 | `class_slots` | Pre-defined class schedules with capacity tracking |
| 24 | `waitlist_entries` | Waitlist for full class slots |
| 25 | `recurrence_rules` | Complex recurrence configuration for recurring appointments |
| 26 | `rooms` | Physical rooms at branches for appointment scheduling |
| 27 | `sales_orders` | Sales order headers with cancellation tracking |
| 28 | `sales_order_items` | Line items for sales orders |
| 29 | `invoices` | Invoice records linked to sales orders and payments |
| 30 | `announcements` | System announcements for dashboard display |
| 31 | `expenses` | Expense/claim tracking for staff reimbursements |
| 32 | `notifications` | User notifications for bookings, payments, promotions, etc. |
| 33 | `notification_preferences` | Per-user notification channel and type toggles |
| 34 | `user_activity_log` | Customer activity tracking for dashboard widgets |
| 35 | `ghl_contact_links` | GoHighLevel contact-to-customer mappings |
| 36 | `ghl_sync_events` | GoHighLevel webhook payloads and processing outcomes |
| 37 | `brands` | Product brands |
| 38 | `product_categories` | Product categorization |
| 39 | `suppliers` | Supplier/vendor records |
| 40 | `units_of_measure` | Units of measure with base-unit conversion |
| 41 | `products` | Product catalog with SKU, pricing, and supplier links |
| 42 | `product_stock` | Per-branch product inventory levels |
| 43 | `stock_requests` | Inter-branch stock request headers |
| 44 | `stock_request_items` | Line items for stock requests |
| 45 | `transfer_orders` | Inter-branch stock transfer headers |
| 46 | `transfer_order_items` | Line items for transfer orders |
| 47 | `purchase_orders` | Purchase orders sent to suppliers |
| 48 | `purchase_order_items` | Line items for purchase orders |
| 49 | `promotions` | Discount/promotion codes for checkout |
| 50 | `promotion_usages` | Tracks each use of a promotion by a customer |
| 51 | `walk_in_customers` | Unregistered walk-in customer records |
| 52 | `tax_rates` | Configurable tax rates for Malaysian tax compliance (LHDN) |
| 53 | `dashboard_snapshots` | Pre-computed dashboard KPI snapshots |

---

## Table Definitions

### hierarchy_nodes

5-level organizational hierarchy: organization (0) > country (1) > region (2) > area (3) > branch (4). Branch names are globally unique (enforced by partial unique index in migration).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | - |
| type | text | NO | - | "organization" \| "country" \| "region" \| "area" \| "branch" |
| parent_id | uuid | YES | - | FK -> hierarchy_nodes.id |
| depth | integer | NO | - | 0-4 |
| address | text | YES | - | Branch-specific |
| pic_user_id | text | YES | - | Cross-DB ref to control panel users.id |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `hierarchy_parent_idx(parent_id)`, `hierarchy_type_idx(type)`, `hierarchy_depth_idx(depth)`, `hierarchy_pic_user_idx(pic_user_id)`
**Foreign Keys:** `parent_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### members

User membership in an organization with role and hierarchy scope. One user can have only one membership per tenant DB.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | text | NO | - | UNIQUE INDEX |
| role | text | NO | - | "admin" \| "trainer" \| "staff" \| "client" |
| hierarchy_scope_id | uuid | NO | - | FK -> hierarchy_nodes.id |
| status | text | NO | - | "active" \| "suspended" |
| joined_at | timestamp | NO | now() | - |

**Indexes:** `members_user_idx(user_id) UNIQUE`, `members_hierarchy_idx(hierarchy_scope_id)`, `members_role_idx(role)`, `members_status_idx(status)`
**Foreign Keys:** `hierarchy_scope_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### invitations

Pending invitations to join the organization. Invitations expire after 7 days (enforced in app layer).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| email | text | NO | - | - |
| invited_by | text | NO | - | Cross-DB ref to control panel users.id |
| role | text | NO | - | "admin" \| "trainer" \| "staff" \| "client" |
| hierarchy_scope_id | uuid | NO | - | FK -> hierarchy_nodes.id |
| token | text | NO | - | UNIQUE |
| status | text | NO | - | "pending" \| "accepted" \| "declined" \| "expired" |
| expires_at | timestamp | NO | - | - |
| created_at | timestamp | NO | now() | - |

**Indexes:** `invitations_email_status_idx(email, status)`, `invitations_expires_idx(expires_at)`, `invitations_invited_by_idx(invited_by)`
**Foreign Keys:** `hierarchy_scope_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### roles

Role definitions within a tenant. System roles (admin, trainer, staff, client) are seeded automatically and cannot be deleted.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | UNIQUE |
| description | text | YES | - | - |
| is_system | boolean | NO | false | - |
| priority | integer | NO | - | Higher = more permissions |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `roles_name_idx(name)`, `roles_priority_idx(priority)`
**Foreign Keys:** None

---

### permissions

Permission definitions as resource:action pairs (e.g., "hierarchy_management:create").

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| resource | text | NO | - | UNIQUE(resource, action) |
| action | text | NO | - | UNIQUE(resource, action) |
| description | text | YES | - | - |
| created_at | timestamp | NO | now() | - |

**Indexes:** `permissions_resource_action_unique(resource, action) UNIQUE`, `permissions_resource_idx(resource)`
**Foreign Keys:** None

---

### role_permissions

Many-to-many relationship between roles and permissions.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| role_id | uuid | NO | - | FK -> roles.id, UNIQUE(role_id, permission_id) |
| permission_id | uuid | NO | - | FK -> permissions.id, UNIQUE(role_id, permission_id) |
| scope | text | NO | "organization" | "organization" \| "team" \| "own" \| "branch" |
| created_at | timestamp | NO | now() | - |

**Indexes:** `role_permissions_role_permission_unique(role_id, permission_id) UNIQUE`, `role_permissions_role_idx(role_id)`, `role_permissions_permission_idx(permission_id)`, `role_permissions_scope_idx(scope)`, `role_permissions_role_scope_idx(role_id, scope)`
**Foreign Keys:** `role_id -> roles.id ON DELETE CASCADE`, `permission_id -> permissions.id ON DELETE CASCADE`

---

### service_categories

Categories for organizing services within a tenant, scoped to a branch.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | - |
| description | text | YES | - | - |
| display_order | integer | NO | 0 | - |
| branch_id | uuid | YES | - | FK -> hierarchy_nodes.id |
| is_active | boolean | NO | true | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `service_categories_branch_idx(branch_id)`, `service_categories_active_idx(is_active)`, `service_categories_order_idx(display_order)`
**Foreign Keys:** `branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### services

Services offered by the organization (e.g., Personal Training, Group Classes). Includes Stripe integration, package-equivalent fields, and display metadata.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | - |
| category_id | uuid | YES | - | FK -> service_categories.id |
| duration | integer | NO | - | Duration in seconds |
| duration_unit_type | text | NO | "minutes" | "seconds" \| "minutes" \| "hours" |
| max_attendees | integer | NO | - | - |
| attendance_threshold | integer | YES | - | Minimum attendees required |
| stripe_product_id | text | YES | - | Stripe Product ID (prod_xxx) |
| stripe_price_id | text | YES | - | Stripe Price ID (price_xxx) |
| stripe_sync_status | text | NO | "pending" | "pending" \| "synced" \| "failed" |
| stripe_last_synced_at | timestamp | YES | - | - |
| branch_id | uuid | YES | - | FK -> hierarchy_nodes.id |
| is_active | boolean | NO | true | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |
| title | text | YES | - | Display title |
| description | text | YES | - | Display description |
| image_url | text | YES | - | Display image |
| type | text | NO | "private" | "private" \| "semi_private" \| "both" |
| price | integer | YES | - | Display price in cents |
| price_unit | text | YES | "session" | "session" \| "class" \| "package" |
| taxable | boolean | NO | false | - |
| tax_percentage | integer | NO | 0 | 0-100 |
| is_recommended | boolean | NO | false | - |
| location | text | YES | - | - |
| features | text[] | YES | - | Array of feature strings |
| scheduling_type | text | NO | "appointment" | "appointment" \| "class_slot" |
| session_count | integer | YES | - | **NEW** - Package sessions |
| expirable | boolean | NO | false | **NEW** - Whether package expires |
| expiry_days | integer | YES | - | **NEW** - Days until expiry |
| expiry_date | timestamp | YES | - | **NEW** - Fixed expiry date |

**Indexes:** `services_category_idx(category_id)`, `services_branch_idx(branch_id)`, `services_stripe_product_idx(stripe_product_id)`, `services_stripe_sync_status_idx(stripe_sync_status)`, `services_active_idx(is_active)`, `services_type_idx(type)`, `services_recommended_idx(is_recommended)`, `services_scheduling_type_idx(scheduling_type)`, `services_expiry_days_idx(expiry_days)`
**Foreign Keys:** `category_id -> service_categories.id ON DELETE RESTRICT`, `branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### service_category_config

Per-category commission, incentive, and booking rule configuration. 1:1 relationship with service_categories. Replaces the dropped `service_rules` and `service_commission_config` tables.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| category_id | uuid | NO | - | FK -> service_categories.id, UNIQUE |
| default_duration | integer | YES | - | - |
| default_max_attendees | integer | YES | - | - |
| incentive_type | text | YES | - | "fixed" \| "variable" |
| is_conditional | boolean | NO | false | - |
| max_staff | integer | NO | 1 | - |
| staff_pool_percentage | integer | NO | 100 | - |
| staff_weightage | jsonb | YES | - | Array of {position, percentage, title?} |
| payment_structures | jsonb | YES | - | Record<string, unknown> |
| threshold | integer | YES | - | - |
| require_advance_booking | boolean | NO | false | - |
| min_advance_hours | integer | YES | - | - |
| enable_cancellation_window | boolean | NO | false | - |
| cancellation_cutoff_hours | integer | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `service_category_config_category_idx(category_id)`, `service_category_config_incentive_idx(incentive_type)`
**Foreign Keys:** `category_id -> service_categories.id ON DELETE CASCADE`

---

### service_members

Junction table linking services to trainers/staff who can perform them.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| service_id | uuid | NO | - | FK -> services.id, UNIQUE(service_id, member_id) |
| member_id | uuid | NO | - | FK -> members.id, UNIQUE(service_id, member_id) |
| is_primary | boolean | NO | false | - |
| created_at | timestamp | NO | now() | - |

**Indexes:** `service_members_unique_idx(service_id, member_id) UNIQUE`, `service_members_service_idx(service_id)`, `service_members_member_idx(member_id)`
**Foreign Keys:** `service_id -> services.id ON DELETE CASCADE`, `member_id -> members.id ON DELETE CASCADE`

---

### appointments

Individual appointment bookings including type, time, location, service, status, payment, and cancellation tracking.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| type | text | NO | - | "private" \| "semi-private" |
| start_time | timestamp | NO | - | - |
| duration | integer | NO | - | Duration in minutes |
| end_time | timestamp | NO | - | Calculated: startTime + duration |
| service_id | uuid | YES | - | FK -> services.id |
| branch_id | uuid | NO | - | FK -> hierarchy_nodes.id |
| status | text | NO | - | "pending" \| "confirmed" \| "completed" \| "cancelled" \| "no-show" |
| session_total | integer | NO | - | Total pre-tax revenue in cents |
| price_per_client | integer | NO | - | Price per client in cents |
| is_recurring | boolean | NO | false | - |
| recurring_parent_id | uuid | YES | - | FK -> appointments.id (self-ref) |
| recurring_frequency | text | YES | - | "daily" \| "weekly" \| "custom" |
| recurring_end_date | timestamp | YES | - | - |
| conflict_resolved | boolean | NO | false | - |
| conflict_reason | text | YES | - | - |
| payment_status | text | NO | "pending" | "pending" \| "paid" \| "partial" \| "refunded" |
| stripe_payment_intent_id | text | YES | - | - |
| notes | text | YES | - | - |
| created_by | text | NO | - | members.userId |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |
| booking_number | text | YES | - | UNIQUE |
| user_id | text | YES | - | Client user ID for mobile app bookings |
| trainer_id | uuid | YES | - | FK -> members.id |
| package_instance_id | uuid | YES | - | FK -> package_instances.id |
| credits_used | integer | YES | 1 | - |
| location | text | YES | - | - |
| cancelled_at | timestamp | YES | - | - |
| cancellation_reason | text | YES | - | - |
| class_slot_id | uuid | YES | - | FK -> class_slots.id |
| description | text | YES | - | - |
| image_url | text | YES | - | - |
| room_id | uuid | YES | - | FK -> rooms.id |

**Indexes:** `appointments_branch_idx(branch_id)`, `appointments_service_idx(service_id)`, `appointments_start_time_idx(start_time)`, `appointments_status_idx(status)`, `appointments_type_idx(type)`, `appointments_recurring_idx(recurring_parent_id)`, `appointments_stripe_payment_idx(stripe_payment_intent_id)`, `appointments_start_time_status_idx(start_time, status)`, `appointments_booking_number_idx(booking_number)`, `appointments_user_idx(user_id)`, `appointments_trainer_idx(trainer_id)`, `appointments_package_instance_idx(package_instance_id)`, `appointments_class_slot_idx(class_slot_id)`, `appointments_user_status_idx(user_id, status)`, `appointments_room_idx(room_id)`
**Foreign Keys:** `service_id -> services.id ON DELETE SET NULL`, `branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`, `recurring_parent_id -> appointments.id ON DELETE CASCADE`, `trainer_id -> members.id ON DELETE SET NULL`, `package_instance_id -> package_instances.id ON DELETE SET NULL`, `class_slot_id -> class_slots.id ON DELETE SET NULL`, `room_id -> rooms.id ON DELETE SET NULL`

---

### appointment_clients

Links clients to appointments, tracking attendance and per-client package usage.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| appointment_id | uuid | NO | - | FK -> appointments.id, UNIQUE(appointment_id, client_id) |
| client_id | text | NO | - | members.userId |
| package_instance_id | uuid | YES | - | FK -> package_instances.id **RENAMED from package_assignment_id** |
| price_paid | integer | NO | - | Price in cents |
| attended | boolean | YES | - | null = not yet occurred |
| notes | text | YES | - | - |
| created_at | timestamp | NO | now() | - |

**Indexes:** `appointment_clients_unique_idx(appointment_id, client_id) UNIQUE`, `appointment_clients_appointment_idx(appointment_id)`, `appointment_clients_client_idx(client_id)`, `appointment_clients_package_instance_idx(package_instance_id)`
**Foreign Keys:** `appointment_id -> appointments.id ON DELETE CASCADE`, `package_instance_id -> package_instances.id ON DELETE SET NULL`

---

### appointment_staff

Links staff members to appointments. One staff member per appointment (enforced by unique index).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| appointment_id | uuid | NO | - | FK -> appointments.id, UNIQUE(appointment_id, staff_id) |
| staff_id | text | NO | - | members.userId |
| created_at | timestamp | NO | now() | - |

**Indexes:** `appointment_staff_unique_idx(appointment_id, staff_id) UNIQUE`, `appointment_staff_appointment_idx(appointment_id)`, `appointment_staff_staff_idx(staff_id)`
**Foreign Keys:** `appointment_id -> appointments.id ON DELETE CASCADE`

---

### commission_splits

Calculated commission splits for staff per appointment. One split per appointment-staff combination.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| appointment_id | uuid | NO | - | FK -> appointments.id, UNIQUE(appointment_id, staff_id) |
| staff_id | text | NO | - | members.userId |
| split_percentage | integer | NO | - | 0-100 |
| calculated_amount | integer | NO | - | Pre-tax amount in cents |
| notes | text | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `commission_splits_unique_idx(appointment_id, staff_id) UNIQUE`, `commission_splits_appointment_idx(appointment_id)`, `commission_splits_staff_idx(staff_id)`
**Foreign Keys:** `appointment_id -> appointments.id ON DELETE CASCADE`

---

### payments

Customer payment records with Stripe PaymentIntent details, platform fees, and franchiser amounts.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| stripe_payment_intent_id | text | NO | - | UNIQUE |
| stripe_charge_id | text | YES | - | - |
| customer_id | text | NO | - | members.userId |
| stripe_customer_id | text | YES | - | - |
| amount | integer | NO | - | Pre-tax amount in cents |
| tax_amount | integer | NO | 0 | Tax in cents |
| total_amount | integer | NO | - | Total in cents |
| currency | text | NO | "usd" | ISO currency code |
| platform_fee_amount | integer | NO | 0 | Platform fee in cents |
| platform_fee_percentage | integer | NO | 0 | 0-100 |
| franchiser_amount | integer | NO | - | totalAmount - platformFeeAmount |
| status | text | NO | - | "pending" \| "succeeded" \| "failed" \| "canceled" \| "refunded" |
| appointment_id | uuid | YES | - | FK exists at DB level (no schema .references() due to circular import) |
| description | text | YES | - | - |
| metadata | text | YES | - | JSON string |
| user_id | text | YES | - | Control Panel user.id |
| payment_number | text | YES | - | UNIQUE |
| payment_method | text | YES | - | "card" \| "apple_pay" \| "google_pay" \| "cash" |
| invoice_id | uuid | YES | - | No schema FK (circular import avoidance) |
| e_invoice_status | text | YES | - | "pending" \| "generated" \| "failed" |
| e_invoice_id | text | YES | - | LHDN MyInvois UUID |
| refunded_at | timestamp | YES | - | - |
| refund_amount | integer | YES | - | - |
| failure_reason | text | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `payments_stripe_pi_idx(stripe_payment_intent_id)`, `payments_stripe_charge_idx(stripe_charge_id)`, `payments_customer_idx(customer_id)`, `payments_appointment_idx(appointment_id)`, `payments_status_idx(status)`, `payments_customer_status_idx(customer_id, status)`, `payments_user_idx(user_id)`, `payments_payment_number_idx(payment_number)`, `payments_payment_method_idx(payment_method)`, `payments_invoice_idx(invoice_id)`, `payments_e_invoice_status_idx(e_invoice_status)`
**Foreign Keys:** `appointment_id -> appointments.id` (DB-level only, not in Drizzle schema)

---

### payment_items

Line items for payment breakdowns.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| payment_id | uuid | NO | - | FK -> payments.id |
| item_type | text | NO | - | "package" \| "booking" \| "tax" \| "fee" \| "discount" |
| item_id | uuid | YES | - | - |
| promotion_id | uuid | YES | - | No FK (circular dep avoidance) |
| description | text | NO | - | - |
| quantity | integer | NO | 1 | - |
| unit_price | integer | NO | - | In cents |
| total_price | integer | NO | - | In cents |
| created_at | timestamp | NO | now() | - |

**Indexes:** `payment_items_payment_idx(payment_id)`, `payment_items_type_idx(item_type)`, `payment_items_item_idx(item_id)`, `payment_items_promotion_idx(promotion_id)`
**Foreign Keys:** `payment_id -> payments.id ON DELETE CASCADE`

---

### partner_stripe_accounts

Stripe Connect account information for partners who receive payouts.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| partner_id | text | NO | - | UNIQUE INDEX (no FK due to cross-DB) |
| stripe_connect_account_id | text | NO | - | UNIQUE |
| stripe_connect_status | text | NO | "pending" | "pending" \| "active" \| "restricted" \| "rejected" |
| stripe_connect_account_type | text | NO | "partner" | - |
| onboarding_url | text | YES | - | - |
| onboarding_completed_at | timestamp | YES | - | - |
| bank_account_last_4 | text | YES | - | - |
| bank_account_type | text | YES | - | - |
| account_type | text | NO | "express" | "express" \| "standard" \| "custom" |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `partner_stripe_accounts_partner_idx(partner_id)`, `partner_stripe_accounts_stripe_idx(stripe_connect_account_id)`, `partner_stripe_accounts_status_idx(stripe_connect_status)`, `partner_stripe_accounts_partner_unique_idx(partner_id) UNIQUE`
**Foreign Keys:** None (cross-database reference)

---

### payouts

Payout tracking from franchiser to partners (coaches/trainers). Supports Stripe Connect and manual bank transfers.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| stripe_transfer_id | text | YES | - | - |
| stripe_payout_id | text | YES | - | - |
| recipient_id | text | NO | - | members.userId |
| stripe_connect_account_id | text | YES | - | - |
| appointment_id | uuid | NO | - | FK -> appointments.id |
| commission_split_id | uuid | YES | - | FK -> commission_splits.id |
| amount | integer | NO | - | In cents |
| currency | text | NO | "usd" | - |
| payout_method | text | NO | - | "stripe_connect" \| "manual_bank_transfer" |
| bank_account_last_4 | text | YES | - | - |
| manual_payout_confirmed_at | timestamp | YES | - | - |
| manual_payout_confirmed_by | text | YES | - | members.userId |
| status | text | NO | - | "pending" \| "processing" \| "paid" \| "failed" \| "canceled" |
| scheduled_at | timestamp | YES | - | - |
| paid_at | timestamp | YES | - | - |
| description | text | YES | - | - |
| notes | text | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `payouts_recipient_idx(recipient_id)`, `payouts_appointment_idx(appointment_id)`, `payouts_commission_split_idx(commission_split_id)`, `payouts_stripe_transfer_idx(stripe_transfer_id)`, `payouts_stripe_payout_idx(stripe_payout_id)`, `payouts_status_idx(status)`, `payouts_payout_method_idx(payout_method)`, `payouts_recipient_status_idx(recipient_id, status)`
**Foreign Keys:** `appointment_id -> appointments.id ON DELETE RESTRICT`, `commission_split_id -> commission_splits.id ON DELETE SET NULL`

---

### member_profiles

Extended profile information for staff/trainers. 1:1 relationship with members.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| member_id | uuid | NO | - | FK -> members.id, UNIQUE |
| display_name | text | YES | - | - |
| bio | text | YES | - | - |
| specialization | text | YES | - | - |
| image_url | text | YES | - | - |
| phone_number | text | YES | - | - |
| certifications | text[] | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `member_profiles_member_idx(member_id)`
**Foreign Keys:** `member_id -> members.id ON DELETE CASCADE`

---

### customer_profiles

Extended customer data per organization. userId references Control Panel users.id.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | text | NO | - | UNIQUE |
| phone | text | YES | - | - |
| date_of_birth | timestamp | YES | - | - |
| gender | text | YES | - | - |
| address | text | YES | - | - |
| emergency_contact_name | text | YES | - | - |
| emergency_contact_phone | text | YES | - | - |
| medical_notes | text | YES | - | - |
| fitness_goals | text[] | YES | - | - |
| credit_points | integer | NO | 0 | - |
| notes | text | YES | - | - |
| is_deleted | boolean | NO | false | Soft-delete |
| deleted_at | timestamp | YES | - | - |
| deleted_source | text | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `customer_profiles_user_idx(user_id)`, `customer_profiles_credits_idx(credit_points)`, `customer_profiles_is_deleted_idx(is_deleted)`
**Foreign Keys:** None (cross-database reference)

---

### package_instances

Unified tracking for both staff-assigned and client-purchased service packages. Replaces the dropped `package_assignments` table.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| service_id | uuid | NO | - | FK -> services.id **REPLACED package_id** |
| client_id | text | NO | - | - |
| source | text | NO | - | "assigned" \| "purchased" |
| assigned_by | text | YES | - | - |
| purchase_number | text | YES | - | UNIQUE |
| payment_id | uuid | YES | - | FK -> payments.id |
| total_price | integer | YES | - | In cents |
| tax_amount | integer | YES | 0 | - |
| payment_status | text | NO | - | "pending" \| "paid" \| "failed" \| "refunded" |
| payment_method | text | YES | - | - |
| e_signature | text | YES | - | - |
| terms_agreed_at | timestamp | YES | - | - |
| credits_total | integer | NO | - | - |
| credits_remaining | integer | NO | - | - |
| credits_used | integer | NO | 0 | - |
| starts_at | timestamp | NO | - | - |
| expires_at | timestamp | NO | - | - |
| status | text | NO | - | "active" \| "expired" \| "exhausted" \| "cancelled" |
| remark | text | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `package_instances_client_idx(client_id)`, `package_instances_source_idx(source)`, `package_instances_status_idx(status)`, `package_instances_payment_status_idx(payment_status)`, `package_instances_expires_idx(expires_at)`, `package_instances_client_status_idx(client_id, status)`, `package_instances_purchase_number_idx(purchase_number)`, `package_instances_service_idx(service_id)`
**Foreign Keys:** `service_id -> services.id ON DELETE RESTRICT`, `payment_id -> payments.id ON DELETE SET NULL`

---

### preferred_times

Scheduling preferences for package instances.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| package_instance_id | uuid | NO | - | FK -> package_instances.id |
| day_of_week | text | NO | - | "monday" - "sunday" |
| time | text | NO | - | "09:00" format |
| priority | integer | NO | - | 1-4 |
| created_at | timestamp | NO | now() | - |

**Indexes:** `preferred_times_package_instance_idx(package_instance_id)`, `preferred_times_package_priority_idx(package_instance_id, priority) UNIQUE`
**Foreign Keys:** `package_instance_id -> package_instances.id ON DELETE CASCADE`

---

### class_slots

Pre-defined class schedules with capacity tracking.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| service_id | uuid | NO | - | FK -> services.id |
| branch_id | uuid | NO | - | FK -> hierarchy_nodes.id |
| date | timestamp | NO | - | - |
| start_time | text | NO | - | "09:00" format |
| end_time | text | NO | - | - |
| capacity | integer | NO | - | - |
| spots_booked | integer | NO | 0 | - |
| spots_available | integer | NO | - | - |
| is_full | boolean | NO | false | - |
| is_available | boolean | NO | true | - |
| is_cancelled | boolean | NO | false | - |
| cancellation_reason | text | YES | - | - |
| instructor_id | uuid | YES | - | FK -> members.id |
| location | text | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `class_slots_service_idx(service_id)`, `class_slots_branch_idx(branch_id)`, `class_slots_date_idx(date)`, `class_slots_service_date_time_idx(service_id, date, start_time)`, `class_slots_available_idx(is_available, is_full, date)`, `class_slots_instructor_idx(instructor_id)`
**Foreign Keys:** `service_id -> services.id ON DELETE CASCADE`, `branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`, `instructor_id -> members.id ON DELETE SET NULL`

---

### waitlist_entries

Waitlist for full class slots.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| class_slot_id | uuid | NO | - | FK -> class_slots.id, UNIQUE(class_slot_id, user_id) |
| user_id | text | NO | - | - |
| position | integer | NO | - | - |
| status | text | NO | - | "waiting" \| "notified" \| "booked" \| "expired" \| "cancelled" |
| notified_at | timestamp | YES | - | - |
| expires_at | timestamp | YES | - | - |
| booked_at | timestamp | YES | - | - |
| appointment_id | uuid | YES | - | FK -> appointments.id |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `waitlist_entries_slot_user_idx(class_slot_id, user_id) UNIQUE`, `waitlist_entries_slot_idx(class_slot_id)`, `waitlist_entries_user_idx(user_id)`, `waitlist_entries_status_idx(status)`, `waitlist_entries_slot_status_position_idx(class_slot_id, status, position)`
**Foreign Keys:** `class_slot_id -> class_slots.id ON DELETE CASCADE`, `appointment_id -> appointments.id ON DELETE SET NULL`

---

### recurrence_rules

Complex recurrence configuration for recurring appointments. 1:1 with appointments (only for recurring parents).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| appointment_id | uuid | NO | - | FK -> appointments.id, UNIQUE |
| frequency_value | integer | NO | 1 | - |
| time_unit | text | NO | - | "day" \| "week" \| "month" |
| repeat_on | jsonb | YES | - | Array of day numbers e.g. [1,3,5] |
| monthly_type | text | YES | - | "day_of_month" \| "day_of_week" |
| monthly_day_of_week | integer | YES | - | - |
| monthly_week_of_month | integer | YES | - | - |
| ends_type | text | NO | - | "never" \| "on_date" \| "after_occurrences" |
| ends_after_occurrences | integer | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `recurrence_rules_appointment_idx(appointment_id)`
**Foreign Keys:** `appointment_id -> appointments.id ON DELETE CASCADE`

---

### rooms

Physical rooms at branches for appointment scheduling.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | - |
| type | text | NO | - | "consultation" \| "group_session" \| "private" \| "training" \| "individual" |
| capacity | integer | NO | - | - |
| branch_id | uuid | NO | - | FK -> hierarchy_nodes.id |
| is_active | boolean | NO | true | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `rooms_branch_idx(branch_id)`, `rooms_is_active_idx(is_active)`
**Foreign Keys:** `branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### sales_orders

Sales order headers with cancellation tracking.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| sales_order_number | text | NO | - | UNIQUE |
| date | timestamp | NO | - | - |
| customer_id | text | YES | - | - |
| customer_name | text | NO | - | - |
| customer_type | text | NO | "member" | "member" \| "walk_in" |
| created_by | text | NO | - | - |
| branch_id | uuid | NO | - | FK -> hierarchy_nodes.id |
| status | text | NO | "draft" | "draft" \| "confirmed" \| "completed" \| "cancelled" |
| total_amount | integer | NO | - | In cents |
| notes | text | YES | - | - |
| cancellation_number | text | YES | - | UNIQUE **NEW** |
| cancellation_date | timestamp | YES | - | **NEW** |
| cancellation_reason | text | YES | - | **NEW** |
| cancelled_by | text | YES | - | **NEW** |
| cancelled_amount | integer | YES | - | **NEW** Refund amount in cents |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `sales_orders_number_idx(sales_order_number)`, `sales_orders_customer_idx(customer_id)`, `sales_orders_created_by_idx(created_by)`, `sales_orders_branch_idx(branch_id)`, `sales_orders_date_idx(date)`, `sales_orders_status_idx(status)`, `sales_orders_customer_type_idx(customer_type)`, `sales_orders_cancellation_number_idx(cancellation_number)`, `sales_orders_cancellation_date_idx(cancellation_date)`
**Foreign Keys:** `branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### sales_order_items

Line items for sales orders.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| sales_order_id | uuid | NO | - | FK -> sales_orders.id |
| product_id | uuid | YES | - | FK -> products.id |
| service_id | uuid | YES | - | FK -> services.id |
| appointment_id | uuid | YES | - | FK -> appointments.id |
| description | text | NO | - | - |
| quantity | integer | NO | - | - |
| unit_price | integer | NO | - | In cents |
| total_price | integer | NO | - | In cents |
| created_at | timestamp | NO | now() | - |

**Indexes:** `sales_order_items_order_idx(sales_order_id)`, `sales_order_items_product_idx(product_id)`, `sales_order_items_service_idx(service_id)`, `sales_order_items_appointment_idx(appointment_id)`
**Foreign Keys:** `sales_order_id -> sales_orders.id ON DELETE CASCADE`, `product_id -> products.id ON DELETE SET NULL`, `service_id -> services.id ON DELETE SET NULL`, `appointment_id -> appointments.id ON DELETE SET NULL`

---

### invoices

Invoice records linked to sales orders and payments.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| invoice_number | text | NO | - | UNIQUE |
| sales_order_id | uuid | YES | - | FK -> sales_orders.id |
| payment_id | uuid | YES | - | No schema FK (circular import) |
| date | timestamp | NO | - | - |
| due_date | timestamp | YES | - | - |
| customer_id | text | YES | - | members.userId |
| customer_name | text | NO | - | - |
| created_by | text | NO | - | members.userId |
| payment_mode | text | YES | - | "credit_card" \| "bank_transfer" \| "cash" \| "upi" \| "card" \| "apple_pay" \| "google_pay" |
| total_amount | integer | NO | - | In cents |
| amount_paid | integer | NO | 0 | In cents |
| status | text | NO | - | "draft" \| "sent" \| "paid" \| "partially_paid" \| "overdue" \| "cancelled" |
| e_invoice_status | text | YES | - | "pending" \| "generated" \| "failed" |
| e_invoice_id | text | YES | - | LHDN MyInvois UUID |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `invoices_number_idx(invoice_number)`, `invoices_sales_order_idx(sales_order_id)`, `invoices_payment_idx(payment_id)`, `invoices_customer_idx(customer_id)`, `invoices_status_idx(status)`, `invoices_e_invoice_status_idx(e_invoice_status)`, `invoices_date_idx(date)`
**Foreign Keys:** `sales_order_id -> sales_orders.id ON DELETE SET NULL`

---

### announcements

System announcements for dashboard display.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| branch_id | uuid | YES | - | FK -> hierarchy_nodes.id |
| title | text | NO | - | - |
| message | text | NO | - | - |
| priority | text | NO | "normal" | "low" \| "normal" \| "high" \| "urgent" |
| target_audience | text | NO | "all" | "all" \| "staff" \| "clients" |
| start_date | timestamp | YES | - | - |
| end_date | timestamp | YES | - | - |
| is_active | boolean | NO | true | - |
| is_pinned | boolean | NO | false | - |
| created_by | text | NO | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `announcements_branch_idx(branch_id)`, `announcements_active_idx(is_active)`, `announcements_priority_idx(priority)`, `announcements_target_idx(target_audience)`, `announcements_date_range_idx(start_date, end_date)`, `announcements_active_visible_idx(is_active, start_date, end_date)`
**Foreign Keys:** `branch_id -> hierarchy_nodes.id ON DELETE CASCADE`

---

### expenses

Expense/claim tracking for staff reimbursements.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| branch_id | uuid | YES | - | FK -> hierarchy_nodes.id |
| submitted_by | text | NO | - | - |
| amount | integer | NO | - | In cents |
| currency | text | NO | "usd" | - |
| category | text | NO | - | "travel" \| "equipment" \| "supplies" \| "training" \| "other" |
| description | text | NO | - | - |
| receipt_url | text | YES | - | - |
| expense_date | timestamp | NO | - | - |
| status | text | NO | "pending" | "pending" \| "approved" \| "rejected" \| "paid" |
| approved_by | text | YES | - | - |
| approved_at | timestamp | YES | - | - |
| rejection_reason | text | YES | - | - |
| paid_at | timestamp | YES | - | - |
| paid_by | text | YES | - | - |
| payment_reference | text | YES | - | - |
| notes | text | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `expenses_branch_idx(branch_id)`, `expenses_submitted_by_idx(submitted_by)`, `expenses_status_idx(status)`, `expenses_category_idx(category)`, `expenses_date_idx(expense_date)`, `expenses_submitter_status_idx(submitted_by, status)`
**Foreign Keys:** `branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### notifications

User notifications for bookings, payments, promotions, etc.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | text | NO | - | - |
| type | text | NO | - | "booking" \| "reminder" \| "payment" \| "promotion" \| "system" |
| title | text | NO | - | - |
| message | text | NO | - | - |
| icon | text | YES | - | - |
| color | text | YES | - | - |
| related_id | uuid | YES | - | - |
| related_type | text | YES | - | - |
| is_read | boolean | NO | false | - |
| read_at | timestamp | YES | - | - |
| created_at | timestamp | NO | now() | - |

**Indexes:** `notifications_user_idx(user_id)`, `notifications_read_idx(is_read)`, `notifications_type_idx(type)`, `notifications_user_read_created_idx(user_id, is_read, created_at)`
**Foreign Keys:** None

---

### notification_preferences

Per-user notification channel and type toggles.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | text | NO | - | UNIQUE |
| email_enabled | boolean | NO | true | - |
| sms_enabled | boolean | NO | false | - |
| push_enabled | boolean | NO | true | - |
| booking_reminders | boolean | NO | true | - |
| booking_confirmations | boolean | NO | true | - |
| promotional_emails | boolean | NO | true | - |
| package_expiry | boolean | NO | true | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `notification_preferences_user_idx(user_id)`
**Foreign Keys:** None

---

### user_activity_log

Customer activity tracking for dashboard "Recent Activity" widget.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | text | NO | - | - |
| activity_type | text | NO | - | "booking_created" \| "booking_completed" \| "booking_cancelled" \| "package_purchased" \| "credit_used" \| "credit_added" |
| title | text | NO | - | - |
| description | text | YES | - | - |
| related_id | uuid | YES | - | - |
| related_type | text | YES | - | - |
| credits_change | integer | NO | 0 | - |
| icon | text | YES | - | - |
| created_at | timestamp | NO | now() | - |

**Indexes:** `user_activity_log_user_idx(user_id)`, `user_activity_log_type_idx(activity_type)`, `user_activity_log_user_created_idx(user_id, created_at)`
**Foreign Keys:** None

---

### ghl_contact_links

GoHighLevel contact-to-customer profile mappings.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| ghl_contact_id | text | NO | - | UNIQUE |
| user_id | text | NO | - | - |
| customer_profile_id | uuid | YES | - | FK -> customer_profiles.id |
| sync_status | text | NO | "active" | "active" \| "deleted" \| "error" |
| last_synced_at | timestamp | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `ghl_contact_links_ghl_contact_id_unique(ghl_contact_id) UNIQUE`, `ghl_contact_links_user_idx(user_id)`, `ghl_contact_links_customer_profile_idx(customer_profile_id)`, `ghl_contact_links_sync_status_idx(sync_status)`, `ghl_contact_links_last_synced_idx(last_synced_at)`
**Foreign Keys:** `customer_profile_id -> customer_profiles.id ON DELETE SET NULL`

---

### ghl_sync_events

GoHighLevel webhook payloads and processing outcomes for observability.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| event_key | text | NO | - | UNIQUE |
| event_type | text | NO | - | "create" \| "update" \| "delete" \| "custom" |
| ghl_contact_id | text | YES | - | - |
| email | text | YES | - | - |
| status | text | NO | - | "processed" \| "skipped" \| "failed" \| "deduped" |
| error_message | text | YES | - | - |
| raw_payload | jsonb | YES | - | - |
| created_at | timestamp | NO | now() | - |

**Indexes:** `ghl_sync_events_event_key_unique(event_key) UNIQUE`, `ghl_sync_events_event_type_idx(event_type)`, `ghl_sync_events_contact_idx(ghl_contact_id)`, `ghl_sync_events_status_idx(status)`, `ghl_sync_events_created_idx(created_at)`
**Foreign Keys:** None

---

### brands

Product brands.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | UNIQUE |
| description | text | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `brands_name_unique(name) UNIQUE`, `brands_name_idx(name)`
**Foreign Keys:** None

---

### product_categories

Product categorization.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | UNIQUE |
| external_code | text | YES | - | UNIQUE |
| description | text | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `product_categories_name_unique(name) UNIQUE`, `product_categories_external_code_unique(external_code) UNIQUE`, `product_categories_name_idx(name)`, `product_categories_external_code_idx(external_code)`
**Foreign Keys:** None

---

### suppliers

Supplier/vendor records.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | - |
| description | text | YES | - | - |
| account_number | text | YES | - | - |
| payment_terms | text | YES | - | - |
| contact_person | text | YES | - | - |
| contact_phone | text | YES | - | - |
| office_phone | text | YES | - | - |
| email | text | YES | - | - |
| website | text | YES | - | - |
| barcode | text | YES | - | - |
| is_active | boolean | NO | true | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `suppliers_name_idx(name)`, `suppliers_is_active_idx(is_active)`
**Foreign Keys:** None

---

### units_of_measure

Units of measure with self-referential base-unit conversion.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | UNIQUE |
| description | text | YES | - | - |
| base_uom_id | uuid | YES | - | FK -> units_of_measure.id (self-ref; null = this IS the base unit) |
| conversion_factor | numeric(12,4) | NO | "1" | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `uom_name_unique(name) UNIQUE`, `uom_name_idx(name)`, `uom_base_uom_idx(base_uom_id)`
**Foreign Keys:** `base_uom_id -> units_of_measure.id ON DELETE RESTRICT`

---

### products

Product catalog with SKU, pricing, and supplier links.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| sku | text | NO | - | UNIQUE |
| name | text | NO | - | - |
| barcode | text | YES | - | - |
| type | text | NO | "product" | "product" \| "service_item" |
| brand_id | uuid | YES | - | FK -> brands.id |
| category_id | uuid | YES | - | FK -> product_categories.id |
| supplier_id | uuid | YES | - | FK -> suppliers.id |
| uom_id | uuid | NO | - | FK -> units_of_measure.id |
| conversion_factor | numeric(12,4) | NO | "1" | - |
| price | integer | NO | - | Selling price in cents |
| status | text | NO | "active" | "active" \| "inactive" \| "discontinued" |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `products_sku_unique(sku) UNIQUE`, `products_sku_idx(sku)`, `products_barcode_idx(barcode)`, `products_brand_idx(brand_id)`, `products_category_idx(category_id)`, `products_supplier_idx(supplier_id)`, `products_status_idx(status)`
**Foreign Keys:** `brand_id -> brands.id ON DELETE SET NULL`, `category_id -> product_categories.id ON DELETE SET NULL`, `supplier_id -> suppliers.id ON DELETE SET NULL`, `uom_id -> units_of_measure.id ON DELETE RESTRICT`

---

### product_stock

Per-branch product inventory levels.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| product_id | uuid | NO | - | FK -> products.id, UNIQUE(product_id, branch_id) |
| branch_id | uuid | NO | - | FK -> hierarchy_nodes.id, UNIQUE(product_id, branch_id) |
| quantity | integer | NO | 0 | - |
| min_stock_level | integer | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `product_stock_product_branch_unique(product_id, branch_id) UNIQUE`, `product_stock_product_idx(product_id)`, `product_stock_branch_idx(branch_id)`
**Foreign Keys:** `product_id -> products.id ON DELETE CASCADE`, `branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### stock_requests

Inter-branch stock request headers.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| request_number | text | NO | - | UNIQUE |
| date_issued | timestamp | NO | - | - |
| issued_by_member_id | uuid | NO | - | FK -> members.id |
| from_branch_id | uuid | YES | - | FK -> hierarchy_nodes.id (null = central warehouse) |
| to_branch_id | uuid | NO | - | FK -> hierarchy_nodes.id |
| destination_label | text | YES | - | - |
| status | text | NO | "pending" | "pending" \| "approved" \| "fulfilled" \| "rejected" \| "cancelled" |
| notes | text | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `stock_requests_number_idx(request_number)`, `stock_requests_member_idx(issued_by_member_id)`, `stock_requests_from_branch_idx(from_branch_id)`, `stock_requests_to_branch_idx(to_branch_id)`, `stock_requests_status_idx(status)`, `stock_requests_date_idx(date_issued)`
**Foreign Keys:** `issued_by_member_id -> members.id ON DELETE RESTRICT`, `from_branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`, `to_branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### stock_request_items

Line items for stock requests.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| stock_request_id | uuid | NO | - | FK -> stock_requests.id |
| product_id | uuid | NO | - | FK -> products.id |
| quantity_requested | integer | NO | - | - |
| quantity_fulfilled | integer | NO | 0 | - |
| notes | text | YES | - | - |
| created_at | timestamp | NO | now() | - |

**Indexes:** `stock_request_items_request_idx(stock_request_id)`, `stock_request_items_product_idx(product_id)`
**Foreign Keys:** `stock_request_id -> stock_requests.id ON DELETE CASCADE`, `product_id -> products.id ON DELETE RESTRICT`

---

### transfer_orders

Inter-branch stock transfer headers.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| transfer_number | text | NO | - | UNIQUE |
| date_issued | timestamp | NO | - | - |
| from_branch_id | uuid | NO | - | FK -> hierarchy_nodes.id |
| to_branch_id | uuid | NO | - | FK -> hierarchy_nodes.id |
| issued_by_member_id | uuid | NO | - | FK -> members.id |
| status | text | NO | "pending" | "pending" \| "in_transit" \| "completed" \| "cancelled" |
| notes | text | YES | - | - |
| completed_at | timestamp | YES | - | - |
| created_at | timestamp | NO | now() | - |
| updated_at | timestamp | NO | now() | - |

**Indexes:** `transfer_orders_number_idx(transfer_number)`, `transfer_orders_from_branch_idx(from_branch_id)`, `transfer_orders_to_branch_idx(to_branch_id)`, `transfer_orders_member_idx(issued_by_member_id)`, `transfer_orders_status_idx(status)`, `transfer_orders_date_idx(date_issued)`
**Foreign Keys:** `from_branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`, `to_branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`, `issued_by_member_id -> members.id ON DELETE RESTRICT`

---

### transfer_order_items

Line items for transfer orders.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| transfer_order_id | uuid | NO | - | FK -> transfer_orders.id |
| product_id | uuid | NO | - | FK -> products.id |
| quantity_transferred | integer | NO | - | - |
| quantity_received | integer | NO | 0 | - |
| notes | text | YES | - | - |
| created_at | timestamp | NO | now() | - |

**Indexes:** `transfer_order_items_order_idx(transfer_order_id)`, `transfer_order_items_product_idx(product_id)`
**Foreign Keys:** `transfer_order_id -> transfer_orders.id ON DELETE CASCADE`, `product_id -> products.id ON DELETE RESTRICT`

---

### purchase_orders

Purchase orders sent to suppliers. Uses `purchase_order_status` enum.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| purchase_order_number | text | NO | - | UNIQUE INDEX |
| supplier_id | uuid | NO | - | FK -> suppliers.id |
| branch_id | uuid | NO | - | FK -> hierarchy_nodes.id |
| status | purchase_order_status | NO | "draft" | "draft" \| "approved" \| "ordered" \| "partially_received" \| "received" \| "cancelled" |
| order_date | timestamptz | NO | - | - |
| expected_delivery_date | timestamptz | YES | - | - |
| received_at | timestamptz | YES | - | - |
| subtotal | integer | NO | 0 | In cents |
| tax_amount | integer | NO | 0 | In cents |
| total_amount | integer | NO | 0 | In cents |
| notes | text | YES | - | - |
| created_by | text | NO | - | member.userId |
| approved_by | text | YES | - | member.userId |
| approved_at | timestamptz | YES | - | - |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | NO | now() | - |

**Indexes:** `po_number_idx(purchase_order_number) UNIQUE`, `po_supplier_idx(supplier_id)`, `po_branch_idx(branch_id)`, `po_status_idx(status)`, `po_order_date_idx(order_date)`, `po_created_by_idx(created_by)`, `po_supplier_status_idx(supplier_id, status)`
**Foreign Keys:** `supplier_id -> suppliers.id ON DELETE RESTRICT`, `branch_id -> hierarchy_nodes.id ON DELETE RESTRICT`

---

### purchase_order_items

Line items for purchase orders.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| purchase_order_id | uuid | NO | - | FK -> purchase_orders.id |
| product_id | uuid | NO | - | FK -> products.id |
| ordered_qty | integer | NO | - | - |
| received_qty | integer | NO | 0 | - |
| unit_cost | integer | NO | - | In cents |
| total_cost | integer | NO | - | In cents (ordered_qty x unit_cost) |
| notes | text | YES | - | - |
| created_at | timestamptz | NO | now() | - |

**Indexes:** `po_items_po_id_idx(purchase_order_id)`, `po_items_product_idx(product_id)`
**Foreign Keys:** `purchase_order_id -> purchase_orders.id ON DELETE CASCADE`, `product_id -> products.id ON DELETE RESTRICT`

---

### promotions

Discount/promotion codes for checkout. Uses `promotion_type` enum. Value encoding: percentage = basis points (2000 = 20%), fixed_amount = cents (1000 = RM 10).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| code | text | NO | - | UNIQUE INDEX |
| name | text | NO | - | - |
| description | text | YES | - | - |
| type | promotion_type | NO | - | "percentage" \| "fixed_amount" \| "free_item" \| "buy_x_get_y" |
| value | integer | NO | - | Basis points or cents depending on type |
| minimum_order_amount | integer | NO | 0 | In cents |
| maximum_discount | integer | YES | - | In cents (cap for percentage discounts) |
| usage_limit | integer | YES | - | null = unlimited |
| usage_count | integer | NO | 0 | - |
| per_customer_limit | integer | YES | 1 | - |
| valid_from | timestamptz | NO | - | - |
| valid_until | timestamptz | YES | - | null = never expires |
| is_active | boolean | NO | true | - |
| branch_id | uuid | YES | - | FK -> hierarchy_nodes.id (null = all branches) |
| applicable_product_ids | jsonb | YES | - | string[] of product UUIDs |
| applicable_service_ids | jsonb | YES | - | string[] of service UUIDs |
| created_by | text | NO | - | member.userId |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | NO | now() | - |

**Indexes:** `promotions_code_idx(code) UNIQUE`, `promotions_active_idx(is_active)`, `promotions_valid_dates_idx(valid_from, valid_until)`, `promotions_branch_idx(branch_id)`, `promotions_type_idx(type)`
**Foreign Keys:** `branch_id -> hierarchy_nodes.id ON DELETE SET NULL`

---

### promotion_usages

Tracks each use of a promotion by a customer.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| promotion_id | uuid | NO | - | FK -> promotions.id |
| customer_id | text | NO | - | member.userId or walk_in_customers.id |
| sales_order_id | text | NO | - | - |
| discount_amount | integer | NO | - | In cents |
| used_at | timestamptz | NO | now() | - |

**Indexes:** `promo_usages_promo_idx(promotion_id)`, `promo_usages_customer_idx(customer_id)`, `promo_usages_order_idx(sales_order_id)`, `promo_usages_unique_customer_order(promotion_id, customer_id, sales_order_id) UNIQUE`
**Foreign Keys:** `promotion_id -> promotions.id ON DELETE CASCADE`

---

### walk_in_customers

Unregistered walk-in customer records. Used alongside `customer_profiles` (for registered members).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | - |
| email | text | YES | - | - |
| phone | text | YES | - | - |
| branch_id | uuid | YES | - | FK -> hierarchy_nodes.id |
| date_of_birth | timestamptz | YES | - | - |
| gender | text | YES | - | "male" \| "female" \| "other" \| "prefer_not_to_say" |
| address | text | YES | - | - |
| emergency_contact_name | text | YES | - | - |
| emergency_contact_phone | text | YES | - | - |
| medical_notes | text | YES | - | - |
| notes | text | YES | - | - |
| is_active | boolean | NO | true | Soft-delete |
| created_by | text | NO | - | member.userId |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | NO | now() | - |

**Indexes:** `walk_in_customers_name_idx(name)`, `walk_in_customers_phone_idx(phone)`, `walk_in_customers_email_idx(email)`, `walk_in_customers_branch_idx(branch_id)`, `walk_in_customers_active_idx(is_active)`
**Foreign Keys:** `branch_id -> hierarchy_nodes.id ON DELETE SET NULL`

---

### tax_rates

Configurable tax rates for Malaysian tax compliance (LHDN MyInvois). Rates stored in basis points (800 = 8.00%).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | - | - |
| code | text | NO | - | UNIQUE INDEX |
| rate_in_basis_points | integer | NO | - | 800 = 8.00% |
| category | text | NO | "SST" | "SST" \| "GST" \| "service_tax" \| "withholding_tax" \| "tax_exempt" \| "custom" |
| is_active | boolean | NO | true | - |
| is_default | boolean | NO | false | Only one can be true (enforced in service layer) |
| effective_from | timestamptz | NO | - | - |
| effective_until | timestamptz | YES | - | null = still active |
| description | text | YES | - | - |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | NO | now() | - |

**Indexes:** `tax_rates_code_idx(code) UNIQUE`, `tax_rates_active_idx(is_active)`, `tax_rates_default_idx(is_default)`, `tax_rates_category_idx(category)`
**Foreign Keys:** None

---

### dashboard_snapshots

Pre-computed dashboard KPI snapshots.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | PK |
| organization_id | text | NO | - | - |
| branch_id | uuid | YES | - | null = org-wide snapshot |
| snapshot_date | timestamptz | NO | - | - |
| period | text | NO | - | "daily" \| "weekly" \| "monthly" |
| total_sales | integer | NO | 0 | In cents |
| sales_order_count | integer | NO | 0 | - |
| total_appointments | integer | NO | 0 | - |
| completed_appointments | integer | NO | 0 | - |
| active_members_count | integer | NO | 0 | - |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | NO | now() | - |

**Indexes:** `dashboard_snapshots_org_period_idx(organization_id, period)`, `dashboard_snapshots_date_idx(snapshot_date)`
**Foreign Keys:** None

---

## Schema Consolidation Changes

This section documents changes made during the schema consolidation on the `Customer-app` branch. The consolidation simplified the data model by merging package-related concepts into the `services` table and unifying cancellation tracking into `sales_orders`.

### Dropped Tables

| Table | Reason | Data Migration |
|-------|--------|----------------|
| `packages` | Absorbed into `services` table. Package-specific fields (`session_count`, `expirable`, `expiry_days`, `expiry_date`) added directly to services. | Services now serve dual purpose as both service definitions and package definitions. |
| `package_assignments` | Replaced by `package_instances` table which provides unified tracking for both staff-assigned and client-purchased packages. | All assignment data migrated to `package_instances` with `source: "assigned"`. |
| `service_rules` | Replaced by `service_category_config` table which consolidates booking rules at the category level instead of per-service. | Booking rules (advance booking, cancellation windows) moved to `service_category_config`. |
| `service_commission_config` | Replaced by `service_category_config` table which consolidates commission/incentive configuration at the category level. | Commission config (incentive type, staff weightage, payment structures) moved to `service_category_config`. |
| `cancelled_sales` | Absorbed into `sales_orders` table. Cancellation metadata columns added directly to the sales order record. | Cancellation data stored inline on the sales order when `status = "cancelled"`. |

### New Columns on Existing Tables

#### `services` table
| Column | Type | Note |
|--------|------|------|
| `session_count` | integer (nullable) | **NEW** - Number of sessions in the package |
| `expirable` | boolean (default false) | **NEW** - Whether the package/service expires |
| `expiry_days` | integer (nullable) | **NEW** - Number of days until expiry |
| `expiry_date` | timestamp (nullable) | **NEW** - Fixed expiry date |

#### `sales_orders` table
| Column | Type | Note |
|--------|------|------|
| `cancellation_number` | text (nullable, unique) | **NEW** - Unique cancellation identifier |
| `cancellation_date` | timestamp (nullable) | **NEW** - When the order was cancelled |
| `cancellation_reason` | text (nullable) | **NEW** - Reason for cancellation |
| `cancelled_by` | text (nullable) | **NEW** - Who cancelled the order |
| `cancelled_amount` | integer (nullable) | **NEW** - Partial or full refund amount in cents |

### Renamed Columns

| Table | Old Column | New Column | Note |
|-------|-----------|------------|------|
| `appointment_clients` | `package_assignment_id` | `package_instance_id` | **RENAMED** - FK target changed from `package_assignments.id` to `package_instances.id` |

### Replaced Columns

| Table | Old Column | New Column | Note |
|-------|-----------|------------|------|
| `package_instances` | `package_id` (FK -> packages.id) | `service_id` (FK -> services.id, NOT NULL) | **REPLACED** - Now references services directly since packages were absorbed into services |

### New Tables

| Table | Purpose |
|-------|---------|
| `service_category_config` | Per-category booking rules and commission/incentive configuration. 1:1 with `service_categories`. Replaces the per-service `service_rules` and `service_commission_config` tables with a category-level approach. |

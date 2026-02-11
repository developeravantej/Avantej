# Native App - Optimal Database Schema

**Created**: Based on `PAGE_FEATURES_ANALYSIS.md`  
**Purpose**: Database schema optimized for the native mobile app features  
**Database**: PostgreSQL (recommended)  
**ORM**: Compatible with Drizzle ORM, Prisma, or TypeORM

---

## Table of Contents

1. [Overview](#overview)
2. [Core Tables](#core-tables)
3. [Service & Package Tables](#service--package-tables)
4. [Booking Tables](#booking-tables)
5. [Package Purchase Tables](#package-purchase-tables)
6. [Payment Tables](#payment-tables)
7. [Notification Tables](#notification-tables)
8. [User Preference Tables](#user-preference-tables)
9. [Relationships Diagram](#relationships-diagram)
10. [Indexes & Performance](#indexes--performance)
11. [Computed Fields & Views](#computed-fields--views)
12. [Business Rules](#business-rules)
13. [Sample Queries](#sample-queries)
14. [Migration Strategy](#migration-strategy)
15. [Notes](#notes)

---

## Overview

This schema supports all features identified in the native app:

- **Phone-based authentication** (OTP)
- **Service booking** (1-on-1 and group classes)
- **Package purchasing** (Personal Training and Classes)
- **Preferred time scheduling**
- **Credit-based workout system**
- **Notifications**
- **Payment processing**
- **User profiles and preferences**

---

## Core Tables

### `users`
Platform-wide user accounts with phone-based authentication.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | User ID |
| `phone_number` | text | UNIQUE, NOT NULL | Phone number (E.164 format) |
| `phone_verified` | boolean | DEFAULT false | Phone verification status |
| `full_name` | text | | User's full name |
| `email` | text | UNIQUE | Email address (optional) |
| `profile_image_url` | text | | Profile picture URL |
| `member_since` | date | | Membership start date |
| `status` | text | DEFAULT 'active' | Status: `active`, `suspended`, `inactive` |
| `created_at` | timestamp | DEFAULT now() | Account creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |
| `last_login_at` | timestamp | | Most recent login time |

**Indexes**:
- Unique index on `phone_number`
- Unique index on `email` (where not null)
- Index on `status`

---

### `otp_verifications`
OTP codes for phone number verification and login.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Verification ID |
| `phone_number` | text | NOT NULL | Phone number |
| `code` | text | NOT NULL | 6-digit OTP code |
| `purpose` | text | NOT NULL | Purpose: `login`, `signup`, `verify_phone` |
| `expires_at` | timestamp | NOT NULL | Expiration time (5-10 minutes) |
| `verified_at` | timestamp | | Verification completion time |
| `attempts` | integer | DEFAULT 0 | Number of verification attempts |
| `created_at` | timestamp | DEFAULT now() | Creation time |

**Indexes**:
- Index on `phone_number`, `code`, `expires_at` (for lookup)
- Index on `expires_at` (for cleanup)

**Business Rules**:
- OTP expires after 10 minutes
- Maximum 3 attempts per OTP
- Rate limiting: 1 OTP per phone per minute

---

### `sessions`
User authentication sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Session ID |
| `user_id` | uuid | FK → users.id | User ID |
| `token` | text | UNIQUE, NOT NULL | Session token (JWT or random) |
| `device_id` | text | | Device identifier |
| `device_type` | text | | Device type: `ios`, `android`, `web` |
| `ip_address` | text | | Client IP address |
| `user_agent` | text | | Client user agent |
| `expires_at` | timestamp | NOT NULL | Session expiration |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `last_activity_at` | timestamp | DEFAULT now() | Last activity time |

**Indexes**:
- Unique index on `token`
- Index on `user_id`
- Index on `expires_at` (for cleanup)

---

## Service & Package Tables

### `service_categories`
Service categories (Fitness & Training, Group Classes, Wellness & Recovery, Specialized Programs).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Category ID |
| `name` | text | UNIQUE, NOT NULL | Category name |
| `description` | text | | Category description |
| `display_order` | integer | DEFAULT 0 | Display order for UI |
| `is_active` | boolean | DEFAULT true | Active status |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**Indexes**:
- Unique index on `name`
- Index on `is_active`, `display_order`

---

### `services`
Individual services (Personal Training, HIIT Class, Yoga Flow, etc.).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Service ID |
| `category_id` | uuid | FK → service_categories.id | Category ID |
| `title` | text | NOT NULL | Service title |
| `description` | text | | Service description |
| `type` | text | NOT NULL | Type: `private` (1-on-1), `semi_private` (class) |
| `duration_minutes` | integer | | Duration in minutes |
| `image_url` | text | | Service image URL |
| `price` | decimal(10,2) | | Price per session/class |
| `price_unit` | text | | Unit: `session`, `class`, `package` |
| `popularity_percentage` | integer | DEFAULT 0 | Popularity metric (0-100) |
| `is_recommended` | boolean | DEFAULT false | Recommended flag |
| `location` | text | | Default location/studio name |
| `features` | text[] | | Array of service features |
| `is_active` | boolean | DEFAULT true | Active status |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**Indexes**:
- Index on `category_id`
- Index on `type`
- Index on `is_active`, `is_recommended`
- Index on `popularity_percentage` (for sorting)
- Index on `location` (for filtering)

---

### `trainers`
Trainers/providers who deliver services.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Trainer ID |
| `name` | text | NOT NULL | Trainer name |
| `specialization` | text | | Specialization description |
| `bio` | text | | Trainer biography |
| `image_url` | text | | Trainer photo URL |
| `phone_number` | text | | Contact phone |
| `email` | text | | Contact email |
| `is_active` | boolean | DEFAULT true | Active status |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**Indexes**:
- Index on `is_active`

---

### `service_trainers`
Many-to-many relationship between services and trainers.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Relationship ID |
| `service_id` | uuid | FK → services.id | Service ID |
| `trainer_id` | uuid | FK → trainers.id | Trainer ID |
| `is_primary` | boolean | DEFAULT false | Primary trainer flag |
| `created_at` | timestamp | DEFAULT now() | Creation time |

**Indexes**:
- Unique index on (`service_id`, `trainer_id`)
- Index on `service_id`
- Index on `trainer_id`

---

### `packages`
Package offerings (2×12-Week Personal Training, Class A, etc.).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Package ID |
| `service_id` | uuid | FK → services.id | Associated service |
| `title` | text | NOT NULL | Package title |
| `description` | text | | Package description |
| `type` | text | NOT NULL | Type: `private`, `semi_private` |
| `credits` | integer | | Number of credits included (for private) |
| `schedule` | text | | Fixed schedule (for classes, e.g., "Mon/Wed/Fri 7:00 PM") |
| `duration_weeks` | integer | | Package duration in weeks |
| `sessions_per_week` | integer | | Sessions per week (for private) |
| `price` | decimal(10,2) | NOT NULL | Package price |
| `is_active` | boolean | DEFAULT true | Active status |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**Indexes**:
- Index on `service_id`
- Index on `type`
- Index on `is_active`

---

## Booking Tables

### `bookings`
Individual workout bookings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Booking ID |
| `booking_number` | text | UNIQUE, NOT NULL | Human-readable booking ID (e.g., "BK-2024-001") |
| `user_id` | uuid | FK → users.id | User ID |
| `service_id` | uuid | FK → services.id | Service ID |
| `package_purchase_id` | uuid | FK → package_purchases.id, NULL | Package purchase ID (if booked via package) |
| `trainer_id` | uuid | FK → trainers.id, NULL | Trainer ID (NULL if auto-assigned or class) |
| `instructor` | text | | Instructor name (for classes, alternative to trainer) |
| `is_auto_assigned` | boolean | DEFAULT false | Auto-assigned trainer flag |
| `scheduled_date` | date | NOT NULL | Scheduled date |
| `scheduled_time` | time | NOT NULL | Scheduled time |
| `duration_minutes` | integer | | Duration in minutes |
| `location` | text | | Location/studio name |
| `studio` | text | | Studio name (for classes) |
| `image_url` | text | | Booking image URL |
| `status` | text | NOT NULL | Status: `pending`, `confirmed`, `completed`, `cancelled`, `no_show` |
| `credits_used` | integer | DEFAULT 1 | Credits used for this booking |
| `price` | decimal(10,2) | | Booking price |
| `price_unit` | text | | Price unit: `session`, `class` |
| `description` | text | | Booking description |
| `remark` | text | | Additional remarks/notes |
| `cancelled_at` | timestamp | | Cancellation time |
| `cancellation_reason` | text | | Cancellation reason |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**Indexes**:
- Unique index on `booking_number`
- Index on `user_id`
- Index on `service_id`
- Index on `package_purchase_id`
- Index on `trainer_id`
- Index on `scheduled_date`, `scheduled_time`
- Index on `status`
- Composite index on (`user_id`, `status`, `scheduled_date`)

---

### `class_slots`
Available time slots for group classes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Slot ID |
| `service_id` | uuid | FK → services.id | Service ID |
| `date` | date | NOT NULL | Slot date |
| `time` | time | NOT NULL | Slot time |
| `capacity` | integer | NOT NULL | Maximum capacity |
| `spots_available` | integer | NOT NULL | Available spots |
| `is_full` | boolean | DEFAULT false | Full status |
| `is_available` | boolean | DEFAULT true | Availability status |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

---

### `waitlist_entries`
Waitlist entries for full class slots.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Waitlist entry ID |
| `user_id` | uuid | FK → users.id | User ID |
| `class_slot_id` | uuid | FK → class_slots.id | Class slot ID |
| `service_id` | uuid | FK → services.id | Service ID |
| `status` | text | NOT NULL | Status: `pending`, `notified`, `booked`, `cancelled` |
| `notified_at` | timestamp | | Notification timestamp |
| `booked_at` | timestamp | | Booking timestamp (when spot became available) |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**Indexes**:
- Index on `user_id`
- Index on `class_slot_id`
- Index on `service_id`
- Index on `status`
- Composite index on (`class_slot_id`, `status`, `created_at`)

**Indexes**:
- Index on `service_id`
- Index on `date`, `time`
- Index on `is_available`, `is_full`
- Composite index on (`service_id`, `date`, `time`)

---

## Package Purchase Tables

### `package_purchases`
User package purchases.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Purchase ID |
| `user_id` | uuid | FK → users.id | User ID |
| `package_id` | uuid | FK → packages.id | Package ID |
| `payment_id` | uuid | FK → payments.id, NULL | Payment ID (after payment completion) |
| `purchase_number` | text | UNIQUE, NOT NULL | Purchase number (e.g., "PKG-2024-001") |
| `total_price` | decimal(10,2) | NOT NULL | Total purchase price |
| `tax_amount` | decimal(10,2) | DEFAULT 0 | Tax amount |
| `payment_status` | text | NOT NULL | Status: `pending`, `paid`, `failed`, `refunded` |
| `payment_method` | text | | Payment method: `card`, `apple_pay`, `google_pay` |
| `e_signature` | text | | Electronic signature (full name) |
| `terms_agreed_at` | timestamp | | Terms agreement timestamp |
| `remark` | text | | Additional remarks |
| `starts_at` | date | | Package start date |
| `expires_at` | date | | Package expiration date |
| `renewal_date` | date | | Next renewal date (for recurring packages) |
| `credits_total` | integer | | Total credits purchased |
| `credits_remaining` | integer | | Remaining credits |
| `workouts_completed` | integer | DEFAULT 0 | Number of workouts completed |
| `status` | text | NOT NULL | Status: `active`, `expired`, `cancelled`, `completed` |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**Indexes**:
- Unique index on `purchase_number`
- Index on `user_id`
- Index on `package_id`
- Index on `payment_id`
- Index on `payment_status`
- Index on `status`
- Index on `expires_at`
- Index on `renewal_date`
- Composite index on (`user_id`, `status`)

---

### `preferred_times`
Preferred day and time combinations for Personal Training packages.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Preferred time ID |
| `package_purchase_id` | uuid | FK → package_purchases.id | Package purchase ID |
| `day_of_week` | text | NOT NULL | Day: `Monday`, `Tuesday`, `Wednesday`, etc. |
| `time` | time | NOT NULL | Preferred time |
| `priority` | integer | DEFAULT 1 | Priority order (1-4) |
| `created_at` | timestamp | DEFAULT now() | Creation time |

**Indexes**:
- Index on `package_purchase_id`
- Index on `day_of_week`, `time`
- Composite index on (`package_purchase_id`, `priority`)

**Business Rules**:
- Maximum 4 preferred times per package purchase
- Priority must be unique per package purchase (1-4)

---

## Payment Tables

### `payments`
Payment transactions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Payment ID |
| `user_id` | uuid | FK → users.id | User ID |
| `payment_number` | text | UNIQUE, NOT NULL | Payment number (e.g., "PAY-2024-001") |
| `amount` | decimal(10,2) | NOT NULL | Payment amount |
| `currency` | text | DEFAULT 'USD' | Currency code |
| `payment_method` | text | NOT NULL | Method: `card`, `apple_pay`, `google_pay` |
| `payment_intent_id` | text | | Stripe PaymentIntent ID |
| `status` | text | NOT NULL | Status: `pending`, `processing`, `succeeded`, `failed`, `refunded` |
| `failure_reason` | text | | Failure reason (if failed) |
| `refunded_at` | timestamp | | Refund timestamp |
| `refund_amount` | decimal(10,2) | | Refunded amount |
| `metadata` | jsonb | | Additional payment metadata |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**Indexes**:
- Unique index on `payment_number`
- Index on `user_id`
- Index on `payment_intent_id`
- Index on `status`
- Index on `created_at`

---

### `payment_items`
Line items for payments (for order breakdown).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Item ID |
| `payment_id` | uuid | FK → payments.id | Payment ID |
| `item_type` | text | NOT NULL | Type: `package`, `booking`, `tax`, `fee` |
| `item_id` | uuid | | Reference to item (package_purchase_id, booking_id, etc.) |
| `description` | text | NOT NULL | Item description |
| `quantity` | integer | DEFAULT 1 | Quantity |
| `unit_price` | decimal(10,2) | NOT NULL | Unit price |
| `total_price` | decimal(10,2) | NOT NULL | Total price |
| `created_at` | timestamp | DEFAULT now() | Creation time |

**Indexes**:
- Index on `payment_id`
- Index on `item_type`, `item_id`

---

## Notification Tables

### `notifications`
User notifications.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Notification ID |
| `user_id` | uuid | FK → users.id | User ID |
| `type` | text | NOT NULL | Type: `booking`, `reminder`, `promotion`, `system`, `payment` |
| `title` | text | NOT NULL | Notification title |
| `message` | text | NOT NULL | Notification message |
| `icon` | text | | Icon name |
| `color` | text | | Icon color code |
| `related_id` | uuid | | Related entity ID (booking_id, payment_id, etc.) |
| `related_type` | text | | Related entity type |
| `is_read` | boolean | DEFAULT false | Read status |
| `read_at` | timestamp | | Read timestamp |
| `created_at` | timestamp | DEFAULT now() | Creation time |

**Indexes**:
- Index on `user_id`
- Index on `is_read`
- Index on `type`
- Index on `created_at`
- Composite index on (`user_id`, `is_read`, `created_at`)

---

## User Preference Tables

### `user_profiles`
Extended user profile information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Profile ID |
| `user_id` | uuid | FK → users.id, UNIQUE | User ID (one-to-one) |
| `full_name` | text | | Full name |
| `email` | text | | Email address |
| `phone_number` | text | | Phone number (synced from users) |
| `date_of_birth` | date | | Date of birth |
| `gender` | text | | Gender |
| `address` | text | | Physical address |
| `emergency_contact_name` | text | | Emergency contact name |
| `emergency_contact_phone` | text | | Emergency contact phone |
| `medical_notes` | text | | Medical notes/restrictions |
| `fitness_goals` | text[] | | Array of fitness goals |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**Indexes**:
- Unique index on `user_id`

---

### `notification_preferences`
User notification preferences.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Preference ID |
| `user_id` | uuid | FK → users.id, UNIQUE | User ID (one-to-one) |
| `email_enabled` | boolean | DEFAULT true | Email notifications |
| `sms_enabled` | boolean | DEFAULT false | SMS notifications |
| `push_enabled` | boolean | DEFAULT false | Push notifications |
| `booking_reminders` | boolean | DEFAULT true | Booking reminders |
| `promotional_emails` | boolean | DEFAULT true | Promotional emails |
| `created_at` | timestamp | DEFAULT now() | Creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**Indexes**:
- Unique index on `user_id`

---

### `user_activity_log`
User activity tracking (for Recent Activity section).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Activity ID |
| `user_id` | uuid | FK → users.id | User ID |
| `activity_type` | text | NOT NULL | Type: `booking_completed`, `package_purchased`, `credit_added`, `credit_used` |
| `title` | text | NOT NULL | Activity title |
| `description` | text | | Activity description |
| `related_id` | uuid | | Related entity ID |
| `related_type` | text | | Related entity type |
| `credits_change` | integer | DEFAULT 0 | Credits change (+/-) |
| `icon` | text | | Icon name |
| `created_at` | timestamp | DEFAULT now() | Activity timestamp |

**Indexes**:
- Index on `user_id`
- Index on `activity_type`
- Index on `created_at`
- Composite index on (`user_id`, `created_at` DESC)

---

## Relationships Diagram

```
users (1) ──< (many) sessions
users (1) ──< (many) bookings
users (1) ──< (many) package_purchases
users (1) ──< (many) payments
users (1) ──< (many) notifications
users (1) ──< (many) user_activity_log
users (1) ── (1) user_profiles
users (1) ── (1) notification_preferences

service_categories (1) ──< (many) services
services (1) ──< (many) bookings
services (1) ──< (many) packages
services (1) ──< (many) class_slots
services (many) ──< (many) service_trainers ──> (many) trainers

trainers (1) ──< (many) bookings

packages (1) ──< (many) package_purchases
package_purchases (1) ──< (many) bookings
package_purchases (1) ──< (many) preferred_times
package_purchases (1) ── (1) payments (optional, after payment)

payments (1) ──< (many) payment_items
payments (1) ── (1) package_purchases (one-to-one after payment)

class_slots (1) ──< (many) waitlist_entries
class_slots (1) ──< (many) bookings
```

---

## Indexes & Performance

### Critical Indexes

1. **User Lookups**:
   - `users.phone_number` (unique)
   - `users.email` (unique, partial where not null)

2. **Booking Queries**:
   - `bookings(user_id, status, scheduled_date)`
   - `bookings(scheduled_date, scheduled_time)`

3. **Package Queries**:
   - `package_purchases(user_id, status)`
   - `package_purchases(expires_at)` (for expiration checks)

4. **Notification Queries**:
   - `notifications(user_id, is_read, created_at)`

5. **Activity Queries**:
   - `user_activity_log(user_id, created_at DESC)`

### Performance Considerations

- Use **partial indexes** for active records (e.g., `WHERE is_active = true`)
- Consider **partitioning** for large tables:
  - `bookings` by `scheduled_date`
  - `notifications` by `created_at`
  - `user_activity_log` by `created_at`
- Use **materialized views** for dashboard aggregations:
  - User workout statistics
  - Popular services
  - Revenue metrics

---

## Business Rules

### Authentication
1. Phone numbers must be in E.164 format
2. OTP codes expire after 10 minutes
3. Maximum 3 OTP verification attempts
4. Rate limit: 1 OTP per phone per minute
5. Sessions expire after 30 days of inactivity

### Bookings
1. Bookings require available credits (for credit-based services)
2. Class bookings require available spots in `class_slots`
3. Cancellations must be made at least 24 hours in advance
4. Auto-assigned trainers are assigned based on availability and specialization
5. Booking status flow: `pending` → `confirmed` → `completed`/`cancelled`

### Packages
1. Personal Training packages include credits
2. Class packages have fixed schedules
3. Maximum 4 preferred times per Personal Training package
4. Packages expire based on `expires_at` date
5. Credits cannot be negative
6. `workouts_remaining` = `credits_remaining` (calculated field)
7. `plan_progress` = ((`credits_total` - `credits_remaining`) / `credits_total`) * 100 (calculated field)
8. `renewal_date` is set based on package duration from `starts_at` or `expires_at`

### Payments
1. Payment must be completed before package activation
2. Tax calculation: 10% of subtotal (configurable)
3. Refunds must be processed through payment gateway
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
5. Reminder notifications are sent 24 hours before scheduled bookings

### Data Integrity
1. Soft deletes for critical records (add `deleted_at` timestamp)
2. Audit trail for financial transactions
3. Referential integrity via foreign keys with appropriate CASCADE rules
4. Unique constraints on business-critical fields
5. `credits_remaining` must be >= 0 (check constraint)
6. `spots_available` must be >= 0 and <= `capacity` (check constraint)
7. `expires_at` must be > `starts_at` (check constraint)
8. `scheduled_date` must be >= CURRENT_DATE for new bookings (check constraint)

---

## Computed Fields & Views

### Dashboard Calculations

The following fields are computed/calculated for the dashboard:

1. **Workouts Remaining**: `credits_remaining` from active `package_purchases`
2. **Plan Progress**: `((credits_total - credits_remaining) / credits_total) * 100`
3. **Weeks to Finish**: Calculated based on average workouts per week and remaining credits
4. **Renewal Date**: `expires_at` or calculated from package duration

### Materialized Views (Recommended)

```sql
-- User package summary (for dashboard)
CREATE MATERIALIZED VIEW user_package_summary AS
SELECT 
  pp.user_id,
  pp.id as package_purchase_id,
  p.title as package_title,
  pp.credits_total,
  pp.credits_remaining,
  pp.workouts_completed,
  pp.starts_at,
  pp.expires_at,
  pp.renewal_date,
  pp.status,
  ROUND(((pp.credits_total - pp.credits_remaining)::decimal / pp.credits_total) * 100, 2) as plan_progress
FROM package_purchases pp
JOIN packages p ON pp.package_id = p.id
WHERE pp.status = 'active';

-- Refresh periodically or on package_purchases updates
CREATE INDEX ON user_package_summary(user_id);
```

---

## Sample Queries

### Get User Dashboard Data
```sql
-- User's active package with remaining credits
SELECT 
  pp.id,
  p.title,
  pp.credits_remaining,
  pp.expires_at
FROM package_purchases pp
JOIN packages p ON pp.package_id = p.id
WHERE pp.user_id = $1 
  AND pp.status = 'active'
ORDER BY pp.created_at DESC
LIMIT 1;

-- Upcoming bookings
SELECT 
  b.id,
  s.title as service_name,
  b.scheduled_date,
  b.scheduled_time,
  t.name as trainer_name,
  b.location
FROM bookings b
JOIN services s ON b.service_id = s.id
LEFT JOIN trainers t ON b.trainer_id = t.id
WHERE b.user_id = $1 
  AND b.status = 'confirmed'
  AND b.scheduled_date >= CURRENT_DATE
ORDER BY b.scheduled_date, b.scheduled_time
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
  cs.time,
  cs.spots_available,
  cs.is_full
FROM class_slots cs
WHERE cs.service_id = $1
  AND cs.date >= CURRENT_DATE
  AND cs.is_available = true
  AND cs.is_full = false
ORDER BY cs.date, cs.time;
```

### Get User Fitness Plan Progress
```sql
-- Get active package with progress calculations
SELECT 
  pp.id,
  p.title,
  pp.credits_total,
  pp.credits_remaining,
  pp.workouts_completed,
  pp.expires_at,
  pp.renewal_date,
  ROUND(((pp.credits_total - pp.credits_remaining)::decimal / pp.credits_total) * 100, 2) as plan_progress,
  -- Calculate weeks to finish (assuming 2 workouts per week average)
  CEIL(pp.credits_remaining::decimal / 2.0) as weeks_to_finish
FROM package_purchases pp
JOIN packages p ON pp.package_id = p.id
WHERE pp.user_id = $1 
  AND pp.status = 'active'
ORDER BY pp.created_at DESC
LIMIT 1;
```

### Join Waitlist
```sql
INSERT INTO waitlist_entries (user_id, class_slot_id, service_id, status)
VALUES ($1, $2, $3, 'pending')
ON CONFLICT DO NOTHING; -- Prevent duplicate entries
```

---

## Migration Strategy

1. **Phase 1**: Core tables (users, otp_verifications, sessions)
2. **Phase 2**: Service tables (service_categories, services, trainers, service_trainers)
3. **Phase 3**: Booking tables (bookings, class_slots, waitlist_entries)
4. **Phase 4**: Package tables (packages, package_purchases, preferred_times)
5. **Phase 5**: Payment tables (payments, payment_items)
6. **Phase 6**: Notification and preference tables (notifications, user_profiles, notification_preferences, user_activity_log)
7. **Phase 7**: Indexes and performance optimizations
8. **Phase 8**: Materialized views and computed fields

---

## Schema Summary

### Total Tables: 19

**Core (3 tables)**:
- `users` - User accounts
- `otp_verifications` - OTP management
- `sessions` - User sessions

**Services & Packages (6 tables)**:
- `service_categories` - Service categories
- `services` - Individual services
- `trainers` - Trainers/providers
- `service_trainers` - Service-trainer relationships
- `packages` - Package offerings
- `class_slots` - Class availability

**Bookings (3 tables)**:
- `bookings` - Individual bookings
- `class_slots` - Class time slots
- `waitlist_entries` - Waitlist for full classes

**Packages (2 tables)**:
- `package_purchases` - User package purchases
- `preferred_times` - Preferred scheduling times

**Payments (2 tables)**:
- `payments` - Payment transactions
- `payment_items` - Payment line items

**Notifications (1 table)**:
- `notifications` - User notifications

**User Preferences (3 tables)**:
- `user_profiles` - Extended profiles
- `notification_preferences` - Notification settings
- `user_activity_log` - Activity tracking

### Key Features Supported

✅ Phone-based OTP authentication  
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

## Notes

- All monetary values use `decimal(10,2)` for precision
- Timestamps use `timestamp with time zone` (recommended)
- UUIDs are used for all primary keys for security and scalability
- Soft deletes can be added by adding `deleted_at` timestamp columns
- Consider adding `version` columns for optimistic locking on critical tables
- Add `created_by` and `updated_by` columns for audit trails if needed
- **Payment-Package Relationship**: `package_purchases.payment_id` is NULL until payment is completed, then links to `payments.id`
- **Booking-Package Relationship**: `bookings.package_purchase_id` links bookings to the package used (for credit tracking)
- **Dashboard Calculations**: Use materialized views or computed columns for performance

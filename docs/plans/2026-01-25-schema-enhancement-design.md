# Schema Enhancement Design for Fitness SaaS Platform

**Date**: 2026-01-25
**Status**: Approved
**Purpose**: Add mobile app booking, customer management, class scheduling, and admin features

---

## Overview

This document outlines the schema changes required to support:
- Mobile app client booking (customers booking appointments directly)
- Enhanced service configuration and display
- Trainer/staff assignment to services
- Class slot management with waitlists
- Customer profiles, notifications, and activity tracking
- Admin features (announcements, expenses)
- Unified package instance model (assigned + purchased)

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Customer data location | Tenant DB + analytics in Control Panel | Clean tenant isolation; superadmin sees aggregated metrics |
| Trainer management | Use `members` + junction table | No separate trainers table; add `member_profiles` for extended info |
| Service category config | Separate `service_category_config` table | Keeps catalog data clean; config is optional per category |
| Notifications | Tenant DB only | Maintains tenant isolation |
| Package instances | Unified `package_instances` table | Single table for assigned + purchased packages |
| Class scheduling | `class_slots` + `waitlist_entries` | Essential for group fitness class management |
| Existing table changes | Hybrid approach | Add essential fields directly; use extension tables for complex config |

---

## Control Panel Database Changes

### New Table: `organization_analytics`

Stores aggregated metrics from tenant databases for superadmin dashboard.

```typescript
organizationAnalytics = pgTable("organization_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),

  // Customer metrics
  totalCustomers: integer("total_customers").default(0).notNull(),
  activeCustomers: integer("active_customers").default(0).notNull(),

  // Booking metrics
  totalBookings: integer("total_bookings").default(0).notNull(),
  completedBookings: integer("completed_bookings").default(0).notNull(),
  cancelledBookings: integer("cancelled_bookings").default(0).notNull(),

  // Revenue metrics (in cents)
  totalRevenue: integer("total_revenue").default(0).notNull(),
  monthlyRevenue: integer("monthly_revenue").default(0).notNull(),

  // Package metrics
  activePackageInstances: integer("active_package_instances").default(0).notNull(),

  // Timestamps
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

**Sync Strategy**: Nightly cron job or on-demand from superadmin dashboard.

---

## Tenant Database Changes

### New Tables

#### 1. `customer_profiles`

Extended customer data per organization.

```typescript
customerProfiles = pgTable("customer_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(), // References Control Panel user.id

  // Contact & personal info
  phone: text("phone"),
  dateOfBirth: timestamp("date_of_birth"),
  gender: text("gender"), // "male" | "female" | "other" | "prefer_not_to_say"
  address: text("address"),

  // Emergency contact
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),

  // Fitness-specific
  medicalNotes: text("medical_notes"),
  fitnessGoals: text("fitness_goals").array(),

  // Loyalty
  creditPoints: integer("credit_points").default(0).notNull(),

  // Staff notes
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### 2. `notification_preferences`

User notification settings per organization.

```typescript
notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),

  // Channel toggles
  emailEnabled: boolean("email_enabled").default(true).notNull(),
  smsEnabled: boolean("sms_enabled").default(false).notNull(),
  pushEnabled: boolean("push_enabled").default(true).notNull(),

  // Notification type toggles
  bookingReminders: boolean("booking_reminders").default(true).notNull(),
  bookingConfirmations: boolean("booking_confirmations").default(true).notNull(),
  promotionalEmails: boolean("promotional_emails").default(true).notNull(),
  packageExpiry: boolean("package_expiry").default(true).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### 3. `notifications`

User notifications.

```typescript
notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),

  type: text("type").notNull(), // "booking" | "reminder" | "payment" | "promotion" | "system"
  title: text("title").notNull(),
  message: text("message").notNull(),

  // Visual
  icon: text("icon"),
  color: text("color"),

  // Related entity
  relatedId: uuid("related_id"),
  relatedType: text("related_type"), // "appointment" | "payment" | "package"

  // Status
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### 4. `user_activity_log`

Activity tracking for customer dashboard.

```typescript
userActivityLog = pgTable("user_activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),

  activityType: text("activity_type").notNull(),
  // "booking_created" | "booking_completed" | "booking_cancelled" |
  // "package_purchased" | "credit_used" | "credit_added"

  title: text("title").notNull(),
  description: text("description"),

  relatedId: uuid("related_id"),
  relatedType: text("related_type"),

  creditsChange: integer("credits_change").default(0).notNull(),
  icon: text("icon"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### 5. `member_profiles`

Extended staff/trainer profiles.

```typescript
memberProfiles = pgTable("member_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .unique()
    .references(() => members.id, { onDelete: "cascade" }),

  displayName: text("display_name"),
  bio: text("bio"),
  specialization: text("specialization"),
  imageUrl: text("image_url"),
  phoneNumber: text("phone_number"),
  certifications: text("certifications").array(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### 6. `service_members`

Service to trainer/staff junction table.

```typescript
serviceMembers = pgTable("service_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),

  isPrimary: boolean("is_primary").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Unique constraint on (serviceId, memberId)
```

#### 7. `service_category_config`

Category-level commission and booking configuration.

```typescript
serviceCategoryConfig = pgTable("service_category_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .unique()
    .references(() => serviceCategories.id, { onDelete: "cascade" }),

  // Default values
  defaultDuration: integer("default_duration"),
  defaultMaxAttendees: integer("default_max_attendees"),

  // Commission config
  incentiveType: text("incentive_type"), // "fixed" | "variable"
  isConditional: boolean("is_conditional").default(false).notNull(),
  maxStaff: integer("max_staff").default(1).notNull(),
  staffPoolPercentage: integer("staff_pool_percentage").default(100).notNull(),
  staffWeightage: jsonb("staff_weightage"),
  paymentStructures: jsonb("payment_structures"),
  threshold: integer("threshold"),

  // Booking rules
  requireAdvanceBooking: boolean("require_advance_booking").default(false).notNull(),
  minAdvanceHours: integer("min_advance_hours"),

  // Cancellation rules
  enableCancellationWindow: boolean("enable_cancellation_window").default(false).notNull(),
  cancellationCutoffHours: integer("cancellation_cutoff_hours"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### 8. `class_slots`

Pre-defined class schedules with capacity tracking.

```typescript
classSlots = pgTable("class_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => hierarchyNodes.id, { onDelete: "restrict" }),

  // Schedule
  date: timestamp("date").notNull(),
  startTime: text("start_time").notNull(), // "09:00"
  endTime: text("end_time").notNull(),

  // Capacity
  capacity: integer("capacity").notNull(),
  spotsBooked: integer("spots_booked").default(0).notNull(),
  spotsAvailable: integer("spots_available").notNull(),

  // Status
  isFull: boolean("is_full").default(false).notNull(),
  isAvailable: boolean("is_available").default(true).notNull(),
  isCancelled: boolean("is_cancelled").default(false).notNull(),
  cancellationReason: text("cancellation_reason"),

  // Instructor override
  instructorId: uuid("instructor_id")
    .references(() => members.id, { onDelete: "set null" }),

  location: text("location"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### 9. `waitlist_entries`

Waitlist for full class slots.

```typescript
waitlistEntries = pgTable("waitlist_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  classSlotId: uuid("class_slot_id")
    .notNull()
    .references(() => classSlots.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),

  position: integer("position").notNull(),
  status: text("status").notNull(), // "waiting" | "notified" | "booked" | "expired" | "cancelled"

  notifiedAt: timestamp("notified_at"),
  expiresAt: timestamp("expires_at"),
  bookedAt: timestamp("booked_at"),

  appointmentId: uuid("appointment_id")
    .references(() => appointments.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Unique constraint on (classSlotId, userId)
```

#### 10. `package_instances`

Unified package tracking (replaces `package_assignments`).

```typescript
packageInstances = pgTable("package_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  packageId: uuid("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "restrict" }),
  clientId: text("client_id").notNull(),

  // Source tracking
  source: text("source").notNull(), // "assigned" | "purchased"
  assignedBy: text("assigned_by"),

  // Purchase details
  purchaseNumber: text("purchase_number").unique(),
  paymentId: uuid("payment_id")
    .references(() => payments.id, { onDelete: "set null" }),

  // Pricing
  totalPrice: integer("total_price"),
  taxAmount: integer("tax_amount").default(0),

  // Payment tracking
  paymentStatus: text("payment_status").notNull(), // "pending" | "paid" | "failed" | "refunded"
  paymentMethod: text("payment_method"),

  // Agreement
  eSignature: text("e_signature"),
  termsAgreedAt: timestamp("terms_agreed_at"),

  // Session tracking
  creditsTotal: integer("credits_total").notNull(),
  creditsRemaining: integer("credits_remaining").notNull(),
  creditsUsed: integer("credits_used").default(0).notNull(),

  // Validity
  startsAt: timestamp("starts_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),

  // Status
  status: text("status").notNull(), // "active" | "expired" | "exhausted" | "cancelled"

  remark: text("remark"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### 11. `preferred_times`

Scheduling preferences for packages.

```typescript
preferredTimes = pgTable("preferred_times", {
  id: uuid("id").primaryKey().defaultRandom(),
  packageInstanceId: uuid("package_instance_id")
    .notNull()
    .references(() => packageInstances.id, { onDelete: "cascade" }),

  dayOfWeek: text("day_of_week").notNull(), // "monday" - "sunday"
  time: text("time").notNull(), // "09:00"
  priority: integer("priority").notNull(), // 1-4

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Unique constraint on (packageInstanceId, priority)
```

#### 12. `recurrence_rules`

Complex recurrence configuration (1:1 with recurring appointments).

```typescript
recurrenceRules = pgTable("recurrence_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id")
    .notNull()
    .unique()
    .references(() => appointments.id, { onDelete: "cascade" }),

  frequencyValue: integer("frequency_value").notNull().default(1),
  timeUnit: text("time_unit").notNull(), // "day" | "week" | "month"

  // Weekly
  repeatOn: jsonb("repeat_on"), // [1,3,5] for Mon,Wed,Fri

  // Monthly
  monthlyType: text("monthly_type"), // "day_of_month" | "day_of_week"
  monthlyDayOfWeek: integer("monthly_day_of_week"),
  monthlyWeekOfMonth: integer("monthly_week_of_month"),

  // End conditions
  endsType: text("ends_type").notNull(), // "never" | "on_date" | "after_occurrences"
  endsAfterOccurrences: integer("ends_after_occurrences"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### 13. `announcements`

System announcements for dashboard.

```typescript
announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),

  branchId: uuid("branch_id")
    .references(() => hierarchyNodes.id, { onDelete: "cascade" }),

  title: text("title").notNull(),
  message: text("message").notNull(),

  priority: text("priority").default("normal").notNull(), // "low" | "normal" | "high" | "urgent"
  targetAudience: text("target_audience").default("all").notNull(), // "all" | "staff" | "clients"

  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),

  isActive: boolean("is_active").default(true).notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),

  createdBy: text("created_by").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### 14. `expenses`

Expense/claim tracking.

```typescript
expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),

  branchId: uuid("branch_id")
    .references(() => hierarchyNodes.id, { onDelete: "restrict" }),

  submittedBy: text("submitted_by").notNull(),

  amount: integer("amount").notNull(),
  currency: text("currency").default("usd").notNull(),

  category: text("category").notNull(), // "travel" | "equipment" | "supplies" | "training" | "other"
  description: text("description").notNull(),
  receiptUrl: text("receipt_url"),

  expenseDate: timestamp("expense_date").notNull(),

  status: text("status").default("pending").notNull(), // "pending" | "approved" | "rejected" | "paid"

  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),

  paidAt: timestamp("paid_at"),
  paidBy: text("paid_by"),
  paymentReference: text("payment_reference"),

  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### 15. `payment_items`

Payment line items.

```typescript
paymentItems = pgTable("payment_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id, { onDelete: "cascade" }),

  itemType: text("item_type").notNull(), // "package" | "booking" | "tax" | "fee" | "discount"
  itemId: uuid("item_id"),

  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: integer("unit_price").notNull(),
  totalPrice: integer("total_price").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

---

### Modified Tables

#### `services` - Add 12 fields

```typescript
// NEW FIELDS
title: text("title"),
description: text("description"),
imageUrl: text("image_url"),
type: text("type").default("private").notNull(), // "private" | "semi_private"
price: integer("price"),
priceUnit: text("price_unit").default("session"),
taxable: boolean("taxable").default(false).notNull(),
taxPercentage: integer("tax_percentage").default(0).notNull(),
isRecommended: boolean("is_recommended").default(false).notNull(),
location: text("location"),
features: text("features").array(),
schedulingType: text("scheduling_type").default("appointment").notNull(), // "appointment" | "class_slot"
```

#### `service_categories` - Add 1 field

```typescript
description: text("description"),
```

#### `appointments` - Add 10 fields

```typescript
bookingNumber: text("booking_number").unique(),
userId: text("user_id"), // Client who booked
trainerId: uuid("trainer_id").references(() => members.id),
packageInstanceId: uuid("package_instance_id").references(() => packageInstances.id),
creditsUsed: integer("credits_used").default(1),
location: text("location"),
cancelledAt: timestamp("cancelled_at"),
cancellationReason: text("cancellation_reason"),
classSlotId: uuid("class_slot_id").references(() => classSlots.id),
description: text("description"),
imageUrl: text("image_url"),
```

#### `payments` - Add 6 fields

```typescript
userId: text("user_id"),
paymentNumber: text("payment_number").unique(),
paymentMethod: text("payment_method"),
refundedAt: timestamp("refunded_at"),
refundAmount: integer("refund_amount"),
failureReason: text("failure_reason"),
```

#### `appointment_clients` - Update FK

```typescript
// Change from:
packageAssignmentId: uuid("package_assignment_id").references(() => packageAssignments.id)

// To:
packageInstanceId: uuid("package_instance_id").references(() => packageInstances.id)
```

---

## Migration Phases

### Phase 1: Foundation (No breaking changes)
1. Add `organization_analytics` to Control Panel
2. Add `service_categories.description`
3. Add new fields to `services` (all nullable)
4. Add new fields to `payments` (all nullable)
5. Create `member_profiles`, `service_members`, `service_category_config`

### Phase 2: Customer Experience
1. Create `customer_profiles`, `notification_preferences`, `notifications`, `user_activity_log`

### Phase 3: Package Refactor
1. Create `package_instances` table
2. Migrate data from `package_assignments`
3. Create `preferred_times`
4. Update `appointment_clients` FK
5. Add `packageInstanceId` to `appointments`
6. Deprecate `package_assignments` (keep for rollback)

### Phase 4: Class Scheduling
1. Create `class_slots`, `waitlist_entries`
2. Add `classSlotId` to `appointments`
3. Add remaining appointment fields

### Phase 5: Admin Features
1. Create `announcements`, `expenses`, `payment_items`
2. Create `recurrence_rules`

### Phase 6: Cleanup
1. Drop `package_assignments` after validation
2. Run analytics sync job

---

## Relationships Diagram

```
Control Panel DB                    Tenant DB
================                    =========

user ─────────────────────────────> customer_profiles (1:1 per org)
  │                                 notification_preferences (1:1 per org)
  │                                 notifications (1:many)
  │                                 user_activity_log (1:many)
  │                                 appointments.userId (1:many)
  │                                 package_instances.clientId (1:many)
  │                                 payments.userId (1:many)
  │
organizations ───────────────────> organization_analytics (1:1)


Tenant DB Internal
==================

members ──────> member_profiles (1:1)
    │
    └─────────> service_members ←──────── services
                                              │
service_categories ──> service_category_config (1:1)
    │
    └──────────────────> services
                            │
                            ├──> class_slots ──> waitlist_entries
                            │
                            └──> appointments ──> recurrence_rules (1:1)
                                     │
                                     ├──> appointment_clients
                                     ├──> appointment_staff
                                     └──> commission_splits

packages ──────> package_instances ──> preferred_times
                        │
                        └──────────────> appointments

payments ──────> payment_items
```

---

## Next Steps

1. Review and approve this design document
2. Create implementation plan with detailed tasks
3. Set up git worktree for isolated development
4. Implement in phases with testing at each stage

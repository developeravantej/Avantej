# Schema Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 15 new tenant tables, 1 control panel table, and modify 5 existing tables to support mobile app booking, customer management, class scheduling, and admin features.

**Architecture:** Multi-tenant SaaS with Control Panel DB (shared) and Tenant DBs (per-organization). New tables follow existing patterns using Drizzle ORM. Migrations are applied via `bun db:generate` and `bun db:migrate`.

**Tech Stack:** Drizzle ORM, PostgreSQL (Neon), TypeScript, Bun

**Design Document:** `docs/plans/2026-01-25-schema-enhancement-design.md`

---

## Phase 1: Foundation (No Breaking Changes)

### Task 1: Add `organization_analytics` to Control Panel

**Files:**
- Create: `packages/db/src/schema/control-panel/organization-analytics.ts`
- Modify: `packages/db/src/schema/control-panel/index.ts`
- Modify: `packages/db/src/schema/control-panel-schema.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/control-panel/organization-analytics.ts

/**
 * Control Panel Organization Analytics Schema
 *
 * Stores aggregated metrics from tenant databases for superadmin dashboard.
 * Synced periodically via cron job or on-demand.
 */

import { pgTable, uuid, integer, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const organizationAnalytics = pgTable("organization_analytics", {
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
}, (table) => ({
	organizationIdIdx: index("org_analytics_org_idx").on(table.organizationId),
}));
```

**Step 2: Export from control-panel index**

Add to `packages/db/src/schema/control-panel/index.ts`:

```typescript
export * from "./organization-analytics";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/control-panel/organization-analytics.ts
git add packages/db/src/schema/control-panel/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add organization_analytics table to control panel"
```

---

### Task 2: Add `description` field to `service_categories`

**Files:**
- Modify: `packages/db/src/schema/tenant/service-categories.ts`

**Step 1: Add the field**

In `packages/db/src/schema/tenant/service-categories.ts`, add after `name`:

```typescript
description: text("description"),
```

**Step 2: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 3: Commit**

```bash
git add packages/db/src/schema/tenant/service-categories.ts
git add packages/db/drizzle/
git commit -m "feat(db): add description field to service_categories"
```

---

### Task 3: Add new fields to `services` table

**Files:**
- Modify: `packages/db/src/schema/tenant/services.ts`

**Step 1: Add the 12 new fields**

In `packages/db/src/schema/tenant/services.ts`, add after `updatedAt`:

```typescript
// ========== NEW FIELDS ==========

// Display info
title: text("title"),
description: text("description"),
imageUrl: text("image_url"),

// Service type
type: text("type").default("private").notNull(), // "private" | "semi_private"

// Pricing display (for mobile app catalog)
price: integer("price"), // Display price in cents
priceUnit: text("price_unit").default("session"), // "session" | "class" | "package"

// Tax configuration
taxable: boolean("taxable").default(false).notNull(),
taxPercentage: integer("tax_percentage").default(0).notNull(), // 0-100

// Discovery
isRecommended: boolean("is_recommended").default(false).notNull(),
location: text("location"),
features: text("features").array(),

// Scheduling
schedulingType: text("scheduling_type").default("appointment").notNull(),
// "appointment" (flexible booking) | "class_slot" (pre-defined slots)
```

**Step 2: Add new indexes**

In the table's index function, add:

```typescript
typeIdx: index("services_type_idx").on(table.type),
recommendedIdx: index("services_recommended_idx").on(table.isRecommended),
schedulingTypeIdx: index("services_scheduling_type_idx").on(table.schedulingType),
```

**Step 3: Add boolean import**

Update the import at top of file:

```typescript
import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
```

**Step 4: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 5: Commit**

```bash
git add packages/db/src/schema/tenant/services.ts
git add packages/db/drizzle/
git commit -m "feat(db): add mobile app fields to services table"
```

---

### Task 4: Add new fields to `payments` table

**Files:**
- Modify: `packages/db/src/schema/tenant/payments.ts`

**Step 1: Add the 6 new fields**

In `packages/db/src/schema/tenant/payments.ts`, add after `metadata`:

```typescript
// ========== NEW FIELDS ==========

// Client reference (for mobile app payments)
userId: text("user_id"), // References Control Panel user.id

// Payment identifier
paymentNumber: text("payment_number").unique(),

// Payment method details
paymentMethod: text("payment_method"), // "card" | "apple_pay" | "google_pay" | "cash"

// Refund tracking
refundedAt: timestamp("refunded_at"),
refundAmount: integer("refund_amount"),
failureReason: text("failure_reason"),
```

**Step 2: Add new indexes**

In the table's index function, add:

```typescript
userIdIdx: index("payments_user_idx").on(table.userId),
paymentNumberIdx: index("payments_payment_number_idx").on(table.paymentNumber),
paymentMethodIdx: index("payments_payment_method_idx").on(table.paymentMethod),
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/payments.ts
git add packages/db/drizzle/
git commit -m "feat(db): add client payment fields to payments table"
```

---

### Task 5: Create `member_profiles` table

**Files:**
- Create: `packages/db/src/schema/tenant/member-profiles.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/member-profiles.ts

/**
 * Tenant Member Profiles Schema
 *
 * Extended profile information for staff/trainers.
 * 1:1 relationship with members table.
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { members } from "./members";

export const memberProfiles = pgTable("member_profiles", {
	id: uuid("id").primaryKey().defaultRandom(),
	memberId: uuid("member_id")
		.notNull()
		.unique()
		.references(() => members.id, { onDelete: "cascade" }),

	// Display info
	displayName: text("display_name"),
	bio: text("bio"),
	specialization: text("specialization"),

	// Media
	imageUrl: text("image_url"),

	// Contact override
	phoneNumber: text("phone_number"),

	// Certifications
	certifications: text("certifications").array(),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	memberIdIdx: index("member_profiles_member_idx").on(table.memberId),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./member-profiles";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/member-profiles.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add member_profiles table for trainer info"
```

---

### Task 6: Create `service_members` junction table

**Files:**
- Create: `packages/db/src/schema/tenant/service-members.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/service-members.ts

/**
 * Tenant Service Members Schema
 *
 * Junction table linking services to trainers/staff who can perform them.
 */

import { pgTable, uuid, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { services } from "./services";
import { members } from "./members";

export const serviceMembers = pgTable("service_members", {
	id: uuid("id").primaryKey().defaultRandom(),
	serviceId: uuid("service_id")
		.notNull()
		.references(() => services.id, { onDelete: "cascade" }),
	memberId: uuid("member_id")
		.notNull()
		.references(() => members.id, { onDelete: "cascade" }),

	isPrimary: boolean("is_primary").default(false).notNull(),

	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	serviceMemberUniqueIdx: uniqueIndex("service_members_unique_idx")
		.on(table.serviceId, table.memberId),
	serviceIdIdx: index("service_members_service_idx").on(table.serviceId),
	memberIdIdx: index("service_members_member_idx").on(table.memberId),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./service-members";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/service-members.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add service_members junction table"
```

---

### Task 7: Create `service_category_config` table

**Files:**
- Create: `packages/db/src/schema/tenant/service-category-config.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/service-category-config.ts

/**
 * Tenant Service Category Config Schema
 *
 * Commission, incentive, and booking rule configuration per category.
 * 1:1 relationship with service_categories.
 */

import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { serviceCategories } from "./service-categories";

export const serviceCategoryConfig = pgTable("service_category_config", {
	id: uuid("id").primaryKey().defaultRandom(),
	categoryId: uuid("category_id")
		.notNull()
		.unique()
		.references(() => serviceCategories.id, { onDelete: "cascade" }),

	// Default values for services in this category
	defaultDuration: integer("default_duration"),
	defaultMaxAttendees: integer("default_max_attendees"),

	// Commission/incentive config
	incentiveType: text("incentive_type"), // "fixed" | "variable"
	isConditional: boolean("is_conditional").default(false).notNull(),
	maxStaff: integer("max_staff").default(1).notNull(),
	staffPoolPercentage: integer("staff_pool_percentage").default(100).notNull(),
	staffWeightage: jsonb("staff_weightage").$type<Array<{ position: number; percentage: number; title?: string }> | null>(),
	paymentStructures: jsonb("payment_structures").$type<Record<string, unknown> | null>(),
	threshold: integer("threshold"),

	// Booking rules
	requireAdvanceBooking: boolean("require_advance_booking").default(false).notNull(),
	minAdvanceHours: integer("min_advance_hours"),

	// Cancellation rules
	enableCancellationWindow: boolean("enable_cancellation_window").default(false).notNull(),
	cancellationCutoffHours: integer("cancellation_cutoff_hours"),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	categoryIdIdx: index("service_category_config_category_idx").on(table.categoryId),
	incentiveTypeIdx: index("service_category_config_incentive_idx").on(table.incentiveType),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./service-category-config";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/service-category-config.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add service_category_config table"
```

---

## Phase 2: Customer Experience Tables

### Task 8: Create `customer_profiles` table

**Files:**
- Create: `packages/db/src/schema/tenant/customer-profiles.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/customer-profiles.ts

/**
 * Tenant Customer Profiles Schema
 *
 * Extended customer data per organization.
 * userId references Control Panel user.id (no FK due to cross-database).
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const customerProfiles = pgTable("customer_profiles", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: text("user_id").notNull().unique(),

	// Contact & personal info
	phone: text("phone"),
	dateOfBirth: timestamp("date_of_birth"),
	gender: text("gender"),
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
}, (table) => ({
	userIdIdx: index("customer_profiles_user_idx").on(table.userId),
	creditPointsIdx: index("customer_profiles_credits_idx").on(table.creditPoints),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./customer-profiles";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/customer-profiles.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add customer_profiles table"
```

---

### Task 9: Create `notification_preferences` table

**Files:**
- Create: `packages/db/src/schema/tenant/notification-preferences.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/notification-preferences.ts

/**
 * Tenant Notification Preferences Schema
 *
 * User notification settings per organization.
 */

import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const notificationPreferences = pgTable("notification_preferences", {
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
}, (table) => ({
	userIdIdx: index("notification_preferences_user_idx").on(table.userId),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./notification-preferences";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/notification-preferences.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add notification_preferences table"
```

---

### Task 10: Create `notifications` table

**Files:**
- Create: `packages/db/src/schema/tenant/notifications.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/notifications.ts

/**
 * Tenant Notifications Schema
 *
 * User notifications for bookings, payments, promotions, etc.
 */

import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const notifications = pgTable("notifications", {
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
	relatedType: text("related_type"),

	// Status
	isRead: boolean("is_read").default(false).notNull(),
	readAt: timestamp("read_at"),

	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	userIdIdx: index("notifications_user_idx").on(table.userId),
	isReadIdx: index("notifications_read_idx").on(table.isRead),
	typeIdx: index("notifications_type_idx").on(table.type),
	userReadCreatedIdx: index("notifications_user_read_created_idx")
		.on(table.userId, table.isRead, table.createdAt),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./notifications";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/notifications.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add notifications table"
```

---

### Task 11: Create `user_activity_log` table

**Files:**
- Create: `packages/db/src/schema/tenant/user-activity-log.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/user-activity-log.ts

/**
 * Tenant User Activity Log Schema
 *
 * Tracks customer activity for "Recent Activity" dashboard widget.
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const userActivityLog = pgTable("user_activity_log", {
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
}, (table) => ({
	userIdIdx: index("user_activity_log_user_idx").on(table.userId),
	activityTypeIdx: index("user_activity_log_type_idx").on(table.activityType),
	userCreatedIdx: index("user_activity_log_user_created_idx")
		.on(table.userId, table.createdAt),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./user-activity-log";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/user-activity-log.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add user_activity_log table"
```

---

## Phase 3: Package Refactor

### Task 12: Create `package_instances` table

**Files:**
- Create: `packages/db/src/schema/tenant/package-instances.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/package-instances.ts

/**
 * Tenant Package Instances Schema
 *
 * Unified tracking for both staff-assigned and client-purchased packages.
 * Replaces the previous package_assignments table with enhanced functionality.
 */

import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { packages } from "./packages";
import { payments } from "./payments";

export const packageInstances = pgTable("package_instances", {
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
}, (table) => ({
	packageIdIdx: index("package_instances_package_idx").on(table.packageId),
	clientIdIdx: index("package_instances_client_idx").on(table.clientId),
	sourceIdx: index("package_instances_source_idx").on(table.source),
	statusIdx: index("package_instances_status_idx").on(table.status),
	paymentStatusIdx: index("package_instances_payment_status_idx").on(table.paymentStatus),
	expiresAtIdx: index("package_instances_expires_idx").on(table.expiresAt),
	clientStatusIdx: index("package_instances_client_status_idx")
		.on(table.clientId, table.status),
	purchaseNumberIdx: index("package_instances_purchase_number_idx").on(table.purchaseNumber),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./package-instances";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/package-instances.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add package_instances table (unified package tracking)"
```

---

### Task 13: Create `preferred_times` table

**Files:**
- Create: `packages/db/src/schema/tenant/preferred-times.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/preferred-times.ts

/**
 * Tenant Preferred Times Schema
 *
 * Scheduling preferences for package instances.
 */

import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { packageInstances } from "./package-instances";

export const preferredTimes = pgTable("preferred_times", {
	id: uuid("id").primaryKey().defaultRandom(),
	packageInstanceId: uuid("package_instance_id")
		.notNull()
		.references(() => packageInstances.id, { onDelete: "cascade" }),

	dayOfWeek: text("day_of_week").notNull(), // "monday" - "sunday"
	time: text("time").notNull(), // "09:00"
	priority: integer("priority").notNull(), // 1-4

	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	packageInstanceIdIdx: index("preferred_times_package_instance_idx")
		.on(table.packageInstanceId),
	packagePriorityUniqueIdx: uniqueIndex("preferred_times_package_priority_idx")
		.on(table.packageInstanceId, table.priority),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./preferred-times";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/preferred-times.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add preferred_times table"
```

---

## Phase 4: Class Scheduling

### Task 14: Create `class_slots` table

**Files:**
- Create: `packages/db/src/schema/tenant/class-slots.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/class-slots.ts

/**
 * Tenant Class Slots Schema
 *
 * Pre-defined class schedules with capacity tracking.
 */

import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { services } from "./services";
import { hierarchyNodes } from "./hierarchy";
import { members } from "./members";

export const classSlots = pgTable("class_slots", {
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
}, (table) => ({
	serviceIdIdx: index("class_slots_service_idx").on(table.serviceId),
	branchIdIdx: index("class_slots_branch_idx").on(table.branchId),
	dateIdx: index("class_slots_date_idx").on(table.date),
	serviceDateTimeIdx: index("class_slots_service_date_time_idx")
		.on(table.serviceId, table.date, table.startTime),
	availableIdx: index("class_slots_available_idx")
		.on(table.isAvailable, table.isFull, table.date),
	instructorIdx: index("class_slots_instructor_idx").on(table.instructorId),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./class-slots";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/class-slots.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add class_slots table for group classes"
```

---

### Task 15: Create `waitlist_entries` table

**Files:**
- Create: `packages/db/src/schema/tenant/waitlist-entries.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/waitlist-entries.ts

/**
 * Tenant Waitlist Entries Schema
 *
 * Waitlist for full class slots.
 */

import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { classSlots } from "./class-slots";
import { appointments } from "./appointments";

export const waitlistEntries = pgTable("waitlist_entries", {
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
}, (table) => ({
	classSlotUserUniqueIdx: uniqueIndex("waitlist_entries_slot_user_idx")
		.on(table.classSlotId, table.userId),
	classSlotIdx: index("waitlist_entries_slot_idx").on(table.classSlotId),
	userIdIdx: index("waitlist_entries_user_idx").on(table.userId),
	statusIdx: index("waitlist_entries_status_idx").on(table.status),
	slotStatusPositionIdx: index("waitlist_entries_slot_status_position_idx")
		.on(table.classSlotId, table.status, table.position),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./waitlist-entries";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/waitlist-entries.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add waitlist_entries table"
```

---

### Task 16: Add new fields to `appointments` table

**Files:**
- Modify: `packages/db/src/schema/tenant/appointments.ts`

**Step 1: Add imports for new references**

Update imports at top of `packages/db/src/schema/tenant/appointments.ts`:

```typescript
import { pgTable, uuid, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { services } from "./services";
import { members } from "./members";
import { packageInstances } from "./package-instances";
import { classSlots } from "./class-slots";
```

**Step 2: Add the 10 new fields**

Add after `updatedAt`:

```typescript
// ========== NEW FIELDS ==========

// Booking identifier
bookingNumber: text("booking_number").unique(),

// Client booking (for mobile app - direct client bookings)
userId: text("user_id"),

// Trainer assignment
trainerId: uuid("trainer_id")
	.references(() => members.id, { onDelete: "set null" }),

// Package usage
packageInstanceId: uuid("package_instance_id")
	.references(() => packageInstances.id, { onDelete: "set null" }),
creditsUsed: integer("credits_used").default(1),

// Location
location: text("location"),

// Cancellation tracking
cancelledAt: timestamp("cancelled_at"),
cancellationReason: text("cancellation_reason"),

// Class slot reference
classSlotId: uuid("class_slot_id")
	.references(() => classSlots.id, { onDelete: "set null" }),

// Description/image
description: text("description"),
imageUrl: text("image_url"),
```

**Step 3: Add new indexes**

In the table's index function, add:

```typescript
bookingNumberIdx: index("appointments_booking_number_idx").on(table.bookingNumber),
userIdIdx: index("appointments_user_idx").on(table.userId),
trainerIdIdx: index("appointments_trainer_idx").on(table.trainerId),
packageInstanceIdIdx: index("appointments_package_instance_idx").on(table.packageInstanceId),
classSlotIdIdx: index("appointments_class_slot_idx").on(table.classSlotId),
userStatusIdx: index("appointments_user_status_idx").on(table.userId, table.status),
```

**Step 4: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 5: Commit**

```bash
git add packages/db/src/schema/tenant/appointments.ts
git add packages/db/drizzle/
git commit -m "feat(db): add mobile booking fields to appointments table"
```

---

### Task 17: Create `recurrence_rules` table

**Files:**
- Create: `packages/db/src/schema/tenant/recurrence-rules.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/recurrence-rules.ts

/**
 * Tenant Recurrence Rules Schema
 *
 * Complex recurrence configuration for recurring appointments.
 * 1:1 relationship with appointments (only for recurring parents).
 */

import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { appointments } from "./appointments";

export const recurrenceRules = pgTable("recurrence_rules", {
	id: uuid("id").primaryKey().defaultRandom(),
	appointmentId: uuid("appointment_id")
		.notNull()
		.unique()
		.references(() => appointments.id, { onDelete: "cascade" }),

	frequencyValue: integer("frequency_value").notNull().default(1),
	timeUnit: text("time_unit").notNull(), // "day" | "week" | "month"

	// Weekly
	repeatOn: jsonb("repeat_on").$type<number[] | null>(), // [1,3,5] for Mon,Wed,Fri

	// Monthly
	monthlyType: text("monthly_type"), // "day_of_month" | "day_of_week"
	monthlyDayOfWeek: integer("monthly_day_of_week"),
	monthlyWeekOfMonth: integer("monthly_week_of_month"),

	// End conditions
	endsType: text("ends_type").notNull(), // "never" | "on_date" | "after_occurrences"
	endsAfterOccurrences: integer("ends_after_occurrences"),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	appointmentIdIdx: index("recurrence_rules_appointment_idx").on(table.appointmentId),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./recurrence-rules";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/recurrence-rules.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add recurrence_rules table"
```

---

## Phase 5: Admin Features

### Task 18: Create `announcements` table

**Files:**
- Create: `packages/db/src/schema/tenant/announcements.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/announcements.ts

/**
 * Tenant Announcements Schema
 *
 * System announcements for dashboard widget.
 */

import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const announcements = pgTable("announcements", {
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
}, (table) => ({
	branchIdIdx: index("announcements_branch_idx").on(table.branchId),
	isActiveIdx: index("announcements_active_idx").on(table.isActive),
	priorityIdx: index("announcements_priority_idx").on(table.priority),
	targetAudienceIdx: index("announcements_target_idx").on(table.targetAudience),
	dateRangeIdx: index("announcements_date_range_idx")
		.on(table.startDate, table.endDate),
	activeVisibleIdx: index("announcements_active_visible_idx")
		.on(table.isActive, table.startDate, table.endDate),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./announcements";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/announcements.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add announcements table"
```

---

### Task 19: Create `expenses` table

**Files:**
- Create: `packages/db/src/schema/tenant/expenses.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/expenses.ts

/**
 * Tenant Expenses Schema
 *
 * Expense/claim tracking for staff reimbursements.
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const expenses = pgTable("expenses", {
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
}, (table) => ({
	branchIdIdx: index("expenses_branch_idx").on(table.branchId),
	submittedByIdx: index("expenses_submitted_by_idx").on(table.submittedBy),
	statusIdx: index("expenses_status_idx").on(table.status),
	categoryIdx: index("expenses_category_idx").on(table.category),
	expenseDateIdx: index("expenses_date_idx").on(table.expenseDate),
	submitterStatusIdx: index("expenses_submitter_status_idx")
		.on(table.submittedBy, table.status),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./expenses";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/expenses.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add expenses table"
```

---

### Task 20: Create `payment_items` table

**Files:**
- Create: `packages/db/src/schema/tenant/payment-items.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`

**Step 1: Create the schema file**

```typescript
// packages/db/src/schema/tenant/payment-items.ts

/**
 * Tenant Payment Items Schema
 *
 * Line items for payments (order breakdown).
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { payments } from "./payments";

export const paymentItems = pgTable("payment_items", {
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
}, (table) => ({
	paymentIdIdx: index("payment_items_payment_idx").on(table.paymentId),
	itemTypeIdx: index("payment_items_type_idx").on(table.itemType),
	itemIdIdx: index("payment_items_item_idx").on(table.itemId),
}));
```

**Step 2: Export from tenant index**

Add to `packages/db/src/schema/tenant/index.ts`:

```typescript
export * from "./payment-items";
```

**Step 3: Generate migration**

Run: `cd packages/db && bun db:generate`

**Step 4: Commit**

```bash
git add packages/db/src/schema/tenant/payment-items.ts
git add packages/db/src/schema/tenant/index.ts
git add packages/db/drizzle/
git commit -m "feat(db): add payment_items table"
```

---

## Phase 6: Update Tenant Schema Exports and Migration

### Task 21: Update tenant-schema.ts

**Files:**
- Modify: `packages/db/src/schema/tenant-schema.ts`

**Step 1: Verify all new exports are included**

The `tenant-schema.ts` re-exports from `./tenant/index.ts`, so if all new tables are exported from the tenant index, no changes are needed. Verify this by checking the file.

**Step 2: Run type check**

Run: `bun check-types`

**Step 3: Commit if changes needed**

```bash
git add packages/db/src/schema/tenant-schema.ts
git commit -m "chore(db): update tenant schema exports"
```

---

### Task 22: Update migrate-tenant.ts for new tables

**Files:**
- Modify: `packages/db/src/migrate-tenant.ts`

**Step 1: Review migrate-tenant.ts**

Check if `migrate-tenant.ts` needs updates for the new tables. It should automatically pick up new tables from the schema exports.

**Step 2: Run migration test**

This will be tested when running actual migrations.

---

### Task 23: Final verification

**Step 1: Generate all migrations**

Run: `cd packages/db && bun db:generate`

**Step 2: Run type check**

Run: `bun check-types`

**Step 3: Create final commit**

```bash
git add -A
git commit -m "feat(db): complete schema enhancement - all tables added"
```

**Step 4: Push branch**

```bash
git push -u origin feature/schema-enhancement
```

---

## Summary

### Tables Created (16 total)

**Control Panel (1):**
1. `organization_analytics`

**Tenant (15):**
1. `member_profiles`
2. `service_members`
3. `service_category_config`
4. `customer_profiles`
5. `notification_preferences`
6. `notifications`
7. `user_activity_log`
8. `package_instances`
9. `preferred_times`
10. `class_slots`
11. `waitlist_entries`
12. `recurrence_rules`
13. `announcements`
14. `expenses`
15. `payment_items`

### Tables Modified (5)

1. `service_categories` (+1 field)
2. `services` (+12 fields)
3. `payments` (+6 fields)
4. `appointments` (+10 fields)

### Next Steps After Implementation

1. Create data migration script for `package_assignments` → `package_instances`
2. Update `appointment_clients` FK from `package_assignments` to `package_instances`
3. Add oRPC procedures for new tables
4. Update frontend to use new fields

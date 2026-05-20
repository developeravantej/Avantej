/**
 * Tenant Services Schema
 * 
 * Represents services offered by the tenant organization (e.g., Personal Training, Group Classes).
 * Services are synced with Stripe Products/Prices for payment processing.
 * 
 * Business Rules:
 * - Service names must be unique within a branch (enforced in app layer)
 * - Duration is stored in seconds for flexibility
 * - Stripe sync status tracks whether service is synced with Stripe Connect
 * - Services can be archived instead of deleted to preserve historical data
 * - Attendance threshold allows services to require minimum attendees
 */

import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { serviceCategories } from "./service-categories";

export const services = pgTable("services", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "restrict" }),
	
	// Duration configuration (flexible time units)
	duration: integer("duration").notNull(), // Duration in seconds
	durationUnitType: text("duration_unit_type").notNull().default("minutes"), // "seconds" | "minutes" | "hours"
	
	// Capacity configuration
	maxAttendees: integer("max_attendees").notNull(),
	attendanceThreshold: integer("attendance_threshold"), // Minimum attendees required (null = no threshold)
	
	// Stripe integration
	stripeProductId: text("stripe_product_id"), // Stripe Product ID (prod_xxx) - nullable if not synced yet
	stripePriceId: text("stripe_price_id"), // Stripe Price ID (price_xxx) - can have multiple prices per product
	stripeSyncStatus: text("stripe_sync_status").default("pending").notNull(), // "pending" | "synced" | "failed"
	stripeLastSyncedAt: timestamp("stripe_last_synced_at"),
	
	// Branch scope
	branchId: uuid("branch_id").references(() => hierarchyNodes.id, { onDelete: "restrict" }),
	
	isActive: boolean("is_active").default(true).notNull(),
	
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),

	// Audit
	createdBy: text("created_by"),
	updatedBy: text("updated_by"),

	// ========== NEW FIELDS ==========

	// Display info
	title: text("title"),
	description: text("description"),
	imageUrl: text("image_url"),

	// Service type
	type: text("type").default("private").notNull(), // "private" | "semi_private" | "both"

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

	// Package-equivalent fields (absorbing packages table)
	sessionCount: integer("session_count"),
	expirable: boolean("expirable").default(false).notNull(),
	expiryDays: integer("expiry_days"),
	expiryDate: timestamp("expiry_date"),

	// Installment configuration
	availablePaymentPlans: text("available_payment_plans").array().default([]),
	installmentIntervalDays: integer("installment_interval_days").default(30),
	gracePeriodDays: integer("grace_period_days"),

	// Commission rate for this service in basis points (e.g. 1000 = 10.00%).
	// Defaults to 0 (no commission). Used when no staff-level override exists.
	defaultCommissionBps: integer("default_commission_bps").notNull().default(0),

	// Recurring class-slot template (only used when schedulingType = "class_slot")
	// Shape: { recurringDays: string[]; timeSlotsPerDay: Record<string, string[]> }
	timePresetConfig: jsonb("time_preset_config").$type<{
		recurringDays: string[];
		timeSlotsPerDay: Record<string, string[]>;
	} | null>(),

}, (table) => ({
	categoryIdIdx: index("services_category_idx").on(table.categoryId),
	branchIdIdx: index("services_branch_idx").on(table.branchId),
	stripeProductIdIdx: index("services_stripe_product_idx").on(table.stripeProductId),
	stripeSyncStatusIdx: index("services_stripe_sync_status_idx").on(table.stripeSyncStatus),
	isActiveIdx: index("services_active_idx").on(table.isActive),
	typeIdx: index("services_type_idx").on(table.type),
	recommendedIdx: index("services_recommended_idx").on(table.isRecommended),
	schedulingTypeIdx: index("services_scheduling_type_idx").on(table.schedulingType),
	expiryDaysIdx: index("services_expiry_days_idx").on(table.expiryDays),
}));


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

import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const dashboardSnapshots = pgTable("dashboard_snapshots", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: text("organization_id").notNull(),
	branchId: uuid("branch_id"),          // null = org-wide snapshot
	snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull(),
	period: text("period").notNull(),      // "daily" | "weekly" | "monthly"
	totalSales: integer("total_sales").notNull().default(0),        // cents
	salesOrderCount: integer("sales_order_count").notNull().default(0),
	totalAppointments: integer("total_appointments").notNull().default(0),
	completedAppointments: integer("completed_appointments").notNull().default(0),
	activeMembersCount: integer("active_members_count").notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	orgPeriodIdx: index("dashboard_snapshots_org_period_idx").on(table.organizationId, table.period),
	snapshotDateIdx: index("dashboard_snapshots_date_idx").on(table.snapshotDate),
}));

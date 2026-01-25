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

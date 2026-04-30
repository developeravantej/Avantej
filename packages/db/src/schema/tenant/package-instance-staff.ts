/**
 * Tenant Package Instance Staff Schema
 *
 * Links staff members (typically trainers) to a specific package_instance.
 *
 * Business rules:
 * - Slot 0 is the primary trainer (mirrors `package_instances.assignedTrainerId`).
 * - Additional slots (1+) cover commission splits or secondary trainers
 *   for semi-private packages.
 * - One staff member can only be assigned once per package (unique index on
 *   packageInstanceId + staffId).
 * - One slot per package (unique index on packageInstanceId + slotIndex)
 *   prevents two trainers from racing into slot 0.
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { packageInstances } from "./package-instances";

export const packageInstanceStaff = pgTable(
	"package_instance_staff",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		packageInstanceId: uuid("package_instance_id")
			.notNull()
			.references(() => packageInstances.id, { onDelete: "cascade" }),
		staffId: text("staff_id").notNull(), // References members.userId (Better-Auth user.id)
		slotIndex: integer("slot_index").notNull().default(0), // 0 = primary, 1+ = additional
		role: text("role").notNull().default("trainer"),
		assignedBy: text("assigned_by"), // Better-Auth user.id of staff who created the assignment
		assignedAt: timestamp("assigned_at").defaultNow().notNull(),
	},
	(table) => ({
		pkgStaffUniqueIdx: uniqueIndex("package_instance_staff_unique_idx").on(
			table.packageInstanceId,
			table.staffId,
		),
		pkgStaffSlotUniqueIdx: uniqueIndex(
			"package_instance_staff_slot_unique_idx",
		).on(table.packageInstanceId, table.slotIndex),
		pkgInstanceIdx: index("package_instance_staff_pkg_idx").on(
			table.packageInstanceId,
		),
		staffIdx: index("package_instance_staff_staff_idx").on(table.staffId),
	}),
);

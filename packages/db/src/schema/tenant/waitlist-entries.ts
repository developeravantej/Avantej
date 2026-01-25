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

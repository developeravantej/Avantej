// packages/db/src/schema/tenant/waitlist-entries.ts

/**
 * Tenant Waitlist Entries Schema
 *
 * Waitlist for full class slots.
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
import { classSlots } from "./class-slots";
import { appointments } from "./appointments";
import { members } from "./members";
import { customerProfiles } from "./customer-profiles";
import { walkInCustomers } from "./walk-in-customers";

export const waitlistEntries = pgTable(
	"waitlist_entries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		classSlotId: uuid("class_slot_id")
			.notNull()
			.references(() => classSlots.id, { onDelete: "cascade" }),
		// Legacy cross-DB Better-Auth user id (pre-Agent 2.10).
		// New writes should populate one of memberId / customerProfileId / walkInCustomerId.
		// Kept NOT NULL for backward compat with existing rows + service writers.
		userId: text("user_id").notNull(),

		// Agent 2.10 (audit-driven §8.5): polymorphic typed FKs for waitlist client.
		// Exactly-one-of CHECK is enforced via NOT VALID constraint (see migration 0037)
		// so legacy rows continue to validate while new writes are constrained.
		memberId: uuid("member_id").references(() => members.id, {
			onDelete: "cascade",
		}),
		customerProfileId: uuid("customer_profile_id").references(
			() => customerProfiles.id,
			{ onDelete: "cascade" },
		),
		walkInCustomerId: uuid("walk_in_customer_id").references(
			() => walkInCustomers.id,
			{ onDelete: "cascade" },
		),

		position: integer("position").notNull(),
		status: text("status").notNull(), // "waiting" | "notified" | "booked" | "expired" | "cancelled"

		notifiedAt: timestamp("notified_at"),
		expiresAt: timestamp("expires_at"),
		bookedAt: timestamp("booked_at"),

		appointmentId: uuid("appointment_id").references(() => appointments.id, {
			onDelete: "set null",
		}),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		classSlotUserUniqueIdx: uniqueIndex("waitlist_entries_slot_user_idx").on(
			table.classSlotId,
			table.userId,
		),
		classSlotIdx: index("waitlist_entries_slot_idx").on(table.classSlotId),
		userIdIdx: index("waitlist_entries_user_idx").on(table.userId),
		statusIdx: index("waitlist_entries_status_idx").on(table.status),
		slotStatusPositionIdx: index(
			"waitlist_entries_slot_status_position_idx",
		).on(table.classSlotId, table.status, table.position),
		// Agent 2.10: typed-FK indexes for polymorphic client lookups
		memberIdx: index("waitlist_entries_member_idx").on(table.memberId),
		customerProfileIdx: index("waitlist_entries_customer_profile_idx").on(
			table.customerProfileId,
		),
		walkInCustomerIdx: index("waitlist_entries_walk_in_customer_idx").on(
			table.walkInCustomerId,
		),
	}),
);

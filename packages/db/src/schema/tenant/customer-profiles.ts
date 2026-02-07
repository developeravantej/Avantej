// packages/db/src/schema/tenant/customer-profiles.ts

/**
 * Tenant Customer Profiles Schema
 *
 * Extended customer data per organization.
 * userId references Control Panel user.id (no FK due to cross-database).
 */

import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

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

	// Soft-delete support for external sync integrations
	isDeleted: boolean("is_deleted").default(false).notNull(),
	deletedAt: timestamp("deleted_at"),
	deletedSource: text("deleted_source"),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	userIdIdx: index("customer_profiles_user_idx").on(table.userId),
	creditPointsIdx: index("customer_profiles_credits_idx").on(table.creditPoints),
	isDeletedIdx: index("customer_profiles_is_deleted_idx").on(table.isDeleted),
}));

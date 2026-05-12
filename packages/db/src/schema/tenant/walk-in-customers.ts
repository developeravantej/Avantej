// packages/db/src/schema/tenant/walk-in-customers.ts

/**
 * Tenant Walk-In Customers Schema
 *
 * Walk-in customers who don't have a full organization member account.
 * These are unregistered customers who visit in person.
 *
 * Relationship to existing tables:
 * - customer_profiles → for member-customers (have login, full org membership)
 * - walk_in_customers → for walk-in / unregistered customers
 *
 * sales_orders.customerId (text) holds either members.userId or walk_in_customers.id
 * sales_orders.customerType discriminates: "member" | "walk_in"
 */

import {
	pgTable,
	uuid,
	text,
	boolean,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { customerProfiles } from "./customer-profiles";

export const walkInCustomers = pgTable(
	"walk_in_customers",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Required: at minimum a name to identify the customer
		name: text("name").notNull(),

		// Contact info — optional for walk-ins
		email: text("email"),
		phone: text("phone"),

		// Which branch this walk-in was registered at
		branchId: uuid("branch_id").references(() => hierarchyNodes.id, {
			onDelete: "set null",
		}),

		// Optional extended info
		dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),

		// "male" | "female" | "other" | "prefer_not_to_say"
		gender: text("gender"),

		address: text("address"),

		// Emergency contact
		emergencyContactName: text("emergency_contact_name"),
		emergencyContactPhone: text("emergency_contact_phone"),

		// Health/fitness notes
		medicalNotes: text("medical_notes"),

		// General notes
		notes: text("notes"),

		// Migration 0046 — conversion tracking to full customer profile
		// Populated when a walk-in is promoted to a registered customer.
		customerProfileId: uuid("customer_profile_id").references(
			() => customerProfiles.id,
			{ onDelete: "set null" },
		),
		convertedAt: timestamp("converted_at", { withTimezone: true }),

		// Soft-delete via isActive flag
		isActive: boolean("is_active").notNull().default(true),

		// Who created this record (member.userId, cross-DB text reference)
		createdBy: text("created_by").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		nameIdx: index("walk_in_customers_name_idx").on(table.name),
		phoneIdx: index("walk_in_customers_phone_idx").on(table.phone),
		emailIdx: index("walk_in_customers_email_idx").on(table.email),
		branchIdx: index("walk_in_customers_branch_idx").on(table.branchId),
		isActiveIdx: index("walk_in_customers_active_idx").on(table.isActive),
		customerProfileIdx: index("walk_in_customers_customer_profile_idx").on(table.customerProfileId),
	})
);

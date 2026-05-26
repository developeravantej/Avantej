// packages/db/src/schema/tenant/customer-profiles.ts

/**
 * Tenant Customer Profiles Schema
 *
 * Extended customer data per organization.
 * userId references Control Panel user.id (no FK due to cross-database).
 */

import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { accountGroups } from "./account-groups";
import { households } from "./households";
import { leadSources } from "./lead-sources";
import { members } from "./members";

export const customerProfiles = pgTable("customer_profiles", {
	id: uuid("id").primaryKey().defaultRandom(),
	// Phase 4: nullable so dependents in an account_group can exist without
	// a control-panel user row (shared-email case). Uniqueness for primaries
	// is enforced via the partial unique index declared in the table options.
	userId: text("user_id"),

	// Phase 4 — shared-email grouping
	accountGroupId: uuid("account_group_id").references(() => accountGroups.id, {
		onDelete: "set null",
	}),
	relationship: text("relationship"),

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

	// === 3.2 lead source / attribution ===
	// Where this lead came from. ON DELETE SET NULL keeps the profile intact
	// if the lookup row is removed; campaign tag is free-form for now.
	leadSourceId: uuid("lead_source_id").references(() => leadSources.id, {
		onDelete: "set null",
	}),
	referrerMemberId: uuid("referrer_member_id").references(() => members.id, {
		onDelete: "set null",
	}),
	campaignId: text("campaign_id"),
	// === /3.2 ===

	// === 3.6 household linking ===
	// Optional household membership. Profile survives household deletion
	// (ON DELETE SET NULL). Reverse pointer households.primary_contact_profile_id
	// lives in households table; cycle handled via DEFERRABLE FK in migration.
	householdId: uuid("household_id").references(() => households.id, {
		onDelete: "set null",
	}),
	// === /3.6 ===

	// === Plan B Phase 3d — card-on-file ===
	// Stripe Customer id lives on the tenant's Connect account (Standard), not
	// on the platform. Off-session charges later cite both this and the snapshot
	// of which connected account holds the customer (Phase 4 migration safety).
	stripeCustomerId: text("stripe_customer_id"),
	stripeConnectAccountIdSnapshot: text("stripe_connect_account_id_snapshot"),
	defaultPaymentMethodId: text("default_payment_method_id"),
	// === /3d ===

	// Unclaimed: profile was created by staff on behalf of the customer.
	// Cleared when the customer claims their account via magic-link.
	isUnclaimed: boolean("is_unclaimed").default(false).notNull(),

	// Soft-delete support for external sync integrations
	isDeleted: boolean("is_deleted").default(false).notNull(),
	deletedAt: timestamp("deleted_at"),
	deletedSource: text("deleted_source"),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	// Phase 4: partial unique index — primaries keep 1:1 user<->profile,
	// dependents (user_id IS NULL) are allowed to coexist.
	userIdUniqueIdx: uniqueIndex("customer_profiles_user_id_unique_not_null")
		.on(table.userId)
		.where(sql`${table.userId} IS NOT NULL`),
	creditPointsIdx: index("customer_profiles_credits_idx").on(table.creditPoints),
	isDeletedIdx: index("customer_profiles_is_deleted_idx").on(table.isDeleted),
	isUnclaimedIdx: index("customer_profiles_is_unclaimed_idx").on(table.isUnclaimed),
	// === 3.2 attribution lookup indexes ===
	leadSourceIdx: index("customer_profiles_lead_source_idx").on(table.leadSourceId),
	referrerMemberIdx: index("customer_profiles_referrer_member_idx").on(
		table.referrerMemberId,
	),
	// === /3.2 ===
	// === 3.6 household linking ===
	householdIdx: index("customer_profiles_household_idx").on(table.householdId),
	// === /3.6 ===
	// Phase 4
	accountGroupIdx: index("customer_profiles_account_group_idx").on(
		table.accountGroupId,
	),
}));

/**
 * Control Panel Organizations Schema
 * 
 * Represents tenant franchises. Each organization has a dedicated Neon database project.
 * Organizations are created automatically when a Stripe subscription is confirmed.
 * 
 * Security: connectionString must be encrypted before storage (handled by encryption utilities).
 */

import { pgTable, uuid, text, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { subscriptions } from "./subscriptions";
import { users } from "./users";

export const organizations = pgTable("organizations", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	neonProjectId: text("neon_project_id").notNull().unique(),
	connectionString: text("connection_string").notNull(),
	subscriptionId: uuid("subscription_id")
		.notNull()
		.references(() => subscriptions.id, { onDelete: "restrict" }),
	paymentStatus: text("payment_status").notNull(), // active, suspended, failed
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
	ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "restrict" }),
	// Stripe Connect fields for franchiser accounts
	stripeConnectAccountId: text("stripe_connect_account_id").unique(),
	stripeConnectStatus: text("stripe_connect_status").default("pending").notNull(), // pending | active | restricted | rejected
	stripeConnectAccountType: text("stripe_connect_account_type").default("franchiser").notNull(),
	stripeConnectOnboardingCompletedAt: timestamp("stripe_connect_onboarding_completed_at"),
	// Tenant schema migration tracking
	schemaVersion: text("schema_version").default("0000"),
	// GHL org-shared sync model (Phase G). NULL = not yet provisioned.
	// One GHL sub-account per Avantej org. Branches differentiated via per-country
	// SINGLE_OPTIONS custom field on contacts/users (key = "<slug>_location").
	ghlLocationId: text("ghl_location_id"),
	ghlApiKeyEncrypted: text("ghl_api_key_encrypted"),
	// Map: { "<country_node_id>": { ghlFieldId, fieldKey, createdAt } }
	// Field id locked at GHL custom-field creation time → country rename in
	// Avantej only updates label, never fieldKey.
	ghlCountryFieldMap: jsonb("ghl_country_field_map"),
	ghlProvisionedAt: timestamp("ghl_provisioned_at"),
	// Feature flag for sync model. "per-branch" (legacy Option X — one GHL
	// location per branch via ghl_branch_links) or "org-shared" (Phase G —
	// one GHL location per org, branches as custom-field option). NULL =
	// not configured. Defaults to "per-branch" for existing tenants.
	ghlSyncModel: text("ghl_sync_model"),
}, (table) => ({
	// Indexes for performance
	// Note: slug and neonProjectId already have unique constraints/indexes via .unique()
	subscriptionIdIdx: index("organizations_subscription_idx").on(table.subscriptionId),
	paymentStatusIdx: index("organizations_payment_status_idx").on(table.paymentStatus),
	stripeConnectAccountIdIdx: index("organizations_stripe_connect_idx").on(table.stripeConnectAccountId),
}));

export const organizationsRelations = relations(organizations, ({ one }) => ({
	subscription: one(subscriptions, {
		fields: [organizations.subscriptionId],
		references: [subscriptions.id],
	}),
	owner: one(users, {
		fields: [organizations.ownerUserId],
		references: [users.id],
	}),
}));


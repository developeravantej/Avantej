/**
 * Control Panel Organizations Schema
 *
 * Represents tenant franchises. Each organization has a dedicated Neon database project.
 * Organizations are created on trial signup; a subscription is attached when the trial
 * is activated to paid (ADR-0003). Stripe Connect state (chargesEnabled/payoutsEnabled/
 * detailsSubmitted/connectAccountUpdatedAt) is synced from the account.updated webhook
 * per ADR-0008.
 *
 * Security: connectionString must be encrypted before storage (handled by encryption utilities).
 */

import {
	pgTable,
	uuid,
	text,
	timestamp,
	index,
	uniqueIndex,
	jsonb,
	boolean,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { subscriptions } from "./subscriptions";
import { users } from "./users";

export const organizations = pgTable(
	"organizations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		neonProjectId: text("neon_project_id").notNull().unique(),
		connectionString: text("connection_string").notNull(),
		subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
			onDelete: "set null",
		}), // Nullable: org exists during trial without a sub. ADR-0003.
		trialEndsAt: timestamp("trial_ends_at"),
		paymentStatus: text("payment_status").notNull(), // active, suspended, failed
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
		// NO ACTION (drizzle default) matches the live constraint — the schema
		// previously declared RESTRICT, which the drift gate flagged as an
		// action mismatch. In Postgres the two are equivalent for our use
		// (both block deleting a user who still owns an org).
		ownerUserId: text("owner_user_id").references(() => users.id),
		// Plan E follow-up — primary country (ISO 3166-1 alpha-2). Captured at
		// provisioning time by the E.7 wizard. Nullable for legacy rows.
		countryCode: text("country_code"),
		// Phase 4.5: legacy org-level Stripe Connect fields dropped — see
		// migration 0020. All Connect state now lives in
		// org_country_stripe_accounts (one row per (org, country_code)).
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
		// Map of GHL global (location-level) custom-field ids keyed by
		// CustomFieldKey: { gender, emergencyContactName, ..., designatedCountry,
		// designatedBranch }. Persisted at connect time from
		// ensureCustomFieldsExist so the live sync path can stamp contacts
		// (previously the return value was discarded → fields never sent).
		ghlGlobalFieldMap: jsonb("ghl_global_field_map"),
		// GHL custom-field id for the org's "Primary Staff" SINGLE_OPTIONS dropdown
		// (one per org/location). Cached at creation time like ghlCountryFieldMap.
		ghlPrimaryStaffFieldId: text("ghl_primary_staff_field_id"),
		ghlProvisionedAt: timestamp("ghl_provisioned_at"),
		// Org-shared inbound webhook auth secret. Per-branch tenants carry this
		// on ghl_branch_links; org-shared has no link row, so the secret lives
		// here. Generated at connect time; the tenant configures GHL's webhook
		// automation to send it (header/query) and we verify on each inbound.
		ghlWebhookSecret: text("ghl_webhook_secret"),
		// Feature flag for sync model. "per-branch" (legacy Option X — one GHL
		// location per branch via ghl_branch_links) or "org-shared" (Phase G —
		// one GHL location per org, branches as custom-field option). NULL =
		// not configured. Defaults to "per-branch" for existing tenants.
		ghlSyncModel: text("ghl_sync_model"),
		// GHL inbound approval gate (Phase G follow-up). When true, an inbound
		// ContactCreate for a NEW contact is held in ghl_pending_contacts for
		// staff approval instead of being materialized immediately. Default false
		// preserves the instant-sync behavior for every other tenant.
		ghlRequireApproval: boolean("ghl_require_approval").default(false),
		// Per-org IANA timezone for availability/booking math (migration 0013).
		// Currently informational — booking slot math still runs in UTC; org-tz
		// awareness is a tracked future enhancement (see appointment.service.ts).
		timezone: text("timezone").notNull().default("Asia/Kuala_Lumpur"),
	},
	(table) => ({
		// Indexes for performance
		// Note: slug and neonProjectId already have unique constraints/indexes via .unique()
		subscriptionIdIdx: index("organizations_subscription_idx").on(
			table.subscriptionId,
		),
		paymentStatusIdx: index("organizations_payment_status_idx").on(
			table.paymentStatus,
		),
		countryCodeIdx: index("organizations_country_code_idx").on(
			table.countryCode,
		),
		// One GHL location per org (partial — unconnected orgs hold NULL).
		ghlLocationIdUnique: uniqueIndex("organizations_ghl_location_id_unique")
			.on(table.ghlLocationId)
			.where(sql`${table.ghlLocationId} IS NOT NULL`),
	}),
);

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

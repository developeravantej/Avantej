/**
 * Tenant Schema — households (Phase 3 Agent 3.6)
 *
 * Households group customer profiles into a single billing / family unit
 * (e.g. parent-payer + dependents). One profile may be designated the
 * primary contact via `primaryContactProfileId`. The reverse pointer lives
 * on `customer_profiles.householdId`.
 *
 * The cycle households.primary_contact_profile_id <-> customer_profiles.household_id
 * is broken at the database layer with DEFERRABLE INITIALLY DEFERRED on the
 * outgoing FK from this table — see `0045_add_households.sql`.
 *
 * NOTE: `primaryContactProfileId` deliberately has NO drizzle `.references()`
 * here so the generator does not emit a non-deferrable FK. The constraint is
 * created by hand in the migration. `createdBy` stores the Better-Auth user
 * id (cross-database, no FK).
 */

import {
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const households = pgTable("households", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	primaryContactProfileId: uuid("primary_contact_profile_id"),
	notes: text("notes"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	createdBy: text("created_by").notNull(),
});

/**
 * Control Panel Organizations Schema
 * 
 * Represents tenant franchises. Each organization has a dedicated Neon database project.
 * Organizations are created automatically when a Stripe subscription is confirmed.
 * 
 * Security: connectionString must be encrypted before storage (handled by encryption utilities).
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
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
	ownerUserId: text("owner_user_id").references(() => users.id),
}, (table) => ({
	// Indexes for performance
	// Note: slug and neonProjectId already have unique constraints/indexes via .unique()
	subscriptionIdIdx: index("organizations_subscription_idx").on(table.subscriptionId),
	paymentStatusIdx: index("organizations_payment_status_idx").on(table.paymentStatus),
}));


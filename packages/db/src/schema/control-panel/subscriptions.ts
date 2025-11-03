/**
 * Control Panel Subscriptions Schema
 * 
 * Tracks Stripe subscriptions and determines organization count limit per tier.
 * Each subscription allows 1:1 relationship with organizations (one subscription = one organization),
 * but higher tiers allow multiple organizations per subscription.
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const subscriptions = pgTable("subscriptions", {
	id: uuid("id").primaryKey().defaultRandom(),
	stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
	stripeCustomerId: text("stripe_customer_id").notNull(),
	tier: text("tier").notNull(), // basic, professional, enterprise
	organizationCountLimit: integer("organization_count_limit").notNull(),
	status: text("status").notNull(), // active, past_due, canceled
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	// Indexes for performance
	// Note: stripeSubscriptionId already has unique constraint/index via .unique()
	stripeCustomerIdIdx: index("subscriptions_customer_idx").on(table.stripeCustomerId),
}));



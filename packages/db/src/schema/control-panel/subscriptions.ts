/**
 * Control Panel Subscriptions Schema
 *
 * Tracks Stripe Billing subscriptions held by Tenants for SaaS access.
 * One subscription belongs to one Tenant (organization) at a time; multi-org
 * tiers permit multiple organizations per subscription via `organizationCountLimit`.
 *
 * State columns are synced from Stripe via webhooks; see ADR-0006, ADR-0009.
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	index,
} from "drizzle-orm/pg-core";

export const subscriptions = pgTable(
	"subscriptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
		stripeCustomerId: text("stripe_customer_id").notNull(),
		stripePriceId: text("stripe_price_id").notNull(),
		tier: text("tier").notNull(), // basic | professional | enterprise
		organizationCountLimit: integer("organization_count_limit").notNull(),
		applicationFeeBps: integer("application_fee_bps").notNull(), // basis points
		currency: text("currency").notNull().default("usd"),
		status: text("status").notNull(),
		pastDueAt: timestamp("past_due_at"),
		gracePeriodEndsAt: timestamp("grace_period_ends_at"),
		trialEndsAt: timestamp("trial_ends_at"),
		currentPeriodStart: timestamp("current_period_start"),
		currentPeriodEnd: timestamp("current_period_end"),
		cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
		canceledAt: timestamp("canceled_at"),
		// F-SAAS-3: canonical anchor for Stripe event ordering. Replaces updatedAt
		// proxy in markPastDue / markActive / upsertSubscriptionFromStripe guards.
		// Nullable on creation (see migration 0032); backfilled from updatedAt for
		// existing rows. timezone-aware to match Stripe's event.created (epoch).
		lastStripeEventAt: timestamp("last_stripe_event_at", {
			withTimezone: true,
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		stripeCustomerIdIdx: index("subscriptions_customer_idx").on(
			table.stripeCustomerId,
		),
		statusIdx: index("subscriptions_status_idx").on(table.status),
	}),
);

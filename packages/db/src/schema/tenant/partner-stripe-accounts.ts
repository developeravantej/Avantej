/**
 * Tenant Partner Stripe Accounts Schema
 * 
 * Stores Stripe Connect account information for any partner (coaches, trainers, etc.)
 * who receives payouts from the organization.
 * 
 * This is distinct from the franchiser's Stripe Connect account (stored in control panel organizations table).
 * 
 * Business Rules:
 * - One Stripe Connect account per partner (enforced by unique constraint on partnerId)
 * - Partner must be a member of the organization
 * - Onboarding status tracks Stripe Connect onboarding flow
 * - Bank account details are stored for manual payout verification
 */

import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const partnerStripeAccounts = pgTable("partner_stripe_accounts", {
	id: uuid("id").primaryKey().defaultRandom(),

	// Stores the member's userId (cross-DB text identifier). No FK constraint because
	// userId is a text field without a unique CONSTRAINT (only a unique INDEX), and
	// PostgreSQL FK references require a unique constraint or primary key.
	partnerId: text("partner_id").notNull(),
	
	stripeConnectAccountId: text("stripe_connect_account_id").notNull().unique(),
	stripeConnectStatus: text("stripe_connect_status").default("pending").notNull(), // "pending" | "active" | "restricted" | "rejected"
	stripeConnectAccountType: text("stripe_connect_account_type").default("partner").notNull(),
	
	onboardingUrl: text("onboarding_url"),
	onboardingCompletedAt: timestamp("onboarding_completed_at"),
	
	bankAccountLast4: text("bank_account_last_4"),
	bankAccountType: text("bank_account_type"),
	
	accountType: text("account_type").default("express").notNull(), // "express" | "standard" | "custom"
	
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	partnerIdIdx: index("partner_stripe_accounts_partner_idx").on(table.partnerId),
	stripeConnectAccountIdIdx: index("partner_stripe_accounts_stripe_idx").on(table.stripeConnectAccountId),
	stripeConnectStatusIdx: index("partner_stripe_accounts_status_idx").on(table.stripeConnectStatus),
	partnerUniqueIdx: uniqueIndex("partner_stripe_accounts_partner_unique_idx").on(table.partnerId),
}));


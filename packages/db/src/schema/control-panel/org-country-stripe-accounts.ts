/**
 * Control-panel — Per-country Stripe Connect accounts (Plan B Phase 4).
 *
 * One row per (organization, country) holds the franchisee's Stripe Connect
 * Standard account for that country. Stripe accounts are country-locked, so
 * a multi-country franchise (MY / SG / TH branches) needs one acct per
 * country to settle in native currency.
 *
 * Resolution at charge time: appointment.branch_id -> hierarchy_nodes ->
 * countryNodeId -> country.name (= ISO code) -> this row. The
 * stripe_connect_account_id snapshot on the appointment / payment row keeps
 * historical reconciliation valid even if the acct id moves between rows.
 */

import { pgTable, uuid, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const orgCountryStripeAccounts = pgTable(
	"org_country_stripe_accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		countryCode: text("country_code").notNull(), // ISO 3166-1 alpha-2 (MY, SG, TH, ...)
		stripeAccountId: text("stripe_account_id").unique(),
		stripeConnectStatus: text("stripe_connect_status").default("pending").notNull(),
		stripeConnectAccountType: text("stripe_connect_account_type")
			.default("standard")
			.notNull(),
		chargesEnabled: boolean("charges_enabled").default(false).notNull(),
		payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),
		detailsSubmitted: boolean("details_submitted").default(false).notNull(),
		currency: text("currency").notNull(), // MYR | SGD | THB | ...
		stripeConnectOnboardingCompletedAt: timestamp("stripe_connect_onboarding_completed_at"),
		connectAccountUpdatedAt: timestamp("connect_account_updated_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		orgCountryUq: uniqueIndex("org_country_stripe_accounts_org_country_uq").on(
			t.organizationId,
			t.countryCode,
		),
		acctIdx: index("org_country_stripe_accounts_acct_idx").on(t.stripeAccountId),
	}),
);

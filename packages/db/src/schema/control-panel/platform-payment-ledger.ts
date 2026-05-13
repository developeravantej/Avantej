/**
 * Platform Payment Ledger (control-panel)
 *
 * Cross-tenant audit mirror of payment events. Written by webhook handlers
 * (Plan D Phase 6-lite). Source of truth remains Stripe; this is for in-app
 * admin audit and revenue reporting per ADR-0011.
 *
 * Plan A creates the table only; the writes land in Plan D.
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	index,
} from "drizzle-orm/pg-core";

export const platformPaymentLedger = pgTable(
	"platform_payment_ledger",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id"), // null for platform-level events
		eventKind: text("event_kind").notNull(), // 'saas_invoice_paid' | 'pi_succeeded' | 'pi_refunded' | etc.
		stripeEventId: text("stripe_event_id").notNull().unique(), // evt_xxx
		stripeObjectId: text("stripe_object_id").notNull(), // pi_xxx, sub_xxx, in_xxx, etc.
		stripeAccount: text("stripe_account"), // acct_xxx, null for platform
		amount: integer("amount").notNull(), // minor units
		applicationFee: integer("application_fee").default(0).notNull(), // minor units
		currency: text("currency").notNull().default("usd"),
		occurredAt: timestamp("occurred_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => ({
		orgIdx: index("ledger_org_idx").on(table.organizationId),
		eventKindIdx: index("ledger_event_kind_idx").on(table.eventKind),
		occurredAtIdx: index("ledger_occurred_idx").on(table.occurredAt),
	}),
);

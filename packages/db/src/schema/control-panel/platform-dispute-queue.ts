/**
 * Platform Dispute Queue (control-panel) — Plan C Phase C.2.
 *
 * One row per Stripe dispute on a tenant's connected account. Written by the
 * connect webhook handler when charge.dispute.* events arrive. Surfaces in
 * the platform-admin dispute queue UI so Avantej ops can track evidence
 * deadlines and ensure tenants respond before Stripe rules against them.
 *
 * Notification flow (triple delivery — ADR-0020):
 *   1. Email tenant via Resend with deadline prominent
 *   2. Insert tenant notifications row (tenant DB)
 *   3. Insert THIS row (platform admin queue)
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const platformDisputeQueue = pgTable(
	"platform_dispute_queue",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		stripeAccountId: text("stripe_account_id").notNull(),
		disputeId: text("dispute_id").notNull().unique(),
		status: text("status").notNull(), // warning_needs_response | needs_response | under_review | won | lost | charge_refunded
		amount: integer("amount").notNull(),
		currency: text("currency").notNull(),
		reason: text("reason"), // fraudulent | duplicate | requested_by_customer | ...
		deadlineAt: timestamp("deadline_at"), // Stripe evidence deadline
		handledAt: timestamp("handled_at"),
		handledBy: text("handled_by"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		orgIdx: index("dispute_queue_org_idx").on(t.organizationId),
		statusIdx: index("dispute_queue_status_idx").on(t.status),
		deadlineIdx: index("dispute_queue_deadline_idx").on(t.deadlineAt),
	}),
);

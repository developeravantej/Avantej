/**
 * Control Panel — Outbound email log
 *
 * One row per send via Resend. `resendMessageId` is the idempotency key —
 * the Resend webhook handler upserts on this when status updates arrive.
 *
 * Lives in control-panel DB so the webhook can route by `tags.organization_id`
 * without first connecting to a tenant branch. Cross-tenant queries (admin
 * dashboards, billing usage) are easier here too.
 */

import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { emailDomains } from "./email-domains";

export const emailLogs = pgTable("email_logs", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	// FK to the sending domain used. Null = sent via platform fallback
	// (RESEND_FROM_EMAIL) before the tenant verified their own domain.
	emailDomainId: uuid("email_domain_id").references(() => emailDomains.id, {
		onDelete: "set null",
	}),
	// Resend message id (e.g. "re_xxx"). Unique → idempotency for webhooks.
	resendMessageId: text("resend_message_id").notNull().unique(),
	fromAddress: text("from_address").notNull(),
	toAddress: text("to_address").notNull(),
	subject: text("subject").notNull(),
	// queued | sent | delivered | bounced | complained | opened | clicked | failed
	status: text("status").notNull().default("queued"),
	lastEventType: text("last_event_type"),
	lastEventAt: timestamp("last_event_at"),
	errorMessage: text("error_message"),
	// Verbatim last webhook payload for forensics / debugging.
	lastEventPayload: jsonb("last_event_payload"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	organizationIdIdx: index("email_logs_organization_idx").on(table.organizationId),
	statusIdx: index("email_logs_status_idx").on(table.status),
	createdAtIdx: index("email_logs_created_at_idx").on(table.createdAt),
}));

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
	organization: one(organizations, {
		fields: [emailLogs.organizationId],
		references: [organizations.id],
	}),
	emailDomain: one(emailDomains, {
		fields: [emailLogs.emailDomainId],
		references: [emailDomains.id],
	}),
}));

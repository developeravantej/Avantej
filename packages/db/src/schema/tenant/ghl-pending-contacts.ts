/**
 * Tenant GoHighLevel Pending Contacts (inbound approval gate).
 *
 * When `organizations.ghl_require_approval` is true, an inbound GHL
 * ContactCreate webhook for a NEW contact is HELD here instead of being
 * materialized into a user / customer_profile / member. Staff review the queue
 * and either approve (→ materialize via the normal webhook create path) or
 * reject (→ discarded, audit row kept).
 *
 * Nothing here writes `ghl_contact_links` — a pending contact is not yet
 * linked, so the live-sync dedupe/retry path is unaffected.
 */

import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const ghlPendingContacts = pgTable(
	"ghl_pending_contacts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ghlContactId: text("ghl_contact_id").notNull(),
		ghlLocationId: text("ghl_location_id").notNull(),
		// Full inbound webhook body — replayed verbatim on approve so the created
		// member is identical to what an ungated sync would have produced.
		rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
		// Denormalized preview fields for the approvals inbox (avoids re-parsing
		// the payload to render a row).
		proposedName: text("proposed_name"),
		proposedEmail: text("proposed_email"),
		proposedPhone: text("proposed_phone"),
		// Branch resolved at queue time — drives both the inbox display and RBAC
		// scoping. Cross-DB ref to hierarchy_nodes.id where type='branch' (no FK).
		resolvedBranchNodeId: uuid("resolved_branch_node_id"),
		// pending | approved | rejected. text + CHECK (no pgEnum → avoids churn).
		status: text("status").default("pending").notNull(),
		rejectReason: text("reject_reason"),
		// Control-panel user id of the approver/rejecter (no cross-DB FK).
		reviewedByUserId: text("reviewed_by_user_id"),
		reviewedAt: timestamp("reviewed_at"),
		// Onboarding hand-off (post-approval): when the sign-in link that starts
		// registration was dispatched, and the control-panel user id who sent it.
		// Lets the approvals inbox render "Sent ✓ / Resend" durably across reloads.
		onboardingLinkSentAt: timestamp("onboarding_link_sent_at"),
		onboardingLinkSentBy: text("onboarding_link_sent_by"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		ghlContactIdUniqueIdx: uniqueIndex(
			"ghl_pending_contacts_ghl_contact_id_unique",
		).on(table.ghlContactId),
		statusIdx: index("ghl_pending_contacts_status_idx").on(table.status),
		branchNodeIdIdx: index("ghl_pending_contacts_branch_idx").on(
			table.resolvedBranchNodeId,
		),
	}),
);

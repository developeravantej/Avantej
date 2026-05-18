/**
 * Control Panel — Tenant Deletions (Plan E E.8).
 *
 * GDPR / lifecycle deletion records. Two-stage:
 *   1. Soft delete: row inserted, organization.paymentStatus = 'cancelled',
 *      hard_delete_after = requested_at + 30d. Tenant data still on disk.
 *   2. Hard delete: daily cron sweeper finds rows where
 *      hard_delete_after <= now AND restored_at IS NULL AND hard_deleted_at
 *      IS NULL, drops the Neon project, deletes the organization row, and
 *      stamps hard_deleted_at.
 *
 * Restore window: any time before hard_deleted_at; sets restored_at and the
 * row drops out of the sweeper's partial index.
 *
 * `requested_by` is plain text (Better-Auth user id) — no FK, audit survives
 * user deletion (same pattern as admin_session_actions.adminUserId).
 *
 * See ADR-0026.
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const tenantDeletions = pgTable(
	"tenant_deletions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		requestedAt: timestamp("requested_at").defaultNow(),
		requestedBy: text("requested_by").notNull(),
		hardDeleteAfter: timestamp("hard_delete_after").notNull(),
		restoredAt: timestamp("restored_at"),
		hardDeletedAt: timestamp("hard_deleted_at"),
		exportUrl: text("export_url"),
	},
	(t) => ({
		hardAfterIdx: index("tenant_deletions_hard_after_idx").on(t.hardDeleteAfter),
		orgIdx: index("tenant_deletions_org_idx").on(t.organizationId),
	}),
);

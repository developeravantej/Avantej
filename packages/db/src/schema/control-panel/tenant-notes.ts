/**
 * Control Panel — Tenant Notes (Plan F.1).
 *
 * Internal platform-admin notes attached to a tenant. Pinned at top,
 * append-only audit; author can edit/delete own within 1 hour, otherwise
 * frozen. Super-admin can delete at any time. Soft-deleted via deleted_at.
 *
 * Author identity stored as plain text Better-Auth user id (no FK) so the
 * note survives user deletion, mirroring admin_session_actions semantics.
 */

import {
	pgTable,
	uuid,
	text,
	boolean,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const tenantNotes = pgTable(
	"tenant_notes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id").notNull(),
		body: text("body").notNull(),
		isPinned: boolean("is_pinned").notNull().default(false),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => ({
		orgIdx: index("tenant_notes_org_idx").on(
			table.organizationId,
			table.createdAt,
		),
		pinnedIdx: index("tenant_notes_pinned_idx").on(
			table.organizationId,
			table.isPinned,
			table.createdAt,
		),
	}),
);

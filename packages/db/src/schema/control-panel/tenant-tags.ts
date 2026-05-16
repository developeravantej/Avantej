/**
 * Control Panel — Tenant Tags (Plan F.1).
 *
 * Platform-admin labels attached to tenant orgs ("enterprise", "trial",
 * "high-risk", ...). Single table, UNIQUE (organization_id, label) so the
 * same label can appear across many orgs but only once per org.
 *
 * created_by_user_id is plain text (no FK) so the tag survives admin user
 * deletion, mirroring tenant_notes / admin_session_actions semantics.
 */

import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const tenantTags = pgTable(
	"tenant_tags",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		color: text("color"),
		createdByUserId: text("created_by_user_id").notNull(),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(table) => ({
		labelIdx: index("tenant_tags_label_idx").on(table.label),
		orgIdx: index("tenant_tags_org_idx").on(table.organizationId),
		orgLabelUnique: unique("tenant_tags_org_label_unique").on(
			table.organizationId,
			table.label,
		),
	}),
);

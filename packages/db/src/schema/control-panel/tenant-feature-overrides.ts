/**
 * Control Panel — Tenant Feature Overrides (Plan F.6 Agent Fo).
 *
 * Per-tenant override of an individual feature flag, on top of the
 * `TIER_LIMITS[tier].features` defaults. Lets ops enable one extra
 * feature for a basic-tier customer as a concession, or disable a
 * feature for a tenant abusing rate limits, without changing tier.
 *
 * UNIQUE (organization_id, feature_key) — at most one override per
 * feature per org. Upsert semantics.
 *
 * Author identity stored as plain text Better-Auth user id (no FK) so
 * the override survives user deletion, mirroring tenant_notes /
 * admin_session_actions patterns.
 */

import {
	pgTable,
	uuid,
	text,
	boolean,
	timestamp,
	index,
	unique,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const tenantFeatureOverrides = pgTable(
	"tenant_feature_overrides",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		featureKey: text("feature_key").notNull(),
		enabled: boolean("enabled").notNull(),
		setByUserId: text("set_by_user_id").notNull(),
		notes: text("notes"),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(table) => ({
		orgIdx: index("tenant_feature_overrides_org_idx").on(table.organizationId),
		orgFeatureUnique: unique("tenant_feature_overrides_org_feature_unique").on(
			table.organizationId,
			table.featureKey,
		),
	}),
);

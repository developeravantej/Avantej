/**
 * Tenant Members Schema
 * 
 * Represents user membership in an organization with role and hierarchy scope.
 * Each member record is scoped to a specific hierarchy node (organization, country, region, area, or branch).
 * 
 * Note: userId references the users table in the control panel database but cannot have
 * a foreign key constraint since they're in different Neon projects. The application layer
 * ensures referential integrity.
 * 
 * Business Rules:
 * - One user can have only one membership in this organization (enforced by unique index on userId)
 * - User can belong to multiple organizations (via separate member records in different tenant databases)
 * - Hierarchy scope determines accessible nodes (current + all descendants)
 * - Admin role grants full organization access
 * - Trainer/Staff/Client roles limited to hierarchy scope
 * - Cannot remove last admin/owner from organization (enforced in app layer)
 * - Role change triggers email notification (handled in app layer)
 */

import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { trainerTiers } from "./trainer-tiers";
import { roles } from "./roles";
import { leadSources } from "./lead-sources";
import { households } from "./households";
import { invitations } from "./invitations";

export const members = pgTable("members", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: text("user_id").notNull(), // References control panel users.id (text, no FK constraint due to cross-database)
	role: text("role").notNull(), // admin, trainer, staff, client (legacy text role; superseded by roleId when set)
	// Wave 3a Agent 2.1 (Journey J1): nullable FK to custom/system roles. When set,
	// permission.service.ts resolves permissions via this role's role_permissions joins.
	// When null, falls through to text-role fast-path. ON DELETE SET NULL preserves member.
	roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
	hierarchyScopeId: uuid("hierarchy_scope_id")
		.notNull()
		.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
	status: text("status").notNull(), // active, suspended
	joinedAt: timestamp("joined_at").defaultNow().notNull(),
	trainerTierId: uuid("trainer_tier_id").references(() => trainerTiers.id, { onDelete: "set null" }),
	// Migration 0046 — acquisition / lifecycle linkage (all nullable)
	leadSourceId: uuid("lead_source_id").references(() => leadSources.id, { onDelete: "set null" }),
	householdId: uuid("household_id").references(() => households.id, { onDelete: "set null" }),
	invitationId: uuid("invitation_id").references(() => invitations.id, { onDelete: "set null" }),
	// Soft-delete marker. Additive to `status` (which captures active/suspended/inactive
	// for the deactivate flow). When non-null, the row is hidden from default member
	// queries and surfaced only when callers opt in via `includeDeleted`. Soft-delete
	// is a GHL no-op (mirrors customer parity except customers also fire GHL DELETE).
	deletedAt: timestamp("deleted_at"),
}, (table) => ({
	// Unique constraint: one membership per user in this tenant
	userIdUniqueIdx: uniqueIndex("members_user_idx").on(table.userId),
	// Indexes for performance
	hierarchyScopeIdIdx: index("members_hierarchy_idx").on(table.hierarchyScopeId),
	roleIdx: index("members_role_idx").on(table.role),
	roleIdIdx: index("members_role_id_idx").on(table.roleId),
	statusIdx: index("members_status_idx").on(table.status),
	trainerTierIdx: index("members_trainer_tier_idx").on(table.trainerTierId),
	leadSourceIdx: index("members_lead_source_idx").on(table.leadSourceId),
	householdIdx: index("members_household_idx").on(table.householdId),
	invitationIdx: index("members_invitation_idx").on(table.invitationId),
	deletedAtIdx: index("members_deleted_at_idx").on(table.deletedAt),
}));


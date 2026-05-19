/**
 * Tenant Invitations Schema
 * 
 * Tracks pending invitations to join an organization with role and hierarchy scope.
 * Invitations are stored in each tenant's database and are scoped to a specific hierarchy node.
 * 
 * Note: No organizationId field needed since invitations are stored in the tenant's own database.
 * invitedBy references control panel users table without FK constraint (cross-database).
 * 
 * Business Rules:
 * - Invitations expire after 7 days (enforced in app layer)
 * - Expired invitations cannot be accepted (must be resent)
 * - Email must match user's email for acceptance (enforced in app layer)
 * - Invitation creates member record upon acceptance (handled in app layer)
 * - Can resend pending invitations (handled in app layer)
 * - Can revoke pending invitations (handled in app layer)
 * - Only one pending invitation per email in this organization (enforced in app layer)
 */

import { pgTable, uuid, text, timestamp, index, integer, boolean } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const invitations = pgTable("invitations", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: text("email"), // nullable for branch_self_signup invites (no target email)
	invitedBy: text("invited_by").notNull(), // References control panel users.id (text, no FK constraint due to cross-database)
	role: text("role").notNull(), // admin, trainer, staff, client
	hierarchyScopeId: uuid("hierarchy_scope_id")
		.notNull()
		.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
	token: text("token").notNull().unique(),
	status: text("status").notNull(), // pending, accepted, declined, expired
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	// Phase 0: branch QR onboarding (sales-pipeline-fixes 0051)
	kind: text("kind").notNull().default("staff"), // "staff" | "branch_self_signup"
	usesCount: integer("uses_count").notNull().default(0),
	maxUses: integer("max_uses"), // null = unlimited
	isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
	emailStatusIdx: index("invitations_email_status_idx").on(table.email, table.status),
	expiresAtIdx: index("invitations_expires_idx").on(table.expiresAt),
	invitedByIdx: index("invitations_invited_by_idx").on(table.invitedBy),
	kindBranchIdx: index("invitations_kind_branch_idx").on(table.kind, table.hierarchyScopeId),
}));


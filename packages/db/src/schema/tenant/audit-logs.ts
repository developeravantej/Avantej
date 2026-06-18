import {
	pgTable,
	uuid,
	text,
	jsonb,
	timestamp,
	index,
} from "drizzle-orm/pg-core";

export const auditLogs = pgTable(
	"audit_logs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// Actor — the staff member performing the action
		actorUserId: text("actor_user_id").notNull(), // members.userId (control panel user.id)
		actorMemberId: uuid("actor_member_id"), // members.id (denormalized for filter speed; nullable for system actions)
		actorRole: text("actor_role"), // snapshot of role at action time
		// Action
		action: text("action").notNull(),
		// Vocabulary (extensible string, no enum constraint to avoid migration churn):
		// "sale.create" | "sale.cancel" | "sale.refund.request" | "sale.refund.approve" | "sale.refund.process" | "sale.refund.reject"
		// "commission.approve" | "commission.mark_paid"
		// "member.deactivate" | "member.reactivate" | "member.role_change" | "member.suspend"
		// "checkin.create" | "checkin.delete"
		// "package.unlock" | "package.refund"
		// "promotion.create" | "promotion.deactivate"
		// "tax.set_default"
		entityType: text("entity_type").notNull(),
		// "sales_order" | "refund" | "payment" | "package_instance" | "member" | "commission_split" | "check_in" | "promotion" | "tax_rate" | ...
		entityId: text("entity_id"), // text (uuid or other) — nullable for bulk actions
		// Context
		branchId: uuid("branch_id"), // when applicable; allows branch-scoped audit views
		summary: text("summary").notNull(), // human-readable: "Cancelled sale SO-20260418-0042 for RM 1,500"
		changes: jsonb("changes"), // structured before/after diff or action params; shape varies by action
		ipAddress: text("ip_address"), // optional, populated if available from request headers
		userAgent: text("user_agent"), // optional
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		actorIdx: index("audit_logs_actor_idx").on(
			table.actorUserId,
			table.createdAt,
		),
		actionIdx: index("audit_logs_action_idx").on(table.action),
		entityIdx: index("audit_logs_entity_idx").on(
			table.entityType,
			table.entityId,
		),
		branchIdx: index("audit_logs_branch_idx").on(table.branchId),
		createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
	}),
);

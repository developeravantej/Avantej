// ─── Constants ────────────────────────────────────────────────────────────────

export const PAGE_LIMIT = 100;

export const AUDIT_ACTIONS = [
	"sale.create",
	"sale.cancel",
	"sale.refund.request",
	"sale.refund.approve",
	"sale.refund.process",
	"sale.refund.reject",
	"commission.approve",
	"commission.mark_paid",
	"member.deactivate",
	"member.reactivate",
	"member.role_change",
	"member.suspend",
	"checkin.create",
	"checkin.delete",
	"package.unlock",
	"package.refund",
	"promotion.create",
	"promotion.deactivate",
	"tax.set_default",
] as const;

export const ENTITY_TYPES = [
	"sales_order",
	"refund",
	"payment",
	"package_instance",
	"member",
	"commission_split",
	"check_in",
	"promotion",
	"tax_rate",
] as const;

export type SeverityFilter = "danger" | "warning" | "info" | "";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditRowEnriched = {
	id: string;
	actorUserId: string;
	actorMemberId: string | null;
	actorRole: string | null;
	actorName: string | null;
	actorInitials: string | null;
	action: string;
	entityType: string;
	entityId: string | null;
	entityLabel: string | null;
	branchId: string | null;
	branchName: string | null;
	summary: string;
	severity: "danger" | "warning" | "info";
	changes: Record<string, unknown> | null;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: Date | string;
};

/**
 * Audit Log Service
 *
 * Provides write (hook) and read utilities for the audit_logs table.
 *
 * CANONICAL ACTION VOCABULARY — append here when adding new phases; never reuse a string for a different concept:
 * "sale.create"              — POS sale recorded
 * "sale.cancel"              — Sales order cancelled
 * "sale.refund.request"      — Refund requested
 * "sale.refund.approve"      — Refund approved
 * "sale.refund.process"      — Refund processed / paid out
 * "sale.refund.reject"       — Refund rejected
 * "commission.create"        — Commission split created (pending)
 * "commission.approve"       — Commission row approved
 * "commission.mark_paid"     — Commission row marked paid
 * "commission.void"          — Commission row voided (any prior status)
 * "member.deactivate"        — Member deactivated (tenant-only status change)
 * "member.suspend"           — Member suspended (control panel + tenant)
 * "member.reactivate"        — Member reactivated
 * "member.role_change"       — Member role updated
 * "checkin.create"           — Attendance check-in created
 * "checkin.delete"           — Attendance check-in deleted
 * "package.unlock"           — Package instance manually unlocked (admin override)
 * "package.refund"           — Package instance refunded / cancelled
 * "appointment.created"      — Appointment record inserted
 * "appointment.status_changed" — Appointment status transition (e.g. pending → confirmed → completed → cancelled)
 * "installment.paid"         — Installment payment confirmed by admin
 * "promotion.create"         — Promotion created
 * "promotion.deactivate"     — Promotion deactivated
 * "tax.set_default"          — Default tax rate changed
 */

import { eq, and, inArray, isNull, or, gte, lte, desc } from "drizzle-orm";
import { auditLogs } from "@avantej-core/db/schema/tenant/audit-logs";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;
// Drizzle transaction type: same shape as base DB client within a tx callback
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

// -------------------------------------------------------------------------
// Write helper
// -------------------------------------------------------------------------

export interface WriteAuditParams {
	actorUserId: string;
	actorMemberId?: string;
	actorRole?: string;
	action: string;       // see canonical vocabulary at top of file
	entityType: string;
	entityId?: string;
	branchId?: string;
	summary: string;
	changes?: Record<string, unknown>;
	ipAddress?: string;
	userAgent?: string;
}

/**
 * Write an audit log row inside a tenant DB transaction (or base DB if no tx is open).
 *
 * CRITICAL CONTRACT: always call this with the active transaction `tx`, not the base
 * `tenantDb`. If the surrounding data change rolls back, the audit row rolls back with it.
 * Callers that cannot use a tx (e.g., MembershipService dual-writes) should call with
 * `tenantDb` and document the deviation in a code comment.
 */
export async function writeAudit(
	db: TenantDb | TenantTx,
	params: WriteAuditParams,
): Promise<void> {
	await db.insert(auditLogs).values({
		actorUserId: params.actorUserId,
		actorMemberId: params.actorMemberId ?? null,
		actorRole: params.actorRole ?? null,
		action: params.action,
		entityType: params.entityType,
		entityId: params.entityId ?? null,
		branchId: params.branchId ?? null,
		summary: params.summary,
		changes: params.changes ?? null,
		ipAddress: params.ipAddress ?? null,
		userAgent: params.userAgent ?? null,
	});
}

// -------------------------------------------------------------------------
// Read helper
// -------------------------------------------------------------------------

export interface ListAuditParams {
	actorUserId?: string;
	action?: string | string[];
	entityType?: string;
	entityId?: string;
	branchId?: string;
	from?: Date;
	to?: Date;
	accessibleNodeIds: string[];
	limit?: number;
	offset?: number;
}

export interface AuditRowEnriched {
	id: string;
	actorUserId: string;
	actorMemberId: string | null;
	actorRole: string | null;
	actorName: string | null;    // enriched from control panel
	action: string;
	entityType: string;
	entityId: string | null;
	branchId: string | null;
	summary: string;
	changes: unknown;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: Date;
}

/**
 * List audit log rows with optional filters and RBAC scoping.
 *
 * RBAC rule:
 * - Rows with a branchId must have branchId in accessibleNodeIds, OR
 * - Rows with branchId IS NULL (system-wide) are visible to all with the permission.
 *
 * Actor names are enriched from the control panel DB (best-effort; null on failure).
 */
export async function listAudit(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	params: ListAuditParams,
): Promise<{ rows: AuditRowEnriched[]; total: number }> {
	const { actorUserId, action, entityType, entityId, branchId, from, to, accessibleNodeIds, limit = 100, offset = 0 } = params;

	// Build filter conditions
	const conditions = [];

	// RBAC: branchId must be in accessibleNodeIds OR null (system-wide)
	if (accessibleNodeIds.length > 0) {
		conditions.push(
			// biome-ignore lint/style/noNonNullAssertion: or() with explicit args is never undefined
			or(
				isNull(auditLogs.branchId),
				inArray(auditLogs.branchId, accessibleNodeIds),
			)!,
		);
	} else {
		// No accessible nodes: only show system-wide rows (branchId IS NULL)
		conditions.push(isNull(auditLogs.branchId));
	}

	if (actorUserId) {
		conditions.push(eq(auditLogs.actorUserId, actorUserId));
	}

	if (action) {
		if (Array.isArray(action)) {
			if (action.length > 0) {
				conditions.push(inArray(auditLogs.action, action));
			}
		} else {
			conditions.push(eq(auditLogs.action, action));
		}
	}

	if (entityType) {
		conditions.push(eq(auditLogs.entityType, entityType));
	}

	if (entityId) {
		conditions.push(eq(auditLogs.entityId, entityId));
	}

	if (branchId) {
		conditions.push(eq(auditLogs.branchId, branchId));
	}

	if (from) {
		conditions.push(gte(auditLogs.createdAt, from));
	}

	if (to) {
		conditions.push(lte(auditLogs.createdAt, to));
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;

	// Fetch paginated rows
	const rows = await tenantDb.query.auditLogs.findMany({
		where,
		orderBy: [desc(auditLogs.createdAt)],
		limit: Math.min(limit, 200),
		offset,
	});

	// Fetch total count
	const allRows = await tenantDb.query.auditLogs.findMany({
		where,
		columns: { id: true },
	});
	const total = allRows.length;

	// Enrich actor names from control panel DB (best-effort)
	const distinctActorIds = [...new Set(rows.map((r) => r.actorUserId))];
	const actorNameMap = new Map<string, string>();

	if (distinctActorIds.length > 0) {
		try {
			const users = await controlPanelDb.query.user.findMany({
				where: (users, { inArray: inArr }) => inArr(users.id, distinctActorIds),
				columns: { id: true, name: true },
			});
			for (const u of users) {
				actorNameMap.set(u.id, u.name);
			}
		} catch {
			// Best-effort: if control panel is unavailable, leave names null
		}
	}

	const enriched: AuditRowEnriched[] = rows.map((row) => ({
		id: row.id,
		actorUserId: row.actorUserId,
		actorMemberId: row.actorMemberId,
		actorRole: row.actorRole,
		actorName: actorNameMap.get(row.actorUserId) ?? null,
		action: row.action,
		entityType: row.entityType,
		entityId: row.entityId,
		branchId: row.branchId,
		summary: row.summary,
		changes: row.changes,
		ipAddress: row.ipAddress,
		userAgent: row.userAgent,
		createdAt: row.createdAt,
	}));

	return { rows: enriched, total };
}

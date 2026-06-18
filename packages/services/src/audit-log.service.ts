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
 * "email_domain.registered"  — Sending domain registered at Resend (email settings)
 * "email_domain.deleted"     — Sending domain removed (email settings)
 * "email_route.changed"      — Notification routing updated (email settings)
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
// Severity helpers
// -------------------------------------------------------------------------

/**
 * Derived severity tiers for audit log actions.
 *
 * danger  — destructive / irreversible actions (voids, deactivations, refunds)
 * warning — mutations that change state but are recoverable
 * info    — everything else (creates, reads, system events)
 */
export type AuditSeverity = "info" | "warning" | "danger";

const DANGER_ACTIONS = new Set([
	"refund.approve",
	"refund.approve.partial",
	"sale.refund.approve",
	"sale.void",
	"role.delete",
	"commission.void",
	"member.deactivate",
	"package.terminate",
	"package.refund",
	"email_domain.deleted",
]);

const WARNING_ACTIONS = new Set([
	"refund.reject",
	"sale.refund.reject",
	"sale.update",
	"commission.mark_paid",
	"commission.approve",
	"role.update",
	"member.update",
]);

export function getActionSeverity(action: string): AuditSeverity {
	if (DANGER_ACTIONS.has(action)) return "danger";
	if (WARNING_ACTIONS.has(action)) return "warning";
	return "info";
}

/** Alias exported for test files. */
export const deriveSeverity = getActionSeverity;

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
	severity?: AuditSeverity;
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
	actorInitials: string | null; // enriched from control panel
	action: string;
	severity: AuditSeverity;
	entityType: string;
	entityId: string | null;
	branchId: string | null;
	summary: string;
	changes: unknown;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: Date;
}

// Severity-to-actions mapping (inverse of the sets above) for SQL IN filtering.
function getSeverityActions(): { danger: string[]; warning: string[] } {
	return {
		danger: [...DANGER_ACTIONS],
		warning: [...WARNING_ACTIONS],
	};
}

/**
 * Derive actorInitials from a display name.
 * "John Doe" → "JD", "Alice" → "A", "" → null.
 */
function deriveInitials(name: string): string | null {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return null;
	if (parts.length === 1) return (parts[0]![0] ?? "").toUpperCase() || null;
	return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase() || null;
}

/**
 * List audit log rows with optional filters and RBAC scoping.
 *
 * RBAC rule:
 * - Rows with a branchId must have branchId in accessibleNodeIds, OR
 * - Rows with branchId IS NULL (system-wide) are visible to all with the permission.
 *
 * Severity filtering is done post-query in memory (no severity column in DB;
 * derived from the action string). For small result sets (≤200) this is cheap.
 *
 * Actor names are enriched from the control panel DB (best-effort; null on failure).
 * One batch lookup per page — never N+1.
 */
export async function listAudit(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	params: ListAuditParams,
): Promise<{ rows: AuditRowEnriched[]; total: number }> {
	const { actorUserId, action, entityType, entityId, branchId, from, to, severity, accessibleNodeIds, limit = 100, offset = 0 } = params;

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

	// Severity filter: translate to action IN (...) or NOT IN (...) clauses
	if (severity) {
		const { danger: dangerActions, warning: warningActions } = getSeverityActions();
		if (severity === "danger") {
			conditions.push(inArray(auditLogs.action, dangerActions));
		} else if (severity === "warning") {
			conditions.push(inArray(auditLogs.action, warningActions));
		} else {
			// info = everything that is NOT danger and NOT warning
			const excludedActions = [...dangerActions, ...warningActions];
			if (excludedActions.length > 0) {
				// Drizzle does not expose notInArray from the same import path in all versions;
				// use explicit OR of NOT conditions via sql template.
				// Simpler: fetch all and post-filter (limit is already capped at 200).
				// We handle this post-query below — skip the SQL clause here.
			}
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

	// Fetch paginated rows (over-fetch when severity=info to account for post-filter loss)
	const fetchLimit = severity === "info" ? Math.min(limit * 3, 600) : Math.min(limit, 200);
	const fetchOffset = severity === "info" ? 0 : offset; // info needs full scan with post-filter

	const rows = await tenantDb.query.auditLogs.findMany({
		where,
		orderBy: [desc(auditLogs.createdAt)],
		limit: fetchLimit,
		offset: fetchOffset,
	});

	// Fetch total count (pre-severity-filter; consistent with non-severity pagination)
	const allRows = await tenantDb.query.auditLogs.findMany({
		where,
		columns: { id: true },
	});
	let total = allRows.length;

	// Post-filter for severity (action-based, done in memory)
	let filteredRows = rows;
	if (severity) {
		filteredRows = rows.filter((r) => getActionSeverity(r.action) === severity);
		// Total reflects pre-severity count (allRows only has id column; action not available).
		// This is an acceptable approximation — severity filter is best-effort for display.
		total = allRows.length;
		// Apply offset/limit after post-filter
		if (severity === "info") {
			filteredRows = filteredRows.slice(offset, offset + limit);
		} else {
			filteredRows = filteredRows.slice(0, limit);
		}
	}

	// Enrich actor names from control panel DB — ONE batch per page (never N+1)
	const distinctActorIds = [...new Set(filteredRows.map((r) => r.actorUserId))];
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

	const enriched: AuditRowEnriched[] = filteredRows.map((row) => {
		const name = actorNameMap.get(row.actorUserId) ?? null;
		return {
			id: row.id,
			actorUserId: row.actorUserId,
			actorMemberId: row.actorMemberId,
			actorRole: row.actorRole,
			actorName: name,
			actorInitials: name ? deriveInitials(name) : null,
			action: row.action,
			severity: getActionSeverity(row.action),
			entityType: row.entityType,
			entityId: row.entityId,
			branchId: row.branchId,
			summary: row.summary,
			changes: row.changes,
			ipAddress: row.ipAddress,
			userAgent: row.userAgent,
			createdAt: row.createdAt,
		};
	});

	return { rows: enriched, total };
}

// -------------------------------------------------------------------------
// CSV export helper
// -------------------------------------------------------------------------

export interface ExportAuditCsvParams extends Omit<ListAuditParams, "limit" | "offset"> {
	/** Maximum rows to export. Hard-capped at 50_000. */
	maxRows?: number;
}

export interface ExportAuditCsvResult {
	csv: string;
	truncated: boolean;
	totalMatching: number;
}

const CSV_HARD_CAP = 50_000;
const CSV_CHUNK_SIZE = 500;

const CSV_HEADERS = [
	"id",
	"createdAt",
	"actorUserId",
	"actorName",
	"actorRole",
	"action",
	"severity",
	"entityType",
	"entityId",
	"branchId",
	"summary",
	"ipAddress",
].join(",");

function escapeCsv(val: unknown): string {
	if (val === null || val === undefined) return "";
	const str = String(val);
	// Wrap in quotes if contains comma, quote, or newline
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function rowToCsv(row: AuditRowEnriched): string {
	return [
		row.id,
		row.createdAt.toISOString(),
		row.actorUserId,
		row.actorName ?? "",
		row.actorRole ?? "",
		row.action,
		row.severity,
		row.entityType,
		row.entityId ?? "",
		row.branchId ?? "",
		row.summary,
		row.ipAddress ?? "",
	]
		.map(escapeCsv)
		.join(",");
}

/**
 * Export audit log rows as CSV.
 *
 * Cursor-paginates in chunks of 500 rows. Hard cap at 50_000 rows.
 * Returns truncated=true if the result was capped.
 *
 * RBAC: callers must check audit_log:read before calling this.
 */
export async function exportAuditCsv(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	params: ExportAuditCsvParams,
): Promise<ExportAuditCsvResult> {
	const maxRows = Math.min(params.maxRows ?? CSV_HARD_CAP, CSV_HARD_CAP);

	const allCsvLines: string[] = [CSV_HEADERS];
	let offset = 0;
	let totalMatching = 0;
	let truncated = false;

	// First pass: get total count
	const { total } = await listAudit(controlPanelDb, tenantDb, {
		...params,
		limit: 1,
		offset: 0,
	});
	totalMatching = total;

	// Cursor-paginate in chunks
	while (offset < Math.min(totalMatching, maxRows)) {
		const chunkSize = Math.min(CSV_CHUNK_SIZE, maxRows - offset);

		const { rows: chunk } = await listAudit(controlPanelDb, tenantDb, {
			...params,
			limit: chunkSize,
			offset,
		});

		if (chunk.length === 0) break;

		for (const row of chunk) {
			allCsvLines.push(rowToCsv(row));
		}

		offset += chunk.length;

		if (offset >= maxRows && totalMatching > maxRows) {
			truncated = true;
			break;
		}
	}

	return {
		csv: allCsvLines.join("\n"),
		truncated,
		totalMatching,
	};
}

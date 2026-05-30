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

import { eq, and, inArray, isNull, or, gte, lte, desc, sql } from "drizzle-orm";
import { auditLogs } from "@avantej-core/db/schema/tenant/audit-logs";
import { userActivityLog } from "@avantej-core/db/schema/tenant/user-activity-log";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { members } from "@avantej-core/db/schema/tenant/members";
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
	action: string; // see canonical vocabulary at top of file
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
	actorName: string | null; // enriched from control panel
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
	return (
		(
			(parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")
		).toUpperCase() || null
	);
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
	const {
		actorUserId,
		action,
		entityType,
		entityId,
		branchId,
		from,
		to,
		severity,
		accessibleNodeIds,
		limit = 100,
		offset = 0,
	} = params;

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

	// NAP-06: Severity filter — push SQL-level action filter into the WHERE clause so
	// the `total` count reflects the filtered set, not the unfiltered set.
	// "info" = every action NOT in danger or warning sets; we express this as a
	// NOT IN clause so the DB handles it rather than a post-query memory filter.
	if (severity) {
		const { danger: dangerActions, warning: warningActions } =
			getSeverityActions();
		if (severity === "danger") {
			conditions.push(inArray(auditLogs.action, dangerActions));
		} else if (severity === "warning") {
			conditions.push(inArray(auditLogs.action, warningActions));
		} else {
			// info = every action that is NOT danger and NOT warning.
			// We use a raw SQL NOT IN rather than Drizzle notInArray to stay
			// compatible with all Drizzle versions without conditional imports.
			const excludedActions = [...dangerActions, ...warningActions];
			if (excludedActions.length > 0) {
				// Build a parameterised NOT IN using sql template tag.
				conditions.push(
					sql`${auditLogs.action} NOT IN (${sql.join(
						excludedActions.map((a) => sql`${a}`),
						sql`, `,
					)})`,
				);
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

	// NAP-06: severity filter is now part of `where` (pushed into SQL above), so
	// a single query path handles all filter combinations correctly.
	// Both the paginated fetch AND the count query use the same `where` clause —
	// `total` therefore always reflects the filtered set, not the unfiltered set.

	const rows = await tenantDb.query.auditLogs.findMany({
		where,
		orderBy: [desc(auditLogs.createdAt)],
		limit: Math.min(limit, 200),
		offset,
	});

	// Total count: use a lightweight id-only scan with the same `where` predicate.
	const allRows = await tenantDb.query.auditLogs.findMany({
		where,
		columns: { id: true },
	});
	const total = allRows.length;

	const filteredRows = rows;

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

export interface ExportAuditCsvParams
	extends Omit<ListAuditParams, "limit" | "offset"> {
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

// -------------------------------------------------------------------------
// Customer log feed — merged audit + activity stream
// -------------------------------------------------------------------------

export interface CustomerLogEntry {
	id: string;
	source: "audit" | "activity";
	createdAt: Date;
	summary: string;
	action: string | null; // audit: action string; activity: activityType
	severity: AuditSeverity | null; // audit only
	entityType: string | null; // audit only
	entityId: string | null; // audit only
	actorName: string | null; // audit only
	actorInitials: string | null; // audit only
	description: string | null; // activity only
	icon: string | null; // activity only
	creditsChange: number | null; // activity only
}

export interface ListCustomerLogsParams {
	memberId: string; // customers members.id (UUID) — used for audit entityId filter
	memberUserId: string; // customers members.userId — used for activity log userId filter
	accessibleNodeIds: string[];
	limit?: number;
	offset?: number;
}

export async function listCustomerLogs(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	params: ListCustomerLogsParams,
): Promise<{ rows: CustomerLogEntry[]; total: number }> {
	const {
		memberId,
		memberUserId,
		accessibleNodeIds,
		limit = 50,
		offset = 0,
	} = params;

	// Resolve the member's trainer PK (needed for appointment.trainerId filter)
	const memberRow = await tenantDb.query.members.findFirst({
		where: eq(members.id, memberId),
		columns: { id: true },
	});

	// Step 1: collect all entity IDs belonging to this customer in parallel
	const [pkgRows, orderRows, apptRows] = await Promise.all([
		// Package instances where clientId = customer's userId
		tenantDb
			.select({ id: packageInstances.id })
			.from(packageInstances)
			.where(eq(packageInstances.clientId, memberUserId)),
		// Sales orders where customerId = customer's userId
		tenantDb
			.select({ id: salesOrders.id })
			.from(salesOrders)
			.where(
				and(
					eq(salesOrders.customerId, memberUserId),
					eq(salesOrders.customerType, "member"),
				),
			),
		// Appointments where userId = customer's userId (member-app bookings) OR trainerId = member.id (trainer view)
		memberRow
			? tenantDb
					.select({ id: appointments.id })
					.from(appointments)
					.where(eq(appointments.userId, memberUserId))
			: Promise.resolve([]),
	]);

	// Build the complete set of entity IDs to match against audit_logs
	const entityIds = [
		memberId, // member entity (profile, deactivate, etc.)
		...pkgRows.map((r) => r.id), // package_instance actions
		...orderRows.map((r) => r.id), // sales_order actions
		...apptRows.map((r) => r.id), // appointment actions
	];

	// Step 2: build RBAC scope condition
	const rbacCondition =
		accessibleNodeIds.length > 0
			? // biome-ignore lint/style/noNonNullAssertion: or() with explicit args is never undefined
				or(
					isNull(auditLogs.branchId),
					inArray(auditLogs.branchId, accessibleNodeIds),
				)!
			: isNull(auditLogs.branchId);

	// Step 3: fetch audit rows + user activity in parallel
	const [auditRows, activityRows] = await Promise.all([
		tenantDb.query.auditLogs.findMany({
			where: and(inArray(auditLogs.entityId, entityIds), rbacCondition),
			orderBy: [desc(auditLogs.createdAt)],
			limit: 500,
		}),
		tenantDb.query.userActivityLog.findMany({
			where: eq(userActivityLog.userId, memberUserId),
			orderBy: [desc(userActivityLog.createdAt)],
			limit: 500,
		}),
	]);

	// Enrich actor names from control panel DB (batch, not N+1)
	const actorIds = [...new Set(auditRows.map((r) => r.actorUserId))];
	const actorNameMap = new Map<string, string>();
	if (actorIds.length > 0) {
		try {
			const users = await controlPanelDb.query.user.findMany({
				where: (u, { inArray: inArr }) => inArr(u.id, actorIds),
				columns: { id: true, name: true },
			});
			for (const u of users) actorNameMap.set(u.id, u.name);
		} catch {
			// CP DB unavailable — leave names null
		}
	}

	// Map to unified CustomerLogEntry
	const auditEntries: CustomerLogEntry[] = auditRows.map((r) => {
		const name = actorNameMap.get(r.actorUserId) ?? null;
		return {
			id: r.id,
			source: "audit",
			createdAt: r.createdAt,
			summary: r.summary,
			action: r.action,
			severity: getActionSeverity(r.action),
			entityType: r.entityType,
			entityId: r.entityId,
			actorName: name,
			actorInitials: name ? deriveInitials(name) : null,
			description: null,
			icon: null,
			creditsChange: null,
		};
	});

	const activityEntries: CustomerLogEntry[] = activityRows.map((r) => ({
		id: r.id,
		source: "activity",
		createdAt: r.createdAt,
		summary: r.title,
		action: r.activityType,
		severity: null,
		entityType: r.relatedType ?? null,
		entityId: r.relatedId ?? null,
		actorName: null,
		actorInitials: null,
		description: r.description ?? null,
		icon: r.icon ?? null,
		creditsChange: r.creditsChange ?? null,
	}));

	// Merge and sort descending by createdAt
	const all = [...auditEntries, ...activityEntries].sort(
		(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
	);

	const total = all.length;
	const rows = all.slice(offset, offset + limit);

	return { rows, total };
}

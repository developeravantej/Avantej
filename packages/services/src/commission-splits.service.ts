/**
 * Commission Splits Service
 *
 * Manages the lifecycle of commission splits:
 *   pending → approved → paid
 *   (any status) → void
 *
 * Two creation paths:
 *   1. Appointment completed  → createCommissionSplitsForAppointment (called by appointment.service)
 *   2. POS sale with salesperson → createCommissionSplit (called by pos.service)
 *
 * NOTE (Open Question 6 — Phase 6): Appointment-based commission creation requires a
 * service commission config table or column (serviceCommissionConfig / services.commissionPercentage).
 * Neither exists in the current schema. The hook in appointment.service is scaffolded but will
 * silently no-op until the config is added. See plan §6.11 risk note and execute/log.md.
 *
 * staffId convention: always the member's cross-DB userId (i.e. members.userId), NOT member.id.
 * Frontend and callers must send userId — not the tenant member table PK.
 */

import {
	and,
	desc,
	eq,
	gte,
	inArray,
	lte,
} from "drizzle-orm";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { ORPCError } from "@orpc/server";
import { writeAudit } from "./audit-log.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CommissionSplit = typeof commissionSplits.$inferSelect;

// ---------------------------------------------------------------------------
// Existing read functions (unchanged)
// ---------------------------------------------------------------------------

export async function listCommissionSplits(
	tenantDb: TenantDb,
	params: {
		memberId?: string;
		appointmentId?: string;
		from?: Date;
		to?: Date;
		limit?: number;
		offset?: number;
	} = {},
) {
	const { memberId, appointmentId, from, to, limit = 50, offset = 0 } = params;

	const conditions = [];

	if (memberId) {
		conditions.push(eq(commissionSplits.staffId, memberId));
	}

	if (appointmentId) {
		conditions.push(eq(commissionSplits.appointmentId, appointmentId));
	}

	if (from) {
		conditions.push(gte(commissionSplits.createdAt, from));
	}

	if (to) {
		conditions.push(lte(commissionSplits.createdAt, to));
	}

	const query = tenantDb
		.select()
		.from(commissionSplits)
		.orderBy(desc(commissionSplits.createdAt))
		.limit(limit)
		.offset(offset);

	if (conditions.length > 0) {
		return query.where(and(...conditions));
	}

	return query;
}

export async function getCommissionsByAppointment(
	tenantDb: TenantDb,
	appointmentId: string,
) {
	return tenantDb
		.select()
		.from(commissionSplits)
		.where(eq(commissionSplits.appointmentId, appointmentId))
		.orderBy(desc(commissionSplits.calculatedAmount));
}

export async function getMyCommissions(
	tenantDb: TenantDb,
	memberId: string,
	params: {
		from?: Date;
		to?: Date;
	} = {},
) {
	const { from, to } = params;

	const conditions = [eq(commissionSplits.staffId, memberId)];

	if (from) {
		conditions.push(gte(commissionSplits.createdAt, from));
	}

	if (to) {
		conditions.push(lte(commissionSplits.createdAt, to));
	}

	const splits = await tenantDb
		.select()
		.from(commissionSplits)
		.where(and(...conditions))
		.orderBy(desc(commissionSplits.createdAt));

	const totalAmount = splits.reduce(
		(sum, s) => sum + (s.calculatedAmount ?? 0),
		0,
	);

	return { splits, totalAmount };
}

// ---------------------------------------------------------------------------
// Write helpers — new in Phase 6
// ---------------------------------------------------------------------------

export interface CreateSplitParams {
	/** Exactly one of appointmentId or salesOrderId must be set */
	appointmentId?: string;
	salesOrderId?: string;
	/**
	 * staffId = members.userId (cross-DB user ID), NOT the tenant member table PK.
	 * Consistent with appointmentStaff.staffId and payouts.recipientId conventions.
	 */
	staffId: string;
	splitPercentage: number; // 0–100
	calculatedAmountCents: number; // pre-tax, integer cents
	notes?: string;
	actor: { userId: string; memberId: string; role: string };
}

/**
 * Insert a single commission split with status='pending'.
 * Idempotent: if a split already exists for the same (appointment_id, staff_id) or
 * (sales_order_id, staff_id), the duplicate is silently ignored and the existing row
 * is returned. Uses onConflictDoNothing rather than error-code parsing.
 * Writes audit inside the same transaction.
 */
export async function createCommissionSplit(
	db: TenantDb | TenantTx,
	params: CreateSplitParams,
): Promise<CommissionSplit> {
	const {
		appointmentId,
		salesOrderId,
		staffId,
		splitPercentage,
		calculatedAmountCents,
		notes,
		actor,
	} = params;

	if (!appointmentId && !salesOrderId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "createCommissionSplit: exactly one of appointmentId or salesOrderId is required",
		});
	}
	if (appointmentId && salesOrderId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "createCommissionSplit: cannot set both appointmentId and salesOrderId",
		});
	}

	const [inserted] = await (db as TenantDb)
		.insert(commissionSplits)
		.values({
			appointmentId: appointmentId ?? null,
			salesOrderId: salesOrderId ?? null,
			staffId,
			splitPercentage,
			calculatedAmount: calculatedAmountCents,
			notes: notes ?? null,
			status: "pending",
		})
		.onConflictDoNothing()
		.returning();

	if (inserted) {
		// New row was created — write audit
		await writeAudit(db as TenantDb, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "commission.create",
			entityType: "commission_split",
			entityId: inserted.id,
			branchId: undefined,
			summary: `Commission split created for staff ${staffId} — ${calculatedAmountCents} cents (${splitPercentage}%)`,
			changes: {
				appointmentId: appointmentId ?? null,
				salesOrderId: salesOrderId ?? null,
				staffId,
				splitPercentage,
				calculatedAmountCents,
			},
		});
		return inserted;
	}

	// Conflict: row already exists — fetch and return it
	const existing = appointmentId
		? await (db as TenantDb).query.commissionSplits.findFirst({
				where: and(
					eq(commissionSplits.appointmentId, appointmentId),
					eq(commissionSplits.staffId, staffId),
				),
			})
		: await (db as TenantDb).query.commissionSplits.findFirst({
				where: and(
					eq(commissionSplits.salesOrderId, salesOrderId!),
					eq(commissionSplits.staffId, staffId),
				),
			});

	if (!existing) {
		throw new Error(
			"createCommissionSplit: conflict resolution failed — existing row not found",
		);
	}
	return existing;
}

export interface CreateSplitsForAppointmentParams {
	appointmentId: string;
	splits: Array<{
		staffId: string; // members.userId (cross-DB)
		splitPercentage: number;
		sessionTotalCents: number;
		notes?: string;
	}>;
	actor: { userId: string; memberId: string; role: string };
}

/**
 * Batch helper: create one commission split per staff member for an appointment.
 * calculatedAmount per split = sessionTotal × splitPercentage / 100 (integer cents).
 * Idempotent via createCommissionSplit's onConflictDoNothing.
 */
export async function createCommissionSplitsForAppointment(
	db: TenantDb | TenantTx,
	params: CreateSplitsForAppointmentParams,
): Promise<CommissionSplit[]> {
	const results: CommissionSplit[] = [];
	for (const split of params.splits) {
		const calculatedAmountCents = Math.floor(
			(split.sessionTotalCents * split.splitPercentage) / 100,
		);
		const row = await createCommissionSplit(db, {
			appointmentId: params.appointmentId,
			staffId: split.staffId,
			splitPercentage: split.splitPercentage,
			calculatedAmountCents,
			notes: split.notes,
			actor: params.actor,
		});
		results.push(row);
	}
	return results;
}

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

/**
 * Bulk approve pending commission splits.
 * All ids must be status='pending'. Any non-pending id causes BAD_REQUEST.
 * Writes one audit row per split inside the supplied db connection.
 */
export async function approveCommissionSplits(
	tenantDb: TenantDb,
	ids: string[],
	actor: { userId: string; memberId: string; role: string },
): Promise<CommissionSplit[]> {
	if (ids.length === 0) return [];

	const existing = await tenantDb
		.select()
		.from(commissionSplits)
		.where(inArray(commissionSplits.id, ids));

	const nonPending = existing.filter((r) => r.status !== "pending");
	if (nonPending.length > 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Cannot approve: ${nonPending.length} split(s) are not in 'pending' status (ids: ${nonPending.map((r) => r.id).join(", ")})`,
		});
	}

	const now = new Date();
	const updated = await tenantDb
		.update(commissionSplits)
		.set({
			status: "approved",
			approvedBy: actor.userId,
			approvedAt: now,
			updatedAt: now,
		})
		.where(inArray(commissionSplits.id, ids))
		.returning();

	// Audit per row inside the same connection
	for (const row of updated) {
		await writeAudit(tenantDb, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "commission.approve",
			entityType: "commission_split",
			entityId: row.id,
			summary: `Commission split approved for staff ${row.staffId} — ${row.calculatedAmount} cents`,
			changes: { previousStatus: "pending", newStatus: "approved" },
		});
	}

	return updated;
}

export interface MarkPaidParams {
	payoutId?: string;
	actor: { userId: string; memberId: string; role: string };
}

/**
 * Bulk mark approved commission splits as paid.
 * All ids must be status='approved'. Any non-approved id causes BAD_REQUEST.
 * Optionally links a payoutId to each split.
 */
export async function markCommissionSplitsPaid(
	tenantDb: TenantDb,
	ids: string[],
	params: MarkPaidParams,
): Promise<CommissionSplit[]> {
	if (ids.length === 0) return [];

	const existing = await tenantDb
		.select()
		.from(commissionSplits)
		.where(inArray(commissionSplits.id, ids));

	const nonApproved = existing.filter((r) => r.status !== "approved");
	if (nonApproved.length > 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Cannot mark paid: ${nonApproved.length} split(s) are not in 'approved' status (ids: ${nonApproved.map((r) => r.id).join(", ")})`,
		});
	}

	const now = new Date();
	const updated = await tenantDb
		.update(commissionSplits)
		.set({
			status: "paid",
			paidBy: params.actor.userId,
			paidAt: now,
			...(params.payoutId !== undefined && { payoutId: params.payoutId }),
			updatedAt: now,
		})
		.where(inArray(commissionSplits.id, ids))
		.returning();

	for (const row of updated) {
		await writeAudit(tenantDb, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "commission.mark_paid",
			entityType: "commission_split",
			entityId: row.id,
			summary: `Commission split marked paid for staff ${row.staffId} — ${row.calculatedAmount} cents`,
			changes: {
				previousStatus: "approved",
				newStatus: "paid",
				payoutId: params.payoutId ?? null,
			},
		});
	}

	return updated;
}

/**
 * Void a commission split from any status.
 * Appends reason to notes. Writes audit.
 */
export async function voidCommissionSplit(
	tenantDb: TenantDb,
	id: string,
	reason: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<CommissionSplit> {
	const existing = await tenantDb.query.commissionSplits.findFirst({
		where: eq(commissionSplits.id, id),
	});

	if (!existing) {
		throw new ORPCError("NOT_FOUND", {
			message: `Commission split not found: ${id}`,
		});
	}

	if (existing.status === "void") {
		throw new ORPCError("BAD_REQUEST", {
			message: `Commission split ${id} is already void`,
		});
	}

	const now = new Date();
	const previousStatus = existing.status;
	const updatedNotes = existing.notes
		? `${existing.notes}\nVoid reason: ${reason}`
		: `Void reason: ${reason}`;

	const [updated] = await tenantDb
		.update(commissionSplits)
		.set({
			status: "void",
			notes: updatedNotes,
			updatedAt: now,
		})
		.where(eq(commissionSplits.id, id))
		.returning();

	if (!updated) throw new Error("voidCommissionSplit: update returned no row");

	await writeAudit(tenantDb, {
		actorUserId: actor.userId,
		actorMemberId: actor.memberId,
		actorRole: actor.role,
		action: "commission.void",
		entityType: "commission_split",
		entityId: id,
		summary: `Commission split voided for staff ${existing.staffId} — reason: ${reason}`,
		changes: { previousStatus, newStatus: "void", reason },
	});

	return updated;
}

// ---------------------------------------------------------------------------
// Ledger query
// ---------------------------------------------------------------------------

export interface CommissionLedgerRow extends CommissionSplit {
	staffName: string | null; // enriched from control panel (best-effort)
	appointmentNumber: string | null; // appointment.id (no number field)
	salesOrderNumber: string | null; // sales_orders.salesOrderNumber
	branchId: string | null; // from appointment.branchId or salesOrders.branchId
}

export interface CommissionLedgerResult {
	rows: CommissionLedgerRow[];
	total: number;
	totals: {
		pending: number; // sum of calculatedAmount for status=pending (cents)
		approved: number; // sum of calculatedAmount for status=approved (cents)
		paid: number; // sum of calculatedAmount for status=paid (cents)
	};
}

export interface ListCommissionLedgerParams {
	status?: "pending" | "approved" | "paid" | "void" | "all";
	staffId?: string;
	branchId?: string;
	from?: Date;
	to?: Date;
	accessibleNodeIds: string[];
	limit?: number;
	offset?: number;
}

/**
 * List commission splits with enriched ledger data.
 *
 * RBAC scoping:
 * - Appointment-based splits: appointment.branchId must be in accessibleNodeIds.
 * - SalesOrder-based splits: salesOrder.branchId must be in accessibleNodeIds.
 * Returns the union of both sets.
 *
 * Staff names are enriched from control panel DB (best-effort; null on failure).
 */
export async function listCommissionLedger(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: ListCommissionLedgerParams,
): Promise<CommissionLedgerResult> {
	const {
		status,
		staffId,
		branchId,
		from,
		to,
		accessibleNodeIds,
		limit = 100,
		offset = 0,
	} = params;

	// Build filter conditions
	const conditions: ReturnType<typeof eq>[] = [];

	if (status && status !== "all") {
		conditions.push(eq(commissionSplits.status, status));
	}

	if (staffId) {
		conditions.push(eq(commissionSplits.staffId, staffId));
	}

	if (from) {
		conditions.push(gte(commissionSplits.createdAt, from));
	}

	if (to) {
		conditions.push(lte(commissionSplits.createdAt, to));
	}

	// Fetch raw splits with appointment and sales order joins for branchId + numbers
	const allSplits = await tenantDb
		.select({
			split: commissionSplits,
			appointmentId: appointments.id,
			appointmentBranchId: appointments.branchId,
			salesOrderId: salesOrders.id,
			salesOrderNumber: salesOrders.salesOrderNumber,
			salesOrderBranchId: salesOrders.branchId,
		})
		.from(commissionSplits)
		.leftJoin(appointments, eq(commissionSplits.appointmentId, appointments.id))
		.leftJoin(salesOrders, eq(commissionSplits.salesOrderId, salesOrders.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(commissionSplits.createdAt));

	// Apply RBAC filtering + optional branchId filter
	const scopedSplits = allSplits.filter((row) => {
		// Determine the effective branchId for this split
		const effectiveBranch =
			row.appointmentBranchId ?? row.salesOrderBranchId ?? null;

		// RBAC: must be in accessible nodes (or no restriction if admin sees all)
		if (accessibleNodeIds.length > 0) {
			if (!effectiveBranch || !accessibleNodeIds.includes(effectiveBranch)) {
				return false;
			}
		}

		// Optional branchId filter
		if (branchId && effectiveBranch !== branchId) {
			return false;
		}

		return true;
	});

	const total = scopedSplits.length;

	// Pagination
	const paginated = scopedSplits.slice(offset, offset + limit);

	// Enrich staff names from control panel (best-effort)
	const distinctStaffIds = [...new Set(paginated.map((r) => r.split.staffId))];
	const staffNameMap = new Map<string, string>();

	if (distinctStaffIds.length > 0) {
		try {
			const { user } = await import("@avantej-core/db/schema/auth");
			const { inArray: inArr } = await import("drizzle-orm");
			const users = await controlPanelDb
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(inArr(user.id, distinctStaffIds));
			for (const u of users) {
				staffNameMap.set(u.id, u.name);
			}
		} catch {
			// Best-effort: if control panel is unavailable, names remain null
		}
	}

	// Build enriched rows
	const rows: CommissionLedgerRow[] = paginated.map((row) => ({
		...row.split,
		staffName: staffNameMap.get(row.split.staffId) ?? null,
		appointmentNumber: row.appointmentId ?? null,
		salesOrderNumber: row.salesOrderNumber ?? null,
		branchId: row.appointmentBranchId ?? row.salesOrderBranchId ?? null,
	}));

	// Compute totals across ALL scoped rows (not just paginated)
	let pendingTotal = 0;
	let approvedTotal = 0;
	let paidTotal = 0;
	for (const row of scopedSplits) {
		if (row.split.status === "pending")
			pendingTotal += row.split.calculatedAmount;
		else if (row.split.status === "approved")
			approvedTotal += row.split.calculatedAmount;
		else if (row.split.status === "paid") paidTotal += row.split.calculatedAmount;
	}

	return {
		rows,
		total,
		totals: {
			pending: pendingTotal,
			approved: approvedTotal,
			paid: paidTotal,
		},
	};
}

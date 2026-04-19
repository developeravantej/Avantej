/**
 * Refunds Service
 *
 * Unified refund ledger with a four-step lifecycle:
 *   request → approve|reject → process
 *
 * All writes occur inside a single database transaction so audit rows roll
 * back if the data change fails. Never call writeAudit() outside a tx here.
 *
 * Target priority when auto-pulling customer/branch:
 *   salesOrderId > paymentId > packageInstanceId
 */

import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { installmentEvents } from "@avantej-core/db/schema/tenant/installment-events";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { refunds } from "@avantej-core/db/schema/tenant/refunds";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	and,
	count,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	or,
	sql,
	sum,
} from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";

// ---------------------------------------------------------------------------
// Internal type aliases
// ---------------------------------------------------------------------------

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Refund = typeof refunds.$inferSelect;

export interface RequestRefundInput {
	// Target — at least one must be set
	salesOrderId?: string;
	paymentId?: string;
	packageInstanceId?: string;
	// Amount (gross + tax separately; auto-derived from target if omitted)
	amountCents: number;
	taxAmountCents?: number;
	reason: string;
	notes?: string;
	// Customer + branch — service auto-pulls from target if not provided.
	// Pull priority: salesOrderId > paymentId > packageInstanceId
	customerId?: string;
	customerName?: string;
	branchId?: string;
	actor: { userId: string; memberId: string; role: string };
}

export interface ApproveRefundParams {
	reviewNotes?: string;
	actor: { userId: string; memberId: string; role: string };
}

export interface RejectRefundParams {
	reviewNotes: string; // required for rejection
	actor: { userId: string; memberId: string; role: string };
}

export interface ProcessRefundParams {
	refundMethod: "cash" | "card_reversal" | "bank_transfer" | "store_credit";
	refundReference?: string;
	actor: { userId: string; memberId: string; role: string };
}

export interface RefundRowEnriched extends Refund {
	requestedByName: string | null;
	reviewedByName: string | null;
	processedByName: string | null;
}

export interface ListRefundsParams {
	status?:
		| "pending"
		| "approved"
		| "rejected"
		| "processed"
		| "cancelled"
		| "all";
	salesOrderId?: string;
	customerId?: string;
	branchId?: string;
	from?: Date;
	to?: Date;
	accessibleNodeIds: string[];
	limit?: number;
	offset?: number;
}

// ---------------------------------------------------------------------------
// Utility: date formatting for number generation
// ---------------------------------------------------------------------------

function formatDateYYYYMMDD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}

// ---------------------------------------------------------------------------
// Number generators (within tx — count() under same-tx serialization is safe
// for tenant-scale concurrency)
// ---------------------------------------------------------------------------

async function generateRefundNumber(tx: TenantTx, date: Date): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const prefix = `RF-${datePart}-`;
	const result = await tx
		.select({ total: count() })
		.from(refunds)
		.where(sql`${refunds.refundNumber} LIKE ${`${prefix}%`}`);
	const seq = (result[0]?.total ?? 0) + 1;
	return `${prefix}${String(seq).padStart(4, "0")}`;
}

async function generateCancellationNumber(
	tx: TenantTx,
	date: Date,
): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const prefix = `CN-${datePart}-`;
	const result = await tx
		.select({ total: count() })
		.from(salesOrders)
		.where(sql`${salesOrders.cancellationNumber} LIKE ${`${prefix}%`}`);
	const seq = (result[0]?.total ?? 0) + 1;
	return `${prefix}${String(seq).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Pure helper: remaining refundable cap
// ---------------------------------------------------------------------------

/**
 * Compute remaining refundable amount given total and already-refunded.
 * Returns 0 when already fully refunded. Never negative.
 */
export function computeRemainingRefundable(target: {
	totalCents: number;
	alreadyRefundedCents: number;
}): number {
	return Math.max(0, target.totalCents - target.alreadyRefundedCents);
}

// ---------------------------------------------------------------------------
// Internal: compute remaining refundable from DB
// ---------------------------------------------------------------------------

async function computeRemainingBySalesOrder(
	tx: TenantTx | TenantDb,
	salesOrderId: string,
): Promise<{
	totalCents: number;
	remainingCents: number;
	cancelledAmount: number;
}> {
	const order = await (tx as TenantDb).query.salesOrders.findFirst({
		where: (so, { eq: eqFn }) => eqFn(so.id, salesOrderId),
	});
	if (!order)
		throw {
			code: "NOT_FOUND",
			message: `Sales order ${salesOrderId} not found`,
		};

	// Sum approved+processed refunds already recorded against this order
	const existingResult = await (tx as TenantDb)
		.select({ total: sum(refunds.amountCents) })
		.from(refunds)
		.where(
			and(
				eq(refunds.salesOrderId, salesOrderId),
				inArray(refunds.status, ["approved", "processed"]),
			),
		);
	const existingRefundsCents = Number(existingResult[0]?.total ?? 0);

	// Also subtract the legacy cancelledAmount that predates the refunds table
	const legacyCancelledCents = order.cancelledAmount ?? 0;

	const remainingCents = Math.max(
		0,
		order.totalAmount - legacyCancelledCents - existingRefundsCents,
	);

	return {
		totalCents: order.totalAmount,
		remainingCents,
		cancelledAmount: legacyCancelledCents,
	};
}

async function computeRemainingByPayment(
	tx: TenantTx | TenantDb,
	paymentId: string,
): Promise<{ totalCents: number; remainingCents: number }> {
	const payment = await (tx as TenantDb).query.payments.findFirst({
		where: (p, { eq: eqFn }) => eqFn(p.id, paymentId),
	});
	if (!payment)
		throw { code: "NOT_FOUND", message: `Payment ${paymentId} not found` };

	const existingResult = await (tx as TenantDb)
		.select({ total: sum(refunds.amountCents) })
		.from(refunds)
		.where(
			and(
				eq(refunds.paymentId, paymentId),
				inArray(refunds.status, ["approved", "processed"]),
			),
		);
	const existingRefundsCents = Number(existingResult[0]?.total ?? 0);
	const legacyRefundCents = payment.refundAmount ?? 0;

	const remainingCents = Math.max(
		0,
		payment.totalAmount - legacyRefundCents - existingRefundsCents,
	);

	return { totalCents: payment.totalAmount, remainingCents };
}

async function computeRemainingByPackageInstance(
	tx: TenantTx | TenantDb,
	packageInstanceId: string,
): Promise<{ totalCents: number; remainingCents: number }> {
	const instance = await (tx as TenantDb).query.packageInstances.findFirst({
		where: (pi, { eq: eqFn }) => eqFn(pi.id, packageInstanceId),
	});
	if (!instance)
		throw {
			code: "NOT_FOUND",
			message: `Package instance ${packageInstanceId} not found`,
		};

	const totalPrice = instance.totalPrice ?? 0;

	// Legacy manual_refund installment events
	const legacyResult = await (tx as TenantDb)
		.select({ total: sum(installmentEvents.amount) })
		.from(installmentEvents)
		.where(
			and(
				eq(installmentEvents.packageInstanceId, packageInstanceId),
				eq(installmentEvents.eventType, "manual_refund"),
			),
		);
	const legacyManualRefundCents = Number(legacyResult[0]?.total ?? 0);

	// Existing approved/processed refunds in the new refunds table
	const existingResult = await (tx as TenantDb)
		.select({ total: sum(refunds.amountCents) })
		.from(refunds)
		.where(
			and(
				eq(refunds.packageInstanceId, packageInstanceId),
				inArray(refunds.status, ["approved", "processed"]),
			),
		);
	const existingRefundsCents = Number(existingResult[0]?.total ?? 0);

	const remainingCents = Math.max(
		0,
		totalPrice - legacyManualRefundCents - existingRefundsCents,
	);

	return { totalCents: totalPrice, remainingCents };
}

// ---------------------------------------------------------------------------
// requestRefund
// ---------------------------------------------------------------------------

/**
 * Create a new pending refund request.
 *
 * At least one of salesOrderId, paymentId, packageInstanceId must be supplied.
 * The service auto-fills customerId / customerName / branchId from the target
 * (pull priority: salesOrderId > paymentId > packageInstanceId).
 *
 * Rejects with BAD_REQUEST if amountCents exceeds remaining-refundable on the target.
 */
export async function requestRefund(
	tenantDb: TenantDb,
	input: RequestRefundInput,
): Promise<Refund> {
	if (!input.salesOrderId && !input.paymentId && !input.packageInstanceId) {
		throw {
			code: "BAD_REQUEST",
			message:
				"At least one of salesOrderId, paymentId, or packageInstanceId is required",
		};
	}

	if (input.amountCents <= 0) {
		throw {
			code: "BAD_REQUEST",
			message: "amountCents must be a positive integer",
		};
	}

	return tenantDb.transaction(async (tx) => {
		const now = new Date();

		// ------------------------------------------------------------------
		// Auto-fill customer / branch from target (priority: SO > payment > pkg)
		// ------------------------------------------------------------------
		let customerId = input.customerId;
		let customerName = input.customerName;
		let branchId = input.branchId;

		if (input.salesOrderId) {
			const order = await tx.query.salesOrders.findFirst({
				where: (so, { eq: eqFn }) => eqFn(so.id, input.salesOrderId as string),
			});
			if (!order)
				throw {
					code: "NOT_FOUND",
					message: `Sales order ${input.salesOrderId} not found`,
				};
			customerId = customerId ?? order.customerId ?? "";
			customerName = customerName ?? order.customerName;
			branchId = branchId ?? order.branchId;
		} else if (input.paymentId) {
			const payment = await tx.query.payments.findFirst({
				where: (p, { eq: eqFn }) => eqFn(p.id, input.paymentId as string),
			});
			if (!payment)
				throw {
					code: "NOT_FOUND",
					message: `Payment ${input.paymentId} not found`,
				};
			customerId = customerId ?? payment.customerId;
			customerName = customerName ?? payment.customerId; // no name on payments; use ID as fallback
		} else if (input.packageInstanceId) {
			const instance = await tx.query.packageInstances.findFirst({
				where: (pi, { eq: eqFn }) =>
					eqFn(pi.id, input.packageInstanceId as string),
			});
			if (!instance)
				throw {
					code: "NOT_FOUND",
					message: `Package instance ${input.packageInstanceId} not found`,
				};
			customerId = customerId ?? instance.clientId;
			customerName = customerName ?? instance.clientId; // no name on package_instances; use ID as fallback
		}

		if (!customerId || !customerName) {
			throw {
				code: "BAD_REQUEST",
				message:
					"customerId and customerName are required (could not be auto-derived from target)",
			};
		}

		// ------------------------------------------------------------------
		// branchId is required for RBAC scoping.
		// salesOrderId always provides it. For paymentId/packageInstanceId the
		// caller must supply it explicitly — there is no reliable single-hop
		// source on those tables (payments.appointmentId → appointments.branchId
		// is a multi-hop join; package_instances have no branchId column).
		// Rows with branchId=null are visible to all members (system-wide rule
		// inherited from listAudit). That is too permissive for refunds, so we
		// reject rather than silently allow it.
		// ------------------------------------------------------------------
		if (!branchId) {
			throw {
				code: "BAD_REQUEST",
				message:
					"branchId is required when the refund target is a payment or package instance (it cannot be auto-derived). Pass branchId explicitly.",
			};
		}

		// ------------------------------------------------------------------
		// Validate remaining-refundable cap
		// ------------------------------------------------------------------
		let remainingCents = Number.POSITIVE_INFINITY;

		if (input.salesOrderId) {
			const info = await computeRemainingBySalesOrder(tx, input.salesOrderId);
			remainingCents = info.remainingCents;
		} else if (input.paymentId) {
			const info = await computeRemainingByPayment(tx, input.paymentId);
			remainingCents = info.remainingCents;
		} else if (input.packageInstanceId) {
			const info = await computeRemainingByPackageInstance(
				tx,
				input.packageInstanceId,
			);
			remainingCents = info.remainingCents;
		}

		if (input.amountCents > remainingCents) {
			throw {
				code: "BAD_REQUEST",
				message: `Refund amount ${input.amountCents} exceeds remaining refundable amount ${remainingCents}`,
			};
		}

		// ------------------------------------------------------------------
		// Generate refund number and insert
		// ------------------------------------------------------------------
		const refundNumber = await generateRefundNumber(tx, now);

		const [inserted] = await tx
			.insert(refunds)
			.values({
				refundNumber,
				status: "pending",
				salesOrderId: input.salesOrderId ?? null,
				paymentId: input.paymentId ?? null,
				packageInstanceId: input.packageInstanceId ?? null,
				amountCents: input.amountCents,
				taxAmountCents: input.taxAmountCents ?? 0,
				reason: input.reason,
				notes: input.notes ?? null,
				requestedBy: input.actor.userId,
				requestedAt: now,
				branchId: branchId ?? null,
				customerId,
				customerName,
			})
			.returning();

		if (!inserted) throw new Error("Failed to insert refund row");

		// ------------------------------------------------------------------
		// Audit
		// ------------------------------------------------------------------
		await writeAudit(tx, {
			actorUserId: input.actor.userId,
			actorMemberId: input.actor.memberId,
			actorRole: input.actor.role,
			action: "sale.refund.request",
			entityType: "refund",
			entityId: inserted.id,
			branchId: branchId ?? undefined,
			summary: `Refund ${refundNumber} requested for ${customerName} — ${(input.amountCents / 100).toFixed(2)} MYR — ${input.reason}`,
			changes: {
				target: {
					salesOrderId: input.salesOrderId,
					paymentId: input.paymentId,
					packageInstanceId: input.packageInstanceId,
				},
				amountCents: input.amountCents,
				reason: input.reason,
			},
		});

		return inserted;
	});
}

// ---------------------------------------------------------------------------
// approveRefund
// ---------------------------------------------------------------------------

/**
 * Approve a pending refund.
 * Requires status='pending'; throws BAD_REQUEST otherwise.
 */
export async function approveRefund(
	tenantDb: TenantDb,
	id: string,
	params: ApproveRefundParams,
): Promise<Refund> {
	return tenantDb.transaction(async (tx) => {
		const existing = await tx.query.refunds.findFirst({
			where: (r, { eq: eqFn }) => eqFn(r.id, id),
		});

		if (!existing)
			throw { code: "NOT_FOUND", message: `Refund ${id} not found` };

		if (existing.status !== "pending") {
			throw {
				code: "BAD_REQUEST",
				message: `Cannot approve refund with status '${existing.status}' — only 'pending' refunds can be approved`,
			};
		}

		const now = new Date();

		const [updated] = await tx
			.update(refunds)
			.set({
				status: "approved",
				reviewedBy: params.actor.userId,
				reviewedAt: now,
				reviewNotes: params.reviewNotes ?? null,
				updatedAt: now,
			})
			.where(eq(refunds.id, id))
			.returning();

		if (!updated) throw new Error("Failed to update refund row");

		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "sale.refund.approve",
			entityType: "refund",
			entityId: id,
			branchId: existing.branchId ?? undefined,
			summary: `Refund ${existing.refundNumber} approved`,
			changes: { reviewNotes: params.reviewNotes },
		});

		return updated;
	});
}

// ---------------------------------------------------------------------------
// rejectRefund
// ---------------------------------------------------------------------------

/**
 * Reject a pending refund. reviewNotes is required.
 * Requires status='pending'; throws BAD_REQUEST otherwise.
 */
export async function rejectRefund(
	tenantDb: TenantDb,
	id: string,
	params: RejectRefundParams,
): Promise<Refund> {
	if (!params.reviewNotes?.trim()) {
		throw {
			code: "BAD_REQUEST",
			message: "reviewNotes is required when rejecting a refund",
		};
	}

	return tenantDb.transaction(async (tx) => {
		const existing = await tx.query.refunds.findFirst({
			where: (r, { eq: eqFn }) => eqFn(r.id, id),
		});

		if (!existing)
			throw { code: "NOT_FOUND", message: `Refund ${id} not found` };

		if (existing.status !== "pending") {
			throw {
				code: "BAD_REQUEST",
				message: `Cannot reject refund with status '${existing.status}' — only 'pending' refunds can be rejected`,
			};
		}

		const now = new Date();

		const [updated] = await tx
			.update(refunds)
			.set({
				status: "rejected",
				reviewedBy: params.actor.userId,
				reviewedAt: now,
				reviewNotes: params.reviewNotes,
				updatedAt: now,
			})
			.where(eq(refunds.id, id))
			.returning();

		if (!updated) throw new Error("Failed to update refund row");

		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "sale.refund.reject",
			entityType: "refund",
			entityId: id,
			branchId: existing.branchId ?? undefined,
			summary: `Refund ${existing.refundNumber} rejected — ${params.reviewNotes}`,
			changes: { reviewNotes: params.reviewNotes },
		});

		return updated;
	});
}

// ---------------------------------------------------------------------------
// processRefund  (THE CRITICAL TRANSACTION)
// ---------------------------------------------------------------------------

/**
 * Process an approved refund. Requires status='approved'.
 *
 * In one atomic transaction:
 *  1. Lock and update refund → status='processed'
 *  2. If salesOrderId: update sales_orders.cancelledAmount, cancellationNumber,
 *     cancelledBy, cancelledAt, cancellationReason. Flip to 'cancelled' if fully refunded.
 *  3. If paymentId: update payments.refundAmount, refundedAt.
 *     Flip to 'refunded' if cumulative >= totalAmount.
 *  4. If packageInstanceId: flip package_instances.paymentStatus='refunded' if
 *     cumulative new-table refunds >= totalPrice (legacy manual_refund events
 *     are NOT counted in this flip — they are only in the cap check, per plan §5.8).
 *  5. Write audit row.
 *
 * Card reversals and bank transfers do NOT move money — the operator must
 * manually issue the reversal and enter the reference here. Out of scope for v1.
 */
export async function processRefund(
	tenantDb: TenantDb,
	id: string,
	params: ProcessRefundParams,
): Promise<Refund> {
	return tenantDb.transaction(async (tx) => {
		// 1. Lock and validate the refund row
		const [existing] = await tx
			.select()
			.from(refunds)
			.where(eq(refunds.id, id))
			.for("update");

		if (!existing)
			throw { code: "NOT_FOUND", message: `Refund ${id} not found` };

		if (existing.status !== "approved") {
			throw {
				code: "BAD_REQUEST",
				message: `Cannot process refund with status '${existing.status}' — only 'approved' refunds can be processed`,
			};
		}

		const now = new Date();

		// 2. Mark refund as processed
		const [updated] = await tx
			.update(refunds)
			.set({
				status: "processed",
				processedBy: params.actor.userId,
				processedAt: now,
				refundMethod: params.refundMethod,
				refundReference: params.refundReference ?? null,
				updatedAt: now,
			})
			.where(eq(refunds.id, id))
			.returning();

		if (!updated) throw new Error("Failed to update refund row");

		let cumulativeRefundCents = existing.amountCents;

		// 3. Update sales order if targeted
		if (existing.salesOrderId) {
			const [order] = await tx
				.select()
				.from(salesOrders)
				.where(eq(salesOrders.id, existing.salesOrderId))
				.for("update");

			if (order) {
				const newCancelledAmount =
					(order.cancelledAmount ?? 0) + existing.amountCents;
				cumulativeRefundCents = newCancelledAmount;

				// Generate cancellation number on first refund against this order
				const cancellationNumber =
					order.cancellationNumber ??
					(await generateCancellationNumber(tx, now));

				const newStatus =
					newCancelledAmount >= order.totalAmount ? "cancelled" : order.status;

				await tx
					.update(salesOrders)
					.set({
						cancelledAmount: newCancelledAmount,
						cancellationNumber,
						cancellationDate: order.cancellationDate ?? now,
						// Only set reason if not already set (preserve first refund's reason)
						cancellationReason: order.cancellationReason ?? existing.reason,
						cancelledBy: params.actor.userId,
						status: newStatus,
						updatedAt: now,
					})
					.where(eq(salesOrders.id, existing.salesOrderId));
			}
		}

		// 4. Update payment if targeted
		if (existing.paymentId) {
			const [payment] = await tx
				.select()
				.from(payments)
				.where(eq(payments.id, existing.paymentId))
				.for("update");

			if (payment) {
				const newRefundAmount =
					(payment.refundAmount ?? 0) + existing.amountCents;
				cumulativeRefundCents = newRefundAmount;

				const newStatus =
					newRefundAmount >= payment.totalAmount ? "refunded" : payment.status;

				await tx
					.update(payments)
					.set({
						refundAmount: newRefundAmount,
						refundedAt: payment.refundedAt ?? now, // only set on first refund
						status: newStatus,
						updatedAt: now,
					})
					.where(eq(payments.id, existing.paymentId));
			}
		}

		// 5. Update package instance if targeted
		if (existing.packageInstanceId) {
			const [instance] = await tx
				.select()
				.from(packageInstances)
				.where(eq(packageInstances.id, existing.packageInstanceId))
				.for("update");

			if (instance) {
				// Only count new-table processed refunds for the status flip.
				// Legacy installment_events.manual_refund events are NOT counted here
				// (they are only included in the initial cap check per plan §5.8).
				const processedResult = await tx
					.select({ total: sum(refunds.amountCents) })
					.from(refunds)
					.where(
						and(
							eq(refunds.packageInstanceId, existing.packageInstanceId),
							eq(refunds.status, "processed"),
						),
					);
				const cumulativeProcessedCents = Number(processedResult[0]?.total ?? 0);
				const totalPrice = instance.totalPrice ?? 0;

				if (cumulativeProcessedCents >= totalPrice && totalPrice > 0) {
					await tx
						.update(packageInstances)
						.set({ paymentStatus: "refunded", updatedAt: now })
						.where(eq(packageInstances.id, existing.packageInstanceId));
				}
			}
		}

		// 6. Audit
		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "sale.refund.process",
			entityType: "refund",
			entityId: id,
			branchId: existing.branchId ?? undefined,
			summary: `Refund ${existing.refundNumber} processed via ${params.refundMethod}${params.refundReference ? ` (ref: ${params.refundReference})` : ""}`,
			changes: {
				method: params.refundMethod,
				reference: params.refundReference,
				cumulativeRefundCents,
			},
		});

		return updated;
	});
}

// ---------------------------------------------------------------------------
// listRefunds
// ---------------------------------------------------------------------------

/**
 * List refund rows with optional filters and RBAC scoping.
 *
 * Actor names (requestedBy, reviewedBy, processedBy) are enriched from the
 * control panel DB using the same best-effort pattern as listAudit().
 */
export async function listRefunds(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: ListRefundsParams,
): Promise<{ rows: RefundRowEnriched[]; total: number }> {
	const {
		status,
		salesOrderId,
		customerId,
		branchId,
		from,
		to,
		accessibleNodeIds,
		limit = 100,
		offset = 0,
	} = params;

	const conditions = [];

	// RBAC: branchId must be in accessibleNodeIds OR null (system-wide visible)
	if (accessibleNodeIds.length > 0) {
		conditions.push(
			// biome-ignore lint/style/noNonNullAssertion: or() with explicit args is never undefined
			or(
				isNull(refunds.branchId),
				inArray(refunds.branchId, accessibleNodeIds),
			)!,
		);
	} else {
		conditions.push(isNull(refunds.branchId));
	}

	if (status && status !== "all") {
		conditions.push(eq(refunds.status, status));
	}

	if (salesOrderId) {
		conditions.push(eq(refunds.salesOrderId, salesOrderId));
	}

	if (customerId) {
		conditions.push(eq(refunds.customerId, customerId));
	}

	if (branchId) {
		conditions.push(eq(refunds.branchId, branchId));
	}

	if (from) {
		conditions.push(gte(refunds.requestedAt, from));
	}

	if (to) {
		conditions.push(lte(refunds.requestedAt, to));
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [rows, countResult] = await Promise.all([
		tenantDb.query.refunds.findMany({
			where,
			orderBy: (r, { desc: descFn }) => [descFn(r.requestedAt)],
			limit: Math.min(limit, 200),
			offset,
		}),
		tenantDb.query.refunds.findMany({ where, columns: { id: true } }),
	]);

	const total = countResult.length;

	// Collect all user IDs to look up names
	const userIds = new Set<string>();
	for (const row of rows) {
		userIds.add(row.requestedBy);
		if (row.reviewedBy) userIds.add(row.reviewedBy);
		if (row.processedBy) userIds.add(row.processedBy);
	}

	const nameMap = new Map<string, string>();
	if (userIds.size > 0) {
		try {
			const users = await controlPanelDb.query.user.findMany({
				where: (u, { inArray: inArr }) => inArr(u.id, [...userIds]),
				columns: { id: true, name: true },
			});
			for (const u of users) {
				nameMap.set(u.id, u.name);
			}
		} catch {
			// Best-effort: names left null on control-panel unavailability
		}
	}

	const enriched: RefundRowEnriched[] = rows.map((row) => ({
		...row,
		requestedByName: nameMap.get(row.requestedBy) ?? null,
		reviewedByName: row.reviewedBy
			? (nameMap.get(row.reviewedBy) ?? null)
			: null,
		processedByName: row.processedBy
			? (nameMap.get(row.processedBy) ?? null)
			: null,
	}));

	return { rows: enriched, total };
}

// ---------------------------------------------------------------------------
// getRefundById
// ---------------------------------------------------------------------------

/**
 * Fetch a single refund by ID. Returns null when not found.
 */
export async function getRefundById(
	tenantDb: TenantDb,
	id: string,
): Promise<Refund | null> {
	const row = await tenantDb.query.refunds.findFirst({
		where: (r, { eq: eqFn }) => eqFn(r.id, id),
	});
	return row ?? null;
}

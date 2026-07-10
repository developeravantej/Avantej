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
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { refundItems } from "@avantej-core/db/schema/tenant/refund-items";
import { refunds } from "@avantej-core/db/schema/tenant/refunds";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	and,
	count,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lte,
	or,
	sql,
	sum,
} from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";
import { reverseForRefund } from "./commission-splits.service";
import {
	appendPackageInstanceStatusHistory,
	appendPaymentStatusHistory,
} from "./status-history.helper";

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
	// Customer + branch — service DERIVES these from the target record.
	// Pull priority: salesOrderId > paymentId > packageInstanceId.
	// CPR-08: customerId must NOT be supplied by callers; it is always derived
	// server-side. customerName and branchId are accepted as hints only when
	// they cannot be auto-derived (e.g. payment/packageInstance targets).
	customerName?: string;
	branchId?: string;
	// Optional line-item breakdown for the refund (Phase 3 Task 3.2)
	items?: {
		salesOrderItemId: string;
		quantity: number;
		amountCents: number;
		reason?: string;
	}[];
	actor: { userId: string; memberId: string; role: string };
}

export interface ApproveRefundParams {
	reviewNotes?: string;
	/**
	 * Optional partial-approve amount in cents.
	 * Must satisfy: 0 < approveAmountCents ≤ requested AND ≤ remaining-refundable.
	 * When omitted the full requested amount is approved (existing behaviour).
	 */
	approveAmountCents?: number;
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
	salesOrderNumber: string | null;
	/** From the joined sales order: "member" | "walk_in" | null when no order. */
	customerType: string | null;
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

export interface BulkApproveItem {
	id: string;
	approveAmountCents?: number;
	reviewNotes?: string;
}

export interface BulkApproveResult {
	id: string;
	success: boolean;
	refund?: Refund;
	error?: string;
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

	// Sum pending/processing/approved/processed refunds already recorded against this order
	// V4: include pending+processing so in-flight refunds count toward the cap
	const existingResult = await (tx as TenantDb)
		.select({ total: sum(refunds.amountCents) })
		.from(refunds)
		.where(
			and(
				eq(refunds.salesOrderId, salesOrderId),
				inArray(refunds.status, ["pending", "approved", "processed"]),
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
				inArray(refunds.status, ["pending", "approved", "processed"]),
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

	// Existing pending/processing/approved/processed refunds in the new refunds table
	// V4: include pending+processing so in-flight refunds count toward the cap
	const existingResult = await (tx as TenantDb)
		.select({ total: sum(refunds.amountCents) })
		.from(refunds)
		.where(
			and(
				eq(refunds.packageInstanceId, packageInstanceId),
				inArray(refunds.status, ["pending", "approved", "processed"]),
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
		// CPR-08: Derive customer from the refund target — NEVER trust caller input.
		// Priority: salesOrderId > paymentId > packageInstanceId.
		// customerId is always authoritative from the target record so a malicious
		// caller cannot attribute a refund to the wrong customer.
		// ------------------------------------------------------------------
		let derivedCustomerId: string | undefined;
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
			derivedCustomerId = order.customerId ?? undefined;
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
			derivedCustomerId = payment.customerId ?? undefined;
			customerName = customerName ?? payment.customerId ?? undefined; // no name on payments; use ID as fallback
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
			derivedCustomerId = instance.clientId ?? undefined;
			customerName = customerName ?? instance.clientId ?? undefined; // no name on package_instances; use ID as fallback
		}

		// Authoritative customer is derived; ignore any caller-supplied customerId entirely.
		const customerId = derivedCustomerId;

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

		// Phase 3 Task 3.2: Insert optional line-item breakdown rows.
		// refund_items schema has: refundId, salesOrderItemId, amountCents, creditsRefunded.
		// quantity and reason fields from the input type are not stored at the row level —
		// amountCents already incorporates quantity (unitPrice × quantity).
		if (input.items && input.items.length > 0) {
			await tx.insert(refundItems).values(
				input.items.map((item) => ({
					refundId: inserted.id,
					salesOrderItemId: item.salesOrderItemId,
					amountCents: item.amountCents,
				})),
			);
		}

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
 * Approve a pending refund, with optional partial-amount override.
 *
 * Requires status='pending'; throws BAD_REQUEST otherwise.
 *
 * 1.5 — Partial approve:
 *   * Uses SELECT … FOR UPDATE to lock the row and prevent concurrent double-approvals.
 *   * approveAmountCents must satisfy: 0 < amount ≤ requested AND amount ≤ remaining-refundable.
 *   * When approveAmountCents < requested the stored amountCents is updated to the approved
 *     amount so downstream processRefund uses the correct figure.
 *   * Audit action is `refund.approve.partial` when amount < requested, `refund.approve.full`
 *     when amount equals requested (or omitted).
 */
export async function approveRefund(
	tenantDb: TenantDb,
	id: string,
	params: ApproveRefundParams,
): Promise<Refund> {
	return tenantDb.transaction(async (tx) => {
		// 1.5 — Lock the row with SELECT FOR UPDATE to prevent concurrent approvals
		const [existing] = await tx
			.select()
			.from(refunds)
			.where(eq(refunds.id, id))
			.for("update");

		if (!existing)
			throw { code: "NOT_FOUND", message: `Refund ${id} not found` };

		if (existing.status !== "pending") {
			throw {
				code: "BAD_REQUEST",
				message: `Cannot approve refund with status '${existing.status}' — only 'pending' refunds can be approved`,
			};
		}

		// F-07 — Lock the PARENT target row (sales_order, payment, or package_instance)
		// BEFORE reading remaining-refundable, so concurrent approveRefund calls against
		// the same target serialize on the cap check. Without this lock, two TXs can
		// both read SUM(refunds.amountCents) before either commits, both compute the
		// same `remainingCents`, and both pass the cap → over-approval. The parent
		// row is held until COMMIT, which forces the second TX to re-read post-commit.
		//
		// The cap re-validation that follows now ALWAYS runs (was previously partial-only),
		// closing the symmetrical hole where a full-approve path skipped the check
		// entirely. A full-approve whose `existing.amountCents` exceeds the now-current
		// remaining is rejected with BAD_REQUEST.
		if (existing.salesOrderId) {
			await tx
				.select({ id: salesOrders.id })
				.from(salesOrders)
				.where(eq(salesOrders.id, existing.salesOrderId))
				.for("update");
		} else if (existing.paymentId) {
			await tx
				.select({ id: payments.id })
				.from(payments)
				.where(eq(payments.id, existing.paymentId))
				.for("update");
		} else if (existing.packageInstanceId) {
			await tx
				.select({ id: packageInstances.id })
				.from(packageInstances)
				.where(eq(packageInstances.id, existing.packageInstanceId))
				.for("update");
		}

		// Compute remaining-refundable on the target (now under the parent lock).
		// `existing.amountCents` is added back because computeRemaining* counts this
		// pending refund in its SUM — the cap should reflect previously-settled
		// refunds only.
		let remainingCents = existing.amountCents;
		if (existing.salesOrderId) {
			const info = await computeRemainingBySalesOrder(
				tx,
				existing.salesOrderId,
			);
			remainingCents = info.remainingCents + existing.amountCents;
		} else if (existing.paymentId) {
			const info = await computeRemainingByPayment(tx, existing.paymentId);
			remainingCents = info.remainingCents + existing.amountCents;
		} else if (existing.packageInstanceId) {
			const info = await computeRemainingByPackageInstance(
				tx,
				existing.packageInstanceId,
			);
			remainingCents = info.remainingCents + existing.amountCents;
		}

		// 1.5 — Validate partial-approve amount when provided
		let effectiveAmountCents = existing.amountCents;
		let isPartial = false;

		if (params.approveAmountCents !== undefined) {
			const approve = params.approveAmountCents;

			if (!Number.isInteger(approve) || approve <= 0) {
				throw {
					code: "BAD_REQUEST",
					message: "approveAmountCents must be a positive integer",
				};
			}

			if (approve > existing.amountCents) {
				throw {
					code: "BAD_REQUEST",
					message: `approveAmountCents (${approve}) exceeds requested amount (${existing.amountCents})`,
				};
			}

			effectiveAmountCents = approve;
			isPartial = approve < existing.amountCents;
		}

		// Always validate the effective amount against the now-current remaining cap.
		// This catches both partial-approve and full-approve over-cap scenarios,
		// including the race where two concurrent requestRefund inserts each
		// passed their own (unlocked) cap check.
		if (effectiveAmountCents > remainingCents) {
			throw {
				code: "BAD_REQUEST",
				message: `Refund amount (${effectiveAmountCents}) exceeds remaining refundable amount (${remainingCents})`,
			};
		}

		const now = new Date();
		const auditAction = isPartial
			? "refund.approve.partial"
			: "refund.approve.full";

		const [updated] = await tx
			.update(refunds)
			.set({
				status: "approved",
				amountCents: effectiveAmountCents,
				reviewedBy: params.actor.userId,
				reviewedAt: now,
				reviewNotes: params.reviewNotes ?? null,
				updatedAt: now,
			})
			.where(eq(refunds.id, id))
			.returning();

		if (!updated) throw new Error("Failed to update refund row");

		// Migration A: flip sales_orders.refund_status to 'pending' on approval so the
		// Sales page refund-status filter surfaces these immediately. processRefund will
		// flip again to 'partial' / 'processed' on payout.
		if (existing.salesOrderId) {
			await tx
				.update(salesOrders)
				.set({ refundStatus: "pending", updatedAt: now })
				.where(eq(salesOrders.id, existing.salesOrderId));
		}

		// Agent 2.9 — J5: chain refund approval to commission reversal.
		// Reversals are created inside the same tx so we either reverse + approve atomically,
		// or roll back both.
		const reversalResult = await reverseForRefund(tx, id, {
			reason: `Refund ${existing.refundNumber} approved: ${existing.reason}`,
			initiatedBy: params.actor.userId,
			actor: params.actor,
		});

		// CPR-05: when a full refund is approved against a package instance, cancel the
		// instance and zero its credits within this same transaction so the customer
		// cannot continue consuming a fully-refunded package.
		if (existing.packageInstanceId) {
			const [pkgInstance] = await tx
				.select()
				.from(packageInstances)
				.where(eq(packageInstances.id, existing.packageInstanceId))
				.for("update");

			if (pkgInstance) {
				const totalPrice = pkgInstance.totalPrice ?? 0;
				const isFullRefund =
					totalPrice > 0 && effectiveAmountCents >= totalPrice;

				if (isFullRefund && pkgInstance.status !== "cancelled") {
					const now = new Date();
					const previousStatus = pkgInstance.status;

					// Cancel outstanding instalment rows before marking package cancelled
					await tx
						.update(installments)
						.set({ status: "cancelled", updatedAt: now })
						.where(
							and(
								eq(installments.packageInstanceId, existing.packageInstanceId),
								inArray(installments.status, ["pending", "overdue"]),
							),
						);

					// Zero out remaining credits and cancel the instance
					await tx
						.update(packageInstances)
						.set({
							status: "cancelled",
							creditsUsed: pkgInstance.creditsTotal ?? pkgInstance.creditsUsed,
							cancellationReason: `Full refund approved: ${existing.refundNumber}`,
							cancelledBy: params.actor.userId,
							updatedAt: now,
						})
						.where(eq(packageInstances.id, existing.packageInstanceId));

					await appendPackageInstanceStatusHistory(
						tx,
						existing.packageInstanceId,
						{
							fromStatus: previousStatus,
							toStatus: "cancelled",
							changedBy: params.actor.userId,
							reason: `Full refund approved: ${existing.refundNumber}`,
						},
					);

					await writeAudit(tx, {
						actorUserId: params.actor.userId,
						actorMemberId: params.actor.memberId,
						actorRole: params.actor.role,
						action: "package.cancelled",
						entityType: "package_instance",
						entityId: existing.packageInstanceId,
						branchId: existing.branchId ?? undefined,
						summary: `Package instance ${existing.packageInstanceId} cancelled due to full refund ${existing.refundNumber}`,
						changes: {
							previousStatus,
							refundId: id,
							refundNumber: existing.refundNumber,
							effectiveAmountCents,
							totalPrice,
						},
					});
				}
			}
		}

		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: `sale.${auditAction}`,
			entityType: "refund",
			entityId: id,
			branchId: existing.branchId ?? undefined,
			summary: `Refund ${existing.refundNumber} ${isPartial ? `partially approved (${(effectiveAmountCents / 100).toFixed(2)} of ${(existing.amountCents / 100).toFixed(2)} MYR)` : "approved"}${reversalResult.reversalIds.length > 0 ? ` (${reversalResult.reversalIds.length} commission reversal(s))` : ""}`,
			changes: {
				reviewNotes: params.reviewNotes,
				requestedAmountCents: existing.amountCents,
				approvedAmountCents: effectiveAmountCents,
				isPartial,
				reversalIds: reversalResult.reversalIds,
			},
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
				// AVANTEJ-9: a fully-refunded sale keeps status='confirmed'/'completed'
				// (a refund is NOT a cancellation), so detect "already fully refunded"
				// from the refunded amount rather than the order status.
				if (
					(order.refundedAmountCents ?? order.cancelledAmount ?? 0) >=
					order.totalAmount
				) {
					throw {
						code: "BAD_REQUEST",
						message: "Sale is already fully refunded",
					};
				}

				const newCancelledAmount =
					(order.cancelledAmount ?? 0) + existing.amountCents;
				cumulativeRefundCents = newCancelledAmount;

				// Generate cancellation number on first refund against this order
				const cancellationNumber =
					order.cancellationNumber ??
					(await generateCancellationNumber(tx, now));

				// AVANTEJ-9: a refund is NOT a cancellation. We must NOT flip the sales
				// order to 'cancelled' on a full refund — the Sales KPI excludes
				// 'cancelled' orders from revenue/collected while still summing
				// refunded_amount_cents, so a fully-refunded sale vanished from revenue
				// AND was subtracted again as a refund, driving Net Collected negative
				// (double-count). The refund is tracked purely via refund_status +
				// refunded_amount_cents; genuine cancellations go through
				// cancelSalesOrder(). Full refunds now behave like partial refunds
				// w.r.t. order.status (unchanged).
				const isFullRefund = newCancelledAmount >= order.totalAmount;

				// Migration A: maintain refund_status + refunded_amount_cents on sales_orders
				// so the Sales page KPI / refundStatus filter reflects reality.
				// - 'processed' when fully refunded (cumulative >= total)
				// - 'partial' otherwise
				const newRefundStatus: "partial" | "processed" = isFullRefund
					? "processed"
					: "partial";

				await tx
					.update(salesOrders)
					.set({
						cancelledAmount: newCancelledAmount,
						cancellationNumber,
						cancellationDate: order.cancellationDate ?? now,
						// Only set reason if not already set (preserve first refund's reason)
						cancellationReason: order.cancellationReason ?? existing.reason,
						cancelledBy: params.actor.userId,
						// status intentionally left unchanged (AVANTEJ-9) — refund ≠ cancellation
						refundStatus: newRefundStatus,
						refundedAmountCents: newCancelledAmount,
						updatedAt: now,
					})
					.where(eq(salesOrders.id, existing.salesOrderId));

				// Full refund → cancel associated package instances
				// Find package instances via: salesOrder → invoices → payments → packageInstances
				if (isFullRefund) {
					const invoiceRows = await tx
						.select({ paymentId: invoices.paymentId })
						.from(invoices)
						.where(
							and(
								eq(invoices.salesOrderId, existing.salesOrderId),
								isNotNull(invoices.paymentId),
							),
						);

					const paymentIds = invoiceRows
						.map((r) => r.paymentId)
						.filter((id): id is string => id !== null);

					if (paymentIds.length > 0) {
						const pkgRows = await tx
							.select({ id: packageInstances.id })
							.from(packageInstances)
							.where(
								and(
									inArray(packageInstances.paymentId, paymentIds),
									isNotNull(packageInstances.paymentId),
								),
							);

						const pkgIds = pkgRows.map((r) => r.id);

						if (pkgIds.length > 0) {
							await tx
								.update(packageInstances)
								.set({ status: "cancelled", updatedAt: now })
								.where(inArray(packageInstances.id, pkgIds));
						}
					}
				}
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

				// Phase 3 Task 3.3: append payment status history row when status changes
				if (newStatus !== payment.status) {
					await appendPaymentStatusHistory(tx, existing.paymentId, {
						fromStatus: payment.status,
						toStatus: newStatus,
						changedBy: params.actor.userId,
						reason: "Refund processed",
					});
				}
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

	// D.3.3 — Use SELECT COUNT(*) instead of fetching full rows to count
	// 1.4 — LEFT JOIN sales_orders to project salesOrderNumber on each row.
	const [rawRows, countResult] = await Promise.all([
		tenantDb
			.select({
				// All refund columns
				id: refunds.id,
				refundNumber: refunds.refundNumber,
				status: refunds.status,
				salesOrderId: refunds.salesOrderId,
				paymentId: refunds.paymentId,
				packageInstanceId: refunds.packageInstanceId,
				amountCents: refunds.amountCents,
				taxAmountCents: refunds.taxAmountCents,
				reason: refunds.reason,
				notes: refunds.notes,
				requestedBy: refunds.requestedBy,
				requestedAt: refunds.requestedAt,
				reviewedBy: refunds.reviewedBy,
				reviewedAt: refunds.reviewedAt,
				reviewNotes: refunds.reviewNotes,
				processedBy: refunds.processedBy,
				processedAt: refunds.processedAt,
				refundMethod: refunds.refundMethod,
				refundReference: refunds.refundReference,
				branchId: refunds.branchId,
				customerId: refunds.customerId,
				customerName: refunds.customerName,
				metadata: refunds.metadata,
				createdAt: refunds.createdAt,
				updatedAt: refunds.updatedAt,
				// Joined columns
				salesOrderNumber: salesOrders.salesOrderNumber,
				customerType: salesOrders.customerType,
			})
			.from(refunds)
			.leftJoin(salesOrders, eq(refunds.salesOrderId, salesOrders.id))
			.where(where)
			.orderBy(sql`${refunds.requestedAt} DESC`)
			.limit(Math.min(limit, 200))
			.offset(offset),
		tenantDb.select({ total: count() }).from(refunds).where(where),
	]);

	const total = countResult[0]?.total ?? 0;

	// Collect all user IDs to look up names
	const userIds = new Set<string>();
	for (const row of rawRows) {
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

	const enriched: RefundRowEnriched[] = rawRows.map((row) => ({
		...row,
		requestedByName: nameMap.get(row.requestedBy) ?? null,
		reviewedByName: row.reviewedBy
			? (nameMap.get(row.reviewedBy) ?? null)
			: null,
		processedByName: row.processedBy
			? (nameMap.get(row.processedBy) ?? null)
			: null,
		salesOrderNumber: row.salesOrderNumber ?? null,
		customerType: row.customerType ?? null,
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

// ---------------------------------------------------------------------------
// createPartialRefund — Agent 2.8 (Phase 2 Wave 3d — J5)
// ---------------------------------------------------------------------------

export interface CreatePartialRefundParams {
	packageInstanceId: string;
	creditsRefunded: number;
	reason: string;
	branchId?: string;
	actor: { userId: string; memberId: string; role: string };
}

export interface CreatePartialRefundResult {
	refundId: string;
	refundItemId: string;
	refundNumber: string;
	amountCents: number;
}

/**
 * Create a partial refund against a package instance, refunding a specific
 * number of session credits.
 *
 * Concurrency safety:
 *   * SELECT FOR UPDATE locks the package_instances row inside a transaction
 *   * UPDATE ... credits_used = credits_used + N (the generated column
 *     creditsRemaining is automatically recomputed; do NOT write to it)
 *   * Validate `credits_used <= COALESCE(credits_unlocked, credits_total)`
 *     after the update, throw BAD_REQUEST if violated (rolls back tx)
 *
 * Per-credit refund amount is derived from the instance's totalPrice / creditsTotal.
 * If totalPrice is null or creditsTotal is 0/null, throws BAD_REQUEST.
 *
 * Writes:
 *   * 1 row in refunds (status='pending', target=packageInstance)
 *   * 1 row in refund_items (creditsRefunded=N, amountCents=perCredit*N)
 *   * 1 audit row (sale.refund.request — partial)
 */
export async function createPartialRefund(
	tenantDb: TenantDb,
	params: CreatePartialRefundParams,
): Promise<CreatePartialRefundResult> {
	if (
		params.creditsRefunded <= 0 ||
		!Number.isInteger(params.creditsRefunded)
	) {
		throw {
			code: "BAD_REQUEST",
			message: "creditsRefunded must be a positive integer",
		};
	}
	if (!params.reason?.trim()) {
		throw { code: "BAD_REQUEST", message: "reason is required" };
	}

	return tenantDb.transaction(async (tx) => {
		const now = new Date();

		// 1. Lock the package_instances row
		const [instance] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, params.packageInstanceId))
			.for("update");

		if (!instance) {
			throw {
				code: "NOT_FOUND",
				message: `Package instance ${params.packageInstanceId} not found`,
			};
		}

		const totalPrice = instance.totalPrice ?? 0;
		const creditsTotal = instance.creditsTotal ?? 0;
		if (totalPrice <= 0 || creditsTotal <= 0) {
			throw {
				code: "BAD_REQUEST",
				message:
					"Package instance has no totalPrice or creditsTotal; cannot derive per-credit refund amount",
			};
		}

		// Per-credit amount (integer cents). For the last credit refunded against
		// a package, callers may want to round-up to fully zero out totalPrice;
		// for v1 we use floor and accept residual cents.
		const perCreditCents = Math.floor(totalPrice / creditsTotal);
		if (perCreditCents <= 0) {
			throw {
				code: "BAD_REQUEST",
				message: "Per-credit refund amount resolves to 0 cents",
			};
		}
		const amountCents = perCreditCents * params.creditsRefunded;

		// 2. Increment credits_used
		const newCreditsUsed = (instance.creditsUsed ?? 0) + params.creditsRefunded;
		const cap = instance.creditsUnlocked ?? instance.creditsTotal;
		if (newCreditsUsed > cap) {
			throw {
				code: "BAD_REQUEST",
				message: `Refund of ${params.creditsRefunded} credits exceeds remaining (used=${instance.creditsUsed}, cap=${cap})`,
			};
		}

		await tx
			.update(packageInstances)
			.set({ creditsUsed: newCreditsUsed, updatedAt: now })
			.where(eq(packageInstances.id, params.packageInstanceId));

		// 3. Auto-fill customer + branch from instance (clientId is the customer)
		const customerId = instance.clientId ?? "";
		const customerName = instance.clientId ?? "(unknown)"; // package_instances has no name
		const branchId = params.branchId ?? null;

		if (!customerId) {
			throw {
				code: "BAD_REQUEST",
				message: "Package instance has no clientId; cannot create refund",
			};
		}

		// 4. Generate refund number, insert parent refund row
		const refundNumber = await generateRefundNumber(tx, now);

		const [refund] = await tx
			.insert(refunds)
			.values({
				refundNumber,
				status: "pending",
				packageInstanceId: params.packageInstanceId,
				amountCents,
				taxAmountCents: 0,
				reason: params.reason,
				requestedBy: params.actor.userId,
				requestedAt: now,
				branchId,
				customerId,
				customerName,
				metadata: {
					partial: true,
					creditsRefunded: params.creditsRefunded,
					perCreditCents,
				},
			})
			.returning();

		if (!refund) throw new Error("Failed to insert refund row");

		// 5. Insert refund_items line
		const [item] = await tx
			.insert(refundItems)
			.values({
				refundId: refund.id,
				packageInstanceId: params.packageInstanceId,
				salesOrderItemId: null,
				creditsRefunded: params.creditsRefunded,
				amountCents,
			})
			.returning();

		if (!item) throw new Error("Failed to insert refund_items row");

		// 6. Audit
		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "sale.refund.request",
			entityType: "refund",
			entityId: refund.id,
			branchId: branchId ?? undefined,
			summary: `Partial refund ${refundNumber} requested — ${params.creditsRefunded} credits @ ${(perCreditCents / 100).toFixed(2)} = ${(amountCents / 100).toFixed(2)} MYR — ${params.reason}`,
			changes: {
				partial: true,
				packageInstanceId: params.packageInstanceId,
				creditsRefunded: params.creditsRefunded,
				perCreditCents,
				amountCents,
				newCreditsUsed,
			},
		});

		return {
			refundId: refund.id,
			refundItemId: item.id,
			refundNumber,
			amountCents,
		};
	});
}

// ---------------------------------------------------------------------------
// bulkApproveRefunds — 1.6
// ---------------------------------------------------------------------------

/**
 * Approve up to 50 refunds in a single API call.
 *
 * Each item is processed in its own independent transaction so a failure on one
 * row does NOT roll back the others. Per-row success/error is returned.
 *
 * Each item may optionally supply approveAmountCents and reviewNotes, which are
 * forwarded to approveRefund() with the same validation rules as the single-row
 * endpoint.
 *
 * Max 50 items per call — callers should paginate for larger batches.
 */
export async function bulkApproveRefunds(
	tenantDb: TenantDb,
	items: BulkApproveItem[],
	actor: { userId: string; memberId: string; role: string },
): Promise<BulkApproveResult[]> {
	if (items.length === 0) {
		return [];
	}

	if (items.length > 50) {
		throw {
			code: "BAD_REQUEST",
			message: `bulkApproveRefunds accepts at most 50 items per call (received ${items.length})`,
		};
	}

	// Process each item sequentially (independent TXs, not one giant TX)
	const results: BulkApproveResult[] = [];

	for (const item of items) {
		try {
			const refund = await approveRefund(tenantDb, item.id, {
				approveAmountCents: item.approveAmountCents,
				reviewNotes: item.reviewNotes,
				actor,
			});
			results.push({ id: item.id, success: true, refund });
		} catch (err) {
			const e = err as { code?: string; message?: string };
			results.push({
				id: item.id,
				success: false,
				error: e?.message ?? "Unknown error",
			});
		}
	}

	return results;
}

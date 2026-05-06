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
 * Commission config: categoryCommissionConfigs → commissionCoachSlots + commissionTierRates/Conditions.
 * The calculator (commission-calculator.service.ts) handles rate lookup and slot redistribution.
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
	ne,
	sql,
} from "drizzle-orm";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { commissionSplitReversals } from "@avantej-core/db/schema/tenant/commission-split-reversals";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { categoryCommissionConfigs } from "@avantej-core/db/schema/tenant/category-commission-configs";
import { categoryCommissionConfigVersions } from "@avantej-core/db/schema/tenant/category-commission-config-versions";
import { promotionUsages } from "@avantej-core/db/schema/tenant/promotions";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { payoutBatches } from "@avantej-core/db/schema/tenant/payout-batches";
import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { refundItems } from "@avantej-core/db/schema/tenant/refund-items";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { ORPCError } from "@orpc/server";
import { writeAudit } from "./audit-log.service";
import { getDescendantNodeIds } from "./hierarchy.service";

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
// Agent 3.4 — Commission caps/floors (Phase 3 §5)
// ---------------------------------------------------------------------------

/**
 * Resolve the categoryId for a split's source. The category drives which
 * commission-config row applies (and therefore which caps).
 *
 * Resolution priority — at most one source is set per split (CHECK constraint):
 *   appointmentId      → appointments.serviceId      → services.categoryId
 *   packageInstanceId  → package_instances.serviceId → services.categoryId
 *   salesOrderId       → first sales_order_items row with a serviceId →
 *                        services.categoryId. (Sales orders may bundle multiple
 *                        services across categories. We take the first commission-
 *                        eligible line; if cap-tuning per line is needed later it
 *                        belongs in commission-calculator.service.ts which is
 *                        out of scope here.)
 */
async function resolveCategoryIdForSplit(
	db: TenantDb | TenantTx,
	source: { appointmentId?: string | null; salesOrderId?: string | null; packageInstanceId?: string | null },
): Promise<string | null> {
	const tdb = db as TenantDb;
	if (source.appointmentId) {
		const [row] = await tdb
			.select({ categoryId: services.categoryId })
			.from(appointments)
			.innerJoin(services, eq(appointments.serviceId, services.id))
			.where(eq(appointments.id, source.appointmentId))
			.limit(1);
		return row?.categoryId ?? null;
	}
	if (source.packageInstanceId) {
		const [row] = await tdb
			.select({ categoryId: services.categoryId })
			.from(packageInstances)
			.innerJoin(services, eq(packageInstances.serviceId, services.id))
			.where(eq(packageInstances.id, source.packageInstanceId))
			.limit(1);
		return row?.categoryId ?? null;
	}
	if (source.salesOrderId) {
		const [row] = await tdb
			.select({ categoryId: services.categoryId })
			.from(salesOrderItems)
			.innerJoin(services, eq(salesOrderItems.serviceId, services.id))
			.where(
				and(
					eq(salesOrderItems.salesOrderId, source.salesOrderId),
					eq(salesOrderItems.commissionExcluded, false),
				),
			)
			.limit(1);
		return row?.categoryId ?? null;
	}
	return null;
}

/**
 * Sum the discount applied to a sales order via promotion_usages and compute
 * the discount fraction in basis points relative to the gross order total
 * (gross = totalAmount + sum(discountAmount)). Returns 0 when no promotions
 * were applied or the order is missing.
 */
async function computeOrderDiscountBps(
	db: TenantDb | TenantTx,
	salesOrderId: string,
): Promise<number> {
	const tdb = db as TenantDb;
	const [order] = await tdb
		.select({ totalAmount: salesOrders.totalAmount })
		.from(salesOrders)
		.where(eq(salesOrders.id, salesOrderId))
		.limit(1);
	if (!order) return 0;

	const [agg] = await tdb
		.select({
			discountTotal:
				sql<number>`COALESCE(SUM(${promotionUsages.discountAmount}), 0)`.mapWith(
					Number,
				),
		})
		.from(promotionUsages)
		.where(eq(promotionUsages.salesOrderId, salesOrderId));

	const discountCents = agg?.discountTotal ?? 0;
	if (discountCents <= 0) return 0;
	const grossCents = order.totalAmount + discountCents;
	if (grossCents <= 0) return 0;
	return Math.round((discountCents / grossCents) * 10_000); // basis points
}

/**
 * Inclusive monthly cycle bounds [start, end) anchored to the split's earnedAt.
 * Same convention used by `getOrCreatePayoutBatch` callers when finance closes
 * a calendar-month period. (Custom cycle definitions live with the batch row;
 * at split-creation time we do not yet know which batch will absorb the row,
 * so we use the canonical month boundary.)
 */
function getCycleBoundsForDate(d: Date): { start: Date; end: Date } {
	const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
	const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
	return { start, end };
}

export interface CommissionCapDecision {
	/** True when the split must be skipped entirely (e.g. order discount above threshold). */
	skip: boolean;
	/** Final commission amount after cycle cap. May equal input when no cap applied. */
	amountCents: number;
	/** Reason string when capped/skipped — useful for audit notes. null when unchanged. */
	reason: string | null;
}

/**
 * Apply commission caps for a pending split.
 *
 * Steps:
 *   1. Resolve the effective config via categoryId (skips silently if unresolvable).
 *   2. excludeIfDiscountAbovePct (basis points): if the parent sales order's
 *      effective discount % exceeds the threshold → skip split.
 *   3. maxPerCycleCents: sum of pending+approved+paid splits for the trainer in
 *      the same calendar-month cycle (excluding void). New amount is reduced so
 *      total ≤ cap. If cap already met, returned amount is 0 and skip=true.
 *
 * Returns a decision object the caller acts on. Pure read operation; safe to
 * call inside the same transaction as the eventual insert.
 */
export async function applyCommissionCaps(
	db: TenantDb | TenantTx,
	params: {
		appointmentId?: string | null;
		salesOrderId?: string | null;
		packageInstanceId?: string | null;
		staffId: string;
		amountCents: number;
		earnedAt: Date;
	},
): Promise<CommissionCapDecision> {
	const tdb = db as TenantDb;

	const categoryId = await resolveCategoryIdForSplit(db, {
		appointmentId: params.appointmentId,
		salesOrderId: params.salesOrderId,
		packageInstanceId: params.packageInstanceId,
	});
	if (!categoryId) {
		// Cannot resolve config without a category — fall through with no cap.
		return { skip: false, amountCents: params.amountCents, reason: null };
	}

	const [config] = await tdb
		.select({
			maxPerCycleCents: categoryCommissionConfigs.maxPerCycleCents,
			excludeIfDiscountAbovePct:
				categoryCommissionConfigs.excludeIfDiscountAbovePct,
		})
		.from(categoryCommissionConfigs)
		.where(
			and(
				eq(categoryCommissionConfigs.categoryId, categoryId),
				eq(categoryCommissionConfigs.isActive, true),
			),
		)
		.limit(1);

	if (!config) {
		return { skip: false, amountCents: params.amountCents, reason: null };
	}

	// 1) Discount-threshold opt-out (sales order path only — appointments and
	//    package instances are not promotion-discounted in the current model).
	if (
		params.salesOrderId &&
		config.excludeIfDiscountAbovePct !== null &&
		config.excludeIfDiscountAbovePct !== undefined
	) {
		const discountBps = await computeOrderDiscountBps(db, params.salesOrderId);
		if (discountBps > config.excludeIfDiscountAbovePct) {
			return {
				skip: true,
				amountCents: 0,
				reason: `Commission excluded: order discount ${(discountBps / 100).toFixed(2)}% exceeds category threshold ${(config.excludeIfDiscountAbovePct / 100).toFixed(2)}%`,
			};
		}
	}

	// 2) Per-cycle cap. Sum non-void splits for trainer in the calendar month
	//    that contains earnedAt; cap the new amount so the running total ≤ cap.
	if (
		config.maxPerCycleCents !== null &&
		config.maxPerCycleCents !== undefined &&
		config.maxPerCycleCents >= 0
	) {
		const { start, end } = getCycleBoundsForDate(params.earnedAt);
		const [agg] = await tdb
			.select({
				total:
					sql<number>`COALESCE(SUM(${commissionSplits.calculatedAmount}), 0)`.mapWith(
						Number,
					),
			})
			.from(commissionSplits)
			.where(
				and(
					eq(commissionSplits.staffId, params.staffId),
					ne(commissionSplits.status, "void"),
					gte(commissionSplits.earnedAt, start),
					sql`${commissionSplits.earnedAt} < ${end}`,
				),
			);

		const alreadyCents = agg?.total ?? 0;
		const remaining = config.maxPerCycleCents - alreadyCents;
		if (remaining <= 0) {
			return {
				skip: true,
				amountCents: 0,
				reason: `Commission skipped: trainer reached per-cycle cap of ${config.maxPerCycleCents} cents (already ${alreadyCents})`,
			};
		}
		if (params.amountCents > remaining) {
			return {
				skip: false,
				amountCents: remaining,
				reason: `Commission capped from ${params.amountCents} to ${remaining} cents — per-cycle limit ${config.maxPerCycleCents}`,
			};
		}
	}

	return { skip: false, amountCents: params.amountCents, reason: null };
}

// ---------------------------------------------------------------------------
// Write helpers — new in Phase 6
// ---------------------------------------------------------------------------

export interface CreateSplitParams {
	/** Exactly one of appointmentId, salesOrderId, or packageInstanceId must be set */
	appointmentId?: string;
	salesOrderId?: string;
	/** Agent 2.5 — third source for J5 commission audit */
	packageInstanceId?: string;
	/** Agent 2.5 — frozen config version snapshot at split creation time */
	configVersionId?: string;
	/**
	 * staffId = members.userId (cross-DB user ID), NOT the tenant member table PK.
	 * Consistent with appointmentStaff.staffId and payouts.recipientId conventions.
	 */
	staffId: string;
	splitPercentage: number; // 0–100
	calculatedAmountCents: number; // pre-tax, integer cents
	notes?: string;
	earnedAt?: Date; // defaults to now(); use appointment.completedAt or salesOrder.createdAt when available
	actor: { userId: string; memberId: string; role: string };
	// Commission calculation snapshot fields
	slotIndex?: number;
	conditionId?: string;
	trainerTierId?: string;
	weightageBasisPoints?: number;
	baseAmountCents?: number;
	splitType?: "automatic" | "manual";
	manualNote?: string;
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
): Promise<CommissionSplit | null> {
	const {
		appointmentId,
		salesOrderId,
		packageInstanceId,
		configVersionId,
		staffId,
		splitPercentage,
		calculatedAmountCents,
		notes,
		earnedAt,
		actor,
		slotIndex,
		conditionId,
		trainerTierId,
		weightageBasisPoints,
		baseAmountCents,
		splitType,
		manualNote,
	} = params;

	// Agent 3.3 — Phase 3 §5: comp-order / commission-excluded guard.
	// Skip split creation when the parent sales order is complimentary
	// (sales_orders.complimentary_reason IS NOT NULL) or when every line on
	// the order is opted out via sales_order_items.commission_excluded.
	// NOTE: the hot POS path goes through commission-calculator.service.ts
	// (_buildSplits) and bypasses this function via direct insert. Mirror
	// guard there is a follow-up (read-only in this scope).
	if (salesOrderId) {
		const [orderRow] = await (db as TenantDb)
			.select({ complimentaryReason: salesOrders.complimentaryReason })
			.from(salesOrders)
			.where(eq(salesOrders.id, salesOrderId))
			.limit(1);
		if (orderRow?.complimentaryReason) {
			return null;
		}
		const [activeLine] = await (db as TenantDb)
			.select({ id: salesOrderItems.id })
			.from(salesOrderItems)
			.where(
				and(
					eq(salesOrderItems.salesOrderId, salesOrderId),
					eq(salesOrderItems.commissionExcluded, false),
				),
			)
			.limit(1);
		if (!activeLine) {
			// Either no items at all, or every item is commission-excluded.
			return null;
		}
	}

	const sourceCount =
		(appointmentId ? 1 : 0) + (salesOrderId ? 1 : 0) + (packageInstanceId ? 1 : 0);
	if (sourceCount === 0) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"createCommissionSplit: exactly one of appointmentId, salesOrderId, or packageInstanceId is required",
		});
	}
	if (sourceCount > 1) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"createCommissionSplit: cannot set more than one of appointmentId, salesOrderId, packageInstanceId",
		});
	}

	// Agent 3.4 — Phase 3 §5: discount-threshold opt-out + per-cycle cap.
	// Comp / commission-excluded skip is already evaluated above; if we reach
	// here the line is commission-eligible. Cap evaluation is read-only and
	// safe to share the surrounding transaction.
	const splitEarnedAt = earnedAt ?? new Date();
	const capDecision = await applyCommissionCaps(db, {
		appointmentId: appointmentId ?? null,
		salesOrderId: salesOrderId ?? null,
		packageInstanceId: packageInstanceId ?? null,
		staffId,
		amountCents: calculatedAmountCents,
		earnedAt: splitEarnedAt,
	});
	if (capDecision.skip) {
		return null;
	}
	const finalAmountCents = capDecision.amountCents;
	const capNoteSuffix = capDecision.reason
		? (notes ? `${notes} | ${capDecision.reason}` : capDecision.reason)
		: notes ?? null;

	const [inserted] = await (db as TenantDb)
		.insert(commissionSplits)
		.values({
			appointmentId: appointmentId ?? null,
			salesOrderId: salesOrderId ?? null,
			packageInstanceId: packageInstanceId ?? null,
			configVersionId: configVersionId ?? null,
			staffId,
			splitPercentage,
			calculatedAmount: finalAmountCents,
			notes: capNoteSuffix,
			status: "pending",
			earnedAt: splitEarnedAt,
			slotIndex: slotIndex ?? null,
			conditionId: conditionId ?? null,
			trainerTierId: trainerTierId ?? null,
			weightageBasisPoints: weightageBasisPoints ?? null,
			baseAmountCents: baseAmountCents ?? null,
			splitType: splitType ?? "automatic",
			manualNote: manualNote ?? null,
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
			summary: `Commission split created for staff ${staffId} — ${finalAmountCents} cents (${splitPercentage}%)${capDecision.reason ? ` [${capDecision.reason}]` : ""}`,
			changes: {
				appointmentId: appointmentId ?? null,
				salesOrderId: salesOrderId ?? null,
				staffId,
				splitPercentage,
				requestedAmountCents: calculatedAmountCents,
				calculatedAmountCents: finalAmountCents,
				capReason: capDecision.reason,
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

	return tenantDb.transaction(async (tx) => {
		const existing = await tx
			.select()
			.from(commissionSplits)
			.where(inArray(commissionSplits.id, ids))
			.for("update");

		const nonPending = existing.filter((r) => r.status !== "pending");
		if (nonPending.length > 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Cannot approve: ${nonPending.length} split(s) are not in 'pending' status (ids: ${nonPending.map((r) => r.id).join(", ")})`,
			});
		}

		const now = new Date();
		const updated = await tx
			.update(commissionSplits)
			.set({
				status: "approved",
				approvedBy: actor.userId,
				approvedAt: now,
				updatedAt: now,
			})
			.where(inArray(commissionSplits.id, ids))
			.returning();

		// Audit per row inside the same transaction
		for (const row of updated) {
			await writeAudit(tx, {
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
	});
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

	return tenantDb.transaction(async (tx) => {
		const existing = await tx
			.select()
			.from(commissionSplits)
			.where(inArray(commissionSplits.id, ids))
			.for("update");

		const nonApproved = existing.filter((r) => r.status !== "approved");
		if (nonApproved.length > 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Cannot mark paid: ${nonApproved.length} split(s) are not in 'approved' status (ids: ${nonApproved.map((r) => r.id).join(", ")})`,
			});
		}

		const now = new Date();
		const updated = await tx
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
			await writeAudit(tx, {
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
	});
}

/**
 * Void a single commission split.
 * Blocks on paid status. Idempotent if already void. Writes audit.
 */
export async function voidCommissionSplit(
	tenantDb: TenantDb,
	id: string,
	reason: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<CommissionSplit> {
	return tenantDb.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(commissionSplits)
			.where(eq(commissionSplits.id, id))
			.for("update");

		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Commission split not found" });
		}
		if (existing.status === "paid") {
			throw new ORPCError("BAD_REQUEST", { message: "Cannot void a paid commission split. Contact finance." });
		}
		if (existing.status === "void") {
			return existing; // Idempotent
		}

		const [updated] = await tx
			.update(commissionSplits)
			.set({ status: "void", notes: reason, updatedAt: new Date() })
			.where(eq(commissionSplits.id, id))
			.returning();

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "commission.void",
			entityType: "commission_split",
			entityId: id,
			summary: `Commission split voided: ${reason}`,
			changes: { previousStatus: existing.status, reason },
		});

		return updated!;
	});
}

/**
 * Void all non-void, non-paid commission splits for a sales order.
 * Used by the cancelled-sales flow (Phase 4.8a).
 */
export async function voidCommissionSplitsForSalesOrder(
	tenantDb: TenantDb,
	salesOrderId: string,
	reason: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<CommissionSplit[]> {
	const rows = await tenantDb
		.select()
		.from(commissionSplits)
		.where(and(
			eq(commissionSplits.salesOrderId, salesOrderId),
			ne(commissionSplits.status, "void"),
			ne(commissionSplits.status, "paid"),
		));

	if (rows.length === 0) return [];

	const ids = rows.map(r => r.id);
	const updated = await tenantDb
		.update(commissionSplits)
		.set({ status: "void", notes: reason, updatedAt: new Date() })
		.where(inArray(commissionSplits.id, ids))
		.returning();

	for (const row of updated) {
		await writeAudit(tenantDb, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "commission.void",
			entityType: "commission_split",
			entityId: row.id,
			summary: `Commission voided on sales order cancellation: ${reason}`,
			changes: { salesOrderId, reason },
		});
	}

	return updated;
}

export interface CreateManualAdjustmentParams {
	staffId: string; // members.userId (cross-DB)
	amountCents: number; // Can be negative (clawback)
	note: string; // Required
	salesOrderId?: string;
	appointmentId?: string;
	actor: { userId: string; memberId: string; role: string };
}

/**
 * Create a manual commission adjustment (positive bonus or negative clawback).
 * splitType="manual". Writes audit. No idempotency guard — each call creates a new row.
 */
// ---------------------------------------------------------------------------
// Liability summary (Phase 6)
// ---------------------------------------------------------------------------

export interface LiabilitySummaryTrainer {
	memberId: string; // members.userId (staffId on commission_splits)
	name: string; // from control-panel user.name; falls back to userId
	approvedUnpaidCents: number;
	paidCents: number;
	manualAdjustmentCents: number; // manual splits where status IN (pending, approved)
	netPayableCents: number; // approvedUnpaidCents + manualAdjustmentCents
}

export interface LiabilitySummaryResult {
	trainers: LiabilitySummaryTrainer[];
	totals: {
		approvedUnpaidCents: number;
		paidCents: number;
		manualAdjustmentCents: number;
		netPayableCents: number;
	};
}

export interface LiabilitySummaryParams {
	from: string; // ISO datetime
	to: string; // ISO datetime (inclusive end)
	hierarchyNodeId?: string; // optional scope to hierarchy subtree
	categoryId?: string; // optional filter by service category
}

/**
 * Aggregate commission liability for a date range.
 *
 * Filters on earnedAt (not createdAt) — sessions delivered in a period but
 * completed later still fall in the correct payroll period.
 *
 * Status buckets (all non-void):
 *   approvedUnpaidCents  — automatic splits, status="approved"
 *   paidCents            — status="paid" (any splitType)
 *   manualAdjustmentCents— manual splits, status IN ("pending","approved")
 *   netPayableCents      — approvedUnpaidCents + manualAdjustmentCents
 */
export async function liabilitySummary(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: LiabilitySummaryParams,
): Promise<LiabilitySummaryResult> {
	const { from, to, hierarchyNodeId, categoryId } = params;

	const fromDate = new Date(from);
	const toDate = new Date(to);

	// Build staff scope from hierarchy if needed
	let staffIdScope: string[] | null = null;
	if (hierarchyNodeId) {
		const descendantNodeIds = await getDescendantNodeIds(tenantDb, hierarchyNodeId);
		if (descendantNodeIds.length === 0) {
			// No nodes found — return empty result
			return { trainers: [], totals: { approvedUnpaidCents: 0, paidCents: 0, manualAdjustmentCents: 0, netPayableCents: 0 } };
		}
		// Fetch userIds of members whose hierarchyScopeId is within the descendant set
		const scopedMembers = await tenantDb
			.select({ userId: members.userId })
			.from(members)
			.where(inArray(members.hierarchyScopeId, descendantNodeIds));
		staffIdScope = scopedMembers.map((m) => m.userId);
		if (staffIdScope.length === 0) {
			return { trainers: [], totals: { approvedUnpaidCents: 0, paidCents: 0, manualAdjustmentCents: 0, netPayableCents: 0 } };
		}
	}

	// Build WHERE conditions
	const baseConditions = [
		gte(commissionSplits.earnedAt, fromDate),
		lte(commissionSplits.earnedAt, toDate),
		ne(commissionSplits.status, "void"),
	];

	if (staffIdScope !== null) {
		baseConditions.push(inArray(commissionSplits.staffId, staffIdScope));
	}

	// Single aggregation query using conditional sums grouped by staffId.
	// If categoryId is provided, we LEFT JOIN appointments and salesOrders, then
	// filter to splits that have a matching category (or are manual with no source).
	let rows: { staffId: string; approvedUnpaid: number; paid: number; manualAdj: number }[];

	if (categoryId) {
		// Category filter: appointment path → appointments.serviceId → services.categoryId
		//                  sales order path → sales_order_items.serviceId → services.categoryId
		// Manual splits with neither appointmentId nor salesOrderId are excluded.
		rows = await tenantDb
			.select({
				staffId: commissionSplits.staffId,
				approvedUnpaid: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'approved'
						     AND ${commissionSplits.splitType} = 'automatic'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
				paid: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'paid'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
				manualAdj: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.splitType} = 'manual'
						     AND ${commissionSplits.status} IN ('pending', 'approved')
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
			})
			.from(commissionSplits)
			.leftJoin(appointments, eq(commissionSplits.appointmentId, appointments.id))
			.leftJoin(services, eq(appointments.serviceId, services.id))
			.where(
				and(
					...baseConditions,
					// Must match category via one of the two paths
					sql`(
						-- Appointment-linked: service.categoryId matches
						(${commissionSplits.appointmentId} IS NOT NULL
						 AND ${services.categoryId} = ${categoryId})
						OR
						-- SalesOrder-linked: at least one SOI line has matching serviceId→category
						(${commissionSplits.salesOrderId} IS NOT NULL
						 AND EXISTS (
						   SELECT 1
						   FROM ${salesOrderItems} soi
						   INNER JOIN ${services} svc ON svc.id = soi.service_id
						   WHERE soi.sales_order_id = ${commissionSplits.salesOrderId}
						   AND svc.category_id = ${categoryId}
						 ))
					)`,
				),
			)
			.groupBy(commissionSplits.staffId) as { staffId: string; approvedUnpaid: number; paid: number; manualAdj: number }[];
	} else {
		// No category filter — simple aggregation
		rows = await tenantDb
			.select({
				staffId: commissionSplits.staffId,
				approvedUnpaid: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'approved'
						     AND ${commissionSplits.splitType} = 'automatic'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
				paid: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'paid'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
				manualAdj: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.splitType} = 'manual'
						     AND ${commissionSplits.status} IN ('pending', 'approved')
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
			})
			.from(commissionSplits)
			.where(and(...baseConditions))
			.groupBy(commissionSplits.staffId) as { staffId: string; approvedUnpaid: number; paid: number; manualAdj: number }[];
	}

	if (rows.length === 0) {
		return { trainers: [], totals: { approvedUnpaidCents: 0, paidCents: 0, manualAdjustmentCents: 0, netPayableCents: 0 } };
	}

	// Enrich names from control-panel user table (best-effort — same pattern as listCommissionLedger)
	const distinctStaffIds = rows.map((r) => r.staffId);
	const staffNameMap = new Map<string, string>();
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
		// Best-effort: if control panel is unavailable, names fall back to userId
	}

	// Build per-trainer result rows
	const trainers: LiabilitySummaryTrainer[] = rows.map((row) => {
		const approvedUnpaidCents = row.approvedUnpaid;
		const paidCents = row.paid;
		const manualAdjustmentCents = row.manualAdj;
		const netPayableCents = approvedUnpaidCents + manualAdjustmentCents;
		return {
			memberId: row.staffId,
			name: staffNameMap.get(row.staffId) ?? row.staffId,
			approvedUnpaidCents,
			paidCents,
			manualAdjustmentCents,
			netPayableCents,
		};
	});

	// Aggregate totals from per-trainer rows (cheap JS reduction)
	const totals = trainers.reduce(
		(acc, t) => ({
			approvedUnpaidCents: acc.approvedUnpaidCents + t.approvedUnpaidCents,
			paidCents: acc.paidCents + t.paidCents,
			manualAdjustmentCents: acc.manualAdjustmentCents + t.manualAdjustmentCents,
			netPayableCents: acc.netPayableCents + t.netPayableCents,
		}),
		{ approvedUnpaidCents: 0, paidCents: 0, manualAdjustmentCents: 0, netPayableCents: 0 },
	);

	return { trainers, totals };
}

// ---------------------------------------------------------------------------
// Mark paid batch (Phase 6)
// ---------------------------------------------------------------------------

export interface MarkPaidBatchParams {
	memberIds: string[]; // staffIds / userIds
	from: string; // ISO datetime
	to: string; // ISO datetime
	actor: { userId: string; memberId: string; role: string };
}

export interface MarkPaidBatchResult {
	updatedCount: number;
	memberIds: string[]; // subset of input that actually had rows updated
}

/**
 * Batch-mark all approved commission splits for the given members in the
 * earnedAt date range as paid. Wrapped in a transaction.
 *
 * One audit log entry per MEMBER affected (not per split).
 */
export async function markPaidBatch(
	tenantDb: TenantDb,
	params: MarkPaidBatchParams,
): Promise<MarkPaidBatchResult> {
	const { memberIds, from, to, actor } = params;

	const fromDate = new Date(from);
	const toDate = new Date(to);

	return tenantDb.transaction(async (tx) => {
		const updated = await tx
			.update(commissionSplits)
			.set({
				status: "paid",
				paidBy: actor.userId,
				paidAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					inArray(commissionSplits.staffId, memberIds),
					eq(commissionSplits.status, "approved"),
					gte(commissionSplits.earnedAt, fromDate),
					lte(commissionSplits.earnedAt, toDate),
				),
			)
			.returning({ staffId: commissionSplits.staffId, id: commissionSplits.id });

		const updatedCount = updated.length;
		// Distinct memberIds that had at least one row updated
		const affectedMemberIds = [...new Set(updated.map((r) => r.staffId))];

		// One audit entry per affected member
		for (const memberId of affectedMemberIds) {
			const memberSplitCount = updated.filter((r) => r.staffId === memberId).length;
			await writeAudit(tx, {
				actorUserId: actor.userId,
				actorMemberId: actor.memberId,
				actorRole: actor.role,
				action: "commission.batch_paid",
				entityType: "commission_split",
				entityId: memberId,
				summary: `Batch paid ${memberSplitCount} commission split(s) for staff ${memberId} (period: ${from} – ${to})`,
				changes: {
					staffId: memberId,
					splitCount: memberSplitCount,
					from,
					to,
				},
			});
		}

		return { updatedCount, memberIds: affectedMemberIds };
	});
}

export async function createManualAdjustment(
	tenantDb: TenantDb,
	params: CreateManualAdjustmentParams,
): Promise<CommissionSplit> {
	const [inserted] = await tenantDb
		.insert(commissionSplits)
		.values({
			appointmentId: params.appointmentId ?? null,
			salesOrderId: params.salesOrderId ?? null,
			staffId: params.staffId,
			splitPercentage: 0,
			calculatedAmount: params.amountCents,
			notes: params.note,
			status: "pending",
			splitType: "manual",
			manualNote: params.note,
			earnedAt: new Date(),
		})
		.returning();

	await writeAudit(tenantDb, {
		actorUserId: params.actor.userId,
		actorMemberId: params.actor.memberId,
		actorRole: params.actor.role,
		action: "commission.manual_adjustment",
		entityType: "commission_split",
		entityId: inserted!.id,
		summary: `Manual commission adjustment for staff ${params.staffId}: ${params.amountCents} cents`,
		changes: { amountCents: params.amountCents, note: params.note },
	});

	return inserted!;
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

// ---------------------------------------------------------------------------
// Agent 2.5 — Commission audit helpers (J5)
// ---------------------------------------------------------------------------

/**
 * Resolve the latest `category_commission_config_versions.id` for a given
 * categoryId. Returns null if no version row exists yet (i.e. the config has
 * never been saved since the trigger was installed).
 *
 * Callers should pass the returned id to createCommissionSplit so the split
 * is anchored to the immutable snapshot of the config that was live at split
 * creation time. Disputes mid-cycle can then be reproduced from the frozen
 * version + the per-split snapshot fields already stored on commissionSplits
 * (weightageBasisPoints, baseAmountCents, conditionId, trainerTierId,
 * slotIndex).
 */
export async function getLatestConfigVersionForCategory(
	tenantDb: TenantDb,
	categoryId: string,
): Promise<string | null> {
	const [row] = await tenantDb
		.select({ id: categoryCommissionConfigVersions.id })
		.from(categoryCommissionConfigVersions)
		.where(eq(categoryCommissionConfigVersions.categoryId, categoryId))
		.orderBy(desc(categoryCommissionConfigVersions.versionNumber))
		.limit(1);
	return row?.id ?? null;
}

export interface GetOrCreatePayoutBatchParams {
	branchId: string | null;
	periodStart: Date;
	periodEnd: Date;
	createdBy: string; // members.userId
}

/**
 * Idempotent payout batch resolver. Returns an existing batch matching
 * (branchId, periodStart, periodEnd) if one is already pending or
 * processing; otherwise creates a new pending batch.
 */
export async function getOrCreatePayoutBatch(
	tenantDb: TenantDb,
	params: GetOrCreatePayoutBatchParams,
): Promise<typeof payoutBatches.$inferSelect> {
	const { branchId, periodStart, periodEnd, createdBy } = params;

	const branchCondition = branchId
		? eq(payoutBatches.branchId, branchId)
		: sql`${payoutBatches.branchId} IS NULL`;

	const [existing] = await tenantDb
		.select()
		.from(payoutBatches)
		.where(
			and(
				branchCondition,
				eq(payoutBatches.periodStart, periodStart),
				eq(payoutBatches.periodEnd, periodEnd),
				inArray(payoutBatches.status, ["pending", "processing"]),
			),
		)
		.limit(1);

	if (existing) return existing;

	const [created] = await tenantDb
		.insert(payoutBatches)
		.values({
			branchId,
			periodStart,
			periodEnd,
			createdBy,
			status: "pending",
			totalCents: 0,
		})
		.returning();

	if (!created) {
		throw new Error("getOrCreatePayoutBatch: insert returned no row");
	}
	return created;
}

/**
 * Wire one or more payouts to a payout batch. Idempotent: payouts already
 * linked to the batch are silently re-set (no-op).
 */
export async function attachPayoutsToBatch(
	tenantDb: TenantDb,
	payoutIds: string[],
	batchId: string,
): Promise<{ updatedCount: number }> {
	if (payoutIds.length === 0) return { updatedCount: 0 };
	const updated = await tenantDb
		.update(payouts)
		.set({ batchId, updatedAt: new Date() })
		.where(inArray(payouts.id, payoutIds))
		.returning({ id: payouts.id });
	return { updatedCount: updated.length };
}

// ---------------------------------------------------------------------------
// Agent 2.9 — Refund → commission reversal chain (J5)
// ---------------------------------------------------------------------------

export interface ReverseForRefundParams {
	reason: string;
	initiatedBy: string; // members.userId
	actor?: { userId: string; memberId: string; role: string };
}

export interface ReverseForRefundResult {
	reversalIds: string[];
}

/**
 * Reverse commission splits tied to a refund.
 *
 * Strategy:
 *   1. Resolve the set of commission_splits linked to the refund's targets:
 *      - refund.salesOrderId          → splits with salesOrderId
 *      - refund.packageInstanceId     → splits with packageInstanceId
 *      - refund_items.salesOrderItemId → resolve to splits via the item's salesOrderId
 *      - refund_items.packageInstanceId (partial) → splits with that packageInstanceId
 *   2. For each candidate split, compute the reversal amount:
 *      - Full refund (amount >= total / refund has no items): -split.calculatedAmount
 *      - Partial refund (creditsRefunded < creditsTotal): pro-rate by
 *        creditsRefunded / creditsTotal of the package instance, capped at split amount
 *   3. Skip splits already fully reversed (sum of prior reversals == -split.calculatedAmount).
 *      Subsequent reversals against the same split (e.g. multi-step refunds) are allowed
 *      up to the unreversed remainder.
 *   4. Insert commission_split_reversals rows in the same transaction. The self-FK is
 *      DEFERRABLE so reversal-of-reversal chains can be inserted in any order.
 *   5. Caller (refunds.service) wraps this in its own tx; we accept either tenantDb or tx.
 *
 * Returns the list of inserted reversal IDs. No payout adjustment row is created here —
 * the next payout batch run picks up unsettled reversals via payout_adjustment_id IS NULL.
 */
export async function reverseForRefund(
	db: TenantDb | TenantTx,
	refundId: string,
	params: ReverseForRefundParams,
): Promise<ReverseForRefundResult> {
	const tdb = db as TenantDb;

	// 1. Load the refund + its items
	const refund = await tdb.query.refunds.findFirst({
		where: (r, { eq: eqFn }) => eqFn(r.id, refundId),
	});
	if (!refund) {
		throw new ORPCError("NOT_FOUND", {
			message: `reverseForRefund: refund ${refundId} not found`,
		});
	}

	const items = await tdb
		.select()
		.from(refundItems)
		.where(eq(refundItems.refundId, refundId));

	// 2. Build the candidate split set
	const candidateSplits = new Map<string, typeof commissionSplits.$inferSelect>();

	const addSplits = (rows: (typeof commissionSplits.$inferSelect)[]) => {
		for (const row of rows) {
			// Skip already-void splits — nothing to reverse
			if (row.status === "void") continue;
			candidateSplits.set(row.id, row);
		}
	};

	if (refund.salesOrderId) {
		const rows = await tdb
			.select()
			.from(commissionSplits)
			.where(eq(commissionSplits.salesOrderId, refund.salesOrderId));
		addSplits(rows);
	}

	if (refund.packageInstanceId) {
		const rows = await tdb
			.select()
			.from(commissionSplits)
			.where(eq(commissionSplits.packageInstanceId, refund.packageInstanceId));
		addSplits(rows);
	}

	// Resolve refund_items → underlying splits
	const itemSalesOrderItemIds = items
		.map((i) => i.salesOrderItemId)
		.filter((id): id is string => id !== null);
	const itemPackageInstanceIds = items
		.map((i) => i.packageInstanceId)
		.filter((id): id is string => id !== null);

	if (itemSalesOrderItemIds.length > 0) {
		// Resolve sales_order_items → salesOrderId → splits
		const soiRows = await tdb
			.select({
				id: salesOrderItems.id,
				salesOrderId: salesOrderItems.salesOrderId,
			})
			.from(salesOrderItems)
			.where(inArray(salesOrderItems.id, itemSalesOrderItemIds));
		const orderIds = [...new Set(soiRows.map((r) => r.salesOrderId))];
		if (orderIds.length > 0) {
			const rows = await tdb
				.select()
				.from(commissionSplits)
				.where(inArray(commissionSplits.salesOrderId, orderIds));
			addSplits(rows);
		}
	}

	if (itemPackageInstanceIds.length > 0) {
		const rows = await tdb
			.select()
			.from(commissionSplits)
			.where(
				inArray(commissionSplits.packageInstanceId, itemPackageInstanceIds),
			);
		addSplits(rows);
	}

	if (candidateSplits.size === 0) {
		return { reversalIds: [] };
	}

	// 3. Find the set of credits-refunded info for partial pro-rating.
	// For each refund_item with creditsRefunded > 0, look up the package instance to
	// derive the proration ratio. Multi-item refunds aggregate per packageInstanceId.
	const partialRatios = new Map<string, number>(); // packageInstanceId → 0..1
	for (const item of items) {
		if (
			item.packageInstanceId &&
			item.creditsRefunded !== null &&
			item.creditsRefunded > 0
		) {
			// Need creditsTotal for the instance — best-effort via packageInstances query
			const inst = await tdb.query.packageInstances.findFirst({
				where: (pi, { eq: eqFn }) =>
					eqFn(pi.id, item.packageInstanceId as string),
			});
			const creditsTotal = inst?.creditsTotal ?? 0;
			if (creditsTotal > 0) {
				const ratio = Math.min(1, item.creditsRefunded / creditsTotal);
				const prev = partialRatios.get(item.packageInstanceId) ?? 0;
				partialRatios.set(
					item.packageInstanceId,
					Math.min(1, prev + ratio),
				);
			}
		}
	}

	// 4. Sum prior reversals per split to compute the unreversed remainder
	const splitIds = [...candidateSplits.keys()];
	const priorRows = await tdb
		.select({
			splitId: commissionSplitReversals.reversedSplitId,
			total: sql<number>`COALESCE(SUM(${commissionSplitReversals.amountCents}), 0)`.mapWith(
				Number,
			),
		})
		.from(commissionSplitReversals)
		.where(inArray(commissionSplitReversals.reversedSplitId, splitIds))
		.groupBy(commissionSplitReversals.reversedSplitId);
	const priorReversedBySplit = new Map<string, number>();
	for (const r of priorRows) {
		priorReversedBySplit.set(r.splitId, r.total ?? 0);
	}

	// 5. Build reversal rows
	type InsertRow = typeof commissionSplitReversals.$inferInsert;
	const toInsert: InsertRow[] = [];
	for (const split of candidateSplits.values()) {
		const priorReversed = priorReversedBySplit.get(split.id) ?? 0;
		// priorReversed is negative (clawback); the unreversed positive amount remaining is:
		const unreversed = split.calculatedAmount + priorReversed;
		if (unreversed <= 0) continue;

		// Determine reversal amount
		let reversalCents: number;
		if (split.packageInstanceId && partialRatios.has(split.packageInstanceId)) {
			const ratio = partialRatios.get(split.packageInstanceId) ?? 1;
			reversalCents = -Math.min(
				unreversed,
				Math.round(split.calculatedAmount * ratio),
			);
		} else {
			// Full reversal
			reversalCents = -unreversed;
		}

		if (reversalCents === 0) continue;

		toInsert.push({
			reversedSplitId: split.id,
			refundId,
			amountCents: reversalCents,
			reason: params.reason,
			createdBy: params.initiatedBy,
		});
	}

	if (toInsert.length === 0) {
		return { reversalIds: [] };
	}

	const inserted = await tdb
		.insert(commissionSplitReversals)
		.values(toInsert)
		.returning({ id: commissionSplitReversals.id });

	// Audit (best-effort — only if actor is provided)
	if (params.actor) {
		for (const row of inserted) {
			await writeAudit(tdb, {
				actorUserId: params.actor.userId,
				actorMemberId: params.actor.memberId,
				actorRole: params.actor.role,
				action: "commission.reverse",
				entityType: "commission_split_reversal",
				entityId: row.id,
				summary: `Commission reversal created for refund ${refundId}: ${params.reason}`,
				changes: { refundId, reason: params.reason },
			});
		}
	}

	return { reversalIds: inserted.map((r) => r.id) };
}


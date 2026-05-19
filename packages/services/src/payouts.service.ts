/**
 * Payouts Service
 *
 * Business logic for managing coach/trainer payouts including
 * commission reversal batch processing.
 */

import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { commissionSplitReversals } from "@avantej-core/db/schema/tenant/commission-split-reversals";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { and, between, eq, inArray, isNull, max, sql, sum } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

// ---------------------------------------------------------------------------
// processCommissionReversals
// ---------------------------------------------------------------------------

/**
 * Batch-process all unlinked commission split reversals.
 *
 * Finds every reversal row where `payoutAdjustmentId IS NULL` (i.e. not yet
 * tied to a payout adjustment), groups them by staffId, creates one negative
 * payout row per staff member, and links the reversal rows back to it.
 * Also flips the originating commission_splits to status='reversed'.
 *
 * This function is idempotent when called multiple times — on the second call,
 * `pending` will be empty because all reversals now have a payoutAdjustmentId.
 *
 * @returns processedCount — number of staff members processed (one payout per staff)
 * @returns payoutIds — IDs of the newly created payout rows
 */
export async function processCommissionReversals(
	tenantDb: TenantDb,
	_actor: { userId: string; memberId: string },
): Promise<{ processedCount: number; payoutIds: string[] }> {
	// 1. Find all unprocessed reversals (payoutAdjustmentId IS NULL)
	const pending = await tenantDb
		.select({
			reversalId: commissionSplitReversals.id,
			reversedSplitId: commissionSplitReversals.reversedSplitId,
			amountCents: commissionSplitReversals.amountCents,
			staffId: commissionSplits.staffId,
		})
		.from(commissionSplitReversals)
		.innerJoin(
			commissionSplits,
			eq(commissionSplitReversals.reversedSplitId, commissionSplits.id),
		)
		.where(isNull(commissionSplitReversals.payoutAdjustmentId));

	if (pending.length === 0) return { processedCount: 0, payoutIds: [] };

	// 2. Group by staffId
	type PendingRow = (typeof pending)[number];
	const byStaff = new Map<string, PendingRow[]>();
	for (const row of pending) {
		const existing = byStaff.get(row.staffId) ?? [];
		existing.push(row);
		byStaff.set(row.staffId, existing);
	}

	return tenantDb.transaction(async (tx) => {
		const payoutIds: string[] = [];

		for (const [staffId, reversals] of byStaff) {
			// Total clawback amount — stored as a negative value on the payout row
			const totalNegativeAmountCents = -reversals.reduce(
				(sum, r) => sum + r.amountCents,
				0,
			);
			const reversalIds = reversals.map((r) => r.reversalId);
			const splitIds = reversals.map((r) => r.reversedSplitId);

			// 3. Insert negative payout adjustment row
			const [newPayout] = await tx
				.insert(payouts)
				.values({
					recipientId: staffId,
					amount: totalNegativeAmountCents, // negative value = clawback
					grossAmountCents: totalNegativeAmountCents,
					deductionsCents: 0,
					currency: "myr",
					payoutMethod: "adjustment",
					status: "pending",
					description: `Commission reversal adjustment for ${reversals.length} refund(s)`,
					appointmentId: null, // not tied to an appointment (nullable after migration 0046)
				})
				.returning({ id: payouts.id });

			if (!newPayout) throw new Error(`Failed to insert payout for staff ${staffId}`);
			payoutIds.push(newPayout.id);

			// 4. Link reversal rows to the new payout adjustment
			await tx
				.update(commissionSplitReversals)
				.set({ payoutAdjustmentId: newPayout.id })
				.where(inArray(commissionSplitReversals.id, reversalIds));

			// 5. Mark the originating commission splits as 'reversed'
			await tx
				.update(commissionSplits)
				.set({ status: "reversed" })
				.where(inArray(commissionSplits.id, splitIds));

			// 6. Audit emission — one entry for the adjustment payout + one per reversed split
			await writeAudit(tx, {
				actorUserId: _actor.userId,
				actorMemberId: _actor.memberId,
				action: "payout.adjustment.create",
				entityType: "payout",
				entityId: newPayout.id,
				summary: `Commission reversal adjustment RM ${(totalNegativeAmountCents / 100).toFixed(2)} for staff ${staffId} (${reversals.length} reversal(s))`,
				changes: { recipientId: staffId, amountCents: totalNegativeAmountCents, reversalCount: reversals.length },
			});
			for (const splitId of splitIds) {
				await writeAudit(tx, {
					actorUserId: _actor.userId,
					actorMemberId: _actor.memberId,
					action: "commission.reverse",
					entityType: "commission_split",
					entityId: splitId,
					summary: `Commission split reversed via adjustment payout ${newPayout.id}`,
					changes: { payoutAdjustmentId: newPayout.id },
				});
			}
		}

		return { processedCount: byStaff.size, payoutIds };
	});
}

// ---------------------------------------------------------------------------
// previewBatch
// ---------------------------------------------------------------------------

export interface PreviewBatchParams {
	staffIds: string[];
	periodStart: Date;
	periodEnd: Date;
	branchId?: string;
}

export interface PreviewSplit {
	id: string;
	staffId: string;
	calculatedAmount: number;
	earnedAt: Date | null;
	source: "appointment" | "sales_order" | "package_instance" | "other";
}

export interface PreviewBatchResult {
	count: number;
	totalAmountCents: number;
	truncated: boolean;
	byStaff: Array<{
		staffId: string;
		staffName: string;
		count: number;
		totalCents: number;
	}>;
	splits: PreviewSplit[];
}

/**
 * Preview the commission splits that would be included in a payout batch.
 *
 * Queries approved-but-unpaid splits for the given staff members in the
 * provided date range. No writes — read-only.
 *
 * @param controlPanelDb Used to hydrate staff display names (best-effort).
 */
export async function previewBatch(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: PreviewBatchParams,
): Promise<PreviewBatchResult> {
	const { staffIds, periodStart, periodEnd } = params;

	// Fetch all qualifying splits (status=approved, staffId IN [...], earnedAt in range)
	const rows = await tenantDb
		.select({
			id: commissionSplits.id,
			staffId: commissionSplits.staffId,
			calculatedAmount: commissionSplits.calculatedAmount,
			earnedAt: commissionSplits.earnedAt,
			appointmentId: commissionSplits.appointmentId,
			salesOrderId: commissionSplits.salesOrderId,
			packageInstanceId: commissionSplits.packageInstanceId,
		})
		.from(commissionSplits)
		.where(
			and(
				inArray(commissionSplits.staffId, staffIds),
				eq(commissionSplits.status, "approved"),
				between(commissionSplits.earnedAt, periodStart, periodEnd),
			),
		)
		.orderBy(commissionSplits.earnedAt);

	const totalAmountCents = rows.reduce((sum, r) => sum + r.calculatedAmount, 0);

	// Aggregate per-staff
	const staffMap = new Map<string, { count: number; totalCents: number }>();
	for (const row of rows) {
		const existing = staffMap.get(row.staffId) ?? { count: 0, totalCents: 0 };
		existing.count += 1;
		existing.totalCents += row.calculatedAmount;
		staffMap.set(row.staffId, existing);
	}

	// Hydrate staff names from control-panel (best-effort)
	const distinctStaffIds = [...staffMap.keys()];
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
			// Best-effort: names fall back to staffId if control panel is unavailable
		}
	}

	const byStaff = [...staffMap.entries()].map(([staffId, agg]) => ({
		staffId,
		staffName: staffNameMap.get(staffId) ?? staffId,
		count: agg.count,
		totalCents: agg.totalCents,
	}));

	// Cap the splits array at 500 rows to bound payload size
	const SPLIT_LIMIT = 500;
	const truncated = rows.length > SPLIT_LIMIT;
	const cappedRows = rows.slice(0, SPLIT_LIMIT);

	const splits: PreviewSplit[] = cappedRows.map((r) => ({
		id: r.id,
		staffId: r.staffId,
		calculatedAmount: r.calculatedAmount,
		earnedAt: r.earnedAt,
		source: r.appointmentId
			? "appointment"
			: r.salesOrderId
				? "sales_order"
				: r.packageInstanceId
					? "package_instance"
					: "other",
	}));

	return {
		count: rows.length,
		totalAmountCents,
		truncated,
		byStaff,
		splits,
	};
}

// ---------------------------------------------------------------------------
// runBatch
// ---------------------------------------------------------------------------

export interface RunBatchParams {
	staffIds: string[];
	periodStart: Date;
	periodEnd: Date;
	paymentMethod: "bank_transfer" | "cash" | "check" | "other";
	reference?: string;
	paidByUserId: string; // context.member.userId
}

export interface RunBatchResult {
	payoutIds: string[];
	totalAmountCents: number;
	splitCount: number;
}

/**
 * Execute a payout batch: locks qualifying approved splits, inserts one payout
 * row per staff member, and marks all splits as paid.
 *
 * The entire operation runs in a single transaction. Uses SELECT FOR UPDATE to
 * prevent concurrent runs from double-paying the same splits.
 *
 * @throws Error with code "EMPTY_BATCH" when no qualifying splits are found.
 * @throws Error with code "CONFLICT" on PostgreSQL 23505 (duplicate payout).
 */
export async function runBatch(
	tenantDb: TenantDb,
	params: RunBatchParams,
): Promise<RunBatchResult> {
	const { staffIds, periodStart, periodEnd, paymentMethod, reference, paidByUserId } = params;

	try {
		return await tenantDb.transaction(async (tx) => {
			// 1. Lock qualifying splits to prevent concurrent batch runs
			const locked = await tx
				.select({
					id: commissionSplits.id,
					staffId: commissionSplits.staffId,
					calculatedAmount: commissionSplits.calculatedAmount,
				})
				.from(commissionSplits)
				.where(
					and(
						inArray(commissionSplits.staffId, staffIds),
						eq(commissionSplits.status, "approved"),
						between(commissionSplits.earnedAt, periodStart, periodEnd),
					),
				)
				.for("update");

			if (locked.length === 0) {
				throw Object.assign(
					new Error("No approved splits in range"),
					{ code: "EMPTY_BATCH" },
				);
			}

			// 2. Group by staffId
			const byStaff = new Map<string, { splitIds: string[]; totalCents: number }>();
			for (const row of locked) {
				const existing = byStaff.get(row.staffId) ?? { splitIds: [], totalCents: 0 };
				existing.splitIds.push(row.id);
				existing.totalCents += row.calculatedAmount;
				byStaff.set(row.staffId, existing);
			}

			const now = new Date();
			const payoutIds: string[] = [];
			let totalAmountCents = 0;

			// 3. Insert one payout row per staff member + update splits
			for (const [staffId, group] of byStaff) {
				const [newPayout] = await tx
					.insert(payouts)
					.values({
						recipientId: staffId,
						amount: group.totalCents,
						grossAmountCents: group.totalCents,
						deductionsCents: 0,
						currency: "myr",
						payoutMethod: paymentMethod,
						status: "paid",
						paidAt: now,
						manualPayoutConfirmedAt: now,
						manualPayoutConfirmedBy: paidByUserId,
						description: reference ?? null,
						notes: reference
							? `Batch payout ref: ${reference}`
							: `Batch payout ${periodStart.toISOString().slice(0, 10)} – ${periodEnd.toISOString().slice(0, 10)}`,
					})
					.returning({ id: payouts.id });

				if (!newPayout) {
					throw new Error(`Failed to insert payout row for staff ${staffId}`);
				}

				payoutIds.push(newPayout.id);
				totalAmountCents += group.totalCents;

				// 4. Mark splits as paid and link to the new payout row
				await tx
					.update(commissionSplits)
					.set({
						status: "paid",
						paidBy: paidByUserId,
						paidAt: now,
						payoutId: newPayout.id,
						updatedAt: now,
					})
					.where(inArray(commissionSplits.id, group.splitIds));

				// 5. Audit emission (auditor continuity — one entry per payout
				//    + one per split flipped to paid, mirroring the existing
				//    per-split convention from `markCommissionSplitsPaid`).
				await writeAudit(tx, {
					actorUserId: paidByUserId,
					action: "payout.create",
					entityType: "payout",
					entityId: newPayout.id,
					summary: `Created payout RM ${(group.totalCents / 100).toFixed(2)} for staff ${staffId} (${group.splitIds.length} splits)`,
					changes: {
						recipientId: staffId,
						amountCents: group.totalCents,
						splitCount: group.splitIds.length,
						paymentMethod,
						reference: reference ?? null,
					},
				});
				for (const splitId of group.splitIds) {
					await writeAudit(tx, {
						actorUserId: paidByUserId,
						action: "commission.mark_paid",
						entityType: "commission_split",
						entityId: splitId,
						summary: `Commission split marked paid via batch payout ${newPayout.id}`,
						changes: { payoutId: newPayout.id, paymentReference: reference ?? null },
					});
				}
			}

			return { payoutIds, totalAmountCents, splitCount: locked.length };
		});
	} catch (err) {
		// Surface empty-batch as a distinguishable error
		if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === "EMPTY_BATCH") {
			throw err;
		}
		// Catch PostgreSQL duplicate-key (23505) — concurrent payout for same staff+period
		const pgErr = err as { code?: string };
		if (pgErr?.code === "23505") {
			throw Object.assign(
				new Error("A payout for one or more of these staff members in this period already exists"),
				{ code: "CONFLICT" },
			);
		}
		throw err;
	}
}

// ---------------------------------------------------------------------------
// recipientSummary
// ---------------------------------------------------------------------------

export interface RecipientSummaryResult {
	lifetimePaidCents: number;
	avgPerCycleCents: number;
	lastPayoutAt: Date | null;
}

/**
 * Return lifetime stats for a single payout recipient.
 *
 * Two-query approach:
 *   Q1 — aggregate: SUM(amount) WHERE status='paid', MAX(paidAt)
 *   Q2 — recent 100 paid rows to compute average per distinct cycle (paidAt date)
 */
export async function recipientSummary(
	tenantDb: TenantDb,
	recipientId: string,
): Promise<RecipientSummaryResult> {
	// Q1: lifetime aggregate
	const [agg] = await tenantDb
		.select({
			totalPaid: sum(payouts.amount).mapWith(Number),
			lastPayoutAt: max(payouts.paidAt),
		})
		.from(payouts)
		.where(and(eq(payouts.recipientId, recipientId), eq(payouts.status, "paid")));

	const lifetimePaidCents = agg?.totalPaid ?? 0;
	const lastPayoutAt = agg?.lastPayoutAt ? new Date(agg.lastPayoutAt) : null;

	// Q2: recent 100 paid rows to derive avg-per-cycle
	const recent = await tenantDb
		.select({ amount: payouts.amount, paidAt: payouts.paidAt })
		.from(payouts)
		.where(and(eq(payouts.recipientId, recipientId), eq(payouts.status, "paid")))
		.orderBy(sql`${payouts.paidAt} desc nulls last`)
		.limit(100);

	let avgPerCycleCents = 0;
	if (recent.length > 0) {
		// Group by calendar date of paidAt to count distinct cycles
		const cycleMap = new Map<string, number>();
		for (const row of recent) {
			const dateKey = row.paidAt
				? new Date(row.paidAt).toISOString().slice(0, 10)
				: "unknown";
			cycleMap.set(dateKey, (cycleMap.get(dateKey) ?? 0) + row.amount);
		}
		const cycleTotal = [...cycleMap.values()].reduce((s, v) => s + v, 0);
		avgPerCycleCents = Math.round(cycleTotal / cycleMap.size);
	}

	return { lifetimePaidCents, avgPerCycleCents, lastPayoutAt };
}

// ---------------------------------------------------------------------------
// processForRecipient
// ---------------------------------------------------------------------------

export interface ProcessForRecipientParams {
	recipientId: string;
	paymentMethod: "bank_transfer" | "cash" | "check" | "other";
	reference?: string;
	paidByUserId: string;
	periodStart?: Date;
	periodEnd?: Date;
}

/**
 * Thin wrapper over `runBatch` scoped to a single recipient.
 *
 * Defaults:
 *   periodStart → 1st of the current calendar month (UTC)
 *   periodEnd   → now (UTC)
 */
export async function processForRecipient(
	tenantDb: TenantDb,
	params: ProcessForRecipientParams,
): Promise<RunBatchResult> {
	const now = new Date();
	const defaultPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

	return runBatch(tenantDb, {
		staffIds: [params.recipientId],
		periodStart: params.periodStart ?? defaultPeriodStart,
		periodEnd: params.periodEnd ?? now,
		paymentMethod: params.paymentMethod,
		reference: params.reference,
		paidByUserId: params.paidByUserId,
	});
}

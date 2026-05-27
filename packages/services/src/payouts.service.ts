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
import { payoutBatches } from "@avantej-core/db/schema/tenant/payout-batches";
import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { and, between, eq, inArray, isNull, max, sql, sum } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";
import { getOrCreatePayoutBatch } from "./commission-splits.service";

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
	paymentMethod: "bank_transfer" | "cash" | "check" | "other" | "stripe_connect";
	reference?: string;
	paidByUserId: string; // context.member.userId
	/**
	 * Optional branch anchor for the resulting payout_batches row. When omitted
	 * the batch is created with branchId=NULL (cross-branch / unscoped batch).
	 * `getOrCreatePayoutBatch` is idempotent per (branchId, periodStart, periodEnd),
	 * so the same (branchId|NULL, period) tuple will resolve to the same batch
	 * across re-runs.
	 */
	branchId?: string | null;
	/**
	 * S-payouts-state-machine: when true (default), the inserted payout row is
	 * created at status='paid' immediately AND the linked commission_splits are
	 * flipped to status='paid' — the legacy "cash flow" semantics every existing
	 * caller depends on.
	 *
	 * When false, the payout is created at status='pending' and the linked splits
	 * remain at status='approved' (but carry the payoutId). The operator must
	 * later call `markPayoutPaid` to settle the row out-of-band — appropriate for
	 * bank_transfer / check methods that don't settle in-band.
	 *
	 * Default remains true for backward compat. New non-cash flows should opt in.
	 */
	confirmImmediately?: boolean;
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
 * Batch grouping (F-08): every payout row produced by this run is linked to a
 * single `payout_batches` row resolved idempotently from
 * `(branchId | NULL, periodStart, periodEnd)`. The batch's `totalCents` is
 * recomputed from the inserted payouts after insert.
 *
 * Invariant: SUM(payouts.amount WHERE batchId=B) === payout_batches[B].totalCents
 * (holds because both sides are computed from the same inserted rows in the
 * same transaction; idempotent re-runs with the same period reuse the existing
 * batch and update totalCents to the new sum).
 *
 * @throws Error with code "EMPTY_BATCH" when no qualifying splits are found.
 * @throws Error with code "CONFLICT" on PostgreSQL 23505 (duplicate payout).
 */
export async function runBatch(
	tenantDb: TenantDb,
	params: RunBatchParams,
): Promise<RunBatchResult> {
	const {
		staffIds,
		periodStart,
		periodEnd,
		paymentMethod,
		reference,
		paidByUserId,
		branchId,
		confirmImmediately = true,
	} = params;

	// S-payouts-state-machine: when the operator opts into the state machine
	// (confirmImmediately=false), the payout enters at 'pending' and linked
	// splits stay at 'approved' until `markPayoutPaid` settles the row.
	const payoutInitialStatus: "paid" | "pending" = confirmImmediately ? "paid" : "pending";
	const splitInitialStatus: "paid" | "approved" = confirmImmediately ? "paid" : "approved";

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

			// 2. Resolve the payout batch up-front so every inserted payout row
			//    carries a non-null batchId. Idempotent: a re-run with the same
			//    (branchId|NULL, periodStart, periodEnd) reuses the existing
			//    pending/processing batch instead of creating a duplicate.
			const batch = await getOrCreatePayoutBatch(tx as unknown as TenantDb, {
				branchId: branchId ?? null,
				periodStart,
				periodEnd,
				createdBy: paidByUserId,
			});

			// 3. Group by staffId
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

			// 4. Insert one payout row per staff member + update splits
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
						status: payoutInitialStatus,
						// paidAt + manual confirmation only set when we're entering 'paid'
						// directly. For 'pending', these are filled later by markPayoutPaid.
						paidAt: confirmImmediately ? now : null,
						manualPayoutConfirmedAt: confirmImmediately ? now : null,
						manualPayoutConfirmedBy: confirmImmediately ? paidByUserId : null,
						batchId: batch.id,
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

				// 5. Link splits to the new payout row.
				// In confirmImmediately mode the splits also flip to 'paid' here;
				// in state-machine mode they stay at 'approved' (carry the payoutId)
				// and flip to 'paid' later when `markPayoutPaid` fires.
				await tx
					.update(commissionSplits)
					.set({
						status: splitInitialStatus,
						paidBy: confirmImmediately ? paidByUserId : null,
						paidAt: confirmImmediately ? now : null,
						payoutId: newPayout.id,
						updatedAt: now,
					})
					.where(inArray(commissionSplits.id, group.splitIds));

				// 6. Audit emission (auditor continuity — one entry per payout
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
						batchId: batch.id,
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

			// 7. Recompute the batch total from the actual inserted rows in a
			//    single GROUP BY query — no per-payout UPDATE. Also stamp
			//    finalizedAt to mark the batch as closed for this run. On an
			//    idempotent re-run the SUM reflects ALL payouts now wired to
			//    this batch (including any from a prior partial run that
			//    reused the same batch row), so the invariant continues to
			//    hold.
			const [totals] = await tx
				.select({ sum: sum(payouts.amount).mapWith(Number) })
				.from(payouts)
				.where(eq(payouts.batchId, batch.id));

			await tx
				.update(payoutBatches)
				.set({
					totalCents: totals?.sum ?? totalAmountCents,
					finalizedAt: now,
				})
				.where(eq(payoutBatches.id, batch.id));

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
 *   Q1 — aggregate: SUM(amount) WHERE status='paid', MAX(paidAt). `totalPaid`
 *        intentionally INCLUDES reversal/adjustment rows (negative amounts) —
 *        clawbacks are real money out the door and must net into lifetime totals.
 *   Q2 — recent 100 paid rows to compute average per cycle. Only positive-amount
 *        rows participate (reversal adjustments are a different concept from a
 *        payout cycle and would distort the per-cycle mean). Cycles are grouped
 *        by `batchId` when non-null so two same-day batches do NOT collapse into
 *        one cycle; legacy rows without a batchId fall back to `paidAt::date`.
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
		.select({
			amount: payouts.amount,
			paidAt: payouts.paidAt,
			batchId: payouts.batchId,
		})
		.from(payouts)
		.where(and(eq(payouts.recipientId, recipientId), eq(payouts.status, "paid")))
		.orderBy(sql`${payouts.paidAt} desc nulls last`)
		.limit(100);

	let avgPerCycleCents = 0;
	if (recent.length > 0) {
		// Group cycles by batchId (preferred) or paidAt::date (legacy fallback).
		// Skip negative-amount rows — reversal adjustments are not payout cycles.
		const cycleMap = new Map<string, number>();
		for (const row of recent) {
			if (row.amount < 0) continue;
			const cycleKey = row.batchId
				? `batch:${row.batchId}`
				: row.paidAt
					? `date:${new Date(row.paidAt).toISOString().slice(0, 10)}`
					: "unknown";
			cycleMap.set(cycleKey, (cycleMap.get(cycleKey) ?? 0) + row.amount);
		}
		if (cycleMap.size > 0) {
			const cycleTotal = [...cycleMap.values()].reduce((s, v) => s + v, 0);
			avgPerCycleCents = Math.round(cycleTotal / cycleMap.size);
		}
	}

	return { lifetimePaidCents, avgPerCycleCents, lastPayoutAt };
}

// ---------------------------------------------------------------------------
// processForRecipient
// ---------------------------------------------------------------------------

export interface ProcessForRecipientParams {
	recipientId: string;
	paymentMethod: "bank_transfer" | "cash" | "check" | "other" | "stripe_connect";
	reference?: string;
	paidByUserId: string;
	periodStart?: Date;
	periodEnd?: Date;
	branchId?: string | null;
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
		branchId: params.branchId ?? null,
	});
}

// ---------------------------------------------------------------------------
// State machine — individual payout row transitions
// ---------------------------------------------------------------------------
//
// S-payouts-state-machine: prior to this work `runBatch` was the ONLY producer
// of payout rows and inserted them directly at `status='paid'` for every method.
// The `pending` / `processing` / `failed` / `canceled` enum values were
// unreachable. These four transition helpers — each FOR UPDATE-locked on the
// payout row to serialise concurrent callers (mirrors F-07's refund-row-lock
// pattern) — make the full lifecycle reachable so operators can confirm wire/
// cheque payouts manually and so Stripe payout webhooks (F-09) have a target
// state to flip to.
//
// Each transition:
//   1. Locks the payout row via SELECT ... FOR UPDATE (concurrency).
//   2. Validates the from-state matches the allowed set (state-machine guard).
//   3. Mutates payout + linked commission_splits in a single transaction.
//   4. Writes an audit_log row capturing actor + reason.

export interface PayoutActor {
	userId: string;
	memberId?: string;
	role?: string;
}

async function lockPayoutForUpdate(
	tx: Parameters<Parameters<TenantDb["transaction"]>[0]>[0],
	payoutId: string,
) {
	const [row] = await tx
		.select()
		.from(payouts)
		.where(eq(payouts.id, payoutId))
		.for("update")
		.limit(1);
	if (!row) {
		throw Object.assign(new Error(`Payout ${payoutId} not found`), {
			code: "NOT_FOUND",
		});
	}
	return row;
}

/**
 * `pending | processing → paid`.
 *
 * Operator-initiated when the out-of-band settlement (wire, cheque) clears.
 * `paymentReference` is required so the audit trail captures the external
 * transaction id; stored on the payout row's `description` if absent and
 * always echoed into the audit changes payload.
 *
 * Flips linked commission_splits (where `payoutId = id` AND status='approved')
 * to status='paid', mirroring the bulk update path in runBatch.
 */
export async function markPayoutPaid(
	tenantDb: TenantDb,
	payoutId: string,
	params: { paymentReference: string; actor: PayoutActor },
): Promise<typeof payouts.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		const row = await lockPayoutForUpdate(tx, payoutId);
		if (row.status !== "pending" && row.status !== "processing") {
			throw Object.assign(
				new Error(
					`Cannot mark payout paid: current status '${row.status}' — only pending or processing payouts can be marked paid`,
				),
				{ code: "BAD_REQUEST" },
			);
		}
		const now = new Date();
		const [updated] = await tx
			.update(payouts)
			.set({
				status: "paid",
				paidAt: now,
				manualPayoutConfirmedAt: now,
				manualPayoutConfirmedBy: params.actor.userId,
				// Append reference to description if not already present (preserve any prior text).
				description: row.description
					? `${row.description} | ref: ${params.paymentReference}`
					: `Payment ref: ${params.paymentReference}`,
				updatedAt: now,
			})
			.where(eq(payouts.id, payoutId))
			.returning();
		if (!updated) throw new Error(`markPayoutPaid: payout ${payoutId} update returned no row`);

		// Flip linked approved splits to paid. Splits that are already paid (idempotency
		// safety from a stuck pending payout that was partially synced) are left alone.
		await tx
			.update(commissionSplits)
			.set({
				status: "paid",
				paidBy: params.actor.userId,
				paidAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(commissionSplits.payoutId, payoutId),
					eq(commissionSplits.status, "approved"),
				),
			);

		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "payout.mark_paid",
			entityType: "payout",
			entityId: payoutId,
			summary: `Payout marked paid (ref: ${params.paymentReference})`,
			changes: {
				previousStatus: row.status,
				newStatus: "paid",
				paymentReference: params.paymentReference,
			},
		});

		return updated;
	});
}

/**
 * `pending | processing → failed`.
 *
 * Operator-initiated when a bank rejects the transfer or a cheque bounces.
 * `reason` is required so the failure cause is preserved. Linked commission
 * splits stay at status='approved' so a follow-up `retryPayout` keeps the
 * existing payoutId linkage intact.
 */
export async function markPayoutFailed(
	tenantDb: TenantDb,
	payoutId: string,
	params: { reason: string; actor: PayoutActor },
): Promise<typeof payouts.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		const row = await lockPayoutForUpdate(tx, payoutId);
		if (row.status !== "pending" && row.status !== "processing") {
			throw Object.assign(
				new Error(
					`Cannot mark payout failed: current status '${row.status}' — only pending or processing payouts can be failed`,
				),
				{ code: "BAD_REQUEST" },
			);
		}
		const now = new Date();
		const [updated] = await tx
			.update(payouts)
			.set({
				status: "failed",
				notes: row.notes ? `${row.notes}\nFailed: ${params.reason}` : `Failed: ${params.reason}`,
				updatedAt: now,
			})
			.where(eq(payouts.id, payoutId))
			.returning();
		if (!updated) throw new Error(`markPayoutFailed: payout ${payoutId} update returned no row`);

		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "payout.mark_failed",
			entityType: "payout",
			entityId: payoutId,
			summary: `Payout marked failed: ${params.reason}`,
			changes: { previousStatus: row.status, newStatus: "failed", reason: params.reason },
		});

		return updated;
	});
}

/**
 * `failed → pending`.
 *
 * Reset a failed payout for another attempt. Clears `paidAt` (which should
 * already be null but defense-in-depth). Linked splits are untouched — they
 * remain at status='approved' for the duration of the retry.
 */
export async function retryPayout(
	tenantDb: TenantDb,
	payoutId: string,
	params: { actor: PayoutActor },
): Promise<typeof payouts.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		const row = await lockPayoutForUpdate(tx, payoutId);
		if (row.status !== "failed") {
			throw Object.assign(
				new Error(
					`Cannot retry payout: current status '${row.status}' — only failed payouts can be retried`,
				),
				{ code: "BAD_REQUEST" },
			);
		}
		const now = new Date();
		const [updated] = await tx
			.update(payouts)
			.set({
				status: "pending",
				paidAt: null,
				updatedAt: now,
			})
			.where(eq(payouts.id, payoutId))
			.returning();
		if (!updated) throw new Error(`retryPayout: payout ${payoutId} update returned no row`);

		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "payout.retry",
			entityType: "payout",
			entityId: payoutId,
			summary: "Payout reset to pending for retry",
			changes: { previousStatus: "failed", newStatus: "pending" },
		});

		return updated;
	});
}

/**
 * `pending | failed → canceled`.
 *
 * Cancel a payout that should not be retried (e.g. recipient terminated, data
 * error). Linked commission_splits revert to status='approved' and have their
 * `payoutId` cleared so they're re-eligible for a future batch.
 *
 * Guard: a paid payout cannot be cancelled — issue a refund/clawback flow
 * instead.
 */
export async function cancelPayout(
	tenantDb: TenantDb,
	payoutId: string,
	params: { reason: string; actor: PayoutActor },
): Promise<typeof payouts.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		const row = await lockPayoutForUpdate(tx, payoutId);
		if (row.status !== "pending" && row.status !== "failed") {
			throw Object.assign(
				new Error(
					`Cannot cancel payout: current status '${row.status}' — only pending or failed payouts can be canceled`,
				),
				{ code: "BAD_REQUEST" },
			);
		}
		const now = new Date();
		const [updated] = await tx
			.update(payouts)
			.set({
				status: "canceled",
				notes: row.notes ? `${row.notes}\nCanceled: ${params.reason}` : `Canceled: ${params.reason}`,
				updatedAt: now,
			})
			.where(eq(payouts.id, payoutId))
			.returning();
		if (!updated) throw new Error(`cancelPayout: payout ${payoutId} update returned no row`);

		// Revert linked splits to approved + clear payoutId so they can be re-batched.
		await tx
			.update(commissionSplits)
			.set({
				status: "approved",
				payoutId: null,
				paidAt: null,
				paidBy: null,
				updatedAt: now,
			})
			.where(eq(commissionSplits.payoutId, payoutId));

		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "payout.cancel",
			entityType: "payout",
			entityId: payoutId,
			summary: `Payout canceled: ${params.reason}`,
			changes: { previousStatus: row.status, newStatus: "canceled", reason: params.reason },
		});

		return updated;
	});
}

/**
 * Commission Pipeline — Stage 3: Persist
 *
 * `persistSplits` performs ALL writes:
 *   1. For each PlannedSplit in SplitPlan.planned:
 *      a. POS path: fetch individual member, resolve rate, recompute amounts
 *      b. applyCommissionCaps (per-cycle cap check)
 *      c. Insert into commission_splits (23505-safe)
 *      d. writeAudit per inserted row
 *   2. Batch writeAudit for skipped[] entries that warrant an audit record
 *      (no_tier, no_tier_rate, no_condition_rate)
 *
 * For the appointment path, PlannedSplit has all amounts pre-computed by plan.ts.
 * For the POS path, PlannedSplit carries sentinel amounts (0) and a null
 * trainerTierId; persist resolves the member individually and recomputes.
 */

import { eq } from "drizzle-orm";
import { members } from "@avantej-core/db/schema/tenant/members";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { and } from "drizzle-orm";
import { writeAudit } from "../audit-log.service";
import { applyCommissionCaps } from "../commission-splits.service";
import { computeFinalAmountCents } from "../commission-math";
import type { CommissionContext } from "./context";
import type { SplitPlan, PlannedSplit, SkipReason } from "./plan";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { CommissionEarnReason } from "@avantej-core/types";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

export type CommissionSplitRow = typeof commissionSplits.$inferSelect;

// ---------------------------------------------------------------------------
// persistSplits
// ---------------------------------------------------------------------------

export interface PersistInput {
	requireTrainerRole: boolean;
	unitPriceCents: number;
	quantity: number;
	appointmentId: string | undefined;
	salesOrderId: string | undefined;
	// memberId nullable: system/cron actors have no member row (matches Actor).
	actor: { userId: string; memberId: string | null; role: string };
	earnedAt: Date;
	earnReason: CommissionEarnReason;
}

export async function persistSplits(
	db: TenantDb | TenantTx,
	plan: SplitPlan,
	ctx: CommissionContext,
	input: PersistInput,
): Promise<CommissionSplitRow[]> {
	const tdb = db as TenantDb;
	const results: CommissionSplitRow[] = [];

	// Pre-step B2: comp-order / commission-excluded guard (POS path only)
	if (input.salesOrderId) {
		const [orderRow] = await tdb
			.select({ complimentaryReason: salesOrders.complimentaryReason })
			.from(salesOrders)
			.where(eq(salesOrders.id, input.salesOrderId))
			.limit(1);
		if (orderRow?.complimentaryReason) {
			// Emit batch skip audit for any planned splits
			if (plan.planned.length > 0) {
				await writeAudit(tdb, {
					actorUserId: input.actor.userId,
					actorMemberId: input.actor.memberId ?? undefined,
					actorRole: input.actor.role,
					action: "commission.skip",
					entityType: "commission_split",
					entityId: input.salesOrderId,
					summary: `Commission skipped: order is complimentary (${orderRow.complimentaryReason})`,
					changes: {
						event: "complimentary_order",
						salesOrderId: input.salesOrderId,
						reason: orderRow.complimentaryReason,
					},
				});
			}
			await _writeBatchSkipAudits(tdb, plan.skipped, input);
			return results;
		}

		const [activeLine] = await tdb
			.select({ id: salesOrderItems.id })
			.from(salesOrderItems)
			.where(
				and(
					eq(salesOrderItems.salesOrderId, input.salesOrderId),
					eq(salesOrderItems.commissionExcluded, false),
				),
			)
			.limit(1);
		if (!activeLine) {
			await _writeBatchSkipAudits(tdb, plan.skipped, input);
			return results;
		}
	}

	// Process each planned split
	for (const plannedSplit of plan.planned) {
		const inserted = await _processSplit(tdb, plannedSplit, ctx, input);
		if (inserted) {
			results.push(inserted);
		}
	}

	// Batch audit for skipped entries
	await _writeBatchSkipAudits(tdb, plan.skipped, input);

	return results;
}

// ---------------------------------------------------------------------------
// Internal: process a single planned split
// ---------------------------------------------------------------------------

async function _processSplit(
	tdb: TenantDb,
	plannedSplit: PlannedSplit,
	ctx: CommissionContext,
	input: PersistInput,
): Promise<CommissionSplitRow | null> {
	const { config, rateTable, resolvedTrackId, resolvedTrackVersionId } = ctx;

	let finalAmountCents = plannedSplit.finalAmountCents;
	let baseAmountCents = plannedSplit.baseAmountCents;
	let splitPercentage = plannedSplit.splitPercentage;
	let trainerTierId = plannedSplit.trainerTierId;

	// POS path: resolve member individually and recompute amounts
	if (!input.requireTrainerRole && plannedSplit.finalAmountCents === 0) {
		const [memberRow] = await tdb
			.select({ role: members.role, trainerTierId: members.trainerTierId })
			.from(members)
			.where(eq(members.userId, plannedSplit.staffId))
			.limit(1);

		if (!memberRow) {
			console.warn(
				JSON.stringify({
					event: "commission_skipped_member_not_found",
					staffId: plannedSplit.staffId,
					salesOrderId: input.salesOrderId,
				}),
			);
			return null;
		}

		trainerTierId = memberRow.trainerTierId;

		// Resolve rate from the pre-loaded rateTable
		let rateAmount: number | undefined;
		if (!rateTable.isConditional) {
			const tierRate = rateTable.tierRates.find(
				(r) => r.trainerTierId === trainerTierId,
			);
			if (!tierRate) {
				console.warn(
					JSON.stringify({
						event: "commission_skipped_no_tier_rate",
						staffId: plannedSplit.staffId,
						trainerTierId,
						configId: config.id,
					}),
				);
				await writeAudit(tdb, {
					actorUserId: input.actor.userId,
					actorMemberId: input.actor.memberId ?? undefined,
					actorRole: input.actor.role,
					action: "commission.skip",
					entityType: "commission_split",
					entityId: input.salesOrderId ?? "unknown",
					summary: `Commission skipped for staff ${plannedSplit.staffId}: trainer tier ${trainerTierId} has no rate in config ${config.id}`,
					changes: {
						event: "no_tier_rate",
						staffId: plannedSplit.staffId,
						trainerTierId,
						configId: config.id,
						salesOrderId: input.salesOrderId,
					},
				});
				return null;
			}
			rateAmount = tierRate.amount;
		} else {
			const conditionRate = rateTable.conditionRates.find(
				(r) => r.trainerTierId === trainerTierId,
			);
			if (!conditionRate) {
				console.warn(
					JSON.stringify({
						event: "commission_skipped_no_condition_rate",
						staffId: plannedSplit.staffId,
						trainerTierId,
						conditionId: plannedSplit.conditionId,
					}),
				);
				await writeAudit(tdb, {
					actorUserId: input.actor.userId,
					actorMemberId: input.actor.memberId ?? undefined,
					actorRole: input.actor.role,
					action: "commission.skip",
					entityType: "commission_split",
					entityId: input.salesOrderId ?? "unknown",
					summary: `Commission skipped for staff ${plannedSplit.staffId}: trainer tier ${trainerTierId} has no condition rate for condition ${plannedSplit.conditionId}`,
					changes: {
						event: "no_condition_rate",
						staffId: plannedSplit.staffId,
						trainerTierId,
						conditionId: plannedSplit.conditionId,
						salesOrderId: input.salesOrderId,
					},
				});
				return null;
			}
			rateAmount = conditionRate.amount;
		}

		// Recompute amounts now that we have the actual trainerTierId + rateAmount
		if (config.paymentType === "fixed") {
			baseAmountCents = rateAmount;
			splitPercentage = 0;
		} else {
			baseAmountCents = Math.floor((input.unitPriceCents * rateAmount) / 10000);
			splitPercentage = Math.round(
				(rateAmount * plannedSplit.weightageBasisPoints) / 1_000_000,
			);
		}
		finalAmountCents = computeFinalAmountCents(
			baseAmountCents,
			plannedSplit.weightageBasisPoints,
			input.quantity,
		);
	}

	// Per-cycle cap check (Task #17: pass trackId for per-track cap isolation, GAPS #8/#11)
	const capDecision = await applyCommissionCaps(tdb, {
		appointmentId: input.appointmentId ?? null,
		salesOrderId: input.salesOrderId ?? null,
		packageInstanceId: null,
		staffId: plannedSplit.staffId,
		amountCents: finalAmountCents,
		earnedAt: input.earnedAt,
		trackId: resolvedTrackId,
	});
	if (capDecision.skip) {
		return null;
	}
	const cappedAmount = capDecision.amountCents;

	// Insert (23505-safe)
	// Task #17: stamp track provenance — trackId, roleType='trainer', trackVersionId.
	// A NULL trackVersionId would be excluded from the per-track cap aggregate
	// (LEFT JOIN on trackVersionId), so we must always include it when available.
	let inserted: CommissionSplitRow | undefined;
	try {
		const [row] = await tdb
			.insert(commissionSplits)
			.values({
				...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
				...(input.salesOrderId ? { salesOrderId: input.salesOrderId } : {}),
				configVersionId: plannedSplit.configVersionId,
				staffId: plannedSplit.staffId,
				splitPercentage,
				calculatedAmount: cappedAmount,
				status: "pending",
				splitType: "automatic",
				slotIndex: plannedSplit.slotIndex,
				conditionId: plannedSplit.conditionId ?? undefined,
				trainerTierId: trainerTierId ?? undefined,
				weightageBasisPoints: plannedSplit.weightageBasisPoints,
				baseAmountCents,
				earnedAt: input.earnedAt,
				earnReason: input.earnReason,
				...(capDecision.reason ? { notes: capDecision.reason } : {}),
				// Provenance columns (Task #17) — null for legacy-path fallback rows
				...(resolvedTrackId ? { trackId: resolvedTrackId } : {}),
				...(resolvedTrackId ? { roleType: "trainer" as const } : {}),
				...(resolvedTrackVersionId
					? { trackVersionId: resolvedTrackVersionId }
					: {}),
			})
			.returning();
		inserted = row;
	} catch (err: unknown) {
		const pgCode =
			err != null &&
			typeof err === "object" &&
			"code" in err &&
			(err as { code: unknown }).code;
		if (pgCode === "23505") {
			console.info(
				JSON.stringify({
					event: "commission_split_duplicate_skipped",
					appointmentId: input.appointmentId,
					staffId: plannedSplit.staffId,
				}),
			);
			return null;
		}
		throw err;
	}

	if (inserted) {
		await writeAudit(tdb, {
			actorUserId: input.actor.userId,
			actorMemberId: input.actor.memberId ?? undefined,
			actorRole: input.actor.role,
			action: "commission.create",
			entityType: "commission_split",
			entityId: inserted.id,
			summary: `Commission split created for staff ${plannedSplit.staffId}: ${cappedAmount} cents (${config.paymentType})${capDecision.reason ? ` [${capDecision.reason}]` : ""}`,
			changes: {
				staffId: plannedSplit.staffId,
				slotIndex: plannedSplit.slotIndex,
				splitPercentage,
				requestedAmountCents: finalAmountCents,
				calculatedAmount: cappedAmount,
				capReason: capDecision.reason,
				baseAmountCents,
				weightageBasisPoints: plannedSplit.weightageBasisPoints,
				paymentType: config.paymentType,
				appointmentId: input.appointmentId,
				salesOrderId: input.salesOrderId,
			},
		});
		return inserted;
	}

	return null;
}

// ---------------------------------------------------------------------------
// Internal: batch skip audits
// ---------------------------------------------------------------------------

async function _writeBatchSkipAudits(
	tdb: TenantDb,
	skipped: SkipReason[],
	input: PersistInput,
): Promise<void> {
	// Only audit skip reasons that warrant a record (no_tier, no_tier_rate, no_condition_rate)
	const auditableReasons = new Set<string>([
		"no_tier",
		"no_tier_rate",
		"no_condition_rate",
	]);
	const toAudit = skipped.filter((s) => auditableReasons.has(s.reason));

	if (toAudit.length === 0) return;

	await writeAudit(tdb, {
		actorUserId: input.actor.userId,
		actorMemberId: input.actor.memberId ?? undefined,
		actorRole: input.actor.role,
		action: "commission.skip",
		entityType: "commission_split",
		entityId: input.appointmentId ?? input.salesOrderId ?? "unknown",
		summary: `Commission skipped for ${toAudit.length} staff member(s): ${toAudit.map((s) => `${s.staffId}(${s.reason})`).join(", ")}`,
		changes: { skipped: toAudit },
	});
}

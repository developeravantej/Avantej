/**
 * Commission Calculator Service
 *
 * Core calculation engine for automatic commission splits.
 * Called when an appointment completes or a POS sale is recorded.
 *
 * Direct DB insert pattern: inserts into commission_splits directly
 * (bypassing createCommissionSplit) to avoid circular import with
 * commission-splits.service.ts and to include all snapshot fields in
 * a single statement.
 */

import { eq, and, asc } from "drizzle-orm";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { categoryCommissionConfigs } from "@avantej-core/db/schema/tenant/category-commission-configs";
import { commissionCoachSlots } from "@avantej-core/db/schema/tenant/commission-coach-slots";
import { commissionTierRates } from "@avantej-core/db/schema/tenant/commission-tier-rates";
import { commissionConditions } from "@avantej-core/db/schema/tenant/commission-conditions";
import { commissionConditionRates } from "@avantej-core/db/schema/tenant/commission-condition-rates";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { writeAudit } from "./audit-log.service";
import { applyCommissionCaps } from "./commission-splits.service";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

export type CommissionSplit = typeof commissionSplits.$inferSelect;

// ---------------------------------------------------------------------------
// Shared internal types
// ---------------------------------------------------------------------------

interface StaffAssignment {
	staffId: string;
	slotIndex: number;
}

interface Actor {
	userId: string;
	memberId: string;
	role: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function calculateCommissionForAppointment(
	tenantDb: TenantDb | TenantTx,
	params: {
		appointmentId: string;
		serviceId: string;
		sessionTotalCents: number;
		attendeeCount: number;
		staffAssignments: StaffAssignment[];
		actor: Actor;
		earnedAt?: Date;
	},
): Promise<CommissionSplit[]> {
	const db = tenantDb as TenantDb;

	// Step 1: look up service → categoryId
	const [service] = await db
		.select({ categoryId: services.categoryId })
		.from(services)
		.where(eq(services.id, params.serviceId))
		.limit(1);

	if (!service?.categoryId) {
		return [];
	}

	// Step 2: look up active commission config for this category
	const [config] = await db
		.select()
		.from(categoryCommissionConfigs)
		.where(
			and(
				eq(categoryCommissionConfigs.categoryId, service.categoryId),
				eq(categoryCommissionConfigs.isActive, true),
			),
		)
		.limit(1);

	if (!config) {
		return [];
	}

	// Step 3: determine rates (non-conditional or conditional)
	let matchedConditionId: string | null = null;

	type TierRate = { trainerTierId: string; amount: number };
	type ConditionRate = { trainerTierId: string; amount: number; conditionId: string };
	let tierRates: TierRate[] = [];
	let conditionRates: ConditionRate[] = [];

	if (!config.isConditional) {
		tierRates = await db
			.select({ trainerTierId: commissionTierRates.trainerTierId, amount: commissionTierRates.amount })
			.from(commissionTierRates)
			.where(eq(commissionTierRates.configId, config.id));
	} else {
		// Find matching condition based on attendeeCount
		const conditions = await db
			.select()
			.from(commissionConditions)
			.where(eq(commissionConditions.configId, config.id))
			.orderBy(asc(commissionConditions.conditionIndex));

		const matched = conditions.find((cond) => {
			const n = params.attendeeCount;
			switch (cond.operator) {
				case "lt":
					return n < cond.threshold;
				case "lte":
					return n <= cond.threshold;
				case "gt":
					return n > cond.threshold;
				case "gte":
					return n >= cond.threshold;
				case "eq":
					return n === cond.threshold;
				case "between":
					return (
						cond.thresholdMax !== null &&
						cond.thresholdMax !== undefined &&
						n >= cond.threshold &&
						n <= cond.thresholdMax
					);
				default:
					return false;
			}
		});

		if (!matched) {
			console.warn(
				JSON.stringify({
					event: "commission_skipped_no_matching_condition",
					appointmentId: params.appointmentId,
					attendeeCount: params.attendeeCount,
				}),
			);
			return [];
		}

		matchedConditionId = matched.id;

		conditionRates = await db
			.select({
				trainerTierId: commissionConditionRates.trainerTierId,
				amount: commissionConditionRates.amount,
				conditionId: commissionConditionRates.conditionId,
			})
			.from(commissionConditionRates)
			.where(eq(commissionConditionRates.conditionId, matched.id));
	}

	// Step 4: iterate staff assignments and build splits
	return _buildSplits(db, {
		config,
		tierRates,
		conditionRates,
		matchedConditionId,
		staffAssignments: params.staffAssignments,
		unitPriceCents: params.sessionTotalCents,
		quantity: 1,
		appointmentId: params.appointmentId,
		salesOrderId: undefined,
		actor: params.actor,
		earnedAt: params.earnedAt ?? new Date(),
	});
}

export async function calculateCommissionForPos(
	tenantDb: TenantDb | TenantTx,
	params: {
		salesOrderId: string;
		serviceId: string;
		unitPriceCents: number;
		quantity: number;
		staffAssignments: StaffAssignment[];
		actor: Actor;
		earnedAt?: Date;
	},
): Promise<CommissionSplit[]> {
	const db = tenantDb as TenantDb;

	// Step 1: look up service → categoryId
	const [service] = await db
		.select({ categoryId: services.categoryId })
		.from(services)
		.where(eq(services.id, params.serviceId))
		.limit(1);

	if (!service?.categoryId) {
		return [];
	}

	// Step 2: look up active commission config
	const [config] = await db
		.select()
		.from(categoryCommissionConfigs)
		.where(
			and(
				eq(categoryCommissionConfigs.categoryId, service.categoryId),
				eq(categoryCommissionConfigs.isActive, true),
			),
		)
		.limit(1);

	if (!config) {
		return [];
	}

	// Step 3: determine rates
	let matchedConditionId: string | null = null;

	type TierRate = { trainerTierId: string; amount: number };
	type ConditionRate = { trainerTierId: string; amount: number; conditionId: string };
	let tierRates: TierRate[] = [];
	let conditionRates: ConditionRate[] = [];

	if (!config.isConditional) {
		tierRates = await db
			.select({ trainerTierId: commissionTierRates.trainerTierId, amount: commissionTierRates.amount })
			.from(commissionTierRates)
			.where(eq(commissionTierRates.configId, config.id));
	} else {
		// POS: use first condition (minimum conditionIndex)
		const [firstCondition] = await db
			.select()
			.from(commissionConditions)
			.where(eq(commissionConditions.configId, config.id))
			.orderBy(asc(commissionConditions.conditionIndex))
			.limit(1);

		if (!firstCondition) {
			return [];
		}

		matchedConditionId = firstCondition.id;

		conditionRates = await db
			.select({
				trainerTierId: commissionConditionRates.trainerTierId,
				amount: commissionConditionRates.amount,
				conditionId: commissionConditionRates.conditionId,
			})
			.from(commissionConditionRates)
			.where(eq(commissionConditionRates.conditionId, firstCondition.id));
	}

	// Step 4: iterate staff assignments and build splits
	return _buildSplits(db, {
		config,
		tierRates,
		conditionRates,
		matchedConditionId,
		staffAssignments: params.staffAssignments,
		unitPriceCents: params.unitPriceCents,
		quantity: params.quantity,
		appointmentId: undefined,
		salesOrderId: params.salesOrderId,
		actor: params.actor,
		earnedAt: params.earnedAt ?? new Date(),
	});
}

// ---------------------------------------------------------------------------
// Internal: shared split-building logic
// ---------------------------------------------------------------------------

interface BuildSplitsParams {
	config: typeof categoryCommissionConfigs.$inferSelect;
	tierRates: { trainerTierId: string; amount: number }[];
	conditionRates: { trainerTierId: string; amount: number; conditionId: string }[];
	matchedConditionId: string | null;
	staffAssignments: StaffAssignment[];
	unitPriceCents: number;
	quantity: number;
	appointmentId: string | undefined;
	salesOrderId: string | undefined;
	actor: Actor;
	earnedAt: Date;
}

async function _buildSplits(
	db: TenantDb,
	p: BuildSplitsParams,
): Promise<CommissionSplit[]> {
	const results: CommissionSplit[] = [];

	if (p.staffAssignments.length === 0) {
		return results;
	}

	// Pre-step A: fetch ALL configured coach slots (both filled and absent).
	// Needed for redistribution of unclaimed weightage to present coaches.
	const allSlots = await db
		.select({
			slotIndex: commissionCoachSlots.slotIndex,
			weightageBasisPoints: commissionCoachSlots.weightageBasisPoints,
		})
		.from(commissionCoachSlots)
		.where(eq(commissionCoachSlots.configId, p.config.id));

	const slotWeightByIndex = new Map<number, number>(
		allSlots.map((s) => [s.slotIndex, s.weightageBasisPoints]),
	);

	// Pre-step B: identify assignments whose slotIndex actually exists on this config.
	// Sort by slotIndex ASC for deterministic rounding-remainder distribution
	// (lower slot indices — more senior positions — absorb the +1 bp first).
	const validAssignments = [...p.staffAssignments]
		.filter((a) => {
			if (!slotWeightByIndex.has(a.slotIndex)) {
				console.warn(
					JSON.stringify({
						event: "commission_skipped_no_coach_slot",
						staffId: a.staffId,
						slotIndex: a.slotIndex,
						configId: p.config.id,
					}),
				);
				return false;
			}
			return true;
		})
		.sort((a, b) => a.slotIndex - b.slotIndex);

	if (validAssignments.length === 0) {
		return results;
	}

	// Pre-step B2: comp-order / commission-excluded guard (mirrors Agent 3.3 in createCommissionSplit).
	// Bail before any per-staff work when the whole order is commission-ineligible.
	if (p.salesOrderId) {
		const [orderRow] = await db
			.select({ complimentaryReason: salesOrders.complimentaryReason })
			.from(salesOrders)
			.where(eq(salesOrders.id, p.salesOrderId))
			.limit(1);
		if (orderRow?.complimentaryReason) {
			return results;
		}
		const [activeLine] = await db
			.select({ id: salesOrderItems.id })
			.from(salesOrderItems)
			.where(
				and(
					eq(salesOrderItems.salesOrderId, p.salesOrderId),
					eq(salesOrderItems.commissionExcluded, false),
				),
			)
			.limit(1);
		if (!activeLine) {
			return results;
		}
	}

	// Pre-step C: compute unclaimed weightage from absent slots and distribute
	// it evenly across present coaches (per plan §3.11 algorithm step h).
	const presentSlotIndices = new Set(validAssignments.map((a) => a.slotIndex));
	let unclaimedBP = 0;
	for (const slot of allSlots) {
		if (!presentSlotIndices.has(slot.slotIndex)) {
			unclaimedBP += slot.weightageBasisPoints;
		}
	}
	const presentCount = validAssignments.length;
	const bonusBP = Math.floor(unclaimedBP / presentCount);
	const remainder = unclaimedBP - bonusBP * presentCount;

	// Pre-step D: build the effectiveWeightage for each assignment (order matches
	// validAssignments after its slotIndex-ASC sort). First `remainder` entries
	// each absorb one extra basis point to preserve the 10000-bp sum.
	const effectiveWeightages: number[] = validAssignments.map((a, i) => {
		const base = slotWeightByIndex.get(a.slotIndex) ?? 0;
		return base + bonusBP + (i < remainder ? 1 : 0);
	});

	// Per-staff loop using effectiveWeightage instead of raw slot weightage
	for (let i = 0; i < validAssignments.length; i++) {
		const assignment = validAssignments[i];
		if (!assignment) {
			continue;
		}
		const effectiveWeightage = effectiveWeightages[i] ?? 0;

		// 4a: look up member — must be role "trainer"
		const [member] = await db
			.select({ role: members.role, trainerTierId: members.trainerTierId })
			.from(members)
			.where(eq(members.userId, assignment.staffId))
			.limit(1);

		if (!member) {
			console.warn(
				JSON.stringify({
					event: "commission_skipped_member_not_found",
					staffId: assignment.staffId,
				}),
			);
			continue;
		}

		if (member.role !== "trainer") {
			console.warn(
				JSON.stringify({
					event: "commission_skipped_not_trainer",
					staffId: assignment.staffId,
					role: member.role,
				}),
			);
			continue;
		}

		// 4b: must have a trainerTierId
		if (!member.trainerTierId) {
			console.warn(
				JSON.stringify({
					event: "commission_skipped_no_tier",
					staffId: assignment.staffId,
				}),
			);
			continue;
		}

		// 4c: find rate for this trainer's tier
		let rateAmount: number | undefined;
		if (!p.config.isConditional) {
			const tierRate = p.tierRates.find(
				(r) => r.trainerTierId === member.trainerTierId,
			);
			if (!tierRate) {
				console.warn(
					JSON.stringify({
						event: "commission_skipped_no_tier_rate",
						staffId: assignment.staffId,
						trainerTierId: member.trainerTierId,
						configId: p.config.id,
					}),
				);
				continue;
			}
			rateAmount = tierRate.amount;
		} else {
			const conditionRate = p.conditionRates.find(
				(r) => r.trainerTierId === member.trainerTierId,
			);
			if (!conditionRate) {
				console.warn(
					JSON.stringify({
						event: "commission_skipped_no_condition_rate",
						staffId: assignment.staffId,
						trainerTierId: member.trainerTierId,
						conditionId: p.matchedConditionId,
					}),
				);
				continue;
			}
			rateAmount = conditionRate.amount;
		}

		// 4d: compute baseAmountCents
		let baseAmountCents: number;
		if (p.config.paymentType === "fixed") {
			baseAmountCents = rateAmount; // already cents
		} else {
			// variable: rateAmount is basis points (e.g. 1000 = 10%)
			baseAmountCents = Math.floor((p.unitPriceCents * rateAmount) / 10000);
		}

		// 4e: apply effective weightage (post-redistribution)
		const calculatedAmount = Math.floor(
			(baseAmountCents * effectiveWeightage) / 10000,
		);

		// 4f: multiply by quantity for POS
		const finalAmount = calculatedAmount * p.quantity;

		// 4g: compute splitPercentage
		// For fixed type: 0 (absolute amount, percentage not meaningful)
		// For variable type: rate.amount (bps) * effectiveWeightage (bps) / 1_000_000 → percentage
		const splitPercentage =
			p.config.paymentType === "fixed"
				? 0
				: Math.round((rateAmount * effectiveWeightage) / 1_000_000);

		// 4h: per-cycle cap (mirrors Agent 3.4 in createCommissionSplit)
		const capDecision = await applyCommissionCaps(db, {
			appointmentId: p.appointmentId ?? null,
			salesOrderId: p.salesOrderId ?? null,
			packageInstanceId: null,
			staffId: assignment.staffId,
			amountCents: finalAmount,
			earnedAt: p.earnedAt,
		});
		if (capDecision.skip) {
			continue;
		}
		const cappedAmount = capDecision.amountCents;

		// Insert directly into commission_splits (snapshot effective, not raw, weightage)
		const [inserted] = await db
			.insert(commissionSplits)
			.values({
				...(p.appointmentId ? { appointmentId: p.appointmentId } : {}),
				...(p.salesOrderId ? { salesOrderId: p.salesOrderId } : {}),
				staffId: assignment.staffId,
				splitPercentage,
				calculatedAmount: cappedAmount,
				status: "pending",
				splitType: "automatic",
				slotIndex: assignment.slotIndex,
				conditionId: p.matchedConditionId ?? undefined,
				trainerTierId: member.trainerTierId,
				weightageBasisPoints: effectiveWeightage,
				baseAmountCents,
				earnedAt: p.earnedAt,
				...(capDecision.reason ? { notes: capDecision.reason } : {}),
			})
			.returning();

		if (inserted) {
			// Audit the commission creation
			await writeAudit(db, {
				actorUserId: p.actor.userId,
				actorMemberId: p.actor.memberId,
				actorRole: p.actor.role,
				action: "commission.create",
				entityType: "commission_split",
				entityId: inserted.id,
				summary: `Commission split created for staff ${assignment.staffId}: ${cappedAmount} cents (${p.config.paymentType})${capDecision.reason ? ` [${capDecision.reason}]` : ""}`,
				changes: {
					staffId: assignment.staffId,
					slotIndex: assignment.slotIndex,
					splitPercentage,
					requestedAmountCents: finalAmount,
					calculatedAmount: cappedAmount,
					capReason: capDecision.reason,
					baseAmountCents,
					weightageBasisPoints: effectiveWeightage,
					paymentType: p.config.paymentType,
					appointmentId: p.appointmentId,
					salesOrderId: p.salesOrderId,
				},
			});

			results.push(inserted);
		}
	}

	return results;
}

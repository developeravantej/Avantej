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

import { eq, and, asc, inArray, sql } from "drizzle-orm";
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
import {
	assertConfigSumIs10000,
	computeEffectiveWeightages,
	computeFinalAmountCents,
	dedupeBySlotIndex,
} from "./commission-math";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { CommissionEarnReason } from "@avantej-core/types";

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
		earnReason: CommissionEarnReason;
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
		earnReason: params.earnReason,
		requireTrainerRole: true,
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
		earnReason: CommissionEarnReason;
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
		// POS: walk conditions descending by minQuantity to find the best matching tier.
		// NULL minQuantity = "matches any quantity" (catch-all / first-condition-wins for
		// existing configs that haven't been migrated to use quantity tiers).
		const conds = await db
			.select()
			.from(commissionConditions)
			.where(eq(commissionConditions.configId, config.id))
			.orderBy(sql`COALESCE(${commissionConditions.minQuantity}, 0) DESC`, asc(commissionConditions.conditionIndex));

		const matched = conds.find(c => c.minQuantity == null || c.minQuantity <= params.quantity);

		if (!matched) {
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
		unitPriceCents: params.unitPriceCents,
		quantity: params.quantity,
		appointmentId: undefined,
		salesOrderId: params.salesOrderId,
		actor: params.actor,
		earnedAt: params.earnedAt ?? new Date(),
		earnReason: params.earnReason,
		requireTrainerRole: false,
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
	earnReason: CommissionEarnReason;
	requireTrainerRole: boolean;
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

	// Pre-step A1 (fix #2): assert configured slots sum to exactly 10000 bp.
	// Delegates to commission-math for unit-testable invariant.
	assertConfigSumIs10000(allSlots, p.config.id);

	// Pre-step B (fix #3): dedupe staff assignments by slotIndex before any
	// math runs. A duplicate slotIndex would double-pay that slot because
	// presentSlotIndices (a Set) would dedupe but presentCount (array length)
	// would not.
	const { deduped: dedupedAssignments, hadDuplicates } = dedupeBySlotIndex(
		p.staffAssignments,
	);
	if (hadDuplicates) {
		console.warn(
			JSON.stringify({
				event: "commission_duplicate_slot_index_deduped",
				original: p.staffAssignments.length,
				deduped: dedupedAssignments.length,
				configId: p.config.id,
			}),
		);
	}

	const validAssignments = dedupedAssignments
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

	// Pre-step B3: batch-fetch roles + trainerTierId for all validAssignments.
	// ONLY applied when requireTrainerRole=true (appointment path).
	// POS path skips this block entirely — non-trainer earners are valid there.
	const memberByUserId = await (async () => {
		if (!p.requireTrainerRole) return new Map<string, { userId: string; role: string; trainerTierId: string | null }>();
		const memberData = await db
			.select({ userId: members.userId, role: members.role, trainerTierId: members.trainerTierId })
			.from(members)
			.where(inArray(members.userId, validAssignments.map(a => a.staffId)));
		return new Map(memberData.map(m => [m.userId, m]));
	})();

	const eligibleAssignments = (() => {
		if (!p.requireTrainerRole) return validAssignments;
		return validAssignments.filter(a => {
			const m = memberByUserId.get(a.staffId);
			if (!m) {
				console.warn(JSON.stringify({ event: "commission_skipped_member_not_found", staffId: a.staffId, configId: p.config.id }));
				return false;
			}
			if (m.role !== "trainer") {
				console.warn(JSON.stringify({ event: "commission_skipped_role_mismatch", staffId: a.staffId, role: m.role, configId: p.config.id, appointmentId: p.appointmentId, salesOrderId: p.salesOrderId }));
				return false;
			}
			if (!m.trainerTierId) {
				console.warn(JSON.stringify({ event: "commission_skipped_no_tier", staffId: a.staffId, configId: p.config.id }));
				return false;
			}
			return true;
		});
	})();

	if (eligibleAssignments.length === 0 && p.requireTrainerRole) {
		console.warn(JSON.stringify({
			event: "commission_skipped_no_eligible_staff",
			configId: p.config.id,
			appointmentId: p.appointmentId,
			salesOrderId: p.salesOrderId,
			originalCount: validAssignments.length,
		}));
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

	// Pre-step C+D: distribute unclaimed weightage from absent slots evenly
	// across present coaches; the first `remainder` coaches each absorb one
	// extra basis point so the total still sums to 10000. Delegates to
	// commission-math.computeEffectiveWeightages for unit-testable logic.
	const effectiveWeightages = computeEffectiveWeightages(
		allSlots,
		eligibleAssignments,
	);

	// Per-staff loop using effectiveWeightage instead of raw slot weightage
	for (let i = 0; i < eligibleAssignments.length; i++) {
		const assignment = eligibleAssignments[i];
		if (!assignment) {
			continue;
		}
		const effectiveWeightage = effectiveWeightages[i] ?? 0;

		// 4a: look up member — use pre-fetched map when available (avoids N+1 on appointment path)
		const memberFromMap = memberByUserId.get(assignment.staffId);
		const member: { role: string; trainerTierId: string | null } | undefined = memberFromMap ?? await (async () => {
			if (!p.requireTrainerRole) {
				// POS path: fetch individually since pre-pass was skipped
				const [row] = await db
					.select({ role: members.role, trainerTierId: members.trainerTierId })
					.from(members)
					.where(eq(members.userId, assignment.staffId))
					.limit(1);
				return row;
			}
			return undefined; // pre-pass already filtered ineligible members
		})();

		if (!member) {
			console.warn(JSON.stringify({ event: "commission_skipped_member_not_found", staffId: assignment.staffId }));
			continue;
		}

		if (p.requireTrainerRole && member.role !== "trainer") {
			// Pre-pass should have removed these; this is a safety net
			console.warn(JSON.stringify({ event: "commission_skipped_not_trainer", staffId: assignment.staffId, role: member.role }));
			continue;
		}

		// 4b: must have a trainerTierId
		if (p.requireTrainerRole && !member.trainerTierId) {
			// Pre-pass should have removed these; this is a safety net
			console.warn(JSON.stringify({ event: "commission_skipped_no_tier", staffId: assignment.staffId }));
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

		// 4e + 4f (fix #1): apply effective weightage AND quantity together,
		// then floor once. Delegates to commission-math.computeFinalAmountCents
		// for unit-testable rounding behaviour.
		const finalAmount = computeFinalAmountCents(
			baseAmountCents,
			effectiveWeightage,
			p.quantity,
		);

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
		// Wrap in try/catch to handle concurrent cancellation races on the partial
		// unique index commission_splits_appt_staff_unique (PG error 23505).
		// On duplicate, skip silently — the first writer already owns the split.
		let inserted: (typeof commissionSplits.$inferSelect) | undefined;
		try {
			const [row] = await db
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
					earnReason: p.earnReason,
					...(capDecision.reason ? { notes: capDecision.reason } : {}),
				})
				.returning();
			inserted = row;
		} catch (err: unknown) {
			// PG unique-violation (23505) — concurrent cancel raced this insert.
			// Return the existing row implicitly (skip to next assignment).
			const pgCode =
				err != null &&
				typeof err === "object" &&
				"code" in err &&
				(err as { code: unknown }).code;
			if (pgCode === "23505") {
				console.info(
					JSON.stringify({
						event: "commission_split_duplicate_skipped",
						appointmentId: p.appointmentId,
						staffId: assignment.staffId,
					}),
				);
				continue;
			}
			throw err;
		}

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

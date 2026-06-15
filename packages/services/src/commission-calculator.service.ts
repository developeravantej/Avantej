/**
 * Commission Calculator Service
 *
 * Core calculation engine for automatic commission splits.
 * Called when an appointment completes or a POS sale is recorded.
 *
 * Phase 1 refactor: _buildSplits replaced by a 3-stage pipeline:
 *   gather  → loadCommissionContext  (all DB reads)
 *   plan    → planSplits             (pure math, no DB)
 *   persist → persistSplits          (all DB writes)
 *
 * Phase 3 addition: calculateOriginationCommission
 *   gather  → on_sale tracks + order totals + member tier snapshots
 *   plan    → planOrigination (pure)
 *   persist → _persistOriginationSplits (caps + 23505-safe insert + audit)
 *
 * Public signatures are IDENTICAL to the pre-refactor version.
 * Callers at appointment.service.ts and pos.service.ts are unchanged.
 */

import { eq, and } from "drizzle-orm";
import { loadCommissionContext } from "./commission/context";
import { planSplits } from "./commission/plan";
import { persistSplits } from "./commission/persist";
import {
	planOrigination,
	type PlanOriginationInput,
	type ResolvedOriginationTrack,
} from "./commission/origination-plan";
import { applyCommissionCaps } from "./commission-splits.service";
import { writeAudit } from "./audit-log.service";
import { commissionTracks } from "@avantej-core/db/schema/tenant/commission-tracks";
import { commissionTrackRates } from "@avantej-core/db/schema/tenant/commission-track-rates";
import { commissionTrackVersions } from "@avantej-core/db/schema/tenant/commission-track-versions";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { members } from "@avantej-core/db/schema/tenant/members";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { services } from "@avantej-core/db/schema/tenant/services";
import type { StaffAssignment } from "./commission-math";
import type { CommissionSplit } from "./commission-splits.service";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { CommissionEarnReason } from "@avantej-core/types";

export type { CommissionSplit };

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

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
	const earnedAt = params.earnedAt ?? new Date();

	const ctx = await loadCommissionContext(db, {
		serviceId: params.serviceId,
		matchMode: "operator",
		matchValue: params.attendeeCount,
		requireTrainerRole: true,
		staffIds: params.staffAssignments.map((a) => a.staffId),
		sourceRef: params.appointmentId,
	});
	if (!ctx) return [];

	const planInput = {
		matchMode: "operator" as const,
		quantity: 1,
		matchValue: params.attendeeCount,
		requireTrainerRole: true,
		staffAssignments: params.staffAssignments,
		unitPriceCents: params.sessionTotalCents,
		appointmentId: params.appointmentId,
		salesOrderId: undefined,
		actor: params.actor,
		earnedAt,
		earnReason: params.earnReason,
	};

	const plan = planSplits(ctx, planInput);

	return persistSplits(db, plan, ctx, {
		requireTrainerRole: true,
		unitPriceCents: params.sessionTotalCents,
		quantity: 1,
		appointmentId: params.appointmentId,
		salesOrderId: undefined,
		actor: params.actor,
		earnedAt,
		earnReason: params.earnReason,
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
	const earnedAt = params.earnedAt ?? new Date();

	const ctx = await loadCommissionContext(db, {
		serviceId: params.serviceId,
		matchMode: "threshold",
		quantity: params.quantity,
		requireTrainerRole: false,
		sourceRef: params.salesOrderId,
	});
	if (!ctx) return [];

	const planInput = {
		matchMode: "threshold" as const,
		quantity: params.quantity,
		matchValue: params.quantity,
		requireTrainerRole: false,
		staffAssignments: params.staffAssignments,
		unitPriceCents: params.unitPriceCents,
		appointmentId: undefined,
		salesOrderId: params.salesOrderId,
		actor: params.actor,
		earnedAt,
		earnReason: params.earnReason,
	};

	const plan = planSplits(ctx, planInput);

	return persistSplits(db, plan, ctx, {
		requireTrainerRole: false,
		unitPriceCents: params.unitPriceCents,
		quantity: params.quantity,
		appointmentId: undefined,
		salesOrderId: params.salesOrderId,
		actor: params.actor,
		earnedAt,
		earnReason: params.earnReason,
	});
}

// ---------------------------------------------------------------------------
// calculateOriginationCommission (Phase 3 — Task #21)
// ---------------------------------------------------------------------------

export interface CalculateOriginationParams {
	salesOrderId: string;
	/** Cross-DB userId of the closer. Comes from sales_orders.sold_by or caller. */
	soldByUserId: string | null | undefined;
	/** Cross-DB userId of the lead source. Optional. */
	leadSourceUserId?: string | null;
	actor: Actor;
	earnedAt?: Date;
}

/**
 * Calculate and persist origination (sales) commission for a completed order.
 *
 * Pipeline: gather (DB reads) → planOrigination (pure) → _persistOriginationSplits (DB writes).
 *
 * Idempotency: relies on the (sales_order_id, track_id, staff_id) unique index
 * created in migration 0083 plus the 23505 skip inside _persistOriginationSplits.
 * A retried webhook or race produces exactly one split per (order, track, staff).
 *
 * Base = full totalAmount (whole deal, not first installment) per OQ6 decision.
 */
export async function calculateOriginationCommission(
	tenantDb: TenantDb | TenantTx,
	params: CalculateOriginationParams,
): Promise<CommissionSplit[]> {
	const db = tenantDb as TenantDb;
	const earnedAt = params.earnedAt ?? new Date();

	// ── Stage 1: Gather ─────────────────────────────────────────────────────

	// 1a. Load the order to get totalAmount, soldBy, category context
	const [order] = await db
		.select({
			totalAmount: salesOrders.totalAmount,
			soldBy: salesOrders.soldBy,
			complimentaryReason: salesOrders.complimentaryReason,
			isComplimentary: salesOrders.isComplimentary,
		})
		.from(salesOrders)
		.where(eq(salesOrders.id, params.salesOrderId))
		.limit(1);

	if (!order) {
		console.warn(
			JSON.stringify({
				event: "origination_commission_order_not_found",
				salesOrderId: params.salesOrderId,
			}),
		);
		return [];
	}

	// Skip complimentary orders — same rule as delivery commission
	if (order.isComplimentary || order.complimentaryReason) {
		console.info(
			JSON.stringify({
				event: "origination_commission_skipped_complimentary",
				salesOrderId: params.salesOrderId,
			}),
		);
		return [];
	}

	// Resolve closer: prefer explicit params.soldByUserId, fallback to DB field
	const soldByUserId = params.soldByUserId ?? order.soldBy ?? null;

	// 1b. Compute gross order total from line items (sum of unitPrice × quantity)
	const lineItems = await db
		.select({
			unitPrice: salesOrderItems.unitPrice,
			quantity: salesOrderItems.quantity,
			serviceId: salesOrderItems.serviceId,
		})
		.from(salesOrderItems)
		.where(eq(salesOrderItems.salesOrderId, params.salesOrderId));

	const grossOrderAmountCents = lineItems.reduce(
		(sum, item) => sum + item.unitPrice * item.quantity,
		0,
	);

	// 1c. Resolve the category for on_sale track lookup.
	// We use the first service line item's category. For mixed-category orders,
	// all on_sale tracks across categories are resolved below.
	const serviceIds = [
		...new Set(
			lineItems
				.map((i) => i.serviceId)
				.filter((id): id is string => id !== null),
		),
	];

	// 1d. Load all active on_sale tracks scoped to this order's service categories
	let onSaleTracks: (typeof commissionTracks.$inferSelect)[] = [];

	if (serviceIds.length > 0) {
		// Resolve category IDs from service IDs
		const serviceRows = await db
			.select({ categoryId: services.categoryId })
			.from(services)
			.where(
				serviceIds.length === 1
					? eq(services.id, serviceIds[0]!)
					: eq(services.id, serviceIds[0]!), // handled below via loop if multiple
			);

		const categoryIds = [
			...new Set(
				serviceRows
					.map((s) => s.categoryId)
					.filter((id): id is string => id !== null),
			),
		];

		if (categoryIds.length > 0) {
			// Load on_sale tracks for these categories
			for (const catId of categoryIds) {
				const catTracks = await db
					.select()
					.from(commissionTracks)
					.where(
						and(
							eq(commissionTracks.categoryId, catId),
							eq(commissionTracks.trigger, "on_sale"),
							eq(commissionTracks.isActive, true),
						),
					);
				onSaleTracks.push(...catTracks);
			}
		}
	}

	// Also check org-scoped on_sale tracks (scope='org', categoryId IS NULL)
	const orgScopedTracks = await db
		.select()
		.from(commissionTracks)
		.where(
			and(
				eq(commissionTracks.scope, "org"),
				eq(commissionTracks.trigger, "on_sale"),
				eq(commissionTracks.isActive, true),
			),
		);
	onSaleTracks.push(...orgScopedTracks);

	if (onSaleTracks.length === 0) {
		// No origination tracks configured — clean exit, no commission
		return [];
	}

	// 1e. Resolve track rates + versions for each track
	const resolvedTracks: ResolvedOriginationTrack[] = [];

	for (const track of onSaleTracks) {
		// For "flat" basis with fixed payment type, no tier-based rate needed
		// For "net_order" / "gross_order" with variable payment type, we use track-level rate
		// Origination tracks use a single org-wide rate (not per-tier) — stored as
		// commission_track_rates with tierId = null OR a single representative tier.
		// We take the first rate row (or use the track's own rate if basis=flat).
		let rateAmountCentsOrBp: number;

		if (track.basis === "flat") {
			// Flat basis: amount comes from the track's capAmountCents field (repurposed)
			// or from commission_track_rates. Use first rate row.
			const [rateRow] = await db
				.select({ amount: commissionTrackRates.amount })
				.from(commissionTrackRates)
				.where(eq(commissionTrackRates.trackId, track.id))
				.limit(1);
			rateAmountCentsOrBp = rateRow?.amount ?? 0;
		} else {
			// net_order / gross_order: rate from commission_track_rates (basis points for variable)
			const [rateRow] = await db
				.select({ amount: commissionTrackRates.amount })
				.from(commissionTrackRates)
				.where(eq(commissionTrackRates.trackId, track.id))
				.limit(1);
			rateAmountCentsOrBp = rateRow?.amount ?? 0;
		}

		if (rateAmountCentsOrBp === 0 && track.basis !== "flat") {
			// No rate configured — skip this track
			console.warn(
				JSON.stringify({
					event: "origination_commission_no_rate",
					trackId: track.id,
					salesOrderId: params.salesOrderId,
				}),
			);
			continue;
		}

		// Resolve latest track version for provenance
		const [latestVersion] = await db
			.select({ id: commissionTrackVersions.id })
			.from(commissionTrackVersions)
			.where(eq(commissionTrackVersions.trackId, track.id))
			.orderBy(commissionTrackVersions.versionNumber)
			.limit(1);

		resolvedTracks.push({
			trackId: track.id,
			trackVersionId: latestVersion?.id ?? null,
			roleType: track.roleType,
			basis: track.basis,
			paymentType: track.paymentType,
			rateAmountCentsOrBp,
			configId: track.id, // origination tracks have no backing config — use trackId
			configVersionId: latestVersion?.id ?? undefined,
		});
	}

	if (resolvedTracks.length === 0) {
		return [];
	}

	// 1f. Fetch member tier IDs for the beneficiaries (needed for PlannedSplit.trainerTierId)
	const beneficiaryUserIds = [
		...(soldByUserId ? [soldByUserId] : []),
		...(params.leadSourceUserId ? [params.leadSourceUserId] : []),
	];
	const memberTierByUserId = new Map<string, string | null>();

	if (beneficiaryUserIds.length > 0) {
		for (const userId of beneficiaryUserIds) {
			const [m] = await db
				.select({ trainerTierId: members.trainerTierId })
				.from(members)
				.where(eq(members.userId, userId))
				.limit(1);
			memberTierByUserId.set(userId, m?.trainerTierId ?? null);
		}
	}

	// ── Stage 2: Plan (pure) ────────────────────────────────────────────────

	const planInput: PlanOriginationInput = {
		salesOrderId: params.salesOrderId,
		tracks: resolvedTracks,
		netOrderAmountCents: order.totalAmount,
		grossOrderAmountCents,
		soldByUserId,
		leadSourceUserId: params.leadSourceUserId ?? null,
		memberTierByUserId,
		actor: params.actor,
		earnedAt,
	};

	const { splits: plannedSplits, skipped } = planOrigination(planInput);

	// Log skipped entries (GAPS #23 — attribution gaps surfaced for audit)
	if (skipped.length > 0) {
		console.warn(
			JSON.stringify({
				event: "origination_commission_skipped",
				salesOrderId: params.salesOrderId,
				skipped,
			}),
		);
		await writeAudit(db, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "commission.skip",
			entityType: "commission_split",
			entityId: params.salesOrderId,
			summary: `Origination commission skipped for ${skipped.length} track(s) — attribution gap`,
			changes: { salesOrderId: params.salesOrderId, skipped },
		});
	}

	if (plannedSplits.length === 0) {
		return [];
	}

	// ── Stage 3: Persist ────────────────────────────────────────────────────

	return _persistOriginationSplits(db, {
		salesOrderId: params.salesOrderId,
		plannedSplits,
		resolvedTracks,
		actor: params.actor,
		earnedAt,
	});
}

// ---------------------------------------------------------------------------
// Internal: persist origination splits (caps + 23505-safe insert + audit)
// ---------------------------------------------------------------------------

interface PersistOriginationInput {
	salesOrderId: string;
	plannedSplits: import("./commission/plan").PlannedSplit[];
	resolvedTracks: ResolvedOriginationTrack[];
	actor: Actor;
	earnedAt: Date;
}

async function _persistOriginationSplits(
	db: TenantDb,
	input: PersistOriginationInput,
): Promise<CommissionSplit[]> {
	const results: CommissionSplit[] = [];

	for (const split of input.plannedSplits) {
		// Each PlannedSplit from planOrigination carries configVersionId = trackVersionId
		// and slotIndex = 0. The trackId is determined by looking up which track
		// covers this staffId + roleType. Since planOrigination emits one split per track,
		// we match by the configVersionId (= trackVersionId) stored in the split.
		const resolvedTrack =
			input.resolvedTracks.find(
				(t) =>
					t.trackVersionId === split.configVersionId ||
					t.configVersionId === split.configVersionId,
			) ?? input.resolvedTracks[0];

		if (!resolvedTrack) continue;

		// Per-cycle cap check — reuses the same cap machinery as delivery commission
		const capDecision = await applyCommissionCaps(db, {
			appointmentId: null,
			salesOrderId: input.salesOrderId,
			packageInstanceId: null,
			staffId: split.staffId,
			amountCents: split.finalAmountCents,
			earnedAt: input.earnedAt,
			trackId: resolvedTrack.trackId,
		});

		if (capDecision.skip) {
			continue;
		}
		const cappedAmount = capDecision.amountCents;

		// 23505-safe insert
		let inserted: CommissionSplit | undefined;
		try {
			const [row] = await db
				.insert(commissionSplits)
				.values({
					salesOrderId: input.salesOrderId,
					configVersionId: split.configVersionId,
					staffId: split.staffId,
					splitPercentage: split.splitPercentage,
					calculatedAmount: cappedAmount,
					status: "pending",
					splitType: "automatic",
					slotIndex: split.slotIndex,
					conditionId: undefined,
					trainerTierId: split.trainerTierId ?? undefined,
					weightageBasisPoints: split.weightageBasisPoints,
					baseAmountCents: split.baseAmountCents,
					earnedAt: input.earnedAt,
					earnReason: "pos_product" as CommissionEarnReason, // origination earns at sale
					// Provenance
					trackId: resolvedTrack.trackId,
					roleType: resolvedTrack.roleType as
						| "trainer"
						| "sales"
						| "marketing"
						| "referrer",
					...(resolvedTrack.trackVersionId
						? { trackVersionId: resolvedTrack.trackVersionId }
						: {}),
					...(capDecision.reason ? { notes: capDecision.reason } : {}),
				})
				.returning();
			inserted = row as CommissionSplit;
		} catch (err: unknown) {
			const pgCode =
				err != null &&
				typeof err === "object" &&
				"code" in err &&
				(err as { code: unknown }).code;
			if (pgCode === "23505") {
				console.info(
					JSON.stringify({
						event: "origination_commission_split_duplicate_skipped",
						salesOrderId: input.salesOrderId,
						staffId: split.staffId,
						trackId: resolvedTrack.trackId,
					}),
				);
				continue;
			}
			throw err;
		}

		if (inserted) {
			await writeAudit(db, {
				actorUserId: input.actor.userId,
				actorMemberId: input.actor.memberId,
				actorRole: input.actor.role,
				action: "commission.create",
				entityType: "commission_split",
				entityId: inserted.id,
				summary: `Origination commission split created for staff ${split.staffId}: ${cappedAmount} cents`,
				changes: {
					staffId: split.staffId,
					salesOrderId: input.salesOrderId,
					trackId: resolvedTrack.trackId,
					roleType: resolvedTrack.roleType,
					requestedAmountCents: split.finalAmountCents,
					calculatedAmount: cappedAmount,
					capReason: capDecision.reason,
					basis: resolvedTrack.basis,
				},
			});
			results.push(inserted);
		}
	}

	return results;
}

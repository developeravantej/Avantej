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
 * Phase D addition: distributeInstallmentOriginationCommission
 *   Distributes origination commission proportionally across multi-installment
 *   plans. Called by confirmInstallmentPayment when an installment fully clears.
 *   The last installment performs a true-up to ensure the per-staff total
 *   equals the full planned amount (modulo caps).
 *
 * Public signatures are IDENTICAL to the pre-refactor version.
 * Callers at appointment.service.ts and pos.service.ts are unchanged.
 */

import { eq, and, sum, isNotNull, lt, ne, inArray } from "drizzle-orm";
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
import type {
	CommissionEarnReason,
	CommissionSalesType,
} from "@avantej-core/types";

export type { CommissionSplit };

/**
 * UAT §12 — pick the origination tracks that apply to a sale of the given kind.
 *
 * A track scoped to the matching sale type ("new" for a first-time customer,
 * "renewal" for a returning one) takes precedence. Only when NO sale-type-
 * specific track is configured do the catch-all "any" tracks apply. This keeps
 * pre-§12 tenants (all tracks "any") behaving identically and prevents an "any"
 * track from double-paying alongside a specific one.
 *
 * Pure — exported for unit testing.
 */
export function selectTracksBySalesType<
	T extends { salesType: CommissionSalesType },
>(tracks: T[], isRenewal: boolean): T[] {
	const wanted: CommissionSalesType = isRenewal ? "renewal" : "new";
	const specific = tracks.filter((t) => t.salesType === wanted);
	if (specific.length > 0) return specific;
	return tracks.filter((t) => t.salesType === "any");
}

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

interface Actor {
	userId: string;
	// Nullable: system/cron actors (e.g. "system" on webhook/auto-charge confirms)
	// have no member row. memberId is written to audit_logs.actor_member_id (uuid,
	// nullable) — never pass a non-uuid string (a userId or "system") here.
	memberId: string | null;
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
 * Idempotency: relies on the (sales_order_id, track_id, staff_id, installment_id) unique index
 * created in migration 0092 plus the 23505 skip inside _persistOriginationSplits.
 * A retried webhook or race produces exactly one split per (order, track, staff).
 *
 * Base = full totalAmount (whole deal, not first installment) per OQ6 decision.
 *
 * Phase D: for MULTI-installment plans this function must NOT be called —
 * distributeInstallmentOriginationCommission handles them instead, one row per installment.
 * Callers guard this via the isInstallmentPlan check (see pos.service.ts and webhooks.routes.ts).
 */
export async function calculateOriginationCommission(
	tenantDb: TenantDb | TenantTx,
	params: CalculateOriginationParams,
): Promise<CommissionSplit[]> {
	const db = tenantDb as TenantDb;
	const earnedAt = params.earnedAt ?? new Date();

	const plan = await planOriginationForOrder(db, params);
	if (!plan || plan.plannedSplits.length === 0) {
		return [];
	}

	return _persistOriginationSplits(db, {
		salesOrderId: params.salesOrderId,
		plannedSplits: plan.plannedSplits,
		resolvedTracks: plan.resolvedTracks,
		actor: params.actor,
		earnedAt,
		installmentId: null,
	});
}

// ---------------------------------------------------------------------------
// distributeInstallmentOriginationCommission (Phase D)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pure math helper — exported for unit-testing (conservation proof)
// ---------------------------------------------------------------------------

/**
 * Compute the scaled commission amount for one installment.
 *
 * For all installments except the last:
 *   scaled = floor(plannedTotal × installmentDue / orderTotal)
 *
 * For the last installment (true-up):
 *   scaled = max(0, plannedTotal - alreadyAttributed)
 *
 * This ensures the sum of all per-installment amounts equals `plannedTotal`
 * regardless of rounding across intermediate installments.
 *
 * @param plannedTotal       Full planned commission for this staff/track (cents)
 * @param installmentDue     This installment's due amount (cents)
 * @param orderTotal         Sum of all installments' due amounts (cents)
 * @param isLast             Whether this is the final installment
 * @param alreadyAttributed  Sum of commission rows already persisted for prior installments
 * @returns Scaled amount in cents (always ≥ 0)
 */
export function scaleInstallmentCommission(
	plannedTotal: number,
	installmentDue: number,
	orderTotal: number,
	isLast: boolean,
	alreadyAttributed: number,
): number {
	if (isLast) {
		return Math.max(0, plannedTotal - alreadyAttributed);
	}
	if (orderTotal === 0) return 0;
	return Math.floor((plannedTotal * installmentDue) / orderTotal);
}

export interface DistributeInstallmentOriginationParams {
	salesOrderId: string;
	installmentId: string;
	/** This installment's amount + taxAmount (cents). */
	installmentDueCents: number;
	/** Sum of all installments' amount + taxAmount for the order (cents). */
	orderTotalDueCents: number;
	/**
	 * True when this clearance settles the FINAL still-owed installment.
	 * When true a rounding true-up is applied so per-staff totals equal the
	 * full planned amount (modulo caps).
	 */
	isLastInstallment: boolean;
	soldByUserId: string | null | undefined;
	leadSourceUserId?: string | null;
	actor: Actor;
	earnedAt?: Date;
}

/**
 * Distribute origination commission proportionally as each installment of a
 * multi-installment plan clears. Creates ONE immutable commission row per
 * installment clearance per staff/track, sized to its proportional share.
 *
 * Conservation guarantee: floor(planned × each_due / total) for installments
 * 1..N-1, plus true-up on the last = full planned amount (modulo caps).
 *
 * Idempotency: new (sales_order_id, track_id, staff_id, installment_id) unique
 * index (migration 0092) + 23505-skip inside _persistOriginationSplits.
 */
export async function distributeInstallmentOriginationCommission(
	tenantDb: TenantDb | TenantTx,
	params: DistributeInstallmentOriginationParams,
): Promise<CommissionSplit[]> {
	const db = tenantDb as TenantDb;
	const earnedAt = params.earnedAt ?? new Date();

	// Stage 1: Plan — same gather+plan as calculateOriginationCommission
	const plan = await planOriginationForOrder(db, {
		salesOrderId: params.salesOrderId,
		soldByUserId: params.soldByUserId,
		leadSourceUserId: params.leadSourceUserId,
		actor: params.actor,
		earnedAt,
	});
	if (!plan || plan.plannedSplits.length === 0) {
		return [];
	}

	const allResults: CommissionSplit[] = [];

	// Stage 2: Scale each planned split to this installment's proportion
	for (const split of plan.plannedSplits) {
		// Resolve the matching track (same logic as _persistOriginationSplits)
		const resolvedTrack =
			plan.resolvedTracks.find(
				(t) =>
					t.trackVersionId === split.configVersionId ||
					t.configVersionId === split.configVersionId,
			) ?? plan.resolvedTracks[0];

		if (!resolvedTrack) continue;

		// Query already-persisted Phase D rows for this staff/track/order
		// (installment_id IS NOT NULL = Phase D rows only; NULL != any value so this
		//  naturally excludes the old front-load sentinel row if present)
		const [alreadyRow] = await db
			.select({ total: sum(commissionSplits.calculatedAmount) })
			.from(commissionSplits)
			.where(
				and(
					eq(commissionSplits.salesOrderId, params.salesOrderId),
					eq(commissionSplits.staffId, split.staffId),
					eq(commissionSplits.trackId, resolvedTrack.trackId),
					// Phase D rows only — never subtract a front-load / manual split
					// (installment_id IS NULL) from the per-installment true-up.
					isNotNull(commissionSplits.installmentId),
				),
			);
		// Drizzle SUM returns a string or null
		const alreadySum = alreadyRow?.total
			? parseInt(String(alreadyRow.total), 10)
			: 0;

		const scaled = scaleInstallmentCommission(
			split.finalAmountCents,
			params.installmentDueCents,
			params.orderTotalDueCents,
			params.isLastInstallment,
			alreadySum,
		);

		if (scaled <= 0) continue;

		// Stage 3: Persist (caps + 23505-safe) with installmentId set
		const results = await _persistOriginationSplits(db, {
			salesOrderId: params.salesOrderId,
			plannedSplits: [{ ...split, finalAmountCents: scaled }],
			resolvedTracks: plan.resolvedTracks,
			actor: params.actor,
			earnedAt,
			installmentId: params.installmentId,
		});
		allResults.push(...results);
	}

	return allResults;
}

// ---------------------------------------------------------------------------
// Internal: planOriginationForOrder — gather + plan stages (no DB writes)
// ---------------------------------------------------------------------------

interface PlanOriginationResult {
	plannedSplits: import("./commission/plan").PlannedSplit[];
	resolvedTracks: ResolvedOriginationTrack[];
}

/**
 * Stages 1 (gather) + 2 (plan) of calculateOriginationCommission — all DB reads,
 * no writes. Returns null when the order does not exist, is complimentary, or
 * has no active on_sale tracks configured.
 *
 * Extracted so both calculateOriginationCommission (single-payment, front-load)
 * and distributeInstallmentOriginationCommission (per-installment, Phase D)
 * share the identical gather+plan logic.
 */
async function planOriginationForOrder(
	db: TenantDb,
	params: CalculateOriginationParams,
): Promise<PlanOriginationResult | null> {
	const earnedAt = params.earnedAt ?? new Date();

	// ── Stage 1: Gather ─────────────────────────────────────────────────────

	// 1a. Load the order to get totalAmount, soldBy, category context
	const [order] = await db
		.select({
			totalAmount: salesOrders.totalAmount,
			soldBy: salesOrders.soldBy,
			complimentaryReason: salesOrders.complimentaryReason,
			isComplimentary: salesOrders.isComplimentary,
			customerId: salesOrders.customerId,
			date: salesOrders.date,
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
		return null;
	}

	// Skip complimentary orders — same rule as delivery commission
	if (order.isComplimentary || order.complimentaryReason) {
		console.info(
			JSON.stringify({
				event: "origination_commission_skipped_complimentary",
				salesOrderId: params.salesOrderId,
			}),
		);
		return null;
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
		// Resolve category IDs from ALL service line items (not just the first).
		// A mixed-category order must surface every category's on_sale tracks —
		// using inArray over the full set; the loop below loads tracks per category.
		const serviceRows = await db
			.select({ categoryId: services.categoryId })
			.from(services)
			.where(inArray(services.id, serviceIds));

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
		return null;
	}

	// UAT §12 — new-vs-renewal scoping. The sale is a "renewal" when this order's
	// customer already has an earlier confirmed/completed order; otherwise it is a
	// new-customer sale. Walk-in/anonymous orders (no customerId) are treated as
	// new. Origination tracks scoped to the matching sale type take precedence
	// over catch-all "any" tracks (see selectTracksBySalesType).
	let isRenewal = false;
	if (order.customerId) {
		const [priorOrder] = await db
			.select({ id: salesOrders.id })
			.from(salesOrders)
			.where(
				and(
					eq(salesOrders.customerId, order.customerId),
					inArray(salesOrders.status, ["confirmed", "completed"]),
					lt(salesOrders.date, order.date),
					ne(salesOrders.id, params.salesOrderId),
				),
			)
			.limit(1);
		isRenewal = !!priorOrder;
	}

	onSaleTracks = selectTracksBySalesType(onSaleTracks, isRenewal);

	if (onSaleTracks.length === 0) {
		// Tracks exist but none apply to this sale type — clean exit.
		console.info(
			JSON.stringify({
				event: "origination_commission_no_track_for_sales_type",
				salesOrderId: params.salesOrderId,
				isRenewal,
			}),
		);
		return null;
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
		return null;
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
			actorMemberId: params.actor.memberId ?? undefined,
			actorRole: params.actor.role,
			action: "commission.skip",
			entityType: "commission_split",
			entityId: params.salesOrderId,
			summary: `Origination commission skipped for ${skipped.length} track(s) — attribution gap`,
			changes: { salesOrderId: params.salesOrderId, skipped },
		});
	}

	if (plannedSplits.length === 0) {
		return null;
	}

	return { plannedSplits, resolvedTracks };
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
	/**
	 * Phase D: installment_id to tag this row with. null/undefined for
	 * single-payment front-loaded rows (pre-Phase D).
	 */
	installmentId?: string | null;
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
					// config_version_id FKs category_commission_config_versions (delivery
					// commission). Origination tracks have NO category-config version — their
					// provenance is trackVersionId below. Writing a commission_track_versions
					// id here violates the FK, so leave it null for origination splits.
					configVersionId: undefined,
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
					// Phase D: tag with installment_id when set (null for front-load / single-payment)
					...(input.installmentId != null
						? { installmentId: input.installmentId }
						: {}),
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
						installmentId: input.installmentId ?? null,
					}),
				);
				continue;
			}
			throw err;
		}

		if (inserted) {
			await writeAudit(db, {
				actorUserId: input.actor.userId,
				actorMemberId: input.actor.memberId ?? undefined,
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
					installmentId: input.installmentId ?? null,
				},
			});
			results.push(inserted);
		}
	}

	return results;
}
